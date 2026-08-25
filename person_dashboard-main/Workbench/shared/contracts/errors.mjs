export const ERROR_CODES = Object.freeze({
  INVALID_REQUEST: 'INVALID_REQUEST',
  INVALID_HOST: 'INVALID_HOST',
  SESSION_REQUIRED: 'SESSION_REQUIRED',
  CSRF_REJECTED: 'CSRF_REJECTED',
  BOOTSTRAP_REJECTED: 'BOOTSTRAP_REJECTED',
  BOOTSTRAP_UNAVAILABLE: 'BOOTSTRAP_UNAVAILABLE',
  ACTION_NOT_ALLOWED: 'ACTION_NOT_ALLOWED',
  OBJECT_NOT_AVAILABLE: 'OBJECT_NOT_AVAILABLE',
  INVALID_CURSOR: 'INVALID_CURSOR',
  IDEMPOTENCY_CONFLICT: 'IDEMPOTENCY_CONFLICT',
  VERSION_CONFLICT: 'VERSION_CONFLICT',
  RELATION_CONFLICT: 'RELATION_CONFLICT',
  INVALID_STATE_TRANSITION: 'INVALID_STATE_TRANSITION',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  RESTORE_WINDOW_EXPIRED: 'RESTORE_WINDOW_EXPIRED',
  MIGRATION_REQUIRED: 'MIGRATION_REQUIRED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
})

export class WorkbenchError extends Error {
  constructor({ code, message, statusCode = 500, retryable = false, field = null, cause }) {
    super(message, { cause })
    this.name = 'WorkbenchError'
    this.code = code
    this.statusCode = statusCode
    this.retryable = retryable
    this.field = field
  }
}

export function publicError(code, message, options = {}) {
  return new WorkbenchError({ code, message, ...options })
}
