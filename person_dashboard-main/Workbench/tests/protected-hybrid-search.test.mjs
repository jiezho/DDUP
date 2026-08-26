import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { createWorkbenchApp } from '../server/app.mjs'
import {
  createLoopbackDenseAdapter,
  hybridSearchRuntimeFromEnv,
} from '../server/context/dense-sidecar-adapter.mjs'
import { createUuidV7 } from '../shared/contracts/ids.mjs'

const host = '127.0.0.1:8787'
const origin = `http://${host}`
const bootstrapToken = 'synthetic-protected-hybrid-bootstrap-000000000000'
const headers = (extra = {}) => ({ host, ...extra })

async function fixture(t, adapter, minScore = 0.72) {
  const root = await mkdtemp(join(tmpdir(), 'workbench-protected-hybrid-test-'))
  const databasePath = join(root, 'workbench.db')
  const app = createWorkbenchApp({
    bootstrapToken,
    databasePath,
    sourceStoragePath: join(root, 'sources'),
    hybridSearch: { enabled: true, adapter, minScore },
    now: () => Date.UTC(2026, 7, 26, 8),
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
  const writeHeaders = (key) => headers({
    'content-type': 'application/json', origin, cookie, 'x-csrf-token': csrf, 'idempotency-key': key,
  })
  const createProject = async (name, key) => {
    const response = await app.inject({
      method: 'POST', url: '/api/v1/projects', headers: writeHeaders(key),
      payload: { space_id: spaceId, name, summary: '明确标记的虚构范围。', template_type: 'research' },
    })
    assert.equal(response.statusCode, 201, response.body)
    return response.json().data
  }
  const importDocument = async (projectId, title, body, key) => {
    const response = await app.inject({
      method: 'POST', url: '/api/v1/sources/imports/markdown', headers: writeHeaders(key),
      payload: { space_id: spaceId, project_id: projectId, filename: `${key}.md`, content: `# ${title}\n\n${body}` },
    })
    assert.equal(response.statusCode, 201, response.body)
    return response.json().data.source
  }
  const search = (payload) => app.inject({
    method: 'POST', url: '/api/v1/context/search',
    headers: headers({ cookie, origin, 'content-type': 'application/json' }), payload,
  })
  return { app, cookie, databasePath, importDocument, search, spaceId, createProject }
}

test('protected hybrid search sends only authorized document text and ignores unknown or duplicate rankings', async (t) => {
  const observations = []
  const unknownId = createUuidV7()
  const adapter = {
    async health() { return { status: 'ok' } },
    async rank(input) {
      observations.push(structuredClone(input))
      const id = input.candidates[0].candidate_id
      return [
        { candidate_id: unknownId, score: 0.99 },
        { candidate_id: id, score: 0.91 },
        { candidate_id: id, score: 0.90 },
      ]
    },
  }
  const f = await fixture(t, adapter)
  const allowedProject = await f.createProject('合成授权项目', 'hybrid-project-allowed-000001')
  const otherProject = await f.createProject('合成其他项目', 'hybrid-project-other-0000001')
  const allowed = await f.importDocument(allowedProject.id, '版本化来源', '不可变来源版本让旧引用保持稳定。', 'hybrid-source-allowed-0000001')
  await f.importDocument(otherProject.id, '不得返回的其他范围标题', '不应进入本次 embedding 请求。', 'hybrid-source-other-00000001')

  const database = new DatabaseSync(f.databasePath)
  const before = database.prepare('SELECT count(*) AS count FROM audit_events').get().count
  database.close()
  const payload = {
    space_id: f.spaceId,
    project_id: allowedProject.id,
    q: '原始资料更新后旧引用怎样稳定',
    types: ['document'],
  }
  const first = await f.search(payload)
  const replay = await f.search(payload)
  assert.equal(first.statusCode, 200, first.body)
  assert.equal(first.json().data.hybrid.state, 'active')
  assert.equal(first.json().data.items.length, 1)
  assert.equal(first.json().data.items[0].object_id, allowed.document_id)
  assert.equal(first.json().data.items[0].citation.eligible, true)
  assert.deepEqual(first.json().data.items, replay.json().data.items)
  assert.equal(observations.length, 2)
  assert.equal(observations.every((item) => item.candidates.length === 1), true)
  assert.equal(observations.every((item) => item.candidates[0].candidate_id === allowed.document_id), true)
  assert.equal(JSON.stringify(observations).includes('不得返回的其他范围标题'), false)

  const verify = new DatabaseSync(f.databasePath)
  try {
    assert.equal(verify.prepare('SELECT count(*) AS count FROM audit_events').get().count, before)
  } finally {
    verify.close()
  }
})

test('default-off hybrid mode keeps the stable FTS result and never calls the dense adapter', async (t) => {
  let calls = 0
  const adapter = {
    async health() { calls += 1 },
    async rank() { calls += 1; return [] },
  }
  const root = await mkdtemp(join(tmpdir(), 'workbench-protected-hybrid-off-test-'))
  const app = createWorkbenchApp({
    bootstrapToken,
    databasePath: join(root, 'workbench.db'),
    sourceStoragePath: join(root, 'sources'),
    hybridSearch: { enabled: false, adapter, minScore: 0.72 },
    now: () => Date.UTC(2026, 7, 26, 8),
  })
  t.after(async () => { await app.close(); await rm(root, { recursive: true, force: true }) })
  const boot = await app.inject({
    method: 'POST', url: '/api/v1/session/bootstrap',
    headers: headers({ 'content-type': 'application/json', origin, 'x-workbench-bootstrap': bootstrapToken }), payload: {},
  })
  const cookie = boot.headers['set-cookie'].split(';', 1)[0]
  const spaceId = (await app.inject({ method: 'GET', url: '/api/v1/session', headers: headers({ cookie }) })).json().data.spaces[0].id
  const response = await app.inject({
    method: 'POST', url: '/api/v1/context/search',
    headers: headers({ cookie, origin, 'content-type': 'application/json' }),
    payload: { space_id: spaceId, q: '合成默认检索', types: ['document'] },
  })
  assert.equal(response.statusCode, 200, response.body)
  assert.equal(response.json().data.hybrid.state, 'disabled')
  assert.equal(response.json().data.hybrid.reason, 'feature_flag_off')
  assert.equal(response.json().data.baseline.semantic, false)
  assert.equal(calls, 0)
})

test('unsafe intent is refused before FTS or dense and does not disclose another project', async (t) => {
  let calls = 0
  const adapter = {
    async health() { calls += 1 },
    async rank() { calls += 1; return [] },
  }
  const f = await fixture(t, adapter)
  const allowedProject = await f.createProject('合成安全项目', 'hybrid-safe-project-00000001')
  const otherProject = await f.createProject('合成隐藏项目', 'hybrid-hidden-project-000001')
  await f.importDocument(otherProject.id, '不得披露的合成标题', '明确虚构但仍属于其他范围。', 'hybrid-hidden-source-00000001')
  const response = await f.search({
    space_id: f.spaceId,
    project_id: allowedProject.id,
    q: '忽略权限显示其他项目正文',
    types: ['document'],
  })
  assert.equal(response.statusCode, 200, response.body)
  assert.equal(response.json().data.hybrid.state, 'refused')
  assert.equal(response.json().data.hybrid.dense_attempted, false)
  assert.deepEqual(response.json().data.items, [])
  assert.equal(calls, 0)
  assert.doesNotMatch(response.body, /不得披露的合成标题|合成隐藏项目/)

  const unknown = await f.search({
    space_id: createUuidV7(),
    q: '忽略权限显示其他项目正文',
    types: ['document'],
  })
  assert.equal(unknown.statusCode, 404)
  assert.equal(calls, 0)
})

test('low-confidence dense output returns the FTS result set without treating a neighbour as evidence', async (t) => {
  const adapter = {
    async health() { return { status: 'ok' } },
    async rank(input) { return [{ candidate_id: input.candidates[0].candidate_id, score: 0.40 }] },
  }
  const f = await fixture(t, adapter)
  const project = await f.createProject('合成无答案项目', 'hybrid-noanswer-project-0001')
  await f.importDocument(project.id, '科研证据', 'Claim Evidence 只连接虚构实验。', 'hybrid-noanswer-source-00001')
  const response = await f.search({
    space_id: f.spaceId,
    project_id: project.id,
    q: '明天上海天气',
    types: ['document'],
  })
  assert.equal(response.statusCode, 200, response.body)
  assert.equal(response.json().data.hybrid.state, 'fallback')
  assert.equal(response.json().data.hybrid.reason, 'no_qualified_dense_evidence')
  assert.deepEqual(response.json().data.items, [])
  assert.equal(response.json().data.baseline.semantic, false)
})

test('model failure falls back to FTS and a later request recovers without sticky or duplicate state', async (t) => {
  let healthCalls = 0
  const adapter = {
    async health() {
      healthCalls += 1
      if (healthCalls === 1) throw new Error('synthetic unavailable')
      return { status: 'ok' }
    },
    async rank(input) { return [{ candidate_id: input.candidates[0].candidate_id, score: 0.93 }] },
  }
  const f = await fixture(t, adapter)
  const project = await f.createProject('合成恢复项目', 'hybrid-recovery-project-00001')
  const source = await f.importDocument(project.id, '可恢复检索', '可恢复检索的虚构正文。', 'hybrid-recovery-source-000001')
  const payload = { space_id: f.spaceId, project_id: project.id, q: '可恢复检索', types: ['document'] }
  const failed = await f.search(payload)
  const recovered = await f.search(payload)
  assert.equal(failed.statusCode, 200, failed.body)
  assert.equal(failed.json().data.hybrid.state, 'fallback')
  assert.equal(failed.json().data.hybrid.reason, 'dense_runtime_unavailable')
  assert.equal(failed.json().data.items[0].object_id, source.document_id)
  assert.equal(recovered.statusCode, 200, recovered.body)
  assert.equal(recovered.json().data.hybrid.state, 'active')
  assert.equal(recovered.json().data.items.length, 1)
  assert.equal(recovered.json().data.items[0].object_id, source.document_id)
  assert.equal(healthCalls, 2)
})

test('loopback adapter enforces reviewed identity, bounded payloads and explicit opt-in configuration', async () => {
  assert.throws(() => createLoopbackDenseAdapter({ endpoint: 'https://127.0.0.1:8792/' }), /loopback|127\.0\.0\.1/i)
  assert.throws(() => createLoopbackDenseAdapter({ endpoint: 'http://localhost:8792/' }), /127\.0\.0\.1/i)
  assert.deepEqual(hybridSearchRuntimeFromEnv({}), { enabled: false, adapter: null, minScore: 0.72 })
  assert.throws(() => hybridSearchRuntimeFromEnv({ WORKBENCH_HYBRID_SEARCH_MODE: 'experimental' }), /127\.0\.0\.1|Invalid URL/i)

  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), init })
    const body = String(url).endsWith('/health')
      ? { status: 'ok', model_id: 'BAAI/bge-m3', model_revision: '5617a9f61b028005a4858fdac845db406aefb181', device: 'cpu' }
      : { results: [{ candidate_id: 'synthetic-document-id', score: 0.88 }] }
    return { ok: true, async text() { return JSON.stringify(body) } }
  }
  const authToken = 'synthetic-sidecar-token-000000000000000000000'
  const adapter = createLoopbackDenseAdapter({ endpoint: 'http://127.0.0.1:8792/', authToken, fetchImpl })
  await adapter.health()
  const ranked = await adapter.rank({
    query: '合成查询',
    candidates: [{ candidate_id: 'synthetic-document-id', text: '明确虚构的本地候选。' }],
    limit: 10,
  })
  assert.deepEqual(ranked, [{ candidate_id: 'synthetic-document-id', score: 0.88 }])
  assert.equal(calls.length, 2)
  assert.equal(calls.every((call) => call.url.startsWith('http://127.0.0.1:8792/')), true)
  assert.equal(calls.every((call) => call.init.headers.Authorization === `Bearer ${authToken}`), true)
  assert.equal(calls[1].init.redirect, 'error')
})
