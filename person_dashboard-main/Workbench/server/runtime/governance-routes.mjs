import { ZodError } from 'zod'

import { okEnvelope } from '../../shared/contracts/envelopes.mjs'
import { ERROR_CODES, publicError } from '../../shared/contracts/errors.mjs'
import {
  ApprovalListQuerySchema,
  ApprovalRequestSchema,
  ApprovalResolveSchema,
  CandidateApplySchema,
  CandidateListQuerySchema,
  CandidateSpaceQuerySchema,
} from '../../shared/contracts/tool-gateway.mjs'

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

function commandOptions(request) {
  return { idempotencyKey: request.headers['idempotency-key'], requestId: request.id }
}

export function registerGovernanceRoutes(app, { toolGateway, requireSession, requireCsrf }) {
  app.get('/api/v1/tools', { preHandler: requireSession }, async (request) =>
    okEnvelope(request.id, { items: toolGateway.listTools() }),
  )

  app.get('/api/v1/candidates', { preHandler: requireSession }, async (request) => {
    const query = parse(CandidateListQuerySchema, request.query)
    return okEnvelope(request.id, { items: toolGateway.listCandidates(request.workbenchSession, query) }, { scope: { space_id: query.space_id } })
  })

  app.get('/api/v1/candidates/:candidateId', { preHandler: requireSession }, async (request) => {
    const query = parse(CandidateSpaceQuerySchema, request.query)
    return okEnvelope(request.id, toolGateway.getCandidate(request.workbenchSession, request.params.candidateId, query.space_id), { scope: { space_id: query.space_id } })
  })

  app.post('/api/v1/candidates/:candidateId/approvals', { preHandler: requireCsrf }, async (request, reply) => {
    const input = parse(ApprovalRequestSchema, request.body)
    const result = toolGateway.requestApproval(request.workbenchSession, request.params.candidateId, input, commandOptions(request))
    reply.code(result.statusCode)
    return okEnvelope(request.id, result.data, { scope: { space_id: input.space_id }, idempotency_replayed: result.replayed })
  })

  app.get('/api/v1/approvals', { preHandler: requireSession }, async (request) => {
    const query = parse(ApprovalListQuerySchema, request.query)
    return okEnvelope(request.id, { items: toolGateway.listApprovals(request.workbenchSession, query) }, { scope: { space_id: query.space_id } })
  })

  app.get('/api/v1/approvals/:approvalId', { preHandler: requireSession }, async (request) => {
    const query = parse(CandidateSpaceQuerySchema, request.query)
    return okEnvelope(request.id, toolGateway.getApproval(request.workbenchSession, request.params.approvalId, query.space_id), { scope: { space_id: query.space_id } })
  })

  app.post('/api/v1/approvals/:approvalId/resolve', { preHandler: requireCsrf }, async (request) => {
    const input = parse(ApprovalResolveSchema, request.body)
    const result = toolGateway.resolveApproval(request.workbenchSession, request.params.approvalId, input, {
      ...commandOptions(request), expectedVersion: parseIfMatch(request.headers['if-match']),
    })
    return okEnvelope(request.id, result.data, { scope: { space_id: input.space_id }, idempotency_replayed: result.replayed })
  })

  app.post('/api/v1/candidates/:candidateId/apply', { preHandler: requireCsrf }, async (request) => {
    const input = parse(CandidateApplySchema, request.body)
    const result = toolGateway.applyCandidate(request.workbenchSession, request.params.candidateId, input, {
      ...commandOptions(request), expectedVersion: parseIfMatch(request.headers['if-match']),
    })
    return okEnvelope(request.id, result.data, { scope: { space_id: input.space_id }, idempotency_replayed: result.replayed })
  })
}
