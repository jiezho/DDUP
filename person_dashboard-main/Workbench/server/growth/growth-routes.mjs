import { ZodError } from 'zod'

import { okEnvelope } from '../../shared/contracts/envelopes.mjs'
import { ERROR_CODES, publicError } from '../../shared/contracts/errors.mjs'
import {
  CreateLearningCheckinSchema,
  CreateLearningPracticeSchema,
  CreateLearningRoutineSchema,
  CreateLearningTrackSchema,
  CreateRadarSignalSchema,
  CreateRadarTopicSchema,
  RecordLearningPracticeSchema,
  ReviewRadarTopicSchema,
} from './growth-contracts.mjs'

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
  if (!match) throw publicError(ERROR_CODES.INVALID_REQUEST, '写入现有对象必须提供有效的 If-Match。', { statusCode: 400, field: 'If-Match' })
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

export function registerGrowthRoutes(app, { growthStore, requireSession, requireCsrf }) {
  app.get('/api/v1/growth/projects/:projectId', { preHandler: requireSession }, async (request) => {
    const data = growthStore.getWorkspace(request.workbenchSession, request.params.projectId)
    return okEnvelope(request.id, data, { scope: { space_id: data.project.space_id, project_id: data.project.id } })
  })

  app.post('/api/v1/growth/projects/:projectId/radar/topics', { preHandler: requireCsrf }, async (request, reply) => {
    const result = growthStore.createRadarTopic(request.workbenchSession, request.params.projectId, parse(CreateRadarTopicSchema, request.body), createOptions(request))
    reply.code(result.statusCode)
    return success(request, result, { space_id: result.data.space_id, project_id: result.data.project_id })
  })

  app.post('/api/v1/growth/radar/topics/:topicId/signals', { preHandler: requireCsrf }, async (request, reply) => {
    const result = growthStore.addRadarSignal(request.workbenchSession, request.params.topicId, parse(CreateRadarSignalSchema, request.body), createOptions(request))
    reply.code(result.statusCode)
    return success(request, result, { space_id: result.data.space_id, project_id: result.data.project_id })
  })

  app.post('/api/v1/growth/radar/topics/:topicId/reviews', { preHandler: requireCsrf }, async (request, reply) => {
    const result = growthStore.reviewRadarTopic(request.workbenchSession, request.params.topicId, parse(ReviewRadarTopicSchema, request.body), updateOptions(request))
    reply.code(result.statusCode)
    return success(request, result, { space_id: result.data.topic.space_id, project_id: result.data.topic.project_id })
  })

  app.post('/api/v1/growth/projects/:projectId/learning/tracks', { preHandler: requireCsrf }, async (request, reply) => {
    const result = growthStore.createLearningTrack(request.workbenchSession, request.params.projectId, parse(CreateLearningTrackSchema, request.body), createOptions(request))
    reply.code(result.statusCode)
    return success(request, result, { space_id: result.data.space_id, project_id: result.data.project_id })
  })

  app.post('/api/v1/growth/learning/tracks/:trackId/practices', { preHandler: requireCsrf }, async (request, reply) => {
    const result = growthStore.createLearningPractice(request.workbenchSession, request.params.trackId, parse(CreateLearningPracticeSchema, request.body), createOptions(request))
    reply.code(result.statusCode)
    return success(request, result, { space_id: result.data.space_id, project_id: result.data.project_id })
  })

  app.post('/api/v1/growth/learning/practices/:practiceId/results', { preHandler: requireCsrf }, async (request, reply) => {
    const result = growthStore.recordLearningPractice(request.workbenchSession, request.params.practiceId, parse(RecordLearningPracticeSchema, request.body), updateOptions(request))
    reply.code(result.statusCode)
    return success(request, result, { space_id: result.data.practice.space_id, project_id: result.data.practice.project_id })
  })

  app.post('/api/v1/growth/learning/tracks/:trackId/routines', { preHandler: requireCsrf }, async (request, reply) => {
    const result = growthStore.createLearningRoutine(request.workbenchSession, request.params.trackId, parse(CreateLearningRoutineSchema, request.body), createOptions(request))
    reply.code(result.statusCode)
    return success(request, result, { space_id: result.data.space_id, project_id: result.data.project_id })
  })

  app.post('/api/v1/growth/learning/routines/:routineId/checkins', { preHandler: requireCsrf }, async (request, reply) => {
    const result = growthStore.createLearningCheckin(request.workbenchSession, request.params.routineId, parse(CreateLearningCheckinSchema, request.body), createOptions(request))
    reply.code(result.statusCode)
    return success(request, result, { space_id: result.data.space_id, project_id: result.data.project_id })
  })
}
