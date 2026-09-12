import { ZodError } from 'zod'

import { okEnvelope } from '../../shared/contracts/envelopes.mjs'
import { ERROR_CODES, publicError } from '../../shared/contracts/errors.mjs'
import {
  AddContextPackageItemSchema,
  ArchiveContextPackageSchema,
  ContextPackageSpaceQuerySchema,
  ContextSearchQuerySchema,
  CreateAnswerAttemptSchema,
  CreateContextPackageSchema,
  GenerateAnswerSchema,
  ImportMarkdownSchema,
  ListAnswerAttemptsQuerySchema,
  ListContextPackagesQuerySchema,
  ListSourcesQuerySchema,
  ReadSourceRangeQuerySchema,
  SourceSpaceQuerySchema,
  TransitionSourceSchema,
  UpdateMarkdownSourceSchema,
  ValidateAnswerDraftSchema,
} from './context-contracts.mjs'

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

function parseIfMatch(value) {
  const match = /^"v([1-9]\d*)"$/.exec(String(value ?? ''))
  if (!match) {
    throw publicError(ERROR_CODES.INVALID_REQUEST, '写入现有对象必须提供有效的 If-Match。', { statusCode: 400, field: 'If-Match' })
  }
  return Number(match[1])
}

function writeOptions(request) {
  return {
    expectedVersion: parseIfMatch(request.headers['if-match']),
    idempotencyKey: request.headers['idempotency-key'],
    requestId: request.id,
  }
}

function writeEnvelope(request, result, scope) {
  return okEnvelope(request.id, result.data, { scope, idempotency_replayed: result.replayed })
}

export function registerContextRoutes(app, { answerAttemptStore, contextStore, contextPackageStore, protectedSearchService, requireSession, requireCsrf }) {
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

  app.get('/api/v1/sources/:sourceId/range', { preHandler: requireSession }, async (request) => {
    const query = parse(ReadSourceRangeQuerySchema, request.query)
    return okEnvelope(request.id, contextStore.readSourceRange(request.workbenchSession, request.params.sourceId, query), { scope: { space_id: query.space_id } })
  })

  app.post('/api/v1/sources/:sourceId/versions', { preHandler: requireCsrf }, async (request, reply) => {
    const input = parse(UpdateMarkdownSourceSchema, request.body)
    const result = contextStore.updateMarkdown(request.workbenchSession, request.params.sourceId, input, writeOptions(request))
    reply.code(result.statusCode)
    return writeEnvelope(request, result, { space_id: input.space_id })
  })

  app.post('/api/v1/sources/:sourceId/transitions', { preHandler: requireCsrf }, async (request) => {
    const input = parse(TransitionSourceSchema, request.body)
    const result = contextStore.transitionSource(request.workbenchSession, request.params.sourceId, input, writeOptions(request))
    return writeEnvelope(request, result, { space_id: input.space_id })
  })

  app.post('/api/v1/context/search', { preHandler: requireSession }, async (request) => {
    const query = parse(ContextSearchQuerySchema, request.body)
    const data = await protectedSearchService.search(request.workbenchSession, query)
    return okEnvelope(request.id, data, { scope: data.scope })
  })

  app.get('/api/v1/context/packages', { preHandler: requireSession }, async (request) => {
    const query = parse(ListContextPackagesQuerySchema, request.query)
    return okEnvelope(request.id, { items: contextPackageStore.listPackages(request.workbenchSession, query) }, { scope: { space_id: query.space_id } })
  })

  app.post('/api/v1/context/packages', { preHandler: requireCsrf }, async (request, reply) => {
    const input = parse(CreateContextPackageSchema, request.body)
    const result = contextPackageStore.createPackage(request.workbenchSession, input, {
      idempotencyKey: request.headers['idempotency-key'],
      requestId: request.id,
    })
    reply.code(result.statusCode)
    return writeEnvelope(request, result, { space_id: input.space_id })
  })

  app.get('/api/v1/context/packages/:packageId', { preHandler: requireSession }, async (request) => {
    const query = parse(ContextPackageSpaceQuerySchema, request.query)
    return okEnvelope(request.id, contextPackageStore.getPackage(request.workbenchSession, request.params.packageId, query.space_id), { scope: { space_id: query.space_id } })
  })

  app.post('/api/v1/context/packages/:packageId/items', { preHandler: requireCsrf }, async (request) => {
    const input = parse(AddContextPackageItemSchema, request.body)
    const result = contextPackageStore.addItem(request.workbenchSession, request.params.packageId, input, writeOptions(request))
    return writeEnvelope(request, result, { space_id: input.space_id })
  })

  app.delete('/api/v1/context/packages/:packageId/items/:itemId', { preHandler: requireCsrf }, async (request) => {
    const query = parse(ContextPackageSpaceQuerySchema, request.query)
    const body = request.body ?? {}
    if (typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length) {
      throw publicError(ERROR_CODES.VALIDATION_FAILED, '删除请求正文必须为空对象。', { statusCode: 422 })
    }
    const result = contextPackageStore.removeItem(request.workbenchSession, request.params.packageId, request.params.itemId, query.space_id, writeOptions(request))
    return writeEnvelope(request, result, { space_id: query.space_id })
  })

  app.post('/api/v1/context/packages/:packageId/transitions', { preHandler: requireCsrf }, async (request) => {
    const input = parse(ArchiveContextPackageSchema, request.body)
    const result = contextPackageStore.archivePackage(request.workbenchSession, request.params.packageId, input.space_id, writeOptions(request))
    return writeEnvelope(request, result, { space_id: input.space_id })
  })

  app.get('/api/v1/context/answer-attempts', { preHandler: requireSession }, async (request) => {
    const query = parse(ListAnswerAttemptsQuerySchema, request.query)
    return okEnvelope(request.id, { items: answerAttemptStore.listAttempts(request.workbenchSession, query) }, { scope: { space_id: query.space_id } })
  })

  app.post('/api/v1/context/answer-attempts', { preHandler: requireCsrf }, async (request, reply) => {
    const input = parse(CreateAnswerAttemptSchema, request.body)
    const result = answerAttemptStore.createAttempt(request.workbenchSession, input, {
      idempotencyKey: request.headers['idempotency-key'],
      requestId: request.id,
    })
    reply.code(result.statusCode)
    return writeEnvelope(request, result, { space_id: input.space_id })
  })

  app.get('/api/v1/context/answer-attempts/:attemptId', { preHandler: requireSession }, async (request) => {
    const query = parse(ContextPackageSpaceQuerySchema, request.query)
    return okEnvelope(request.id, answerAttemptStore.getAttempt(request.workbenchSession, request.params.attemptId, query.space_id), { scope: { space_id: query.space_id } })
  })

  app.post('/api/v1/context/answer-attempts/:attemptId/validate-draft', { preHandler: requireCsrf }, async (request) => {
    const input = parse(ValidateAnswerDraftSchema, request.body)
    return okEnvelope(
      request.id,
      answerAttemptStore.validateDraft(request.workbenchSession, request.params.attemptId, input),
      { scope: { space_id: input.space_id } },
    )
  })

  app.get('/api/v1/context/answer-attempts/:attemptId/answer', { preHandler: requireSession }, async (request) => {
    const query = parse(ContextPackageSpaceQuerySchema, request.query)
    return okEnvelope(request.id, answerAttemptStore.getAnswer(request.workbenchSession, request.params.attemptId, query.space_id), { scope: { space_id: query.space_id } })
  })

  app.post('/api/v1/context/answer-attempts/:attemptId/generate', { preHandler: requireCsrf }, async (request, reply) => {
    const input = parse(GenerateAnswerSchema, request.body)
    const result = answerAttemptStore.generateAnswer(request.workbenchSession, request.params.attemptId, input, {
      idempotencyKey: request.headers['idempotency-key'],
      requestId: request.id,
    })
    reply.code(result.statusCode)
    return writeEnvelope(request, result, { space_id: input.space_id })
  })
}
