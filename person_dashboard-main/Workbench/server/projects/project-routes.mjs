import { ZodError } from 'zod'

import { okEnvelope } from '../../shared/contracts/envelopes.mjs'
import { ERROR_CODES, publicError } from '../../shared/contracts/errors.mjs'
import {
  ConvertDiscussionSchema,
  CreateCaptureSchema,
  CreateDiscussionEntrySchema,
  CreateDiscussionSchema,
  CreateProjectSchema,
  CreateMilestoneSchema,
  CreateTaskSchema,
  DailyDateSchema,
  PROJECT_STATUSES,
  PROJECT_TEMPLATES,
  TransitionProjectSchema,
  TransitionTaskSchema,
  TransitionCaptureSchema,
  SaveDailyPlanSchema,
  SaveDailyReviewSchema,
  UpdateMilestoneSchema,
  UpdateProjectSchema,
  UpdateTaskSchema,
} from './project-contracts.mjs'

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

function idempotencyOptions(request) {
  return {
    expectedVersion: parseIfMatch(request.headers['if-match']),
    idempotencyKey: request.headers['idempotency-key'],
    requestId: request.id,
  }
}

function optionalVersionOptions(request) {
  return {
    expectedVersion: request.headers['if-match'] == null ? null : parseIfMatch(request.headers['if-match']),
    idempotencyKey: request.headers['idempotency-key'],
    requestId: request.id,
  }
}

function success(request, result, scope) {
  return okEnvelope(request.id, result.data, {
    scope,
    idempotency_replayed: result.replayed,
  })
}

export function registerProjectRoutes(app, { projectStore, requireSession, requireCsrf }) {
  app.get('/api/v1/spaces', { preHandler: requireSession }, async (request) =>
    okEnvelope(request.id, { items: projectStore.listSpaces(request.workbenchSession) }),
  )

  app.get('/api/v1/spaces/:spaceId', { preHandler: requireSession }, async (request) => {
    const space = projectStore.getSpace(request.workbenchSession, request.params.spaceId)
    return okEnvelope(request.id, space, { scope: { space_id: space.id } })
  })

  app.get('/api/v1/projects', { preHandler: requireSession }, async (request) => {
    const { space_id: spaceId, status = null, template_type: templateType = null, cursor = null, limit = 50 } =
      request.query ?? {}
    if (typeof spaceId !== 'string' || !spaceId) {
      throw publicError(ERROR_CODES.INVALID_REQUEST, 'space_id 为必填查询参数。', {
        statusCode: 400,
        field: 'space_id',
      })
    }
    if (status != null && !PROJECT_STATUSES.includes(status)) {
      throw publicError(ERROR_CODES.VALIDATION_FAILED, '项目状态筛选值无效。', {
        statusCode: 422,
        field: 'status',
      })
    }
    if (templateType != null && !PROJECT_TEMPLATES.includes(templateType)) {
      throw publicError(ERROR_CODES.VALIDATION_FAILED, '项目模板筛选值无效。', {
        statusCode: 422,
        field: 'template_type',
      })
    }
    const result = projectStore.listProjects(request.workbenchSession, {
      spaceId,
      status,
      templateType,
      cursor,
      limit: Number(limit),
    })
    return okEnvelope(
      request.id,
      { items: result.items },
      {
        scope: { space_id: spaceId },
        page: { limit: Number(limit), next_cursor: result.nextCursor, has_more: result.hasMore },
      },
    )
  })

  app.post('/api/v1/projects', { preHandler: requireCsrf }, async (request, reply) => {
    const input = parse(CreateProjectSchema, request.body)
    const result = projectStore.createProject(request.workbenchSession, input, {
      idempotencyKey: request.headers['idempotency-key'],
      requestId: request.id,
    })
    reply.code(result.statusCode)
    return success(request, result, { space_id: input.space_id })
  })

  app.get('/api/v1/projects/:projectId', { preHandler: requireSession }, async (request) => {
    const project = projectStore.getProject(request.workbenchSession, request.params.projectId)
    return okEnvelope(request.id, project, { scope: { space_id: project.space_id } })
  })

  app.patch('/api/v1/projects/:projectId', { preHandler: requireCsrf }, async (request, reply) => {
    const patch = parse(UpdateProjectSchema, request.body)
    const result = projectStore.updateProject(
      request.workbenchSession,
      request.params.projectId,
      patch,
      idempotencyOptions(request),
    )
    reply.code(result.statusCode)
    return success(request, result, { space_id: result.data.space_id })
  })

  app.post('/api/v1/projects/:projectId/transitions', { preHandler: requireCsrf }, async (request, reply) => {
    const { action } = parse(TransitionProjectSchema, request.body)
    const result = projectStore.transitionProject(
      request.workbenchSession,
      request.params.projectId,
      action,
      idempotencyOptions(request),
    )
    reply.code(result.statusCode)
    return success(request, result, { space_id: result.data.space_id })
  })

  app.delete('/api/v1/projects/:projectId', { preHandler: requireCsrf }, async (request, reply) => {
    const body = request.body ?? {}
    if (typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length > 0) {
      throw publicError(ERROR_CODES.VALIDATION_FAILED, '删除请求正文必须为空对象。', { statusCode: 422 })
    }
    const result = projectStore.deleteProject(
      request.workbenchSession,
      request.params.projectId,
      idempotencyOptions(request),
    )
    reply.code(result.statusCode)
    return success(request, result, { space_id: result.data.space_id })
  })

  app.post('/api/v1/projects/:projectId/restore', { preHandler: requireCsrf }, async (request, reply) => {
    const body = request.body ?? {}
    if (typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length > 0) {
      throw publicError(ERROR_CODES.VALIDATION_FAILED, '恢复请求正文必须为空对象。', { statusCode: 422 })
    }
    const result = projectStore.restoreProject(
      request.workbenchSession,
      request.params.projectId,
      idempotencyOptions(request),
    )
    reply.code(result.statusCode)
    return success(request, result, { space_id: result.data.space_id })
  })

  app.get('/api/v1/projects/:projectId/milestones', { preHandler: requireSession }, async (request) => {
    const items = projectStore.listMilestones(request.workbenchSession, request.params.projectId)
    return okEnvelope(request.id, { items })
  })

  app.post('/api/v1/projects/:projectId/milestones', { preHandler: requireCsrf }, async (request, reply) => {
    const input = parse(CreateMilestoneSchema, request.body)
    const result = projectStore.createMilestone(request.workbenchSession, request.params.projectId, input, {
      idempotencyKey: request.headers['idempotency-key'],
      requestId: request.id,
    })
    reply.code(result.statusCode)
    return success(request, result, { space_id: result.data.space_id })
  })

  app.patch('/api/v1/milestones/:milestoneId', { preHandler: requireCsrf }, async (request, reply) => {
    const patch = parse(UpdateMilestoneSchema, request.body)
    const result = projectStore.updateMilestone(
      request.workbenchSession,
      request.params.milestoneId,
      patch,
      idempotencyOptions(request),
    )
    reply.code(result.statusCode)
    return success(request, result, { space_id: result.data.space_id })
  })

  app.delete('/api/v1/milestones/:milestoneId', { preHandler: requireCsrf }, async (request, reply) => {
    const body = request.body ?? {}
    if (typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length > 0) {
      throw publicError(ERROR_CODES.VALIDATION_FAILED, '删除请求正文必须为空对象。', { statusCode: 422 })
    }
    const result = projectStore.deleteMilestone(
      request.workbenchSession,
      request.params.milestoneId,
      idempotencyOptions(request),
    )
    reply.code(result.statusCode)
    return success(request, result, { space_id: result.data.space_id })
  })

  app.get('/api/v1/projects/:projectId/tasks', { preHandler: requireSession }, async (request) => {
    const items = projectStore.listTasks(request.workbenchSession, request.params.projectId)
    return okEnvelope(request.id, { items })
  })

  app.post('/api/v1/projects/:projectId/tasks', { preHandler: requireCsrf }, async (request, reply) => {
    const input = parse(CreateTaskSchema, request.body)
    const result = projectStore.createTask(request.workbenchSession, request.params.projectId, input, {
      idempotencyKey: request.headers['idempotency-key'],
      requestId: request.id,
    })
    reply.code(result.statusCode)
    return success(request, result, { space_id: result.data.space_id })
  })

  app.get('/api/v1/tasks/:taskId', { preHandler: requireSession }, async (request) => {
    const task = projectStore.getTask(request.workbenchSession, request.params.taskId)
    return okEnvelope(request.id, task, { scope: { space_id: task.space_id } })
  })

  app.patch('/api/v1/tasks/:taskId', { preHandler: requireCsrf }, async (request, reply) => {
    const patch = parse(UpdateTaskSchema, request.body)
    const result = projectStore.updateTask(
      request.workbenchSession,
      request.params.taskId,
      patch,
      idempotencyOptions(request),
    )
    reply.code(result.statusCode)
    return success(request, result, { space_id: result.data.space_id })
  })

  app.post('/api/v1/tasks/:taskId/transitions', { preHandler: requireCsrf }, async (request, reply) => {
    const { action } = parse(TransitionTaskSchema, request.body)
    const result = projectStore.transitionTask(
      request.workbenchSession,
      request.params.taskId,
      action,
      idempotencyOptions(request),
    )
    reply.code(result.statusCode)
    return success(request, result, { space_id: result.data.space_id })
  })

  app.delete('/api/v1/tasks/:taskId', { preHandler: requireCsrf }, async (request, reply) => {
    const body = request.body ?? {}
    if (typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length > 0) {
      throw publicError(ERROR_CODES.VALIDATION_FAILED, '删除请求正文必须为空对象。', { statusCode: 422 })
    }
    const result = projectStore.deleteTask(
      request.workbenchSession,
      request.params.taskId,
      idempotencyOptions(request),
    )
    reply.code(result.statusCode)
    return success(request, result, { space_id: result.data.space_id })
  })

  app.get('/api/v1/projects/:projectId/discussions', { preHandler: requireSession }, async (request) => {
    const items = projectStore.listDiscussions(request.workbenchSession, request.params.projectId)
    return okEnvelope(request.id, { items })
  })

  app.post('/api/v1/projects/:projectId/discussions', { preHandler: requireCsrf }, async (request, reply) => {
    const input = parse(CreateDiscussionSchema, request.body)
    const result = projectStore.createDiscussion(request.workbenchSession, request.params.projectId, input, {
      idempotencyKey: request.headers['idempotency-key'],
      requestId: request.id,
    })
    reply.code(result.statusCode)
    return success(request, result, { space_id: result.data.space_id })
  })

  app.get('/api/v1/discussions/:discussionId/entries', { preHandler: requireSession }, async (request) => {
    const items = projectStore.listDiscussionEntries(request.workbenchSession, request.params.discussionId)
    return okEnvelope(request.id, { items })
  })

  app.post('/api/v1/discussions/:discussionId/entries', { preHandler: requireCsrf }, async (request, reply) => {
    const input = parse(CreateDiscussionEntrySchema, request.body)
    const result = projectStore.createDiscussionEntry(request.workbenchSession, request.params.discussionId, input, {
      idempotencyKey: request.headers['idempotency-key'],
      requestId: request.id,
    })
    reply.code(result.statusCode)
    return success(request, result, { space_id: result.data.space_id })
  })

  app.get('/api/v1/projects/:projectId/decisions', { preHandler: requireSession }, async (request) => {
    const items = projectStore.listDecisions(request.workbenchSession, request.params.projectId)
    return okEnvelope(request.id, { items })
  })

  app.post('/api/v1/discussions/:discussionId/conversions', { preHandler: requireCsrf }, async (request, reply) => {
    const input = parse(ConvertDiscussionSchema, request.body)
    const result = projectStore.convertDiscussion(request.workbenchSession, request.params.discussionId, input, {
      idempotencyKey: request.headers['idempotency-key'],
      requestId: request.id,
    })
    reply.code(result.statusCode)
    return success(request, result, { space_id: result.data.discussion.space_id })
  })

  app.get('/api/v1/captures', { preHandler: requireSession }, async (request) => {
    const { space_id: spaceId, project_id: projectId = null, status = 'inbox', limit = 100 } = request.query ?? {}
    if (typeof spaceId !== 'string' || !spaceId) {
      throw publicError(ERROR_CODES.INVALID_REQUEST, 'space_id 为必填查询参数。', { statusCode: 400, field: 'space_id' })
    }
    if (status != null && !['inbox', 'processed', 'archived'].includes(status)) {
      throw publicError(ERROR_CODES.VALIDATION_FAILED, '收件箱状态筛选值无效。', { statusCode: 422, field: 'status' })
    }
    const items = projectStore.listCaptures(request.workbenchSession, {
      spaceId, projectId, status, limit: Number(limit),
    })
    return okEnvelope(request.id, { items }, { scope: { space_id: spaceId } })
  })

  app.post('/api/v1/captures', { preHandler: requireCsrf }, async (request, reply) => {
    const input = parse(CreateCaptureSchema, request.body)
    const result = projectStore.createCapture(request.workbenchSession, input, {
      idempotencyKey: request.headers['idempotency-key'], requestId: request.id,
    })
    reply.code(result.statusCode)
    return success(request, result, { space_id: result.data.space_id })
  })

  app.post('/api/v1/captures/:captureId/transitions', { preHandler: requireCsrf }, async (request, reply) => {
    const { action } = parse(TransitionCaptureSchema, request.body)
    const result = projectStore.transitionCapture(
      request.workbenchSession, request.params.captureId, action, idempotencyOptions(request),
    )
    reply.code(result.statusCode)
    return success(request, result, { space_id: result.data.space_id })
  })

  app.get('/api/v1/daily/:date', { preHandler: requireSession }, async (request) => {
    const date = parse(DailyDateSchema, request.params.date)
    const spaceId = request.query?.space_id
    if (typeof spaceId !== 'string' || !spaceId) {
      throw publicError(ERROR_CODES.INVALID_REQUEST, 'space_id 为必填查询参数。', { statusCode: 400, field: 'space_id' })
    }
    const data = projectStore.getDailySnapshot(request.workbenchSession, { spaceId, date })
    return okEnvelope(request.id, data, { scope: { space_id: spaceId } })
  })

  app.put('/api/v1/daily-plans/:date', { preHandler: requireCsrf }, async (request, reply) => {
    const date = parse(DailyDateSchema, request.params.date)
    const input = parse(SaveDailyPlanSchema, request.body)
    const result = projectStore.saveDailyPlan(
      request.workbenchSession,
      { spaceId: input.space_id, date, taskIds: input.task_ids },
      optionalVersionOptions(request),
    )
    reply.code(result.statusCode)
    return success(request, result, { space_id: result.data.space_id })
  })

  app.put('/api/v1/daily-reviews/:date', { preHandler: requireCsrf }, async (request, reply) => {
    const date = parse(DailyDateSchema, request.params.date)
    const input = parse(SaveDailyReviewSchema, request.body)
    const { space_id: spaceId, ...review } = input
    const result = projectStore.saveDailyReview(
      request.workbenchSession,
      { spaceId, date, input: review },
      optionalVersionOptions(request),
    )
    reply.code(result.statusCode)
    return success(request, result, { space_id: result.data.space_id })
  })
}
