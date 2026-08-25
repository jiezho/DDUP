import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { createWorkbenchApp } from '../server/app.mjs'
import { createUuidV7, isUuidV7 } from '../shared/contracts/ids.mjs'

const host = '127.0.0.1:8787'
const origin = `http://${host}`
const bootstrapToken = 'synthetic-bootstrap-token-000000000000000000000000'

function headers(extra = {}) {
  return { host, ...extra }
}

function cookieFrom(response) {
  return response.headers['set-cookie'].split(';', 1)[0]
}

async function bootstrap(app) {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/session/bootstrap',
    headers: headers({
      'content-type': 'application/json',
      origin,
      'x-workbench-bootstrap': bootstrapToken,
    }),
    payload: {},
  })
  assert.equal(response.statusCode, 200)
  return { cookie: cookieFrom(response), csrf: response.json().data.csrf_token }
}

test('UUIDv7 IDs are valid and monotonic within one millisecond', () => {
  const ids = Array.from({ length: 100 }, () => createUuidV7(() => 1_787_500_000_000))
  assert.equal(new Set(ids).size, ids.length)
  assert.ok(ids.every(isUuidV7))
  assert.deepEqual([...ids].sort(), ids)
})

test('health is minimal and rejects an untrusted Host', async (t) => {
  const app = createWorkbenchApp({ bootstrapToken })
  t.after(() => app.close())

  const response = await app.inject({ method: 'GET', url: '/api/health', headers: headers() })
  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.json().data, {
    service: 'personal-ai-workbench',
    status: 'ok',
    app_version: '0.1.0',
    runtime: { node: process.version, sqlite: 'available' },
  })
  assert.ok(isUuidV7(response.json().request_id))
  assert.doesNotMatch(response.body, /[A-Z]:\\|api[_-]?key|bootstrap-token/i)

  const rejected = await app.inject({
    method: 'GET',
    url: '/api/health',
    headers: { host: 'attacker.example' },
  })
  assert.equal(rejected.statusCode, 400)
  assert.equal(rejected.json().errors[0].code, 'INVALID_HOST')
})

test('bootstrap requires same origin JSON and is single use', async (t) => {
  const app = createWorkbenchApp({ bootstrapToken })
  t.after(() => app.close())

  const crossSite = await app.inject({
    method: 'POST',
    url: '/api/v1/session/bootstrap',
    headers: headers({
      'content-type': 'application/json',
      origin: 'https://attacker.example',
      'x-workbench-bootstrap': bootstrapToken,
    }),
    payload: {},
  })
  assert.equal(crossSite.statusCode, 403)
  assert.equal(crossSite.json().errors[0].code, 'CSRF_REJECTED')

  const valid = await bootstrap(app)
  assert.match(valid.cookie, /^workbench_session=/)
  assert.ok(valid.csrf.length >= 32)

  const replay = await app.inject({
    method: 'POST',
    url: '/api/v1/session/bootstrap',
    headers: headers({
      'content-type': 'application/json',
      origin,
      'x-workbench-bootstrap': bootstrapToken,
    }),
    payload: {},
  })
  assert.equal(replay.statusCode, 503)
  assert.equal(replay.json().errors[0].code, 'BOOTSTRAP_UNAVAILABLE')
})

test('protected endpoints require the session and report only implemented capability states', async (t) => {
  const app = createWorkbenchApp({ bootstrapToken })
  t.after(() => app.close())

  const anonymous = await app.inject({ method: 'GET', url: '/api/v1/session', headers: headers() })
  assert.equal(anonymous.statusCode, 401)
  assert.equal(anonymous.json().errors[0].code, 'SESSION_REQUIRED')

  const session = await bootstrap(app)
  const current = await app.inject({
    method: 'GET',
    url: '/api/v1/session',
    headers: headers({ cookie: session.cookie }),
  })
  assert.equal(current.statusCode, 200)
  assert.equal(current.json().data.principal.kind, 'local_owner')
  assert.equal(current.json().data.csrf_token, session.csrf)
  assert.deepEqual(current.json().data.spaces, [])
  assert.equal(current.json().data.persistence, 'not_implemented')

  const capabilities = await app.inject({
    method: 'GET',
    url: '/api/v1/system/capabilities',
    headers: headers({ cookie: session.cookie }),
  })
  assert.equal(capabilities.statusCode, 200)
  assert.deepEqual(capabilities.json().data, {
    local_session: 'available',
    projects: 'prototype',
    knowledge: 'prototype',
    native_runtime: 'not_implemented',
    deepseek_harness: 'poc_not_connected',
    hermes: 'candidate_not_connected',
    persistence: 'not_implemented',
  })
})

test('session revocation requires matching CSRF and invalidates the cookie', async (t) => {
  const app = createWorkbenchApp({ bootstrapToken })
  t.after(() => app.close())
  const session = await bootstrap(app)

  const withoutCsrf = await app.inject({
    method: 'DELETE',
    url: '/api/v1/session',
    headers: headers({ 'content-type': 'application/json', cookie: session.cookie, origin }),
    payload: {},
  })
  assert.equal(withoutCsrf.statusCode, 403)

  const revoked = await app.inject({
    method: 'DELETE',
    url: '/api/v1/session',
    headers: headers({
      'content-type': 'application/json',
      cookie: session.cookie,
      origin,
      'x-csrf-token': session.csrf,
    }),
    payload: {},
  })
  assert.equal(revoked.statusCode, 200)
  assert.equal(revoked.json().data.revoked, true)
  assert.match(revoked.headers['set-cookie'], /Max-Age=0/)

  const after = await app.inject({
    method: 'GET',
    url: '/api/v1/session',
    headers: headers({ cookie: session.cookie }),
  })
  assert.equal(after.statusCode, 401)
})

test('machine-readable API contract contains the implemented foundation and project work-item routes', async () => {
  const openapi = await readFile(new URL('../shared/contracts/openapi.yaml', import.meta.url), 'utf8')
  for (const route of [
    '/api/health:',
    '/api/v1/session/bootstrap:',
    '/api/v1/session:',
    '/api/v1/system/capabilities:',
    '/api/v1/spaces:',
    '/api/v1/spaces/{spaceId}:',
    '/api/v1/projects:',
    '/api/v1/projects/{projectId}:',
    '/api/v1/projects/{projectId}/transitions:',
    '/api/v1/projects/{projectId}/restore:',
    '/api/v1/projects/{projectId}/milestones:',
    '/api/v1/milestones/{milestoneId}:',
    '/api/v1/projects/{projectId}/tasks:',
    '/api/v1/tasks/{taskId}:',
    '/api/v1/tasks/{taskId}/transitions:',
    '/api/v1/projects/{projectId}/discussions:',
    '/api/v1/discussions/{discussionId}/entries:',
    '/api/v1/projects/{projectId}/decisions:',
    '/api/v1/discussions/{discussionId}/conversions:',
    '/api/v1/captures:',
    '/api/v1/captures/{captureId}/transitions:',
    '/api/v1/daily/{date}:',
    '/api/v1/daily-plans/{date}:',
    '/api/v1/daily-reviews/{date}:',
    '/api/v1/sources:',
    '/api/v1/sources/imports/markdown:',
    '/api/v1/context/search:',
  ]) {
    assert.match(openapi, new RegExp(route.replaceAll('/', '\\/')))
  }
  assert.doesNotMatch(openapi, /Harness.*available|Hermes.*available/i)
})
