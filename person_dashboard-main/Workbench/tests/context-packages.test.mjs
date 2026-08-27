import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { createWorkbenchApp } from '../server/app.mjs'

const host = '127.0.0.1:8787'
const origin = `http://${host}`
const bootstrapToken = 'synthetic-package-bootstrap-token-00000000000000000'
const headers = (extra = {}) => ({ host, ...extra })

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'workbench-package-test-'))
  const databasePath = join(root, 'workbench.db')
  let timestamp = Date.UTC(2026, 7, 25, 8)
  const app = createWorkbenchApp({
    bootstrapToken,
    databasePath,
    sourceStoragePath: join(root, 'controlled-sources'),
    now: () => timestamp,
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
  return { app, cookie, databasePath, spaceId, writeHeaders, advance: (milliseconds) => { timestamp += milliseconds } }
}

async function createPackage(f, overrides = {}) {
  const response = await f.app.inject({
    method: 'POST', url: '/api/v1/context/packages', headers: f.writeHeaders(`package-create-${crypto.randomUUID()}`),
    payload: {
      space_id: f.spaceId,
      name: '合成论证上下文',
      purpose: '仅用于验证显式范围、版本锁定和审计记录。',
      expires_at: '2026-08-26T16:00:00+08:00',
      ...overrides,
    },
  })
  assert.equal(response.statusCode, 201, response.body)
  return response.json().data
}

async function importAndFind(f) {
  const imported = await f.app.inject({
    method: 'POST', url: '/api/v1/sources/imports/markdown', headers: f.writeHeaders(`package-source-${crypto.randomUUID()}`),
    payload: {
      space_id: f.spaceId,
      project_id: null,
      filename: 'synthetic-package-evidence.md',
      content: '# 合成范围证据\n\n显式上下文篮只包含用户主动选定的固定范围。',
    },
  })
  assert.equal(imported.statusCode, 201, imported.body)
  const search = await f.app.inject({
    method: 'POST', url: '/api/v1/context/search',
    headers: headers({ cookie: f.cookie, origin, 'content-type': 'application/json' }),
    payload: { space_id: f.spaceId, q: '上下文篮', types: ['document'] },
  })
  assert.equal(search.statusCode, 200, search.body)
  return search.json().data.items[0]
}

function addPayload(spaceId, hit) {
  return {
    space_id: spaceId,
    object_type: hit.object_type,
    object_id: hit.object_id,
    source_version_id: hit.locator.source_version_id,
    start_char: hit.locator.start,
    end_char: hit.locator.end,
  }
}

test('explicit package persists a fixed document range and records only references plus audit metadata', async (t) => {
  const f = await fixture(t)
  const contextPackage = await createPackage(f)
  assert.equal(contextPackage.expires_at, '2026-08-26T08:00:00.000Z')
  const hit = await importAndFind(f)
  const added = await f.app.inject({
    method: 'POST', url: `/api/v1/context/packages/${contextPackage.id}/items`,
    headers: f.writeHeaders('package-add-document-000000001', contextPackage.version),
    payload: addPayload(f.spaceId, hit),
  })
  assert.equal(added.statusCode, 200, added.body)
  const data = added.json().data
  assert.equal(data.version, 2)
  assert.equal(data.items.length, 1)
  assert.equal(data.items[0].included, true)
  assert.equal(data.items[0].locator.quote, '上下文篮')
  assert.equal(data.resolution.included_count, 1)

  const database = new DatabaseSync(f.databasePath)
  try {
    const stored = database.prepare('SELECT * FROM context_package_items').get()
    assert.equal('quote' in stored, false)
    assert.equal('body_text' in stored, false)
    assert.equal(database.prepare("SELECT count(*) AS count FROM audit_events WHERE action IN ('context_package.create', 'context_package.item.add')").get().count, 2)
    assert.equal(database.prepare("SELECT count(*) AS count FROM outbox_events WHERE aggregate_type = 'context_package'").get().count, 2)
  } finally {
    database.close()
  }
})

test('item commands are replay-safe and stale or duplicate writes do not mutate package state', async (t) => {
  const f = await fixture(t)
  const contextPackage = await createPackage(f)
  const hit = await importAndFind(f)
  const payload = addPayload(f.spaceId, hit)
  const key = 'package-add-replay-00000000001'
  const first = await f.app.inject({ method: 'POST', url: `/api/v1/context/packages/${contextPackage.id}/items`, headers: f.writeHeaders(key, 1), payload })
  const replay = await f.app.inject({ method: 'POST', url: `/api/v1/context/packages/${contextPackage.id}/items`, headers: f.writeHeaders(key, 1), payload })
  assert.equal(first.statusCode, 200, first.body)
  assert.equal(replay.statusCode, 200, replay.body)
  assert.equal(replay.json().meta.idempotency_replayed, true)
  assert.deepEqual(replay.json().data, first.json().data)

  const stale = await f.app.inject({ method: 'POST', url: `/api/v1/context/packages/${contextPackage.id}/items`, headers: f.writeHeaders('package-add-stale-000000000001', 1), payload })
  assert.equal(stale.statusCode, 409)
  assert.equal(stale.json().errors[0].code, 'VERSION_CONFLICT')
  const duplicate = await f.app.inject({ method: 'POST', url: `/api/v1/context/packages/${contextPackage.id}/items`, headers: f.writeHeaders('package-add-duplicate-0000001', 2), payload })
  assert.equal(duplicate.statusCode, 409)
  assert.equal(duplicate.json().errors[0].code, 'RELATION_CONFLICT')

  const database = new DatabaseSync(f.databasePath)
  try {
    assert.equal(database.prepare('SELECT count(*) AS count FROM context_package_items').get().count, 1)
    assert.equal(database.prepare('SELECT version FROM context_packages').get().version, 2)
  } finally {
    database.close()
  }
})

test('forged locators, unavailable objects and expired packages fail without durable writes', async (t) => {
  const f = await fixture(t)
  const contextPackage = await createPackage(f, { expires_at: '2026-08-25T09:00:00Z' })
  const hit = await importAndFind(f)
  const forgedNonDocument = await f.app.inject({
    method: 'POST', url: `/api/v1/context/packages/${contextPackage.id}/items`, headers: f.writeHeaders('package-forged-object-00000001', 1),
    payload: { ...addPayload(f.spaceId, hit), object_type: 'project' },
  })
  assert.equal(forgedNonDocument.statusCode, 422)
  const unavailable = await f.app.inject({
    method: 'POST', url: `/api/v1/context/packages/${contextPackage.id}/items`, headers: f.writeHeaders('package-unavailable-0000000001', 1),
    payload: { space_id: f.spaceId, object_type: 'task', object_id: '0198e6a7-89ab-7def-8123-000000000099' },
  })
  assert.equal(unavailable.statusCode, 404)
  const badRange = await f.app.inject({
    method: 'POST', url: `/api/v1/context/packages/${contextPackage.id}/items`, headers: f.writeHeaders('package-stale-source-000000001', 1),
    payload: { ...addPayload(f.spaceId, hit), source_version_id: '0198e6a7-89ab-7def-8123-000000000098' },
  })
  assert.equal(badRange.statusCode, 409)
  assert.equal(badRange.json().errors[0].code, 'RELATION_CONFLICT')

  f.advance(2 * 60 * 60 * 1000)
  const expired = await f.app.inject({
    method: 'GET', url: `/api/v1/context/packages/${contextPackage.id}?space_id=${f.spaceId}`, headers: headers({ cookie: f.cookie }),
  })
  assert.equal(expired.statusCode, 200, expired.body)
  assert.equal(expired.json().data.effective_status, 'expired')
  const afterExpiry = await f.app.inject({
    method: 'POST', url: `/api/v1/context/packages/${contextPackage.id}/items`, headers: f.writeHeaders('package-expired-add-0000000001', 1),
    payload: addPayload(f.spaceId, hit),
  })
  assert.equal(afterExpiry.statusCode, 409)
  assert.equal(afterExpiry.json().errors[0].code, 'INVALID_STATE_TRANSITION')

  const database = new DatabaseSync(f.databasePath)
  try {
    assert.equal(database.prepare('SELECT count(*) AS count FROM context_package_items').get().count, 0)
    assert.equal(database.prepare("SELECT count(*) AS count FROM audit_events WHERE action = 'context_package.item.add'").get().count, 0)
  } finally {
    database.close()
  }
})

test('remove and archive are versioned, replay-safe, and archived packages resolve no content', async (t) => {
  const f = await fixture(t)
  const contextPackage = await createPackage(f)
  const hit = await importAndFind(f)
  const added = await f.app.inject({ method: 'POST', url: `/api/v1/context/packages/${contextPackage.id}/items`, headers: f.writeHeaders('package-add-for-remove-0000001', 1), payload: addPayload(f.spaceId, hit) })
  const itemId = added.json().data.items[0].item_id
  const removeKey = 'package-remove-replay-000000001'
  const removeUrl = `/api/v1/context/packages/${contextPackage.id}/items/${itemId}?space_id=${f.spaceId}`
  const removed = await f.app.inject({ method: 'DELETE', url: removeUrl, headers: f.writeHeaders(removeKey, 2), payload: {} })
  const replay = await f.app.inject({ method: 'DELETE', url: removeUrl, headers: f.writeHeaders(removeKey, 2), payload: {} })
  assert.equal(removed.statusCode, 200, removed.body)
  assert.equal(replay.statusCode, 200, replay.body)
  assert.equal(replay.json().meta.idempotency_replayed, true)
  assert.equal(removed.json().data.version, 3)

  const archived = await f.app.inject({
    method: 'POST', url: `/api/v1/context/packages/${contextPackage.id}/transitions`, headers: f.writeHeaders('package-archive-000000000001', 3),
    payload: { space_id: f.spaceId, action: 'archive' },
  })
  assert.equal(archived.statusCode, 200, archived.body)
  assert.equal(archived.json().data.effective_status, 'archived')
  assert.equal(archived.json().data.resolution.included_count, 0)
})

test('context packages survive a service restart without persisting resolved body copies', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'workbench-package-restart-'))
  const databasePath = join(root, 'workbench.db')
  const sourceStoragePath = join(root, 'controlled-sources')

  async function boot(app, token) {
    const response = await app.inject({
      method: 'POST', url: '/api/v1/session/bootstrap',
      headers: headers({ 'content-type': 'application/json', origin, 'x-workbench-bootstrap': token }), payload: {},
    })
    const cookie = response.headers['set-cookie'].split(';', 1)[0]
    const csrf = response.json().data.csrf_token
    const session = await app.inject({ method: 'GET', url: '/api/v1/session', headers: headers({ cookie }) })
    return { cookie, csrf, spaceId: session.json().data.spaces[0].id }
  }

  const firstToken = 'synthetic-package-restart-token-first-0000000000000'
  const first = createWorkbenchApp({ bootstrapToken: firstToken, databasePath, sourceStoragePath, now: () => Date.UTC(2026, 7, 25, 8) })
  const firstSession = await boot(first, firstToken)
  const created = await first.inject({
    method: 'POST', url: '/api/v1/context/packages',
    headers: headers({
      'content-type': 'application/json', origin, cookie: firstSession.cookie,
      'x-csrf-token': firstSession.csrf, 'idempotency-key': 'package-restart-create-000000001',
    }),
    payload: { space_id: firstSession.spaceId, name: '合成重启上下文', purpose: '验证服务重启后的持久化语义。', expires_at: null },
  })
  assert.equal(created.statusCode, 201, created.body)
  await first.close()

  const secondToken = 'synthetic-package-restart-token-second-000000000000'
  const second = createWorkbenchApp({ bootstrapToken: secondToken, databasePath, sourceStoragePath, now: () => Date.UTC(2026, 7, 25, 9) })
  t.after(async () => { await second.close(); await rm(root, { recursive: true, force: true }) })
  const secondSession = await boot(second, secondToken)
  assert.equal(secondSession.spaceId, firstSession.spaceId)
  const listed = await second.inject({
    method: 'GET', url: `/api/v1/context/packages?space_id=${secondSession.spaceId}&status=active`,
    headers: headers({ cookie: secondSession.cookie }),
  })
  assert.equal(listed.statusCode, 200, listed.body)
  assert.equal(listed.json().data.items.length, 1)
  assert.equal(listed.json().data.items[0].name, '合成重启上下文')
})
