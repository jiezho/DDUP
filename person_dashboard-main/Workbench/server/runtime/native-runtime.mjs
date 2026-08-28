import { ERROR_CODES, publicError } from '../../shared/contracts/errors.mjs'
import { NATIVE_PROFILE } from '../../shared/contracts/runtime.mjs'

const CAPABILITIES = Object.freeze({
  streaming: false,
  tool_calls: false,
  approvals: false,
  steering: false,
  cancellation: true,
  resume: false,
  checkpoints: false,
  child_runs: false,
  usage: false,
  artifacts: false,
})

export function createNativeRuntime({ mode = 'complete', now = Date.now } = {}) {
  if (!['complete', 'hold', 'fail'].includes(mode)) throw new TypeError('unsupported native runtime mode')
  const descriptor = Object.freeze({
    runtime_key: 'native-v1',
    adapter_version: '1.0.0',
    runtime_name: 'DDUP Native Deterministic Runtime',
    runtime_version: 'synthetic-native-1',
    status: 'available',
    protocol: 'in_process',
    capabilities: CAPABILITIES,
    data_residency: 'local_process',
    supported_profiles: [NATIVE_PROFILE.key],
  })

  return Object.freeze({
    descriptor: () => descriptor,
    health: () => ({
      status: 'healthy',
      checked_at: new Date(now()).toISOString(),
      latency_ms: 0,
      protocol_compatible: true,
      runtime_version: descriptor.runtime_version,
      details: [],
    }),
    start: ({ context }) => {
      if (mode === 'hold') return { outcome: 'running', events: [] }
      if (mode === 'fail') {
        throw publicError(ERROR_CODES.RUNTIME_PROTOCOL_ERROR, '本地确定性 Runtime 演练失败。', { statusCode: 503, retryable: true })
      }
      return {
        outcome: 'succeeded',
        events: [{
          type: 'context.scope.resolved',
          payload: {
            context_digest: context.digest,
            included_count: context.included_count,
            excluded_count: context.excluded_count,
            generated_answer: false,
          },
        }],
      }
    },
    cancel: () => ({ outcome: 'cancelled' }),
  })
}
