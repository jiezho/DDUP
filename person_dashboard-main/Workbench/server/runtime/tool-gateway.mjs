import { createHash } from 'node:crypto'

import { ERROR_CODES, publicError } from '../../shared/contracts/errors.mjs'
import { CANDIDATE_PROPOSAL_SCHEMAS } from '../../shared/contracts/tool-gateway.mjs'

const CANDIDATE_COLUMNS = `
  id, space_id, run_id, candidate_type, project_id, proposal_json, proposal_digest,
  status, applied_object_id, applied_object_version, created_at, created_by, updated_at, updated_by, version
`

const APPROVAL_COLUMNS = `
  id, space_id, subject_type, subject_id, action_level, scope_digest, status,
  reason_code, expires_at, resolved_at, resolved_by, created_at, created_by,
  updated_at, updated_by, version
`

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function digest(value) {
  return createHash('sha256').update(stableJson(value)).digest('hex')
}

function candidatePreview(candidate) {
  if (candidate.candidate_type === 'task') return { operation: 'create', object_type: 'task', fields: ['title', 'description', 'priority', 'due_date'] }
  if (candidate.candidate_type === 'knowledge') return { operation: 'create', object_type: 'knowledge_item', fields: ['title', 'body', 'source_refs'] }
  return { operation: 'create', object_type: 'decision', fields: ['title', 'statement', 'rationale'] }
}

function candidateFromRow(row) {
  if (!row) return null
  const { proposal_json: proposalJson, ...safe } = row
  const candidate = { ...safe, proposal: JSON.parse(proposalJson) }
  return { ...candidate, preview: candidatePreview(candidate), reversible: candidate.status === 'applied' }
}

function approvalFromRow(row, nowMs) {
  if (!row) return null
  const effectiveStatus = ['pending', 'approved'].includes(row.status) && row.expires_at <= new Date(nowMs).toISOString() ? 'expired' : row.status
  return { ...row, effective_status: effectiveStatus }
}

function approvalScope(candidate) {
  return digest({
    action: `candidate.${candidate.candidate_type}.apply.v1`,
    candidate_id: candidate.id,
    project_id: candidate.project_id,
    proposal_digest: candidate.proposal_digest,
  })
}

export function createToolGateway({ database, projectStore } = {}) {
  if (!database || !projectStore?.kernel) throw new TypeError('tool gateway dependencies are required')
  const { kernel } = projectStore
  const tools = Object.freeze([
    Object.freeze({
      tool_key: 'candidate.task.create.v1', version: '1.0.0', action_level: 'L1',
      runtime_callable: true, approval_required: false, external_effect: false,
    }),
    Object.freeze({
      tool_key: 'candidate.knowledge.create.v1', version: '1.0.0', action_level: 'L1',
      runtime_callable: true, approval_required: false, external_effect: false,
    }),
    Object.freeze({
      tool_key: 'candidate.decision.create.v1', version: '1.0.0', action_level: 'L1',
      runtime_callable: true, approval_required: false, external_effect: false,
    }),
    Object.freeze({
      tool_key: 'candidate.apply.v1', version: '1.0.0', action_level: 'L2',
      runtime_callable: false, approval_required: true, external_effect: false,
    }),
  ])

  function requireCandidate(actor, candidateId, spaceId) {
    kernel.visibleSpace(actor, spaceId)
    const row = database.prepare(`SELECT ${CANDIDATE_COLUMNS} FROM candidates WHERE id = ? AND space_id = ?`).get(candidateId, spaceId)
    if (!row) throw publicError(ERROR_CODES.OBJECT_NOT_AVAILABLE, '请求的资源不可用。', { statusCode: 404 })
    return candidateFromRow(row)
  }

  function requireApproval(actor, approvalId, spaceId) {
    kernel.visibleSpace(actor, spaceId)
    const row = database.prepare(`SELECT ${APPROVAL_COLUMNS} FROM approvals WHERE id = ? AND space_id = ?`).get(approvalId, spaceId)
    if (!row) throw publicError(ERROR_CODES.OBJECT_NOT_AVAILABLE, '请求的资源不可用。', { statusCode: 404 })
    return approvalFromRow(row, Date.parse(kernel.nowIso()))
  }

  function executeCandidateCall(session, run, call, { requestId = null } = {}) {
    const actor = kernel.actorForSession(session)
    if (run.status !== 'running') throw publicError(ERROR_CODES.TOOL_NOT_ALLOWED, '当前 Run 不接受新的 ToolCall。', { statusCode: 409 })
    const typeMatch = /^candidate\.(task|knowledge|decision)\.create\.v1$/.exec(call.tool_key)
    if (!typeMatch || call.tool_version !== '1.0.0') {
      throw publicError(ERROR_CODES.TOOL_NOT_REGISTERED, '请求的工具未注册或版本不匹配。', { statusCode: 422 })
    }
    const candidateType = typeMatch[1]
    if (call.purpose_code !== 'user_structured_request') {
      throw publicError(ERROR_CODES.TOOL_SCHEMA_INVALID, '工具用途未通过允许清单校验。', { statusCode: 422 })
    }
    const parsed = CANDIDATE_PROPOSAL_SCHEMAS[candidateType].safeParse(call.arguments)
    if (!parsed.success) throw publicError(ERROR_CODES.TOOL_SCHEMA_INVALID, '工具参数未通过 Schema 校验。', { statusCode: 422 })
    const argumentsDigest = digest(parsed.data)
    const existing = database.prepare(`
      SELECT id, tool_key, tool_version, arguments_digest, status, candidate_id
      FROM tool_calls WHERE run_id = ? AND runtime_tool_call_id = ?
    `).get(run.id, call.runtime_tool_call_id)
    if (existing) {
      if (existing.tool_key !== call.tool_key || existing.tool_version !== call.tool_version || existing.arguments_digest !== argumentsDigest) {
        throw publicError(ERROR_CODES.TOOL_CALL_CONFLICT, 'Runtime ToolCall 标识已绑定其他请求。', { statusCode: 409 })
      }
      return { candidate: requireCandidate(actor, existing.candidate_id, run.space_id), replayed: true }
    }
    const used = database.prepare('SELECT count(*) AS count FROM tool_calls WHERE run_id = ?').get(run.id).count
    if (used >= run.max_tool_calls) throw publicError(ERROR_CODES.BUDGET_EXCEEDED, 'Run ToolCall 预算已耗尽。', { statusCode: 409 })
    const timestamp = kernel.nowIso()
    const toolCallId = kernel.newId()
    database.prepare(`
      INSERT INTO tool_calls (
        id, run_id, space_id, runtime_tool_call_id, tool_key, tool_version, action_level,
        arguments_digest, status, candidate_id, approval_id, error_code, created_at, updated_at, version
      ) VALUES (?, ?, ?, ?, ?, ?, 'L1', ?, 'requested', NULL, NULL, NULL, ?, ?, 1)
    `).run(toolCallId, run.id, run.space_id, call.runtime_tool_call_id, call.tool_key, call.tool_version, argumentsDigest, timestamp, timestamp)
    try {
      const project = kernel.writableProject(actor, parsed.data.project_id)
      if (project.space_id !== run.space_id) throw publicError(ERROR_CODES.TOOL_NOT_ALLOWED, '工具目标不在当前 Run 空间。', { statusCode: 403 })
      const included = database.prepare(`
        SELECT 1 AS found FROM context_package_items
        WHERE package_id = ? AND space_id = ? AND object_type = 'project' AND object_id = ?
        LIMIT 1
      `).get(run.context_package_id, run.space_id, project.id)
      if (!included) throw publicError(ERROR_CODES.TOOL_NOT_ALLOWED, '工具目标不在本次显式上下文范围。', { statusCode: 403 })
      if (candidateType === 'knowledge') {
        for (const ref of parsed.data.source_refs) {
          const selected = database.prepare(`
            SELECT 1 AS found FROM context_package_items
            WHERE package_id = ? AND space_id = ? AND object_type = 'document'
              AND object_id = ? AND source_version_id = ? AND start_char = ? AND end_char = ?
          `).get(run.context_package_id, run.space_id, ref.document_id, ref.source_version_id, ref.start_char, ref.end_char)
          if (!selected) throw publicError(ERROR_CODES.TOOL_NOT_ALLOWED, '知识候选引用不在本次显式上下文范围。', { statusCode: 403 })
        }
      }

      const candidate = {
        id: kernel.newId(), space_id: run.space_id, run_id: run.id, candidate_type: candidateType,
        project_id: project.id, proposal: parsed.data, proposal_digest: argumentsDigest,
        status: 'pending', applied_object_id: null, applied_object_version: null, created_at: timestamp, created_by: actor.id,
        updated_at: timestamp, updated_by: actor.id, version: 1,
      }
      database.prepare(`
        INSERT INTO candidates (${CANDIDATE_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        candidate.id, candidate.space_id, candidate.run_id, candidate.candidate_type, candidate.project_id,
        stableJson(candidate.proposal), candidate.proposal_digest, candidate.status, candidate.applied_object_id, candidate.applied_object_version,
        timestamp, actor.id, timestamp, actor.id, candidate.version,
      )
      database.prepare("UPDATE tool_calls SET status = 'succeeded', candidate_id = ?, updated_at = ?, version = 2 WHERE id = ?")
        .run(candidate.id, timestamp, toolCallId)
      kernel.appendAudit({ spaceId: run.space_id, actor, action: 'tool_call.succeeded', objectType: 'tool_call', objectId: toolCallId, requestId, changed: ['candidate_id', 'status', 'version'] })
      kernel.appendAudit({ spaceId: run.space_id, actor, action: `candidate.${candidateType}.create`, objectType: 'candidate', objectId: candidate.id, requestId, changed: ['candidate_type', 'project_id', 'proposal_digest', 'status'] })
      kernel.appendOutbox({ spaceId: run.space_id, aggregate: candidate, aggregateType: 'candidate', eventType: 'candidate.created' })
      return { candidate, replayed: false }
    } catch (error) {
      const denied = error?.code === ERROR_CODES.TOOL_NOT_ALLOWED
      database.prepare('UPDATE tool_calls SET status = ?, error_code = ?, updated_at = ?, version = 2 WHERE id = ?')
        .run(denied ? 'denied' : 'failed', error?.code ?? ERROR_CODES.INTERNAL_ERROR, kernel.nowIso(), toolCallId)
      kernel.appendAudit({
        spaceId: run.space_id, actor, action: denied ? 'tool_call.denied' : 'tool_call.failed',
        objectType: 'tool_call', objectId: toolCallId, requestId,
        outcome: denied ? 'denied' : 'failed', reasonCode: error?.code ?? ERROR_CODES.INTERNAL_ERROR,
        changed: ['error_code', 'status', 'version'],
      })
      throw error
    }
  }

  function getCandidate(session, candidateId, spaceId) {
    return requireCandidate(kernel.actorForSession(session), candidateId, spaceId)
  }

  function listCandidates(session, { space_id: spaceId, status, candidate_type: candidateType, limit }) {
    const actor = kernel.actorForSession(session)
    kernel.visibleSpace(actor, spaceId)
    return database.prepare(`
      SELECT ${CANDIDATE_COLUMNS} FROM candidates
      WHERE space_id = ? AND (? IS NULL OR status = ?) AND (? IS NULL OR candidate_type = ?)
      ORDER BY updated_at DESC, id DESC LIMIT ?
    `).all(spaceId, status ?? null, status ?? null, candidateType ?? null, candidateType ?? null, limit).map(candidateFromRow)
  }

  function requestApproval(session, candidateId, input, { idempotencyKey, requestId } = {}) {
    const actor = kernel.actorForSession(session)
    kernel.visibleSpace(actor, input.space_id)
    return kernel.executeIdempotent({
      actor, commandScope: `candidate.approval.request:${candidateId}`, key: idempotencyKey,
      request: { candidateId, ...input }, statusCode: 201,
      operation: () => {
        const candidate = requireCandidate(actor, candidateId, input.space_id)
        if (candidate.status !== 'pending') throw publicError(ERROR_CODES.INVALID_STATE_TRANSITION, '当前候选不能申请审批。', { statusCode: 409 })
        if (input.reason_code !== `apply_${candidate.candidate_type}_candidate`) {
          throw publicError(ERROR_CODES.RELATION_CONFLICT, '审批原因与候选类型不匹配。', { statusCode: 409 })
        }
        const existing = database.prepare(`SELECT ${APPROVAL_COLUMNS} FROM approvals WHERE subject_id = ?`).get(candidate.id)
        if (existing) return approvalFromRow(existing, Date.parse(kernel.nowIso()))
        const timestamp = kernel.nowIso()
        const approval = {
          id: kernel.newId(), space_id: candidate.space_id, subject_type: 'candidate', subject_id: candidate.id,
          action_level: 'L2', scope_digest: approvalScope(candidate), status: 'pending', reason_code: input.reason_code,
          expires_at: new Date(Date.parse(timestamp) + 24 * 60 * 60 * 1000).toISOString(), resolved_at: null,
          resolved_by: null, created_at: timestamp, created_by: actor.id, updated_at: timestamp,
          updated_by: actor.id, version: 1,
        }
        database.prepare(`INSERT INTO approvals (${APPROVAL_COLUMNS}) VALUES (${Array(16).fill('?').join(', ')})`)
          .run(...APPROVAL_COLUMNS.split(',').map((column) => approval[column.trim()]))
        kernel.appendAudit({ spaceId: candidate.space_id, actor, action: 'approval.request', objectType: 'approval', objectId: approval.id, requestId, changed: ['action_level', 'reason_code', 'scope_digest', 'status', 'subject_id'] })
        kernel.appendOutbox({ spaceId: candidate.space_id, aggregate: approval, aggregateType: 'approval', eventType: 'approval.requested' })
        return { ...approval, effective_status: 'pending' }
      },
    })
  }

  function listApprovals(session, { space_id: spaceId, status, limit }) {
    const actor = kernel.actorForSession(session)
    kernel.visibleSpace(actor, spaceId)
    return database.prepare(`
      SELECT ${APPROVAL_COLUMNS} FROM approvals
      WHERE space_id = ? AND (? IS NULL OR status = ?)
      ORDER BY updated_at DESC, id DESC LIMIT ?
    `).all(spaceId, status ?? null, status ?? null, limit).map((row) => approvalFromRow(row, Date.parse(kernel.nowIso())))
  }

  function getApproval(session, approvalId, spaceId) {
    return requireApproval(kernel.actorForSession(session), approvalId, spaceId)
  }

  function resolveApproval(session, approvalId, input, { expectedVersion, idempotencyKey, requestId } = {}) {
    const actor = kernel.actorForSession(session)
    kernel.visibleSpace(actor, input.space_id)
    return kernel.executeIdempotent({
      actor, commandScope: `approval.resolve:${approvalId}`, key: idempotencyKey,
      request: { approvalId, expectedVersion, ...input },
      operation: () => {
        const approval = requireApproval(actor, approvalId, input.space_id)
        if (approval.version !== expectedVersion) throw publicError(ERROR_CODES.VERSION_CONFLICT, '审批已更新，请刷新后重试。', { statusCode: 409 })
        if (approval.effective_status === 'expired') throw publicError(ERROR_CODES.APPROVAL_EXPIRED, '审批已过期，请重新生成候选。', { statusCode: 409 })
        const nextStatus = input.decision === 'approve' ? 'approved' : 'rejected'
        if (approval.status !== 'pending') {
          if (approval.status === nextStatus) return approval
          throw publicError(ERROR_CODES.INVALID_STATE_TRANSITION, '审批已经以其他结果结束。', { statusCode: 409 })
        }
        const candidate = requireCandidate(actor, approval.subject_id, input.space_id)
        if (candidate.status !== 'pending') throw publicError(ERROR_CODES.INVALID_STATE_TRANSITION, '候选状态已变化，审批不能继续。', { statusCode: 409 })
        if (approval.scope_digest !== approvalScope(candidate) || digest(candidate.proposal) !== candidate.proposal_digest) {
          throw publicError(ERROR_CODES.APPROVAL_SCOPE_MISMATCH, '候选内容已变化，原审批范围失效。', { statusCode: 409 })
        }
        const timestamp = kernel.nowIso()
        database.prepare(`
          UPDATE approvals SET status = ?, resolved_at = ?, resolved_by = ?, updated_at = ?, updated_by = ?, version = version + 1
          WHERE id = ? AND version = ?
        `).run(nextStatus, timestamp, actor.id, timestamp, actor.id, approval.id, approval.version)
        database.prepare(`UPDATE candidates SET status = ?, updated_at = ?, updated_by = ?, version = version + 1 WHERE id = ? AND version = ?`)
          .run(nextStatus, timestamp, actor.id, candidate.id, candidate.version)
        const resolved = { ...approval, status: nextStatus, effective_status: nextStatus, resolved_at: timestamp, resolved_by: actor.id, updated_at: timestamp, updated_by: actor.id, version: approval.version + 1 }
        kernel.appendAudit({ spaceId: approval.space_id, actor, action: `approval.${nextStatus}`, objectType: 'approval', objectId: approval.id, requestId, changed: ['resolved_at', 'resolved_by', 'status', 'version'] })
        kernel.appendOutbox({ spaceId: approval.space_id, aggregate: resolved, aggregateType: 'approval', eventType: `approval.${nextStatus}` })
        return resolved
      },
    })
  }

  function applyCandidate(session, candidateId, input, { expectedVersion, idempotencyKey, requestId } = {}) {
    const actor = kernel.actorForSession(session)
    kernel.visibleSpace(actor, input.space_id)
    return kernel.executeIdempotent({
      actor, commandScope: `candidate.apply:${candidateId}`, key: idempotencyKey,
      request: { candidateId, expectedVersion, ...input },
      operation: () => {
        const candidate = requireCandidate(actor, candidateId, input.space_id)
        if (candidate.version !== expectedVersion) throw publicError(ERROR_CODES.VERSION_CONFLICT, '候选已更新，请刷新后重试。', { statusCode: 409 })
        if (candidate.status !== 'approved') throw publicError(ERROR_CODES.APPROVAL_REQUIRED, '候选必须先获得有效审批。', { statusCode: 409 })
        const approval = requireApproval(actor, input.approval_id, input.space_id)
        if (approval.subject_id !== candidate.id || approval.status !== 'approved') throw publicError(ERROR_CODES.APPROVAL_REQUIRED, '没有找到匹配的已批准范围。', { statusCode: 409 })
        if (approval.effective_status === 'expired') throw publicError(ERROR_CODES.APPROVAL_EXPIRED, '审批已过期，请重新生成候选。', { statusCode: 409 })
        if (approval.scope_digest !== approvalScope(candidate) || digest(candidate.proposal) !== candidate.proposal_digest) {
          throw publicError(ERROR_CODES.APPROVAL_SCOPE_MISMATCH, '候选内容已变化，原审批范围失效。', { statusCode: 409 })
        }
        const timestamp = kernel.nowIso()
        let appliedObject
        if (candidate.candidate_type === 'task') {
          appliedObject = kernel.createTaskInTransaction(actor, candidate.project_id, {
            title: candidate.proposal.title, description: candidate.proposal.description,
            priority: candidate.proposal.priority, due_at: null, due_date: candidate.proposal.due_date,
            milestone_id: null, parent_task_id: null,
          }, { requestId, sourceKind: 'ai_candidate' })
        } else if (candidate.candidate_type === 'knowledge') {
          appliedObject = {
            id: kernel.newId(), space_id: candidate.space_id, project_id: candidate.project_id,
            title: candidate.proposal.title, body: candidate.proposal.body, status: 'active',
            source_refs_json: stableJson(candidate.proposal.source_refs), source_kind: 'ai_candidate',
            created_at: timestamp, created_by: actor.id, updated_at: timestamp, updated_by: actor.id,
            version: 1, deleted_at: null, deleted_by: null,
          }
          database.prepare(`INSERT INTO knowledge_items (
            id, space_id, project_id, title, body, status, source_refs_json, source_kind,
            created_at, created_by, updated_at, updated_by, version, deleted_at, deleted_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NULL, NULL)`)
            .run(appliedObject.id, appliedObject.space_id, appliedObject.project_id, appliedObject.title, appliedObject.body, appliedObject.status, appliedObject.source_refs_json, appliedObject.source_kind, timestamp, actor.id, timestamp, actor.id)
        } else {
          appliedObject = {
            id: kernel.newId(), space_id: candidate.space_id, project_id: candidate.project_id,
            discussion_id: null, title: candidate.proposal.title, statement: candidate.proposal.statement,
            rationale: candidate.proposal.rationale, status: 'accepted', supersedes_id: null,
            decided_at: timestamp, created_at: timestamp, created_by: actor.id, updated_at: timestamp,
            updated_by: actor.id, version: 1, deleted_at: null, deleted_by: null,
          }
          database.prepare(`INSERT INTO decisions (
            id, space_id, project_id, discussion_id, title, statement, rationale, status, supersedes_id,
            decided_at, created_at, created_by, updated_at, updated_by, version, deleted_at, deleted_by
          ) VALUES (?, ?, ?, NULL, ?, ?, ?, 'accepted', NULL, ?, ?, ?, ?, ?, 1, NULL, NULL)`)
            .run(appliedObject.id, appliedObject.space_id, appliedObject.project_id, appliedObject.title, appliedObject.statement, appliedObject.rationale, timestamp, timestamp, actor.id, timestamp, actor.id)
        }
        database.prepare(`
          UPDATE candidates SET status = 'applied', applied_object_id = ?, applied_object_version = ?, updated_at = ?, updated_by = ?, version = version + 1
          WHERE id = ? AND version = ?
        `).run(appliedObject.id, appliedObject.version, timestamp, actor.id, candidate.id, candidate.version)
        database.prepare(`
          INSERT INTO tool_calls (
            id, run_id, space_id, runtime_tool_call_id, tool_key, tool_version, action_level,
            arguments_digest, status, candidate_id, approval_id, error_code, created_at, updated_at, version
          ) VALUES (?, ?, ?, ?, 'candidate.apply.v1', '1.0.0', 'L2', ?, 'succeeded', ?, ?, NULL, ?, ?, 1)
        `).run(kernel.newId(), candidate.run_id, candidate.space_id, `owner-apply:${candidate.id}`, approval.scope_digest, candidate.id, approval.id, timestamp, timestamp)
        const applied = { ...candidate, status: 'applied', applied_object_id: appliedObject.id, applied_object_version: appliedObject.version, updated_at: timestamp, updated_by: actor.id, version: candidate.version + 1 }
        kernel.appendAudit({ spaceId: candidate.space_id, actor, action: `candidate.${candidate.candidate_type}.apply`, objectType: 'candidate', objectId: candidate.id, requestId, changed: ['applied_object_id', 'applied_object_version', 'status', 'version'] })
        kernel.appendOutbox({ spaceId: candidate.space_id, aggregate: applied, aggregateType: 'candidate', eventType: 'candidate.applied' })
        return { candidate: { ...applied, preview: candidatePreview(applied), reversible: true }, applied_object: appliedObject, [candidate.candidate_type]: appliedObject }
      },
    })
  }

  function revertCandidate(session, candidateId, input, { expectedVersion, idempotencyKey, requestId } = {}) {
    const actor = kernel.actorForSession(session)
    kernel.visibleSpace(actor, input.space_id)
    return kernel.executeIdempotent({
      actor, commandScope: `candidate.revert:${candidateId}`, key: idempotencyKey,
      request: { candidateId, expectedVersion, ...input },
      operation: () => {
        const candidate = requireCandidate(actor, candidateId, input.space_id)
        if (candidate.version !== expectedVersion) throw publicError(ERROR_CODES.VERSION_CONFLICT, '候选已更新，请刷新后重试。', { statusCode: 409 })
        if (candidate.status !== 'applied' || !candidate.applied_object_id || !candidate.applied_object_version) {
          throw publicError(ERROR_CODES.INVALID_STATE_TRANSITION, '只有尚未发生后续修改的已应用候选可以撤销。', { statusCode: 409 })
        }
        const table = candidate.candidate_type === 'task' ? 'tasks' : candidate.candidate_type === 'knowledge' ? 'knowledge_items' : 'decisions'
        const object = database.prepare(`SELECT id, version, deleted_at FROM ${table} WHERE id = ? AND space_id = ?`).get(candidate.applied_object_id, candidate.space_id)
        if (!object || object.deleted_at || object.version !== candidate.applied_object_version) {
          throw publicError(ERROR_CODES.RELATION_CONFLICT, '目标对象已变化，不能自动撤销。', { statusCode: 409 })
        }
        if (candidate.candidate_type === 'task') {
          const linked = database.prepare('SELECT 1 AS found FROM daily_plan_items WHERE task_id = ? UNION SELECT 1 FROM tasks WHERE parent_task_id = ? AND deleted_at IS NULL LIMIT 1').get(object.id, object.id)
          if (linked) throw publicError(ERROR_CODES.RELATION_CONFLICT, '任务已有后续关系，不能自动撤销。', { statusCode: 409 })
        }
        if (candidate.candidate_type === 'decision') {
          const linked = database.prepare('SELECT 1 AS found FROM decision_task_links WHERE decision_id = ? LIMIT 1').get(object.id)
          if (linked) throw publicError(ERROR_CODES.RELATION_CONFLICT, '决策已有后续关系，不能自动撤销。', { statusCode: 409 })
        }
        const timestamp = kernel.nowIso()
        database.prepare(`UPDATE ${table} SET deleted_at = ?, deleted_by = ?, updated_at = ?, updated_by = ?, version = version + 1 WHERE id = ? AND space_id = ? AND version = ? AND deleted_at IS NULL`)
          .run(timestamp, actor.id, timestamp, actor.id, object.id, candidate.space_id, object.version)
        database.prepare("UPDATE candidates SET status = 'reverted', updated_at = ?, updated_by = ?, version = version + 1 WHERE id = ? AND version = ?")
          .run(timestamp, actor.id, candidate.id, candidate.version)
        const reverted = { ...candidate, status: 'reverted', updated_at: timestamp, updated_by: actor.id, version: candidate.version + 1, reversible: false }
        kernel.appendAudit({ spaceId: candidate.space_id, actor, action: `candidate.${candidate.candidate_type}.revert`, objectType: 'candidate', objectId: candidate.id, requestId, reasonCode: input.reason, changed: ['status', 'version'] })
        kernel.appendOutbox({ spaceId: candidate.space_id, aggregate: reverted, aggregateType: 'candidate', eventType: 'candidate.reverted' })
        return { candidate: reverted, reverted_object: { id: object.id, object_type: candidate.candidate_type, deleted_at: timestamp } }
      },
    })
  }

  function listAuditEvents(session, { space_id: spaceId, action = null, limit = 100 }) {
    const actor = kernel.actorForSession(session)
    kernel.visibleSpace(actor, spaceId)
    return database.prepare(`
      SELECT id, action, object_type, object_id, outcome, reason_code, request_id, occurred_at
      FROM audit_events WHERE space_id = ? AND (? IS NULL OR action = ?)
      ORDER BY occurred_at DESC, id DESC LIMIT ?
    `).all(spaceId, action, action, limit).map((row) => ({ ...row }))
  }

  return Object.freeze({
    applyCandidate, executeCandidateCall, getApproval, getCandidate,
    listApprovals, listAuditEvents, listCandidates, listTools: () => tools, requestApproval, resolveApproval,
    revertCandidate,
  })
}
