import { z } from 'zod'

export const ErrorItemSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  field: z.string().nullable().default(null),
  retryable: z.boolean().default(false),
})

export function okEnvelope(requestId, data, meta = {}) {
  return {
    request_id: requestId,
    status: 'ok',
    data,
    errors: [],
    meta: { api_version: 'v1', ...meta },
  }
}

export function errorEnvelope(requestId, error, meta = {}) {
  return {
    request_id: requestId,
    status: 'error',
    data: null,
    errors: [
      ErrorItemSchema.parse({
        code: error.code,
        message: error.message,
        field: error.field ?? null,
        retryable: error.retryable ?? false,
      }),
    ],
    meta: { api_version: 'v1', ...meta },
  }
}
