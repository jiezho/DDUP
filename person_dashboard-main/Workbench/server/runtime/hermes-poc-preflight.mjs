import { createHash } from 'node:crypto'

import { ERROR_CODES, publicError } from '../../shared/contracts/errors.mjs'

export const HERMES_POC_PROFILE = Object.freeze({ key: 'hermes-api-contract-poc-v1', version: 1 })

const MAX_FRAME_BYTES = 64 * 1024
const REQUIRED_FEATURES = Object.freeze([
  'run_submission',
  'run_status',
  'run_events_sse',
  'run_stop',
  'run_steer',
  'run_approval_response',
  'approval_events',
])
const REQUIRED_ENDPOINTS = Object.freeze({
  runs: Object.freeze({ method: 'POST', path: '/v1/runs' }),
  run_status: Object.freeze({ method: 'GET', path: '/v1/runs/{run_id}' }),
  run_events: Object.freeze({ method: 'GET', path: '/v1/runs/{run_id}/events' }),
  run_approval: Object.freeze({ method: 'POST', path: '/v1/runs/{run_id}/approval' }),
  run_steer: Object.freeze({ method: 'POST', path: '/v1/runs/{run_id}/steer' }),
  run_stop: Object.freeze({ method: 'POST', path: '/v1/runs/{run_id}/stop' }),
})
const RUN_EVENT_TYPES = new Set([
  'message.delta',
  'tool.started',
  'tool.completed',
  'reasoning.available',
  'approval.request',
  'subagent.start',
  'subagent.complete',
  'run.completed',
  'run.failed',
  'run.cancelled',
])
const TERMINAL_STATUS = Object.freeze({
  'run.completed': 'completed',
  'run.failed': 'failed',
  'run.cancelled': 'cancelled',
})

const capabilities = Object.freeze({
  streaming: true,
  tool_calls: true,
  approvals: true,
  steering: true,
  cancellation: true,
  resume: false,
  checkpoints: false,
  child_runs: true,
  usage: true,
  artifacts: false,
})

const descriptor = Object.freeze({
  runtime_key: 'hermes-candidate',
  adapter_version: '0.1.0-contract-preflight',
  runtime_name: 'Hermes Agent',
  runtime_version: null,
  status: 'candidate',
  protocol: 'http_sse',
  capabilities,
  data_residency: 'external_local_process',
  supported_profiles: [HERMES_POC_PROFILE.key],
  connected: false,
  readiness: 'api_contract_reviewed_not_installed',
  limitation_codes: Object.freeze([
    'G6B_NOT_APPROVED',
    'HERMES_NOT_INSTALLED',
    'NO_LIVE_CAPABILITY_HANDSHAKE',
    'SERVER_SIDE_FULL_TOOLSET_REQUIRES_ISOLATION',
    'MEMORY_AND_SESSION_TRUTH_NOT_MAPPED',
    'MESSAGE_IDENTITY_NOT_MAPPED',
    'NO_REAL_PROVIDER_OR_PLATFORM_CREDENTIALS',
  ]),
})

function protocolError(message = 'Hermes POC 协议载荷无法安全处理。') {
  return publicError(ERROR_CODES.RUNTIME_PROTOCOL_ERROR, message, { statusCode: 409, retryable: false })
}

function incompatibleError() {
  return publicError(ERROR_CODES.RUNTIME_INCOMPATIBLE, 'Hermes API 契约与已复核版本不兼容。', { statusCode: 409, retryable: false })
}

function plainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
}

function digest(value) {
  return createHash('sha256').update(String(value)).digest('hex')
}

function safeDigest(value) {
  return typeof value === 'string' && value.length > 0 ? digest(value) : null
}

export function hermesPocDescriptor() {
  return descriptor
}

export function validateHermesCapabilities(value) {
  if (!plainObject(value) || value.object !== 'hermes.api_server.capabilities' || value.platform !== 'hermes-agent') {
    throw incompatibleError()
  }
  if (!plainObject(value.auth) || value.auth.type !== 'bearer' || value.auth.required !== true) throw incompatibleError()
  if (!plainObject(value.runtime) || value.runtime.mode !== 'server_agent' || value.runtime.tool_execution !== 'server' || value.runtime.split_runtime !== false) {
    throw incompatibleError()
  }
  if (!plainObject(value.features) || REQUIRED_FEATURES.some((name) => value.features[name] !== true)) throw incompatibleError()
  if (!plainObject(value.endpoints)) throw incompatibleError()
  for (const [name, expected] of Object.entries(REQUIRED_ENDPOINTS)) {
    const actual = value.endpoints[name]
    if (!plainObject(actual) || actual.method !== expected.method || actual.path !== expected.path) throw incompatibleError()
  }
  return Object.freeze({
    compatible: true,
    protocol: 'http_sse',
    platform: 'hermes-agent',
    bearer_auth_required: true,
    server_side_tool_execution: true,
    reviewed_features: Object.freeze([...REQUIRED_FEATURES]),
  })
}

export function inspectHermesRunSseFrame(frame, { maxFrameBytes = MAX_FRAME_BYTES } = {}) {
  if (typeof frame !== 'string') throw protocolError()
  const frameBytes = Buffer.byteLength(frame, 'utf8')
  if (frameBytes === 0 || frameBytes > maxFrameBytes) throw protocolError('Hermes POC SSE 帧超出允许大小。')

  const normalized = frame.replace(/\r\n/g, '\n').trimEnd()
  if (normalized.startsWith(':')) {
    if (!/^: (keepalive|stream closed)$/.test(normalized)) throw protocolError()
    return Object.freeze({ type: 'runtime.transport.observed', payload: Object.freeze({ transport_event: normalized.slice(2), frame_digest: digest(frame), frame_bytes: frameBytes }) })
  }

  const lines = normalized.split('\n')
  if (lines.length !== 1 || !lines[0].startsWith('data: ')) throw protocolError()
  let data
  try {
    data = JSON.parse(lines[0].slice(6))
  } catch {
    throw protocolError()
  }
  if (!plainObject(data) || typeof data.event !== 'string' || !RUN_EVENT_TYPES.has(data.event)) throw protocolError()
  if (typeof data.run_id !== 'string' || data.run_id.length === 0 || data.run_id.length > 256) throw protocolError()

  const payload = {
    runtime_event_type: data.event,
    run_ref_digest: safeDigest(data.run_id),
    frame_digest: digest(frame),
    frame_bytes: frameBytes,
  }
  if (TERMINAL_STATUS[data.event]) payload.runtime_status = TERMINAL_STATUS[data.event]
  if (data.event === 'tool.started' || data.event === 'tool.completed') {
    payload.tool_ref_digest = safeDigest(data.tool)
    if (data.event === 'tool.completed') payload.tool_error = data.error === true
  }
  if (data.event === 'approval.request') {
    if (!Array.isArray(data.choices) || !data.choices.includes('deny')) throw protocolError()
    payload.approval_request_digest = safeDigest(data.request_id)
    payload.deny_available = true
  }
  if (data.event === 'subagent.start' || data.event === 'subagent.complete') {
    payload.child_ref_digest = safeDigest(data.child_session_id ?? data.subagent_id)
  }
  return Object.freeze({ type: 'runtime.extension.observed', payload: Object.freeze(payload) })
}
