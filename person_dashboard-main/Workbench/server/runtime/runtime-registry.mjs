import { ERROR_CODES, publicError } from '../../shared/contracts/errors.mjs'
import { harnessPocDescriptor } from './harness-poc-preflight.mjs'
import { hermesPocDescriptor } from './hermes-poc-preflight.mjs'

const disconnected = Object.freeze([
  harnessPocDescriptor(),
  hermesPocDescriptor(),
])

export function createRuntimeRegistry({ nativeRuntime } = {}) {
  if (!nativeRuntime) throw new TypeError('nativeRuntime is required')
  const nativeDescriptor = Object.freeze({ ...nativeRuntime.descriptor(), connected: true })

  function requireAvailable(runtimeKey) {
    if (runtimeKey !== nativeDescriptor.runtime_key) {
      throw publicError(ERROR_CODES.RUNTIME_UNAVAILABLE, '请求的 Runtime 尚未连接。', { statusCode: 409, retryable: false })
    }
    return nativeRuntime
  }

  return Object.freeze({
    list: () => [nativeDescriptor, ...disconnected],
    get: (runtimeKey) => runtimeKey === nativeDescriptor.runtime_key
      ? nativeDescriptor
      : disconnected.find((item) => item.runtime_key === runtimeKey) ?? null,
    health: (runtimeKey) => requireAvailable(runtimeKey).health(),
    requireAvailable,
  })
}
