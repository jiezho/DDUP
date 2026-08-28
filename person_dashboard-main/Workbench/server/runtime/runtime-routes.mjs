import { ZodError } from 'zod'

import { okEnvelope } from '../../shared/contracts/envelopes.mjs'
import { ERROR_CODES, publicError } from '../../shared/contracts/errors.mjs'
import { CancelRunSchema, CreateRunSchema, ListRunsQuerySchema, RunEventsQuerySchema, RunSpaceQuerySchema } from '../../shared/contracts/runtime.mjs'

function parse(schema, value) {
  try {
    return schema.parse(value)
  } catch (error) {
    if (!(error instanceof ZodError)) throw error
    throw publicError(ERROR_CODES.VALIDATION_FAILED, '请求字段未通过校验。', { statusCode: 422, field: error.issues[0]?.path?.join('.') || null })
  }
}

function parseIfMatch(value) {
  const match = /^"v([1-9]\d*)"$/.exec(String(value ?? ''))
  if (!match) throw publicError(ERROR_CODES.INVALID_REQUEST, '写入现有对象必须提供有效的 If-Match。', { statusCode: 400, field: 'If-Match' })
  return Number(match[1])
}

export function registerRuntimeRoutes(app, { runtimeRegistry, runStore, requireSession, requireCsrf }) {
  app.get('/api/v1/runtimes', { preHandler: requireSession }, async (request) =>
    okEnvelope(request.id, { items: runtimeRegistry.list() }),
  )

  app.get('/api/v1/runtimes/:runtimeKey/health', { preHandler: requireSession }, async (request) =>
    okEnvelope(request.id, runtimeRegistry.health(request.params.runtimeKey)),
  )

  app.get('/api/v1/runs', { preHandler: requireSession }, async (request) => {
    const query = parse(ListRunsQuerySchema, request.query)
    return okEnvelope(request.id, { items: runStore.listRuns(request.workbenchSession, query) }, { scope: { space_id: query.space_id } })
  })

  app.post('/api/v1/runs', { preHandler: requireCsrf }, async (request, reply) => {
    const input = parse(CreateRunSchema, request.body)
    const result = runStore.createRun(request.workbenchSession, input, {
      idempotencyKey: request.headers['idempotency-key'],
      requestId: request.id,
    })
    reply.code(result.statusCode)
    return okEnvelope(request.id, result.data, { scope: { space_id: input.space_id }, idempotency_replayed: result.replayed })
  })

  app.get('/api/v1/runs/:runId', { preHandler: requireSession }, async (request) => {
    const query = parse(RunSpaceQuerySchema, request.query)
    return okEnvelope(request.id, runStore.getRun(request.workbenchSession, request.params.runId, query.space_id), { scope: { space_id: query.space_id } })
  })

  app.get('/api/v1/runs/:runId/events', { preHandler: requireSession }, async (request) => {
    const query = parse(RunEventsQuerySchema, request.query)
    const items = runStore.listEvents(request.workbenchSession, request.params.runId, query)
    return okEnvelope(request.id, { items }, { scope: { space_id: query.space_id }, page: { after_seq: query.after_seq, next_seq: items.at(-1)?.seq ?? query.after_seq } })
  })

  app.post('/api/v1/runs/:runId/cancel', { preHandler: requireCsrf }, async (request) => {
    const input = parse(CancelRunSchema, request.body)
    const result = runStore.cancelRun(request.workbenchSession, request.params.runId, input, {
      expectedVersion: parseIfMatch(request.headers['if-match']),
      idempotencyKey: request.headers['idempotency-key'],
      requestId: request.id,
    })
    return okEnvelope(request.id, result.data, { scope: { space_id: input.space_id }, idempotency_replayed: result.replayed })
  })
}
