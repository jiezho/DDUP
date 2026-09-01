import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'

import { createWorkbenchApp } from '../server/app.mjs'
import { openWorkbenchDatabase } from '../server/storage/database.mjs'
import { createUuidV7, isUuidV7 } from '../shared/contracts/ids.mjs'

const host = '127.0.0.1:8787'
const origin = `http://${host}`
const bootstrapToken = 'synthetic-project-bootstrap-token-000000000000000000'

function baseHeaders(extra = {}) {
  return { host, ...extra }
}

function cookieFrom(response) {
  return response.headers['set-cookie'].split(';', 1)[0]
}

async function createFixture(
  t,
  { clock = { value: Date.UTC(2026, 7, 24, 12) }, sessionTtlMs = 8 * 60 * 60 * 1000 } = {},
) {
  const root = await mkdtemp(join(tmpdir(), 'workbench-project-test-'))
  const databasePath = join(root, 'workbench.db')
  const now = () => clock.value
  const app = createWorkbenchApp({ bootstrapToken, databasePath, now, sessionTtlMs })
  let closed = false
  t.after(async () => {
    if (!closed) await app.close()
    await rm(root, { recursive: true, force: true })
  })

  const bootstrap = await app.inject({
    method: 'POST',
    url: '/api/v1/session/bootstrap',
    headers: baseHeaders({
      'content-type': 'application/json',
      origin,
      'x-workbench-bootstrap': bootstrapToken,
    }),
    payload: {},
  })
  assert.equal(bootstrap.statusCode, 200, bootstrap.body)
  const cookie = cookieFrom(bootstrap)
  const csrf = bootstrap.json().data.csrf_token
  const session = await app.inject({
    method: 'GET',
    url: '/api/v1/session',
    headers: baseHeaders({ cookie }),
  })
  assert.equal(session.statusCode, 200, session.body)
  const space = session.json().data.spaces[0]

  return {
    app,
    clock,
    close: async () => {
      if (!closed) {
        closed = true
        await app.close()
      }
    },
    cookie,
    csrf,
    databasePath,
    root,
    space,
  }
}

function writeHeaders(fixture, extra = {}) {
  return baseHeaders({
    'content-type': 'application/json',
    origin,
    cookie: fixture.cookie,
    'x-csrf-token': fixture.csrf,
    ...extra,
  })
}

function projectInput(spaceId, overrides = {}) {
  return {
    space_id: spaceId,
    name: '合成项目持久化验证',
    summary: '完全虚构，仅用于验证项目垂直切片。',
    template_type: 'research',
    start_date: '2026-08-24',
    target_date: null,
    context_policy: 'project_only',
    color_token: 'sky',
    ...overrides,
  }
}

async function createProject(fixture, key = 'create-project-0000000000000001', overrides = {}) {
  return fixture.app.inject({
    method: 'POST',
    url: '/api/v1/projects',
    headers: writeHeaders(fixture, { 'idempotency-key': key }),
    payload: projectInput(fixture.space.id, overrides),
  })
}

function inspectDatabase(path) {
  return new DatabaseSync(path, {
    allowExtension: false,
    enableDoubleQuotedStringLiterals: false,
    enableForeignKeyConstraints: true,
  })
}

test('migrations initialize one durable owner and personal space without real identity data', async (t) => {
  const fixture = await createFixture(t)
  assert.ok(isUuidV7(fixture.space.id))
  assert.equal(fixture.space.name, '个人工作台')
  assert.equal(fixture.space.classification, 'personal_local')
  assert.equal(fixture.space.default_ai_policy, 'local_only')

  const database = inspectDatabase(fixture.databasePath)
  try {
    assert.equal(database.prepare('SELECT count(*) AS count FROM schema_migrations').get().count, 10)
    assert.equal(database.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' AND name IN ('milestones', 'tasks')").get().count, 2)
    assert.equal(database.prepare('SELECT count(*) AS count FROM principals').get().count, 1)
    assert.equal(database.prepare('SELECT count(*) AS count FROM spaces').get().count, 1)
    const principal = database.prepare('SELECT kind, display_name, status FROM principals').get()
    assert.deepEqual({ ...principal }, { kind: 'local_owner', display_name: '本地拥有者', status: 'active' })
    assert.doesNotMatch(JSON.stringify(principal), /@|Admin|Users|\\|\/home\//i)
  } finally {
    database.close()
  }
})

test('project create is durable, idempotent, and commits audit plus outbox in one transaction', async (t) => {
  const fixture = await createFixture(t)
  const created = await createProject(fixture)
  assert.equal(created.statusCode, 201, created.body)
  const project = created.json().data
  assert.ok(isUuidV7(project.id))
  assert.equal(project.status, 'draft')
  assert.equal(project.version, 1)
  assert.equal(created.json().meta.idempotency_replayed, false)

  const replayed = await createProject(fixture)
  assert.equal(replayed.statusCode, 201, replayed.body)
  assert.equal(replayed.json().data.id, project.id)
  assert.equal(replayed.json().meta.idempotency_replayed, true)

  const database = inspectDatabase(fixture.databasePath)
  try {
    assert.equal(database.prepare('SELECT count(*) AS count FROM projects').get().count, 1)
    assert.equal(database.prepare('SELECT count(*) AS count FROM idempotency_keys').get().count, 1)
    assert.equal(database.prepare('SELECT count(*) AS count FROM outbox_events').get().count, 1)
    const events = database
      .prepare('SELECT action, previous_hash, event_hash, change_digest FROM audit_events ORDER BY occurred_at, id')
      .all()
    assert.equal(events.length, 2)
    assert.equal(events[1].action, 'project.create')
    assert.equal(events[1].previous_hash, events[0].event_hash)
    assert.match(events[1].change_digest, /^[a-f0-9]{64}$/)
    assert.doesNotMatch(JSON.stringify(events), /合成项目持久化验证|完全虚构/)
  } finally {
    database.close()
  }

  const read = await fixture.app.inject({
    method: 'GET',
    url: `/api/v1/projects/${project.id}`,
    headers: baseHeaders({ cookie: fixture.cookie }),
  })
  assert.equal(read.statusCode, 200)
  assert.equal(read.json().data.name, project.name)
})

test('idempotency conflict, validation failure and invalid transition leave durable state unchanged', async (t) => {
  const fixture = await createFixture(t)
  const key = 'create-project-0000000000000002'
  const created = await createProject(fixture, key)
  const project = created.json().data

  const conflict = await createProject(fixture, key, { name: '不同的合成项目' })
  assert.equal(conflict.statusCode, 409)
  assert.equal(conflict.json().errors[0].code, 'IDEMPOTENCY_CONFLICT')

  const unknownField = await fixture.app.inject({
    method: 'PATCH',
    url: `/api/v1/projects/${project.id}`,
    headers: writeHeaders(fixture, {
      'idempotency-key': 'update-project-000000000000001',
      'if-match': '"v1"',
    }),
    payload: { owner_id: createUuidV7() },
  })
  assert.equal(unknownField.statusCode, 422)
  assert.equal(unknownField.json().errors[0].code, 'VALIDATION_FAILED')

  const invalidTransition = await fixture.app.inject({
    method: 'POST',
    url: `/api/v1/projects/${project.id}/transitions`,
    headers: writeHeaders(fixture, {
      'idempotency-key': 'transition-project-000000000001',
      'if-match': '"v1"',
    }),
    payload: { action: 'complete' },
  })
  assert.equal(invalidTransition.statusCode, 409)
  assert.equal(invalidTransition.json().errors[0].code, 'INVALID_STATE_TRANSITION')

  const database = inspectDatabase(fixture.databasePath)
  try {
    assert.deepEqual(
      { ...database.prepare('SELECT count(*) AS count, max(version) AS version FROM projects').get() },
      { count: 1, version: 1 },
    )
    assert.equal(database.prepare('SELECT count(*) AS count FROM audit_events').get().count, 2)
    assert.equal(database.prepare('SELECT count(*) AS count FROM outbox_events').get().count, 1)
    assert.equal(database.prepare('SELECT count(*) AS count FROM idempotency_keys').get().count, 1)
  } finally {
    database.close()
  }
})

test('optimistic update and project state machine reject stale versions without partial writes', async (t) => {
  const fixture = await createFixture(t)
  const project = (await createProject(fixture, 'create-project-0000000000000003')).json().data

  const stale = await fixture.app.inject({
    method: 'PATCH',
    url: `/api/v1/projects/${project.id}`,
    headers: writeHeaders(fixture, {
      'idempotency-key': 'update-project-stale-00000000001',
      'if-match': '"v2"',
    }),
    payload: { name: '不会被保存的名称' },
  })
  assert.equal(stale.statusCode, 409)
  assert.equal(stale.json().errors[0].code, 'VERSION_CONFLICT')

  const updated = await fixture.app.inject({
    method: 'PATCH',
    url: `/api/v1/projects/${project.id}`,
    headers: writeHeaders(fixture, {
      'idempotency-key': 'update-project-valid-00000000001',
      'if-match': '"v1"',
    }),
    payload: { name: '更新后的合成项目', target_date: '2026-12-31' },
  })
  assert.equal(updated.statusCode, 200, updated.body)
  assert.equal(updated.json().data.version, 2)

  const activate = await fixture.app.inject({
    method: 'POST',
    url: `/api/v1/projects/${project.id}/transitions`,
    headers: writeHeaders(fixture, {
      'idempotency-key': 'transition-activate-000000000001',
      'if-match': '"v2"',
    }),
    payload: { action: 'activate' },
  })
  assert.equal(activate.statusCode, 200, activate.body)
  assert.equal(activate.json().data.status, 'active')
  assert.equal(activate.json().data.version, 3)

  const pause = await fixture.app.inject({
    method: 'POST',
    url: `/api/v1/projects/${project.id}/transitions`,
    headers: writeHeaders(fixture, {
      'idempotency-key': 'transition-pause-0000000000001',
      'if-match': '"v3"',
    }),
    payload: { action: 'pause' },
  })
  assert.equal(pause.statusCode, 200, pause.body)
  assert.equal(pause.json().data.status, 'paused')

  const archive = await fixture.app.inject({
    method: 'POST',
    url: `/api/v1/projects/${project.id}/transitions`,
    headers: writeHeaders(fixture, {
      'idempotency-key': 'transition-archive-00000000001',
      'if-match': '"v4"',
    }),
    payload: { action: 'archive' },
  })
  assert.equal(archive.statusCode, 200, archive.body)
  assert.equal(archive.json().data.status, 'archived')
  assert.equal(archive.json().data.version, 5)
})

test('space filtering does not disclose another space or unknown project', async (t) => {
  const fixture = await createFixture(t)
  const foreignPrincipal = createUuidV7()
  const foreignSpace = createUuidV7()
  const foreignProject = createUuidV7()
  const createdAt = new Date(fixture.clock.value).toISOString()
  const database = inspectDatabase(fixture.databasePath)
  try {
    database
      .prepare('INSERT INTO principals (id, kind, display_name, status, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(foreignPrincipal, 'local_owner', '虚构隔离主体', 'active', createdAt)
    database
      .prepare(`
        INSERT INTO spaces (
          id, owner_id, name, classification, default_ai_policy, status,
          created_at, created_by, updated_at, updated_by, version, deleted_at, deleted_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NULL, NULL)
      `)
      .run(
        foreignSpace,
        foreignPrincipal,
        '虚构隔离空间',
        'public_demo',
        'deny_ai',
        'active',
        createdAt,
        foreignPrincipal,
        createdAt,
        foreignPrincipal,
      )
    database
      .prepare(`
        INSERT INTO projects (
          id, space_id, name, summary, template_type, status, start_date, target_date,
          context_policy, color_token, created_at, created_by, updated_at, updated_by,
          version, deleted_at, deleted_by
        ) VALUES (?, ?, ?, '', 'general', 'draft', NULL, NULL, 'project_only', 'sky', ?, ?, ?, ?, 1, NULL, NULL)
      `)
      .run(
        foreignProject,
        foreignSpace,
        '不能泄露的外部空间项目标题',
        createdAt,
        foreignPrincipal,
        createdAt,
        foreignPrincipal,
      )
  } finally {
    database.close()
  }

  const deniedList = await fixture.app.inject({
    method: 'GET',
    url: `/api/v1/projects?space_id=${foreignSpace}`,
    headers: baseHeaders({ cookie: fixture.cookie }),
  })
  assert.equal(deniedList.statusCode, 404)
  assert.equal(deniedList.json().errors[0].code, 'OBJECT_NOT_AVAILABLE')

  const deniedCreate = await fixture.app.inject({
    method: 'POST',
    url: '/api/v1/projects',
    headers: writeHeaders(fixture, { 'idempotency-key': 'denied-project-000000000000001' }),
    payload: projectInput(foreignSpace, { name: '不能泄露的合成标题' }),
  })
  assert.equal(deniedCreate.statusCode, 404)
  assert.equal(deniedCreate.json().errors[0].message, deniedList.json().errors[0].message)
  assert.doesNotMatch(deniedCreate.body, /不能泄露的合成标题|虚构隔离空间/)

  const deniedExistingProject = await fixture.app.inject({
    method: 'GET',
    url: `/api/v1/projects/${foreignProject}`,
    headers: baseHeaders({ cookie: fixture.cookie }),
  })
  assert.equal(deniedExistingProject.statusCode, 404)
  assert.equal(deniedExistingProject.json().errors[0].message, deniedList.json().errors[0].message)
  assert.doesNotMatch(deniedExistingProject.body, /不能泄露的外部空间项目标题|虚构隔离空间/)

  const unknownProject = await fixture.app.inject({
    method: 'GET',
    url: `/api/v1/projects/${createUuidV7()}`,
    headers: baseHeaders({ cookie: fixture.cookie }),
  })
  assert.equal(unknownProject.statusCode, 404)
  assert.equal(unknownProject.json().errors[0].message, deniedList.json().errors[0].message)
})

test('project list uses bounded filters and a tamper-evident cursor without duplicates', async (t) => {
  const fixture = await createFixture(t)
  const ids = []
  for (const [index, template] of ['general', 'learning', 'research'].entries()) {
    fixture.clock.value += 1
    const response = await createProject(
      fixture,
      `create-pagination-project-0000000${index}`,
      { name: `合成分页项目 ${index + 1}`, template_type: template },
    )
    assert.equal(response.statusCode, 201, response.body)
    ids.push(response.json().data.id)
  }

  const first = await fixture.app.inject({
    method: 'GET',
    url: `/api/v1/projects?space_id=${fixture.space.id}&limit=2`,
    headers: baseHeaders({ cookie: fixture.cookie }),
  })
  assert.equal(first.statusCode, 200, first.body)
  assert.equal(first.json().data.items.length, 2)
  assert.equal(first.json().meta.page.has_more, true)
  assert.ok(first.json().meta.page.next_cursor)

  const second = await fixture.app.inject({
    method: 'GET',
    url: `/api/v1/projects?space_id=${fixture.space.id}&limit=2&cursor=${encodeURIComponent(first.json().meta.page.next_cursor)}`,
    headers: baseHeaders({ cookie: fixture.cookie }),
  })
  assert.equal(second.statusCode, 200, second.body)
  assert.equal(second.json().data.items.length, 1)
  assert.equal(second.json().meta.page.has_more, false)
  assert.equal(new Set([...first.json().data.items, ...second.json().data.items].map((item) => item.id)).size, 3)

  const filtered = await fixture.app.inject({
    method: 'GET',
    url: `/api/v1/projects?space_id=${fixture.space.id}&template_type=learning`,
    headers: baseHeaders({ cookie: fixture.cookie }),
  })
  assert.equal(filtered.statusCode, 200)
  assert.equal(filtered.json().data.items.length, 1)
  assert.equal(filtered.json().data.items[0].template_type, 'learning')

  const tampered = await fixture.app.inject({
    method: 'GET',
    url: `/api/v1/projects?space_id=${fixture.space.id}&cursor=${encodeURIComponent(`${first.json().meta.page.next_cursor}x`)}`,
    headers: baseHeaders({ cookie: fixture.cookie }),
  })
  assert.equal(tampered.statusCode, 400)
  assert.equal(tampered.json().errors[0].code, 'INVALID_CURSOR')
  assert.equal(new Set(ids).size, 3)
})

test('expired idempotency records can be safely reused after their retention window', async (t) => {
  const clock = { value: Date.UTC(2026, 7, 24, 12) }
  const fixture = await createFixture(t, { clock, sessionTtlMs: 40 * 60 * 60 * 1000 })
  const key = 'expiring-idempotency-key-000000001'
  const first = await createProject(fixture, key, { name: '合成幂等窗口项目一' })
  assert.equal(first.statusCode, 201, first.body)
  clock.value += 25 * 60 * 60 * 1000
  const second = await createProject(fixture, key, { name: '合成幂等窗口项目二' })
  assert.equal(second.statusCode, 201, second.body)
  assert.notEqual(second.json().data.id, first.json().data.id)

  const database = inspectDatabase(fixture.databasePath)
  try {
    assert.equal(database.prepare('SELECT count(*) AS count FROM projects').get().count, 2)
    assert.equal(database.prepare('SELECT count(*) AS count FROM idempotency_keys').get().count, 1)
  } finally {
    database.close()
  }
})

test('soft delete is hidden, replay-safe and restorable within the 30-day window', async (t) => {
  const fixture = await createFixture(t)
  const project = (await createProject(fixture, 'create-project-0000000000000004')).json().data
  const deleteHeaders = writeHeaders(fixture, {
    'idempotency-key': 'delete-project-0000000000000001',
    'if-match': '"v1"',
  })
  const deleted = await fixture.app.inject({
    method: 'DELETE',
    url: `/api/v1/projects/${project.id}`,
    headers: deleteHeaders,
    payload: {},
  })
  assert.equal(deleted.statusCode, 200, deleted.body)
  assert.equal(deleted.json().data.version, 2)

  const replay = await fixture.app.inject({
    method: 'DELETE',
    url: `/api/v1/projects/${project.id}`,
    headers: deleteHeaders,
    payload: {},
  })
  assert.equal(replay.statusCode, 200)
  assert.equal(replay.json().meta.idempotency_replayed, true)

  const hidden = await fixture.app.inject({
    method: 'GET',
    url: `/api/v1/projects/${project.id}`,
    headers: baseHeaders({ cookie: fixture.cookie }),
  })
  assert.equal(hidden.statusCode, 404)

  const restored = await fixture.app.inject({
    method: 'POST',
    url: `/api/v1/projects/${project.id}/restore`,
    headers: writeHeaders(fixture, {
      'idempotency-key': 'restore-project-00000000000001',
      'if-match': '"v2"',
    }),
    payload: {},
  })
  assert.equal(restored.statusCode, 200, restored.body)
  assert.equal(restored.json().data.version, 3)
  assert.equal(restored.json().data.deleted_at, null)
})

test('restore after 30 days is rejected and the project remains deleted', async (t) => {
  const clock = { value: Date.UTC(2026, 7, 24, 12) }
  const fixture = await createFixture(t, { clock, sessionTtlMs: 40 * 86400000 })
  const project = (await createProject(fixture, 'create-project-0000000000000005')).json().data
  await fixture.app.inject({
    method: 'DELETE',
    url: `/api/v1/projects/${project.id}`,
    headers: writeHeaders(fixture, {
      'idempotency-key': 'delete-project-expiry-00000000001',
      'if-match': '"v1"',
    }),
    payload: {},
  })
  clock.value += 31 * 86400000
  const expired = await fixture.app.inject({
    method: 'POST',
    url: `/api/v1/projects/${project.id}/restore`,
    headers: writeHeaders(fixture, {
      'idempotency-key': 'restore-project-expiry-000000001',
      'if-match': '"v2"',
    }),
    payload: {},
  })
  assert.equal(expired.statusCode, 410)
  assert.equal(expired.json().errors[0].code, 'RESTORE_WINDOW_EXPIRED')

  const database = inspectDatabase(fixture.databasePath)
  try {
    assert.equal(database.prepare('SELECT version, deleted_at IS NOT NULL AS deleted FROM projects').get().version, 2)
    assert.equal(database.prepare('SELECT version, deleted_at IS NOT NULL AS deleted FROM projects').get().deleted, 1)
  } finally {
    database.close()
  }
})

test('projects survive application restart and migration checksum tampering stops startup', async (t) => {
  const fixture = await createFixture(t)
  const project = (await createProject(fixture, 'create-project-0000000000000006')).json().data
  await fixture.close()

  const restarted = createWorkbenchApp({
    bootstrapToken: `${bootstrapToken}-restart`,
    databasePath: fixture.databasePath,
    now: () => fixture.clock.value + 1,
  })
  const bootstrap = await restarted.inject({
    method: 'POST',
    url: '/api/v1/session/bootstrap',
    headers: baseHeaders({
      'content-type': 'application/json',
      origin,
      'x-workbench-bootstrap': `${bootstrapToken}-restart`,
    }),
    payload: {},
  })
  const read = await restarted.inject({
    method: 'GET',
    url: `/api/v1/projects/${project.id}`,
    headers: baseHeaders({ cookie: cookieFrom(bootstrap) }),
  })
  assert.equal(read.statusCode, 200, read.body)
  assert.equal(read.json().data.name, project.name)
  await restarted.close()

  const database = inspectDatabase(fixture.databasePath)
  database.prepare('UPDATE schema_migrations SET checksum = ? WHERE version = 1').run('0'.repeat(64))
  database.close()
  assert.throws(
    () => openWorkbenchDatabase({ databasePath: fixture.databasePath }),
    (error) => error?.code === 'MIGRATION_REQUIRED' && error?.statusCode === 503,
  )
})
