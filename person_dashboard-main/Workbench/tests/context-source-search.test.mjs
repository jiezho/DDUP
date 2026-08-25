import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { createWorkbenchApp } from '../server/app.mjs'

const host = '127.0.0.1:8787'
const origin = `http://${host}`
const bootstrapToken = 'synthetic-context-bootstrap-token-000000000000000000'
const headers = (extra = {}) => ({ host, ...extra })

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'workbench-context-test-'))
  const databasePath = join(root, 'workbench.db')
  const sourceStoragePath = join(root, 'controlled-sources')
  const app = createWorkbenchApp({
    bootstrapToken,
    databasePath,
    sourceStoragePath,
    now: () => Date.UTC(2026, 7, 25, 8),
  })
  t.after(async () => { await app.close(); await rm(root, { recursive: true, force: true }) })
  const boot = await app.inject({
    method: 'POST', url: '/api/v1/session/bootstrap',
    headers: headers({ 'content-type': 'application/json', origin, 'x-workbench-bootstrap': bootstrapToken }), payload: {},
  })
  const cookie = boot.headers['set-cookie'].split(';', 1)[0]
  const csrf = boot.json().data.csrf_token
  const session = await app.inject({ method: 'GET', url: '/api/v1/session', headers: headers({ cookie }) })
  const spaceId = session.json().data.spaces[0].id
  const writeHeaders = (key, version = null) => headers({
    'content-type': 'application/json', origin, cookie, 'x-csrf-token': csrf, 'idempotency-key': key,
    ...(version == null ? {} : { 'if-match': `"v${version}"` }),
  })
  const createProject = async (name = '合成上下文项目') => {
    const response = await app.inject({
      method: 'POST', url: '/api/v1/projects', headers: writeHeaders(`project-${crypto.randomUUID()}`),
      payload: { space_id: spaceId, name, summary: '完全虚构的检索范围。', template_type: 'research' },
    })
    assert.equal(response.statusCode, 201, response.body)
    return response.json().data
  }
  return { app, cookie, csrf, databasePath, root, sourceStoragePath, spaceId, writeHeaders, createProject }
}

function importPayload(spaceId, projectId = null, content = '# 合成证据记录\n\n受控证据仅用于虚构检索验证。') {
  return { space_id: spaceId, project_id: projectId, filename: 'synthetic-evidence.md', content }
}

function searchRequest(f, body) {
  return f.app.inject({
    method: 'POST', url: '/api/v1/context/search',
    headers: headers({ cookie: f.cookie, origin, 'content-type': 'application/json' }), payload: body,
  })
}

test('controlled Markdown import creates one immutable source version, normalized document and traceable search hit', async (t) => {
  const f = await fixture(t)
  const project = await f.createProject()
  const payload = importPayload(f.spaceId, project.id)
  const imported = await f.app.inject({
    method: 'POST', url: '/api/v1/sources/imports/markdown',
    headers: f.writeHeaders('source-import-markdown-00000001'), payload,
  })
  assert.equal(imported.statusCode, 201, imported.body)
  assert.equal(imported.json().data.deduplicated, false)
  assert.equal(imported.json().data.source.title, '合成证据记录')
  assert.equal(imported.json().data.source.original_filename, 'synthetic-evidence.md')
  assert.equal('storage_ref' in imported.json().data.source, false)

  const database = new DatabaseSync(f.databasePath)
  try {
    assert.equal(database.prepare('SELECT count(*) AS count FROM sources').get().count, 1)
    assert.equal(database.prepare('SELECT count(*) AS count FROM source_versions').get().count, 1)
    assert.equal(database.prepare('SELECT count(*) AS count FROM documents').get().count, 1)
    assert.equal(database.prepare("SELECT count(*) AS count FROM audit_events WHERE action = 'source.import'").get().count, 1)
    assert.equal(database.prepare("SELECT count(*) AS count FROM outbox_events WHERE event_type = 'source.imported'").get().count, 1)
  } finally {
    database.close()
  }

  const files = await readdir(f.sourceStoragePath, { recursive: true })
  const blob = files.find((name) => name.endsWith('.md'))
  assert.ok(blob)
  assert.doesNotMatch(blob, /synthetic-evidence/i)
  assert.equal(await readFile(join(f.sourceStoragePath, blob), 'utf8'), payload.content)

  const search = await searchRequest(f, { space_id: f.spaceId, project_id: project.id, q: '受控证据', types: ['document'] })
  assert.equal(search.statusCode, 200, search.body)
  assert.equal(search.json().data.items.length, 1)
  assert.equal(search.json().data.items[0].object_type, 'document')
  assert.equal(search.json().data.items[0].locator.type, 'char_range')
  assert.ok(search.json().data.items[0].locator.end > search.json().data.items[0].locator.start)
  assert.equal(search.json().data.baseline.engine, 'sqlite_fts5_trigram')
  assert.equal(search.json().data.baseline.semantic, false)
})

test('source intake rejects paths, empty projections, unknown relations and oversized bodies without database writes', async (t) => {
  const f = await fixture(t)
  const cases = [
    { key: 'source-invalid-path-000000001', payload: { ...importPayload(f.spaceId), filename: '../escape.md' }, status: 422 },
    { key: 'source-empty-markdown-0000001', payload: importPayload(f.spaceId, null, '<!-- no searchable body -->'), status: 422 },
    { key: 'source-unknown-project-000001', payload: importPayload(f.spaceId, '0198e6a7-89ab-7def-8123-000000000099'), status: 404 },
  ]
  for (const item of cases) {
    const response = await f.app.inject({ method: 'POST', url: '/api/v1/sources/imports/markdown', headers: f.writeHeaders(item.key), payload: item.payload })
    assert.equal(response.statusCode, item.status, response.body)
  }
  const oversized = await f.app.inject({
    method: 'POST', url: '/api/v1/sources/imports/markdown', headers: f.writeHeaders('source-oversized-000000000001'),
    payload: importPayload(f.spaceId, null, `# 过大\n\n${'a'.repeat(1_100_000)}`),
  })
  assert.equal(oversized.statusCode, 413, oversized.body)
  assert.equal(oversized.json().errors[0].code, 'INVALID_REQUEST')
  const database = new DatabaseSync(f.databasePath)
  try {
    assert.equal(database.prepare('SELECT count(*) AS count FROM sources').get().count, 0)
    assert.equal(database.prepare('SELECT count(*) AS count FROM documents').get().count, 0)
  } finally {
    database.close()
  }
})

test('content digest and idempotency prevent duplicate sources while request conflicts do not add blobs', async (t) => {
  const f = await fixture(t)
  const payload = importPayload(f.spaceId)
  const first = await f.app.inject({ method: 'POST', url: '/api/v1/sources/imports/markdown', headers: f.writeHeaders('source-dedupe-first-000000001'), payload })
  const duplicate = await f.app.inject({ method: 'POST', url: '/api/v1/sources/imports/markdown', headers: f.writeHeaders('source-dedupe-second-00000001'), payload })
  assert.equal(duplicate.json().data.source.id, first.json().data.source.id)
  assert.equal(duplicate.json().data.deduplicated, true)
  const conflict = await f.app.inject({
    method: 'POST', url: '/api/v1/sources/imports/markdown', headers: f.writeHeaders('source-dedupe-first-000000001'),
    payload: importPayload(f.spaceId, null, '# 另一份内容\n\n不应写入。'),
  })
  assert.equal(conflict.statusCode, 409)
  assert.equal(conflict.json().errors[0].code, 'IDEMPOTENCY_CONFLICT')
  const database = new DatabaseSync(f.databasePath)
  try {
    assert.equal(database.prepare('SELECT count(*) AS count FROM sources').get().count, 1)
    assert.equal(database.prepare('SELECT count(*) AS count FROM source_versions').get().count, 1)
  } finally {
    database.close()
  }
  const files = (await readdir(f.sourceStoragePath, { recursive: true })).filter((name) => name.endsWith('.md'))
  assert.equal(files.length, 1)
})

test('a database failure rolls back source records and compensates the newly written content blob', async (t) => {
  const f = await fixture(t)
  const database = new DatabaseSync(f.databasePath)
  try {
    database.exec("CREATE TRIGGER synthetic_source_failure BEFORE INSERT ON sources BEGIN SELECT RAISE(ABORT, 'synthetic source failure'); END;")
  } finally {
    database.close()
  }
  const response = await f.app.inject({
    method: 'POST', url: '/api/v1/sources/imports/markdown', headers: f.writeHeaders('source-rollback-file-000000001'),
    payload: importPayload(f.spaceId),
  })
  assert.equal(response.statusCode, 500)
  assert.equal(response.json().errors[0].code, 'INTERNAL_ERROR')
  const verify = new DatabaseSync(f.databasePath)
  try {
    assert.equal(verify.prepare('SELECT count(*) AS count FROM sources').get().count, 0)
    assert.equal(verify.prepare('SELECT count(*) AS count FROM idempotency_keys').get().count, 0)
  } finally {
    verify.close()
  }
  const files = (await readdir(f.sourceStoragePath, { recursive: true })).filter((name) => name.endsWith('.md'))
  assert.equal(files.length, 0)
})

test('unified search indexes projects, tasks, captures and documents with scope/type/date filters applied before output', async (t) => {
  const f = await fixture(t)
  const project = await f.createProject('合成统一检索项目')
  const taskCreated = await f.app.inject({
    method: 'POST', url: `/api/v1/projects/${project.id}/tasks`, headers: f.writeHeaders('context-task-create-000000001'),
    payload: { title: '合成统一检索任务', description: '统一检索基线任务正文。' },
  })
  const task = taskCreated.json().data
  await f.app.inject({
    method: 'POST', url: '/api/v1/captures', headers: f.writeHeaders('context-capture-create-000001'),
    payload: { kind: 'text', space_id: f.spaceId, project_id: project.id, title: '合成统一检索捕获', body: '统一检索基线捕获正文。' },
  })
  await f.app.inject({
    method: 'POST', url: '/api/v1/sources/imports/markdown', headers: f.writeHeaders('context-source-create-0000001'),
    payload: importPayload(f.spaceId, project.id, '# 合成统一检索文档\n\n统一检索基线文档正文。'),
  })
  const all = await searchRequest(f, { space_id: f.spaceId, project_id: project.id, q: '统一检索' })
  assert.equal(all.statusCode, 200, all.body)
  assert.deepEqual(new Set(all.json().data.items.map((item) => item.object_type)), new Set(['project', 'task', 'capture', 'document']))
  assert.equal(all.json().data.items.every((item) => item.project_id === project.id), true)
  assert.equal(all.json().data.scope.applied.space_id, f.spaceId)

  const tasksOnly = await searchRequest(f, { space_id: f.spaceId, q: '统一检索', types: ['task'], from: '2026-08-25', to: '2026-08-25' })
  assert.deepEqual(tasksOnly.json().data.items.map((item) => item.object_type), ['task'])
  const future = await searchRequest(f, { space_id: f.spaceId, q: '统一检索', from: '2026-08-26' })
  assert.equal(future.json().data.items.length, 0)

  const twoCharacterFallback = await searchRequest(f, { space_id: f.spaceId, q: '统一', types: ['document'] })
  assert.equal(twoCharacterFallback.json().data.items.length, 1)
  assert.equal(twoCharacterFallback.json().data.baseline.engine, 'sqlite_bounded_like')

  const deleted = await f.app.inject({
    method: 'DELETE', url: `/api/v1/tasks/${task.id}`, headers: f.writeHeaders('context-task-delete-000000001', task.version), payload: {},
  })
  assert.equal(deleted.statusCode, 200, deleted.body)
  const afterDelete = await searchRequest(f, { space_id: f.spaceId, q: '合成统一检索任务', types: ['task'] })
  assert.equal(afterDelete.json().data.items.length, 0)
})

test('unknown spaces and mismatched project scope return the same unavailable response without titles or counts', async (t) => {
  const f = await fixture(t)
  const project = await f.createProject('不应泄露的合成项目')
  const unknownSpace = '0198e6a7-89ab-7def-8123-000000000098'
  const sources = await f.app.inject({ method: 'GET', url: `/api/v1/sources?space_id=${unknownSpace}`, headers: headers({ cookie: f.cookie }) })
  assert.equal(sources.statusCode, 404)
  assert.doesNotMatch(sources.body, /不应泄露的合成项目|items|count/)
  const search = await searchRequest(f, { space_id: unknownSpace, q: '不应泄露' })
  assert.equal(search.statusCode, 404)
  assert.doesNotMatch(search.body, /不应泄露的合成项目|items|count/)
  const mismatch = await f.app.inject({
    method: 'POST', url: '/api/v1/sources/imports/markdown', headers: f.writeHeaders('source-scope-mismatch-00000001'),
    payload: importPayload(unknownSpace, project.id),
  })
  assert.equal(mismatch.statusCode, 404)
  assert.doesNotMatch(mismatch.body, /不应泄露的合成项目/)
})
