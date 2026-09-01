import assert from 'node:assert/strict'
import test from 'node:test'

import {
  HERMES_POC_PROFILE,
  hermesPocDescriptor,
  inspectHermesRunSseFrame,
  validateHermesCapabilities,
} from '../server/runtime/hermes-poc-preflight.mjs'

const capabilityFixture = () => ({
  object: 'hermes.api_server.capabilities',
  platform: 'hermes-agent',
  model: 'hermes-agent',
  auth: { type: 'bearer', required: true },
  runtime: { mode: 'server_agent', tool_execution: 'server', split_runtime: false },
  features: {
    run_submission: true,
    run_status: true,
    run_events_sse: true,
    run_stop: true,
    run_steer: true,
    run_approval_response: true,
    approval_events: true,
  },
  endpoints: {
    runs: { method: 'POST', path: '/v1/runs' },
    run_status: { method: 'GET', path: '/v1/runs/{run_id}' },
    run_events: { method: 'GET', path: '/v1/runs/{run_id}/events' },
    run_approval: { method: 'POST', path: '/v1/runs/{run_id}/approval' },
    run_steer: { method: 'POST', path: '/v1/runs/{run_id}/steer' },
    run_stop: { method: 'POST', path: '/v1/runs/{run_id}/stop' },
  },
})

test('Hermes contract descriptor remains disconnected and explicitly bounded', () => {
  const value = hermesPocDescriptor()
  assert.equal(value.runtime_key, 'hermes-candidate')
  assert.equal(value.connected, false)
  assert.equal(value.readiness, 'api_contract_reviewed_not_installed')
  assert.equal(value.protocol, 'http_sse')
  assert.deepEqual(value.supported_profiles, [HERMES_POC_PROFILE.key])
  assert.equal(value.capabilities.streaming, true)
  assert.equal(value.capabilities.approvals, true)
  assert.equal(value.capabilities.cancellation, true)
  assert.equal(value.capabilities.artifacts, false)
  assert.ok(value.limitation_codes.includes('G6B_NOT_APPROVED'))
  assert.ok(value.limitation_codes.includes('SERVER_SIDE_FULL_TOOLSET_REQUIRES_ISOLATION'))
})

test('Hermes capabilities preflight requires bearer auth, server execution and the reviewed Runs API', () => {
  const value = validateHermesCapabilities(capabilityFixture())
  assert.equal(value.compatible, true)
  assert.equal(value.bearer_auth_required, true)
  assert.equal(value.server_side_tool_execution, true)

  for (const mutate of [
    (item) => { item.auth.required = false },
    (item) => { item.runtime.split_runtime = true },
    (item) => { item.features.run_stop = false },
    (item) => { item.endpoints.run_events.path = '/private/events' },
  ]) {
    const fixture = capabilityFixture()
    mutate(fixture)
    assert.throws(() => validateHermesCapabilities(fixture), (error) => error.code === 'RUNTIME_INCOMPATIBLE')
  }
})

test('Hermes SSE preflight retains bounded metadata but no message, command or identifier content', () => {
  const sensitive = 'synthetic-run-C:\\private\\fixture sk-synthetic-do-not-store'
  const message = `data: ${JSON.stringify({ event: 'message.delta', run_id: sensitive, delta: sensitive })}\n\n`
  const observed = inspectHermesRunSseFrame(message)
  const serialized = JSON.stringify(observed)
  assert.equal(observed.type, 'runtime.extension.observed')
  assert.equal(observed.payload.runtime_event_type, 'message.delta')
  assert.match(observed.payload.run_ref_digest, /^[a-f0-9]{64}$/)
  assert.doesNotMatch(serialized, /private|synthetic-run|sk-synthetic/)

  const approval = inspectHermesRunSseFrame(`data: ${JSON.stringify({
    event: 'approval.request',
    run_id: sensitive,
    request_id: sensitive,
    command: sensitive,
    choices: ['once', 'deny'],
  })}\n\n`)
  assert.equal(approval.payload.deny_available, true)
  assert.match(approval.payload.approval_request_digest, /^[a-f0-9]{64}$/)
  assert.doesNotMatch(JSON.stringify(approval), /private|synthetic-run|sk-synthetic|command/)
})

test('Hermes SSE preflight accepts official transport comments and fails closed on unsafe frames', () => {
  assert.equal(inspectHermesRunSseFrame(': keepalive\n\n').payload.transport_event, 'keepalive')
  const failures = [
    '',
    ': arbitrary',
    'event: message.delta\ndata: {}\n\n',
    'data: {broken}\n\n',
    `data: ${JSON.stringify({ event: 'unknown.event', run_id: 'run_fixture' })}\n\n`,
    `data: ${JSON.stringify({ event: 'message.delta' })}\n\n`,
    `data: ${JSON.stringify({ event: 'approval.request', run_id: 'run_fixture', choices: ['always'] })}\n\n`,
  ]
  for (const frame of failures) {
    assert.throws(() => inspectHermesRunSseFrame(frame), (error) => error.code === 'RUNTIME_PROTOCOL_ERROR')
  }
  assert.throws(
    () => inspectHermesRunSseFrame('x'.repeat(100), { maxFrameBytes: 32 }),
    (error) => error.code === 'RUNTIME_PROTOCOL_ERROR',
  )
})
