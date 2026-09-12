import { ZodError } from 'zod'

import { okEnvelope } from '../../shared/contracts/envelopes.mjs'
import { ERROR_CODES, publicError } from '../../shared/contracts/errors.mjs'
import {
  CreateAiExperimentSchema,
  CreateAiOpportunitySchema,
  CreateResearchClaimSchema,
  CreateResearchExperimentSchema,
  CreateResearchQuestionSchema,
  RecordAiResultSchema,
  RecordResearchResultSchema,
  TransitionAiOpportunitySchema,
  TransitionResearchQuestionSchema,
} from './professional-contracts.mjs'

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
    throw publicError(ERROR_CODES.INVALID_REQUEST, '写入现有对象必须提供有效的 If-Match。', {
      statusCode: 400,
      field: 'If-Match',
    })
  }
  return Number(match[1])
}

function createOptions(request) {
  return { idempotencyKey: request.headers['idempotency-key'], requestId: request.id }
}

function updateOptions(request) {
  return { ...createOptions(request), expectedVersion: parseIfMatch(request.headers['if-match']) }
}

function success(request, result, scope) {
  return okEnvelope(request.id, result.data, { scope, idempotency_replayed: result.replayed })
}

export function registerProfessionalRoutes(app, { professionalStore, requireSession, requireCsrf }) {
  app.get('/api/v1/professional/projects/:projectId', { preHandler: requireSession }, async (request) => {
    const data = professionalStore.getWorkspace(request.workbenchSession, request.params.projectId)
    return okEnvelope(request.id, data, { scope: { space_id: data.project.space_id, project_id: data.project.id } })
  })

  app.post('/api/v1/professional/projects/:projectId/research/questions', { preHandler: requireCsrf }, async (request, reply) => {
    const input = parse(CreateResearchQuestionSchema, request.body)
    const result = professionalStore.createResearchQuestion(request.workbenchSession, request.params.projectId, input, createOptions(request))
    reply.code(result.statusCode)
    return success(request, result, { space_id: result.data.space_id, project_id: result.data.project_id })
  })

  app.post('/api/v1/professional/research/questions/:questionId/transitions', { preHandler: requireCsrf }, async (request, reply) => {
    const { action } = parse(TransitionResearchQuestionSchema, request.body)
    const result = professionalStore.transitionResearchQuestion(request.workbenchSession, request.params.questionId, action, updateOptions(request))
    reply.code(result.statusCode)
    return success(request, result, { space_id: result.data.space_id, project_id: result.data.project_id })
  })

  app.post('/api/v1/professional/research/questions/:questionId/experiments', { preHandler: requireCsrf }, async (request, reply) => {
    const input = parse(CreateResearchExperimentSchema, request.body)
    const result = professionalStore.createResearchExperiment(request.workbenchSession, request.params.questionId, input, createOptions(request))
    reply.code(result.statusCode)
    return success(request, result, { space_id: result.data.space_id, project_id: result.data.project_id })
  })

  app.post('/api/v1/professional/research/experiments/:experimentId/results', { preHandler: requireCsrf }, async (request, reply) => {
    const input = parse(RecordResearchResultSchema, request.body)
    const result = professionalStore.recordResearchResult(request.workbenchSession, request.params.experimentId, input, updateOptions(request))
    reply.code(result.statusCode)
    return success(request, result, { space_id: result.data.experiment.space_id, project_id: result.data.experiment.project_id })
  })

  app.post('/api/v1/professional/research/questions/:questionId/claims', { preHandler: requireCsrf }, async (request, reply) => {
    const input = parse(CreateResearchClaimSchema, request.body)
    const result = professionalStore.createResearchClaim(request.workbenchSession, request.params.questionId, input, createOptions(request))
    reply.code(result.statusCode)
    return success(request, result, { space_id: result.data.space_id, project_id: result.data.project_id })
  })

  app.post('/api/v1/professional/projects/:projectId/ai/opportunities', { preHandler: requireCsrf }, async (request, reply) => {
    const input = parse(CreateAiOpportunitySchema, request.body)
    const result = professionalStore.createAiOpportunity(request.workbenchSession, request.params.projectId, input, createOptions(request))
    reply.code(result.statusCode)
    return success(request, result, { space_id: result.data.space_id, project_id: result.data.project_id })
  })

  app.post('/api/v1/professional/ai/opportunities/:opportunityId/transitions', { preHandler: requireCsrf }, async (request, reply) => {
    const { action } = parse(TransitionAiOpportunitySchema, request.body)
    const result = professionalStore.transitionAiOpportunity(request.workbenchSession, request.params.opportunityId, action, updateOptions(request))
    reply.code(result.statusCode)
    return success(request, result, { space_id: result.data.space_id, project_id: result.data.project_id })
  })

  app.post('/api/v1/professional/ai/opportunities/:opportunityId/experiments', { preHandler: requireCsrf }, async (request, reply) => {
    const input = parse(CreateAiExperimentSchema, request.body)
    const result = professionalStore.createAiExperiment(request.workbenchSession, request.params.opportunityId, input, createOptions(request))
    reply.code(result.statusCode)
    return success(request, result, { space_id: result.data.space_id, project_id: result.data.project_id })
  })

  app.post('/api/v1/professional/ai/experiments/:experimentId/results', { preHandler: requireCsrf }, async (request, reply) => {
    const input = parse(RecordAiResultSchema, request.body)
    const result = professionalStore.recordAiResult(request.workbenchSession, request.params.experimentId, input, updateOptions(request))
    reply.code(result.statusCode)
    return success(request, result, { space_id: result.data.experiment.space_id, project_id: result.data.experiment.project_id })
  })
}
