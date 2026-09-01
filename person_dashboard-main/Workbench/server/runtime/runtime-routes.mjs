import { ZodError } from 'zod'

import { okEnvelope } from '../../shared/contracts/envelopes.mjs'
import { ERROR_CODES, publicError } from '../../shared/contracts/errors.mjs'
import {
  CancelRunSchema,
  CreateRunSchema,
  ListRunsQuerySchema,
  RetryRunSchema,
  RunCheckpointsQuerySchema,
  RunEventsQuerySchema,
  RunSpaceQuerySchema,
} from '../../shared/contracts/runtime.mjs'

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

function parseEventCursor(value, fallback) {
  if (value == null || value === '') return fallback
  if (!/^\d+$/.test(String(value))) {
    throw publicError(ERROR_CODES.INVALID_CURSOR, '事件游标无效。', { statusCode: 400, field: 'Last-Event-ID' })
  }
  const cursor = Number(value)
  if (!Number.isSafeInteger(cursor) || cursor < 0) {
    throw publicError(ERROR_CODES.INVALID_CURSOR, '事件游标无效。', { statusCode: 400, field: 'Last-Event-ID' })
  }
  return cursor
}

function writeSseEvent(raw, event) {
  raw.write(`id: ${event.seq}\n`)
  raw.write(`event: ${event.type}\n`)
  raw.write(`data: ${JSON.stringify({
    event_version: event.event_version,
    run_id: event.run_id,
    seq: event.seq,
    occurred_at: event.occurred_at,
    payload: event.payload,
  })}\n\n`)
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

  app.get('/api/v1/runs/:runId/events/stream', { preHandler: requireSession }, async (request, reply) => {
    const query = parse(RunEventsQuerySchema, request.query)
    let cursor = parseEventCursor(request.headers['last-event-id'], query.after_seq)
    runStore.getRun(request.workbenchSession, request.params.runId, query.space_id)

    reply.hijack()
    reply.raw.writeHead(200, {
      'cache-control': 'no-cache, no-store',
      connection: 'keep-alive',
      'content-type': 'text/event-stream; charset=utf-8',
      'x-accel-buffering': 'no',
    })
    reply.raw.write('retry: 3000\n\n')

    return new Promise((resolve) => {
      let settled = false
      let pollTimer = null
      let keepaliveTimer = null
      let reconnectTimer = null
      const finish = () => {
        if (settled) return
        settled = true
        if (pollTimer) clearInterval(pollTimer)
        if (keepaliveTimer) clearInterval(keepaliveTimer)
        if (reconnectTimer) clearTimeout(reconnectTimer)
        if (!reply.raw.destroyed && !reply.raw.writableEnded) reply.raw.end()
        resolve()
      }
      const flush = () => {
        if (settled || reply.raw.destroyed) return finish()
        const events = runStore.listEvents(request.workbenchSession, request.params.runId, {
          space_id: query.space_id,
          after_seq: cursor,
          limit: query.limit,
        })
        for (const event of events) {
          writeSseEvent(reply.raw, event)
          cursor = event.seq
        }
        const run = runStore.getRun(request.workbenchSession, request.params.runId, query.space_id)
        if (run.terminal) finish()
      }

      request.raw.on('close', finish)
      pollTimer = setInterval(flush, 300)
      keepaliveTimer = setInterval(() => {
        if (!settled && !reply.raw.destroyed) reply.raw.write(`: keepalive ${Date.now()}\n\n`)
      }, 15_000)
      reconnectTimer = setTimeout(finish, 25_000)
      flush()
    })
  })

  app.get('/api/v1/runs/:runId/checkpoints', { preHandler: requireSession }, async (request) => {
    const query = parse(RunCheckpointsQuerySchema, request.query)
    const items = runStore.listCheckpoints(request.workbenchSession, request.params.runId, query)
    return okEnvelope(request.id, { items }, { scope: { space_id: query.space_id }, page: { after_seq: query.after_seq, next_seq: items.at(-1)?.event_seq ?? query.after_seq } })
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

  app.post('/api/v1/runs/:runId/retry', { preHandler: requireCsrf }, async (request, reply) => {
    const input = parse(RetryRunSchema, request.body)
    const result = runStore.retryRun(request.workbenchSession, request.params.runId, input, {
      expectedVersion: parseIfMatch(request.headers['if-match']),
      idempotencyKey: request.headers['idempotency-key'],
      requestId: request.id,
    })
    reply.code(result.statusCode)
    return okEnvelope(request.id, result.data, { scope: { space_id: input.space_id }, idempotency_replayed: result.replayed })
  })
}
