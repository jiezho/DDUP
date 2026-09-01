import { createHash } from 'node:crypto'

import { ERROR_CODES, publicError } from '../../shared/contracts/errors.mjs'

export const HARNESS_POC_PROFILE = Object.freeze({ key: 'harness-readonly-research-poc-v1', version: 1 })

const MAX_FRAME_BYTES = 64 * 1024
const SERVER_NAME = 'deepseek-harness-sdk-runtime'
const WIRE_VERSION = '0.0.1'
const NOTIFICATION_METHODS = new Set(['session.event', 'session.status'])

const capabilities = Object.freeze({
  streaming: true,
  tool_calls: false,
  approvals: false,
  steering: false,
  cancellation: false,
  resume: false,
  checkpoints: false,
  child_runs: false,
  usage: false,
  artifacts: false,
})

const descriptor = Object.freeze({
  runtime_key: 'deepseek-harness-poc',
  adapter_version: '0.1.0-preflight',
  runtime_name: 'DeepSeek Harness',
  runtime_version: null,
  status: 'poc',
  protocol: 'stdio_jsonrpc',
  capabilities,
  data_residency: 'local_process',
  supported_profiles: [HARNESS_POC_PROFILE.key],
  connected: false,
  readiness: 'protocol_preflight_ready',
  limitation_codes: Object.freeze([
    'DEPENDENCY_NOT_APPROVED',
    'NO_PROTOCOL_NEGOTIATION',
    'NO_SESSION_CANCEL',
    'NO_RUNTIME_APPROVAL_REQUESTS',
  ]),
})

function protocolError(message = 'Harness POC 协议帧无法安全处理。') {
  return publicError(ERROR_CODES.RUNTIME_PROTOCOL_ERROR, message, { statusCode: 409, retryable: false })
}

function incompatibleError() {
  return publicError(ERROR_CODES.RUNTIME_INCOMPATIBLE, 'Harness POC 协议握手不兼容。', { statusCode: 409, retryable: false })
}

function digest(value) {
  return createHash('sha256').update(String(value)).digest('hex')
}

function plainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
}

function safeSessionRef(params) {
  const sessionId = params.sessionId ?? params.session_id ?? params.session?.id
  return typeof sessionId === 'string' && sessionId.length > 0 ? digest(sessionId) : null
}

export function harnessPocDescriptor() {
  return descriptor
}

export function validateHarnessPocHandshake(result) {
  if (!plainObject(result) || !plainObject(result.serverInfo)) throw incompatibleError()
  if (result.serverInfo.name !== SERVER_NAME || result.serverInfo.version !== WIRE_VERSION) throw incompatibleError()
  return Object.freeze({
    compatible: true,
    protocol: 'stdio_jsonrpc',
    server_name: SERVER_NAME,
    wire_version: WIRE_VERSION,
  })
}

export function inspectHarnessPocFrame(line, { maxFrameBytes = MAX_FRAME_BYTES } = {}) {
  if (typeof line !== 'string') throw protocolError()
  const frameBytes = Buffer.byteLength(line, 'utf8')
  if (frameBytes === 0 || frameBytes > maxFrameBytes) throw protocolError('Harness POC 协议帧超出允许大小。')

  let frame
  try {
    frame = JSON.parse(line)
  } catch {
    throw protocolError()
  }
  if (!plainObject(frame) || frame.jsonrpc !== '2.0' || typeof frame.method !== 'string' || 'id' in frame) {
    throw protocolError()
  }
  if (!NOTIFICATION_METHODS.has(frame.method) || !plainObject(frame.params)) throw protocolError()

  const sessionRefDigest = safeSessionRef(frame.params)
  if (frame.method === 'session.status') {
    const status = frame.params.status
    if (!['running', 'idle'].includes(status)) throw protocolError()
    return Object.freeze({
      type: 'runtime.extension.observed',
      payload: Object.freeze({
        runtime_method: frame.method,
        runtime_status: status,
        session_ref_digest: sessionRefDigest,
        frame_digest: digest(line),
      }),
    })
  }

  const event = plainObject(frame.params.event) ? frame.params.event : null
  const eventType = event?.type
  if (typeof eventType !== 'string' || eventType.length === 0 || eventType.length > 120) throw protocolError()
  return Object.freeze({
    type: 'runtime.extension.observed',
    payload: Object.freeze({
      runtime_method: frame.method,
      runtime_event_type: eventType,
      session_ref_digest: sessionRefDigest,
      frame_digest: digest(line),
      frame_bytes: frameBytes,
    }),
  })
}

