import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { createWorkbenchApp } from '../server/app.mjs'
import { createUuidV7 } from '../shared/contracts/ids.mjs'

const host = '127.0.0.1:8787'
const origin = `http://${host}`
const headers = (extra = {}) => ({ host, ...extra })

async function fixture(t, { mode = 'complete', token = `synthetic-runtime-${crypto.randomUUID()}` } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'workbench-runtime-test-'))
  const databasePath = join(root, 'workbench.db')
  const sourceStoragePath = join(root, 'controlled-sources')
  const apps = []
  const createApp = (runtimeMode = mode) => createWorkbenchApp({
    bootstrapToken: token,
    databasePath,
    sourceStoragePath,
    nativeRuntimeMode: runtimeMode,
    now: () => Date.UTC(2026, 7, 27, 5),
  })
  const app = createApp()
  apps.push(app)
  t.after(async () => {
    for (const current of apps.reverse()) await current.close().catch(() => {})
    await rm(root, { recursive: true, force: true })
  })
  const boot = await app.inject({
    method: 'POST', url: '/api/v1/session/bootstrap',
    headers: headers({ 'content-type': 'application/json', origin, 'x-workbench-bootstrap': token }), payload: {},
  })
  const cookie = boot.headers['set-cookie'].split(';', 1)[0]
  const csrf = boot.json().data.csrf_token
  const session = await app.inject({ method: 'GET', url: '/api/v1/session', headers: headers({ cookie }) })
  const spaceId = session.json().data.spaces[0].id
  const writeHeaders = (key, version = null) => headers({
    'content-type': 'application/json', origin, cookie, 'x-csrf-token': csrf, 'idempotency-key': key,
    ...(version == null ? {} : { 'if-match': `"v${version}"` }),
  })
  const contextPackageResponse = await app.inject({
    method: 'POST', url: '/api/v1/context/packages', headers: writeHeaders(`runtime-package-${crypto.randomUUID()}`),
    payload: { space_id: spaceId, name: '合成 Runtime 范围', purpose: '只验证确定性运行生命周期，不生成真实回答。', expires_at: null },
  })
  assert.equal(contextPackageResponse.statusCode, 201, contextPackageResponse.body)
  const restart = async (runtimeMode = mode) => {
    await apps.at(-1).close()
    const reopened = createApp(runtimeMode)
    apps.push(reopened)
    const reboot = await reopened.inject({
      method: 'POST', url: '/api/v1/session/bootstrap',
      headers: headers({ 'content-type': 'application/json', origin, 'x-workbench-bootstrap': token }), payload: {},
    })
    assert.equal(reboot.statusCode, 200, reboot.body)
    return { app: reopened, cookie: reboot.headers['set-cookie'].split(';', 1)[0], csrf: reboot.json().data.csrf_token }
  }
  return { app, cookie, csrf, databasePath, root, spaceId, writeHeaders, restart, contextPackage: contextPackageResponse.json().data }
}

function runPayload(f, overrides = {}) {
  return {
    space_id: f.spaceId,
    context_package_id: f.contextPackage.id,
    context_package_version: f.contextPackage.version,
    goal: '验证合成运行的状态与事件顺序。',
    ...overrides,
  }
}

test('runtime registry exposes only the implemented native adapter as connected and healthy', async (t) => {
  const f = await fixture(t)
  const listed = await f.app.inject({ method: 'GET', url: '/api/v1/runtimes', headers: headers({ cookie: f.cookie }) })
  assert.equal(listed.statusCode, 200, listed.body)
  const items = listed.json().data.items
  assert.equal(items.length, 3)
  const native = items.find((item) => item.runtime_key === 'native-v1')
  assert.equal(native.status, 'available')
  assert.equal(native.connected, true)
  assert.equal(native.capabilities.cancellation, true)
  assert.equal(native.capabilities.tool_calls, true)
  assert.equal(native.capabilities.checkpoints, true)
  const harness = items.find((item) => item.runtime_key === 'deepseek-harness-poc')
  assert.equal(harness.connected, false)
  assert.equal(harness.readiness, 'client_preflight_passed_server_missing')
  assert.equal(harness.protocol, 'stdio_jsonrpc')
  assert.equal(harness.capabilities.cancellation, false)
  assert.equal(items.find((item) => item.runtime_key === 'hermes-candidate').connected, false)

  const health = await f.app.inject({ method: 'GET', url: '/api/v1/runtimes/native-v1/health', headers: headers({ cookie: f.cookie }) })
  assert.equal(health.statusCode, 200, health.body)
  assert.equal(health.json().data.status, 'healthy')
  assert.deepEqual(health.json().data.details, [])
  assert.doesNotMatch(health.body, /[A-Z]:\\|token|secret|cookie/i)

  const unavailable = await f.app.inject({ method: 'GET', url: '/api/v1/runtimes/deepseek-harness-poc/health', headers: headers({ cookie: f.cookie }) })
  assert.equal(unavailable.statusCode, 409)
  assert.equal(unavailable.json().errors[0].code, 'RUNTIME_UNAVAILABLE')

  const capabilities = await f.app.inject({ method: 'GET', url: '/api/v1/system/capabilities', headers: headers({ cookie: f.cookie }) })
  assert.equal(capabilities.statusCode, 200, capabilities.body)
  assert.equal(capabilities.json().data.native_runtime, 'available')
  assert.equal(capabilities.json().data.deepseek_harness, 'poc_not_connected')
  assert.equal(capabilities.json().data.hermes, 'candidate_not_connected')
})

test('native deterministic run persists ordered replayable events without answers or context body copies', async (t) => {
  const f = await fixture(t)
  const key = 'native-run-complete-00000000001'
  const started = await f.app.inject({ method: 'POST', url: '/api/v1/runs', headers: f.writeHeaders(key), payload: runPayload(f) })
  assert.equal(started.statusCode, 202, started.body)
  const run = started.json().data
  assert.equal(run.status, 'succeeded')
  assert.equal(run.terminal, true)
  assert.equal(run.version, 3)
  assert.match(run.context_digest, /^[a-f0-9]{64}$/)

  const events = await f.app.inject({
    method: 'GET', url: `/api/v1/runs/${run.id}/events?space_id=${f.spaceId}&after_seq=0`, headers: headers({ cookie: f.cookie }),
  })
  assert.equal(events.statusCode, 200, events.body)
  assert.deepEqual(events.json().data.items.map((item) => item.seq), [1, 2, 3, 4, 5, 6])
  assert.deepEqual(events.json().data.items.map((item) => item.type), ['run.queued', 'run.started', 'checkpoint.created', 'context.scope.resolved', 'run.succeeded', 'checkpoint.created'])
  assert.equal(events.json().data.items[3].payload.generated_answer, false)
  assert.doesNotMatch(events.body, /只验证确定性运行生命周期|验证合成运行的状态|quote|body_text/)

  const replay = await f.app.inject({ method: 'POST', url: '/api/v1/runs', headers: f.writeHeaders(key), payload: runPayload(f) })
  assert.equal(replay.statusCode, 202, replay.body)
  assert.equal(replay.json().meta.idempotency_replayed, true)
  assert.deepEqual(replay.json().data, run)

  const database = new DatabaseSync(f.databasePath)
  try {
    assert.equal(database.prepare('SELECT count(*) AS count FROM agent_runs').get().count, 1)
    assert.equal(database.prepare('SELECT count(*) AS count FROM run_events').get().count, 6)
    assert.equal(database.prepare('SELECT count(*) AS count FROM run_checkpoints').get().count, 2)
    assert.equal(database.prepare("SELECT count(*) AS count FROM audit_events WHERE action = 'agent_run.start'").get().count, 1)
    assert.equal(database.prepare("SELECT count(*) AS count FROM outbox_events WHERE aggregate_type = 'agent_run'").get().count, 2)
    assert.doesNotMatch(database.prepare("SELECT group_concat(payload_json, '') AS payload FROM run_events").get().payload, /验证合成运行的状态|只验证确定性/)
  } finally {
    database.close()
  }
})

test('start rejects stale scope, disabled AI policy, disconnected runtimes and idempotency conflicts without run writes', async (t) => {
  const f = await fixture(t)
  const stale = await f.app.inject({
    method: 'POST', url: '/api/v1/runs', headers: f.writeHeaders('native-run-stale-package-00001'),
    payload: runPayload(f, { context_package_version: 99 }),
  })
  assert.equal(stale.statusCode, 409)
  assert.equal(stale.json().errors[0].code, 'VERSION_CONFLICT')

  const disconnected = await f.app.inject({
    method: 'POST', url: '/api/v1/runs', headers: f.writeHeaders('native-run-disconnected-000001'),
    payload: runPayload(f, { runtime_key: 'deepseek-harness-poc' }),
  })
  assert.equal(disconnected.statusCode, 422)

  const key = 'native-run-idempotency-0000001'
  const first = await f.app.inject({ method: 'POST', url: '/api/v1/runs', headers: f.writeHeaders(key), payload: runPayload(f) })
  assert.equal(first.statusCode, 202, first.body)
  const conflict = await f.app.inject({ method: 'POST', url: '/api/v1/runs', headers: f.writeHeaders(key), payload: runPayload(f, { goal: '另一个合成目标。' }) })
  assert.equal(conflict.statusCode, 409)
  assert.equal(conflict.json().errors[0].code, 'IDEMPOTENCY_CONFLICT')

  const database = new DatabaseSync(f.databasePath)
  try {
    database.prepare("UPDATE spaces SET default_ai_policy = 'deny_ai' WHERE id = ?").run(f.spaceId)
  } finally {
    database.close()
  }
  const denied = await f.app.inject({ method: 'POST', url: '/api/v1/runs', headers: f.writeHeaders('native-run-denied-policy-00001'), payload: runPayload(f) })
  assert.equal(denied.statusCode, 403)
  assert.equal(denied.json().errors[0].code, 'ACTION_NOT_ALLOWED')
  assert.doesNotMatch(denied.body, /合成 Runtime 范围/)

  const otherSpace = createUuidV7(() => Date.UTC(2026, 7, 27, 6))
  const isolated = await f.app.inject({
    method: 'GET', url: `/api/v1/runs?space_id=${otherSpace}`, headers: headers({ cookie: f.cookie }),
  })
  assert.equal(isolated.statusCode, 404)
  assert.equal(isolated.json().errors[0].code, 'OBJECT_NOT_AVAILABLE')
})

test('held native run can be cancelled once with optimistic versioning and replay-safe events', async (t) => {
  const f = await fixture(t, { mode: 'hold' })
  const started = await f.app.inject({ method: 'POST', url: '/api/v1/runs', headers: f.writeHeaders('native-held-start-0000000001'), payload: runPayload(f) })
  const run = started.json().data
  assert.equal(run.status, 'running')
  assert.equal(run.version, 2)
  const key = 'native-held-cancel-000000001'
  const cancelled = await f.app.inject({
    method: 'POST', url: `/api/v1/runs/${run.id}/cancel`, headers: f.writeHeaders(key, run.version),
    payload: { space_id: f.spaceId, reason: 'user_requested' },
  })
  assert.equal(cancelled.statusCode, 200, cancelled.body)
  assert.equal(cancelled.json().data.status, 'cancelled')
  assert.equal(cancelled.json().data.version, 3)
  const replay = await f.app.inject({
    method: 'POST', url: `/api/v1/runs/${run.id}/cancel`, headers: f.writeHeaders(key, run.version),
    payload: { space_id: f.spaceId, reason: 'user_requested' },
  })
  assert.equal(replay.statusCode, 200, replay.body)
  assert.equal(replay.json().meta.idempotency_replayed, true)
  const stale = await f.app.inject({
    method: 'POST', url: `/api/v1/runs/${run.id}/cancel`, headers: f.writeHeaders('native-held-cancel-stale-0001', 2),
    payload: { space_id: f.spaceId, reason: 'user_requested' },
  })
  assert.equal(stale.statusCode, 409)
  assert.equal(stale.json().errors[0].code, 'VERSION_CONFLICT')

  const events = await f.app.inject({
    method: 'GET', url: `/api/v1/runs/${run.id}/events?space_id=${f.spaceId}&after_seq=1`, headers: headers({ cookie: f.cookie }),
  })
  assert.deepEqual(events.json().data.items.map((item) => item.type), ['run.started', 'checkpoint.created', 'run.cancelled', 'checkpoint.created'])
})

test('native runtime failures persist a safe terminal event and remain readable after restart', async (t) => {
  const f = await fixture(t, { mode: 'fail' })
  const started = await f.app.inject({ method: 'POST', url: '/api/v1/runs', headers: f.writeHeaders('native-failure-start-000000001'), payload: runPayload(f) })
  assert.equal(started.statusCode, 202, started.body)
  const run = started.json().data
  assert.equal(run.status, 'failed')
  assert.equal(run.error_code, 'RUNTIME_PROTOCOL_ERROR')
  assert.doesNotMatch(started.body, /stack|at createNativeRuntime|[A-Z]:\\/i)
  const events = await f.app.inject({
    method: 'GET', url: `/api/v1/runs/${run.id}/events?space_id=${f.spaceId}`, headers: headers({ cookie: f.cookie }),
  })
  assert.equal(events.json().data.items.at(-2).type, 'run.failed')
  assert.equal(events.json().data.items.at(-2).payload.error_code, 'RUNTIME_PROTOCOL_ERROR')

  const restarted = await f.restart('complete')
  const recovered = await restarted.app.inject({
    method: 'GET', url: `/api/v1/runs/${run.id}?space_id=${f.spaceId}`, headers: headers({ cookie: restarted.cookie }),
  })
  assert.equal(recovered.statusCode, 200, recovered.body)
  assert.equal(recovered.json().data.status, 'failed')
  assert.equal(recovered.json().data.error_code, 'RUNTIME_PROTOCOL_ERROR')
  const replayedEvents = await restarted.app.inject({
    method: 'GET', url: `/api/v1/runs/${run.id}/events?space_id=${f.spaceId}`, headers: headers({ cookie: restarted.cookie }),
  })
  assert.deepEqual(replayedEvents.json().data.items.map((item) => item.type), ['run.queued', 'run.started', 'checkpoint.created', 'run.failed', 'checkpoint.created'])
})

test('checkpoint replay and terminal SSE resume expose bounded safe events', async (t) => {
  const f = await fixture(t)
  const started = await f.app.inject({
    method: 'POST', url: '/api/v1/runs', headers: f.writeHeaders('native-checkpoint-stream-00001'), payload: runPayload(f),
  })
  const run = started.json().data

  const checkpoints = await f.app.inject({
    method: 'GET', url: `/api/v1/runs/${run.id}/checkpoints?space_id=${f.spaceId}`, headers: headers({ cookie: f.cookie }),
  })
  assert.equal(checkpoints.statusCode, 200, checkpoints.body)
  assert.deepEqual(checkpoints.json().data.items.map((item) => item.run_status), ['running', 'succeeded'])
  assert.deepEqual(checkpoints.json().data.items.map((item) => item.event_seq), [2, 5])
  assert.ok(checkpoints.json().data.items.every((item) => item.context_digest === run.context_digest))
  assert.doesNotMatch(checkpoints.body, /验证合成运行的状态|只验证确定性|cookie|secret/i)

  const stream = await f.app.inject({
    method: 'GET',
    url: `/api/v1/runs/${run.id}/events/stream?space_id=${f.spaceId}&after_seq=0`,
    headers: headers({ cookie: f.cookie, accept: 'text/event-stream', 'last-event-id': '4' }),
  })
  assert.equal(stream.statusCode, 200, stream.body)
  assert.match(stream.headers['content-type'], /^text\/event-stream/)
  assert.doesNotMatch(stream.body, /id: [1-4]\n/)
  assert.match(stream.body, /id: 5\nevent: run\.succeeded/)
  assert.match(stream.body, /id: 6\nevent: checkpoint\.created/)
  assert.doesNotMatch(stream.body, /验证合成运行的状态|只验证确定性|cookie|secret/i)

  const invalidCursor = await f.app.inject({
    method: 'GET',
    url: `/api/v1/runs/${run.id}/events/stream?space_id=${f.spaceId}`,
    headers: headers({ cookie: f.cookie, 'last-event-id': 'not-a-seq' }),
  })
  assert.equal(invalidCursor.statusCode, 400)
  assert.equal(invalidCursor.json().errors[0].code, 'INVALID_CURSOR')
})

test('interrupted run becomes a retryable safe failure and creates one linked retry', async (t) => {
  const f = await fixture(t, { mode: 'hold' })
  const started = await f.app.inject({
    method: 'POST', url: '/api/v1/runs', headers: f.writeHeaders('native-recovery-start-0000001'), payload: runPayload(f),
  })
  const source = started.json().data
  assert.equal(source.status, 'running')

  const restarted = await f.restart('complete')
  const recovered = await restarted.app.inject({
    method: 'GET', url: `/api/v1/runs/${source.id}?space_id=${f.spaceId}`, headers: headers({ cookie: restarted.cookie }),
  })
  assert.equal(recovered.statusCode, 200, recovered.body)
  assert.equal(recovered.json().data.status, 'failed')
  assert.equal(recovered.json().data.error_code, 'RUNTIME_RECOVERY_REQUIRED')
  assert.equal(recovered.json().data.retryable, true)

  const retryHeaders = headers({
    'content-type': 'application/json', origin, cookie: restarted.cookie,
    'x-csrf-token': restarted.csrf, 'idempotency-key': 'native-recovery-retry-000001',
    'if-match': `"v${recovered.json().data.version}"`,
  })
  const retried = await restarted.app.inject({
    method: 'POST', url: `/api/v1/runs/${source.id}/retry`, headers: retryHeaders, payload: { space_id: f.spaceId },
  })
  assert.equal(retried.statusCode, 202, retried.body)
  assert.equal(retried.json().data.status, 'succeeded')
  assert.equal(retried.json().data.retry_of_run_id, source.id)
  const replay = await restarted.app.inject({
    method: 'POST', url: `/api/v1/runs/${source.id}/retry`, headers: retryHeaders, payload: { space_id: f.spaceId },
  })
  assert.equal(replay.statusCode, 202, replay.body)
  assert.equal(replay.json().meta.idempotency_replayed, true)
  assert.equal(replay.json().data.id, retried.json().data.id)

  const database = new DatabaseSync(f.databasePath)
  try {
    assert.equal(database.prepare('SELECT count(*) AS count FROM agent_runs WHERE retry_of_run_id = ?').get(source.id).count, 1)
    assert.equal(database.prepare("SELECT count(*) AS count FROM audit_events WHERE action = 'agent_run.recover_as_failed'").get().count, 1)
    assert.equal(database.prepare("SELECT count(*) AS count FROM audit_events WHERE action = 'agent_run.retry'").get().count, 1)
  } finally {
    database.close()
  }
})
