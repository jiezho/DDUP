import assert from 'node:assert/strict'
import test from 'node:test'

import {
  HARNESS_POC_PROFILE,
  harnessPocDescriptor,
  inspectHarnessPocFrame,
  validateHarnessPocHandshake,
} from '../server/runtime/harness-poc-preflight.mjs'

test('Harness preflight descriptor remains disconnected and advertises only evidenced wire capabilities', () => {
  const value = harnessPocDescriptor()
  assert.equal(value.runtime_key, 'deepseek-harness-poc')
  assert.equal(value.connected, false)
  assert.equal(value.readiness, 'protocol_preflight_ready')
  assert.equal(value.protocol, 'stdio_jsonrpc')
  assert.deepEqual(value.supported_profiles, [HARNESS_POC_PROFILE.key])
  assert.equal(value.capabilities.streaming, true)
  assert.equal(value.capabilities.cancellation, false)
  assert.equal(value.capabilities.approvals, false)
  assert.equal(value.capabilities.tool_calls, false)
})

test('Harness preflight accepts only the official wire identity reviewed for G6a', () => {
  assert.deepEqual(validateHarnessPocHandshake({
    serverInfo: { name: 'deepseek-harness-sdk-runtime', version: '0.0.1' },
  }), {
    compatible: true,
    protocol: 'stdio_jsonrpc',
    server_name: 'deepseek-harness-sdk-runtime',
    wire_version: '0.0.1',
  })
  assert.throws(
    () => validateHarnessPocHandshake({ serverInfo: { name: 'another-runtime', version: '0.0.1' } }),
    (error) => error.code === 'RUNTIME_INCOMPATIBLE',
  )
  assert.throws(
    () => validateHarnessPocHandshake({ serverInfo: { name: 'deepseek-harness-sdk-runtime', version: '0.0.2' } }),
    (error) => error.code === 'RUNTIME_INCOMPATIBLE',
  )
})

test('Harness notifications become bounded metadata without retaining session ids or runtime content', () => {
  const sensitive = 'synthetic-session-C:\\private\\fixture sk-synthetic-do-not-store'
  const line = JSON.stringify({
    jsonrpc: '2.0',
    method: 'session.event',
    params: {
      sessionId: sensitive,
      event: { type: 'assistant.message', content: sensitive },
    },
  })
  const observed = inspectHarnessPocFrame(line)
  const serialized = JSON.stringify(observed)
  assert.equal(observed.type, 'runtime.extension.observed')
  assert.equal(observed.payload.runtime_event_type, 'assistant.message')
  assert.equal(observed.payload.frame_bytes, Buffer.byteLength(line, 'utf8'))
  assert.doesNotMatch(serialized, /private|synthetic-session|sk-synthetic/)
  assert.match(observed.payload.session_ref_digest, /^[a-f0-9]{64}$/)
})

test('Harness preflight fails closed on malformed, oversized, request, and unsupported frames', () => {
  const failures = [
    '',
    '{broken',
    JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'session.status', params: { status: 'running' } }),
    JSON.stringify({ jsonrpc: '2.0', method: 'subagent.started', params: {} }),
    JSON.stringify({ jsonrpc: '2.0', method: 'session.status', params: { status: 'waiting' } }),
  ]
  for (const frame of failures) {
    assert.throws(() => inspectHarnessPocFrame(frame), (error) => error.code === 'RUNTIME_PROTOCOL_ERROR')
  }
  assert.throws(
    () => inspectHarnessPocFrame('x'.repeat(100), { maxFrameBytes: 32 }),
    (error) => error.code === 'RUNTIME_PROTOCOL_ERROR',
  )
})

