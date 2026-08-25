import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { createWorkbenchApp } from '../server/app.mjs'

const host = '127.0.0.1:8787'
const origin = `http://${host}`
const bootstrapToken = 'synthetic-capture-bootstrap-token-000000000000000000'
const headers = (extra = {}) => ({ host, ...extra })

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'workbench-capture-test-'))
  const databasePath = join(root, 'workbench.db')
  const app = createWorkbenchApp({ bootstrapToken, databasePath, now: () => Date.UTC(2026, 7, 24, 12) })
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
  return { app, cookie, csrf, spaceId, writeHeaders }
}

test('text and link captures enter a durable inbox without fetching external content', async (t) => {
  const f = await fixture(t)
  const textResponse = await f.app.inject({
    method: 'POST', url: '/api/v1/captures', headers: f.writeHeaders('capture-text-0000000000000001'),
    payload: { kind: 'text', space_id: f.spaceId, project_id: null, title: '合成灵感', body: '完全虚构的研究灵感。' },
  })
  assert.equal(textResponse.statusCode, 201, textResponse.body)
  const linkPayload = { kind: 'link', space_id: f.spaceId, project_id: null, title: '示例链接', canonical_uri: 'https://example.com/synthetic-reference' }
  const linkResponse = await f.app.inject({ method: 'POST', url: '/api/v1/captures', headers: f.writeHeaders('capture-link-0000000000000001'), payload: linkPayload })
  assert.equal(linkResponse.statusCode, 201, linkResponse.body)
  assert.equal(linkResponse.json().data.body, '')
  assert.equal(linkResponse.json().data.canonical_uri, linkPayload.canonical_uri)

  const replay = await f.app.inject({ method: 'POST', url: '/api/v1/captures', headers: f.writeHeaders('capture-link-0000000000000001'), payload: linkPayload })
  assert.equal(replay.json().data.id, linkResponse.json().data.id)
  assert.equal(replay.json().meta.idempotency_replayed, true)
  const listed = await f.app.inject({ method: 'GET', url: `/api/v1/captures?space_id=${f.spaceId}`, headers: headers({ cookie: f.cookie }) })
  assert.equal(listed.json().data.items.length, 2)
})

test('capture validation rejects unsafe schemes and unknown project associations without partial writes', async (t) => {
  const f = await fixture(t)
  const unsafe = await f.app.inject({
    method: 'POST', url: '/api/v1/captures', headers: f.writeHeaders('capture-unsafe-00000000000001'),
    payload: { kind: 'link', space_id: f.spaceId, project_id: null, title: '不安全链接', canonical_uri: 'file:///synthetic/private.txt' },
  })
  assert.equal(unsafe.statusCode, 422)
  const unknownProject = '0198e6a7-89ab-7def-8123-000000000099'
  const unknown = await f.app.inject({
    method: 'POST', url: '/api/v1/captures', headers: f.writeHeaders('capture-unknown-project-000001'),
    payload: { kind: 'text', space_id: f.spaceId, project_id: unknownProject, title: '不可关联', body: '不应写入。' },
  })
  assert.equal(unknown.statusCode, 404)
  const listed = await f.app.inject({ method: 'GET', url: `/api/v1/captures?space_id=${f.spaceId}`, headers: headers({ cookie: f.cookie }) })
  assert.equal(listed.json().data.items.length, 0)
})

test('capture processing uses optimistic versions and replay-safe state transitions', async (t) => {
  const f = await fixture(t)
  const created = await f.app.inject({
    method: 'POST', url: '/api/v1/captures', headers: f.writeHeaders('capture-state-create-000000001'),
    payload: { kind: 'text', space_id: f.spaceId, project_id: null, title: '待整理条目', body: '只进入收件箱。' },
  })
  const capture = created.json().data
  const process = await f.app.inject({
    method: 'POST', url: `/api/v1/captures/${capture.id}/transitions`,
    headers: f.writeHeaders('capture-process-0000000000001', 1), payload: { action: 'process' },
  })
  assert.equal(process.statusCode, 200)
  assert.equal(process.json().data.status, 'processed')
  const replay = await f.app.inject({
    method: 'POST', url: `/api/v1/captures/${capture.id}/transitions`,
    headers: f.writeHeaders('capture-process-0000000000001', 1), payload: { action: 'process' },
  })
  assert.equal(replay.json().meta.idempotency_replayed, true)
  const stale = await f.app.inject({
    method: 'POST', url: `/api/v1/captures/${capture.id}/transitions`,
    headers: f.writeHeaders('capture-archive-stale-00000001', 1), payload: { action: 'archive' },
  })
  assert.equal(stale.statusCode, 409)
  assert.equal(stale.json().errors[0].code, 'VERSION_CONFLICT')
})
