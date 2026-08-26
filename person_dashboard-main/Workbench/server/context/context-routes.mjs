import { ZodError } from 'zod'

import { okEnvelope } from '../../shared/contracts/envelopes.mjs'
import { ERROR_CODES, publicError } from '../../shared/contracts/errors.mjs'
import { ContextSearchQuerySchema, ImportMarkdownSchema, ListSourcesQuerySchema } from './context-contracts.mjs'

function parse(schema, value) {
  try {
    return schema.parse(value)
  } catch (error) {
    if (!(error instanceof ZodError)) throw error
    const issue = error.issues[0]
    throw publicError(ERROR_CODES.VALIDATION_FAILED, '请求字段未通过校验。', {
      statusCode: 422,
      field: issue?.path?.join('.') || null,
    })
  }
}

export function registerContextRoutes(app, { contextStore, protectedSearchService, requireSession, requireCsrf }) {
  app.get('/api/v1/sources', { preHandler: requireSession }, async (request) => {
    const query = parse(ListSourcesQuerySchema, request.query)
    return okEnvelope(request.id, { items: contextStore.listSources(request.workbenchSession, query) }, { scope: { space_id: query.space_id } })
  })

  app.post('/api/v1/sources/imports/markdown', { preHandler: requireCsrf }, async (request, reply) => {
    const input = parse(ImportMarkdownSchema, request.body)
    const result = contextStore.importMarkdown(request.workbenchSession, input, {
      idempotencyKey: request.headers['idempotency-key'],
      requestId: request.id,
    })
    reply.code(result.statusCode)
    return okEnvelope(request.id, result.data, {
      scope: { space_id: input.space_id, project_id: input.project_id },
      idempotency_replayed: result.replayed,
    })
  })

  app.post('/api/v1/context/search', { preHandler: requireSession }, async (request) => {
    const query = parse(ContextSearchQuerySchema, request.body)
    const data = await protectedSearchService.search(request.workbenchSession, query)
    return okEnvelope(request.id, data, { scope: data.scope })
  })
}
