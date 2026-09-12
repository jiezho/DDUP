import { createHash } from 'node:crypto'

import { ERROR_CODES, publicError } from '../../shared/contracts/errors.mjs'

const QUESTION_TRANSITIONS = Object.freeze({
  start_testing: new Map([['open', 'testing']]),
  answer: new Map([['testing', 'answered']]),
  archive: new Map([['open', 'archived'], ['testing', 'archived'], ['answered', 'archived']]),
  reopen: new Map([['archived', 'open']]),
})

const OPPORTUNITY_TRANSITIONS = Object.freeze({
  start_exploring: new Map([['draft', 'exploring']]),
  validate: new Map([['exploring', 'validated']]),
  reject: new Map([['draft', 'rejected'], ['exploring', 'rejected']]),
  archive: new Map([['draft', 'archived'], ['exploring', 'archived'], ['validated', 'archived'], ['rejected', 'archived']]),
  reopen: new Map([['archived', 'draft']]),
})

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function assertVersion(current, expectedVersion) {
  if (current.version !== expectedVersion) {
    throw publicError(ERROR_CODES.VERSION_CONFLICT, '对象已被修改，请刷新后比较差异。', { statusCode: 409 })
  }
}

export function createProfessionalStore({ database, projectStore } = {}) {
  if (!database) throw new TypeError('database is required')
  if (!projectStore) throw new TypeError('projectStore is required')
  const kernel = projectStore.kernel

  function professionalProject(actor, projectId, templateType, { writable = false } = {}) {
    const project = writable ? kernel.writableProject(actor, projectId) : kernel.requireProject(actor, projectId)
    if (project.template_type !== templateType) {
      throw publicError(ERROR_CODES.VALIDATION_FAILED, `该能力只适用于 ${templateType === 'research' ? '博士科研' : 'AI 应用探索'}项目。`, {
        statusCode: 422,
        field: 'project_id',
      })
    }
    return project
  }

  function requireQuestion(actor, questionId) {
    const row = database.prepare(`
      SELECT q.* FROM research_questions q
      JOIN spaces s ON s.id = q.space_id
      JOIN projects p ON p.id = q.project_id AND p.space_id = q.space_id
      WHERE q.id = ? AND s.owner_id = ? AND s.status = 'active' AND s.deleted_at IS NULL
        AND p.deleted_at IS NULL AND q.deleted_at IS NULL
    `).get(questionId, actor.id)
    if (!row) throw publicError(ERROR_CODES.OBJECT_NOT_AVAILABLE, '请求的研究问题不可用。', { statusCode: 404 })
    return { ...row }
  }

  function requireResearchExperiment(actor, experimentId) {
    const row = database.prepare(`
      SELECT e.* FROM research_experiments e
      JOIN spaces s ON s.id = e.space_id
      JOIN projects p ON p.id = e.project_id AND p.space_id = e.space_id
      WHERE e.id = ? AND s.owner_id = ? AND s.status = 'active' AND s.deleted_at IS NULL
        AND p.deleted_at IS NULL AND e.deleted_at IS NULL
    `).get(experimentId, actor.id)
    if (!row) throw publicError(ERROR_CODES.OBJECT_NOT_AVAILABLE, '请求的研究实验不可用。', { statusCode: 404 })
    return { ...row }
  }

  function requireOpportunity(actor, opportunityId) {
    const row = database.prepare(`
      SELECT o.* FROM ai_opportunities o
      JOIN spaces s ON s.id = o.space_id
      JOIN projects p ON p.id = o.project_id AND p.space_id = o.space_id
      WHERE o.id = ? AND s.owner_id = ? AND s.status = 'active' AND s.deleted_at IS NULL
        AND p.deleted_at IS NULL AND o.deleted_at IS NULL
    `).get(opportunityId, actor.id)
    if (!row) throw publicError(ERROR_CODES.OBJECT_NOT_AVAILABLE, '请求的机会卡不可用。', { statusCode: 404 })
    return { ...row }
  }

  function requireAiExperiment(actor, experimentId) {
    const row = database.prepare(`
      SELECT e.* FROM ai_experiments e
      JOIN spaces s ON s.id = e.space_id
      JOIN projects p ON p.id = e.project_id AND p.space_id = e.space_id
      WHERE e.id = ? AND s.owner_id = ? AND s.status = 'active' AND s.deleted_at IS NULL
        AND p.deleted_at IS NULL AND e.deleted_at IS NULL
    `).get(experimentId, actor.id)
    if (!row) throw publicError(ERROR_CODES.OBJECT_NOT_AVAILABLE, '请求的 AI 评测不可用。', { statusCode: 404 })
    return { ...row }
  }

  function getWorkspace(session, projectId) {
    const actor = kernel.actorForSession(session)
    const project = kernel.requireProject(actor, projectId)
    const researchQuestions = database.prepare(`
      SELECT * FROM research_questions WHERE space_id = ? AND project_id = ? AND deleted_at IS NULL
      ORDER BY updated_at DESC, id DESC
    `).all(project.space_id, project.id).map((row) => ({ ...row }))
    const researchExperiments = database.prepare(`
      SELECT * FROM research_experiments WHERE space_id = ? AND project_id = ? AND deleted_at IS NULL
      ORDER BY updated_at DESC, id DESC
    `).all(project.space_id, project.id).map((row) => ({ ...row }))
    const researchClaims = database.prepare(`
      SELECT id, space_id, project_id, research_question_id, experiment_id, statement,
        evidence_direction, evidence_strength, source_id, source_version_id, document_id,
        start_char, end_char, text_sha256, created_at, created_by, version
      FROM research_claims WHERE space_id = ? AND project_id = ? AND deleted_at IS NULL
      ORDER BY created_at DESC, id DESC
    `).all(project.space_id, project.id).map((row) => {
      const evidence = database.prepare(`
        SELECT d.body_text FROM documents d
        JOIN sources s ON s.id = d.source_id AND s.space_id = d.space_id
        WHERE d.id = ? AND d.space_id = ? AND d.source_id = ? AND d.source_version_id = ?
          AND d.deleted_at IS NULL AND s.deleted_at IS NULL AND s.status = 'ready'
      `).get(row.document_id, row.space_id, row.source_id, row.source_version_id)
      const currentText = evidence?.body_text?.slice(row.start_char, row.end_char) ?? null
      return { ...row, evidence_integrity: currentText && sha256(currentText) === row.text_sha256 ? 'valid' : 'invalid' }
    })
    const aiOpportunities = database.prepare(`
      SELECT * FROM ai_opportunities WHERE space_id = ? AND project_id = ? AND deleted_at IS NULL
      ORDER BY updated_at DESC, id DESC
    `).all(project.space_id, project.id).map((row) => ({ ...row }))
    const aiExperiments = database.prepare(`
      SELECT * FROM ai_experiments WHERE space_id = ? AND project_id = ? AND deleted_at IS NULL
      ORDER BY updated_at DESC, id DESC
    `).all(project.space_id, project.id).map((row) => ({ ...row }))
    return {
      project,
      research: { questions: researchQuestions, experiments: researchExperiments, claims: researchClaims },
      ai_lab: { opportunities: aiOpportunities, experiments: aiExperiments },
    }
  }

  function createResearchQuestion(session, projectId, input, options) {
    const actor = kernel.actorForSession(session)
    const project = professionalProject(actor, projectId, 'research', { writable: true })
    return kernel.executeIdempotent({
      actor,
      commandScope: `research.question.create:${projectId}`,
      key: options.idempotencyKey,
      request: input,
      statusCode: 201,
      operation() {
        const timestamp = kernel.nowIso()
        const question = {
          id: kernel.newId(), space_id: project.space_id, project_id: project.id,
          ...input, status: 'open', created_at: timestamp, created_by: actor.id,
          updated_at: timestamp, updated_by: actor.id, version: 1, deleted_at: null, deleted_by: null,
        }
        database.prepare(`
          INSERT INTO research_questions (
            id, space_id, project_id, title, problem_statement, hypothesis, success_criteria, status,
            created_at, created_by, updated_at, updated_by, version, deleted_at, deleted_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, 1, NULL, NULL)
        `).run(question.id, question.space_id, question.project_id, question.title, question.problem_statement,
          question.hypothesis, question.success_criteria, timestamp, actor.id, timestamp, actor.id)
        kernel.appendAudit({ spaceId: question.space_id, actor, action: 'research_question.create', objectType: 'research_question', objectId: question.id, requestId: options.requestId, changed: ['hypothesis', 'problem_statement', 'project_id', 'success_criteria', 'title'] })
        kernel.appendOutbox({ spaceId: question.space_id, aggregate: question, aggregateType: 'research_question', eventType: 'research_question.created' })
        return question
      },
    })
  }

  function transitionResearchQuestion(session, questionId, action, options) {
    const actor = kernel.actorForSession(session)
    return kernel.executeIdempotent({
      actor,
      commandScope: `research.question.transition:${questionId}`,
      key: options.idempotencyKey,
      request: { action, expected_version: options.expectedVersion },
      operation() {
        const current = requireQuestion(actor, questionId)
        professionalProject(actor, current.project_id, 'research', { writable: true })
        assertVersion(current, options.expectedVersion)
        const status = QUESTION_TRANSITIONS[action]?.get(current.status)
        if (!status) throw publicError(ERROR_CODES.INVALID_STATE_TRANSITION, '当前研究问题状态不允许该操作。', { statusCode: 409 })
        const timestamp = kernel.nowIso()
        const next = { ...current, status, updated_at: timestamp, updated_by: actor.id, version: current.version + 1 }
        const result = database.prepare('UPDATE research_questions SET status = ?, updated_at = ?, updated_by = ?, version = ? WHERE id = ? AND version = ? AND deleted_at IS NULL')
          .run(status, timestamp, actor.id, next.version, next.id, current.version)
        if (result.changes !== 1) throw publicError(ERROR_CODES.VERSION_CONFLICT, '对象已被修改，请刷新后比较差异。', { statusCode: 409 })
        kernel.appendAudit({ spaceId: next.space_id, actor, action: `research_question.${action}`, objectType: 'research_question', objectId: next.id, requestId: options.requestId, changed: ['status'] })
        kernel.appendOutbox({ spaceId: next.space_id, aggregate: next, aggregateType: 'research_question', eventType: `research_question.${status}` })
        return next
      },
    })
  }

  function createResearchExperiment(session, questionId, input, options) {
    const actor = kernel.actorForSession(session)
    const question = requireQuestion(actor, questionId)
    const project = professionalProject(actor, question.project_id, 'research', { writable: true })
    if (question.status === 'archived') throw publicError(ERROR_CODES.INVALID_STATE_TRANSITION, '已归档研究问题不能新增实验。', { statusCode: 409 })
    return kernel.executeIdempotent({
      actor,
      commandScope: `research.experiment.create:${questionId}`,
      key: options.idempotencyKey,
      request: input,
      statusCode: 201,
      operation() {
        const timestamp = kernel.nowIso()
        const experiment = {
          id: kernel.newId(), space_id: project.space_id, project_id: project.id,
          research_question_id: question.id, ...input, result_summary: '', status: 'planned', decision: 'pending',
          follow_up_task_id: null, created_at: timestamp, created_by: actor.id,
          updated_at: timestamp, updated_by: actor.id, version: 1, deleted_at: null, deleted_by: null,
        }
        database.prepare(`
          INSERT INTO research_experiments (
            id, space_id, project_id, research_question_id, title, method, variables, expected_outcome,
            result_summary, status, decision, follow_up_task_id, created_at, created_by, updated_at, updated_by,
            version, deleted_at, deleted_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', 'planned', 'pending', NULL, ?, ?, ?, ?, 1, NULL, NULL)
        `).run(experiment.id, experiment.space_id, experiment.project_id, experiment.research_question_id,
          experiment.title, experiment.method, experiment.variables, experiment.expected_outcome,
          timestamp, actor.id, timestamp, actor.id)
        kernel.appendAudit({ spaceId: experiment.space_id, actor, action: 'research_experiment.create', objectType: 'research_experiment', objectId: experiment.id, requestId: options.requestId, changed: ['expected_outcome', 'method', 'research_question_id', 'title', 'variables'] })
        kernel.appendOutbox({ spaceId: experiment.space_id, aggregate: experiment, aggregateType: 'research_experiment', eventType: 'research_experiment.created' })
        return experiment
      },
    })
  }

  function recordResearchResult(session, experimentId, input, options) {
    const actor = kernel.actorForSession(session)
    return kernel.executeIdempotent({
      actor,
      commandScope: `research.experiment.result:${experimentId}`,
      key: options.idempotencyKey,
      request: { ...input, expected_version: options.expectedVersion },
      operation() {
        const current = requireResearchExperiment(actor, experimentId)
        professionalProject(actor, current.project_id, 'research', { writable: true })
        assertVersion(current, options.expectedVersion)
        if (current.status !== 'planned') throw publicError(ERROR_CODES.INVALID_STATE_TRANSITION, '该实验已经形成结果。', { statusCode: 409 })
        const task = input.follow_up_task_title
          ? kernel.createTaskInTransaction(actor, current.project_id, {
              title: input.follow_up_task_title,
              description: `由研究实验“${current.title}”的 ${input.decision === 'continue' ? '继续' : '停止'}决定生成。`,
              priority: 'normal', due_at: null, due_date: null, milestone_id: null, parent_task_id: null,
            }, { requestId: options.requestId, sourceKind: 'manual' })
          : null
        const timestamp = kernel.nowIso()
        const next = {
          ...current, result_summary: input.result_summary,
          status: input.decision === 'stop' ? 'stopped' : 'completed', decision: input.decision,
          follow_up_task_id: task?.id ?? null, updated_at: timestamp, updated_by: actor.id, version: current.version + 1,
        }
        database.prepare(`
          UPDATE research_experiments SET result_summary = ?, status = ?, decision = ?, follow_up_task_id = ?,
            updated_at = ?, updated_by = ?, version = ? WHERE id = ? AND version = ? AND deleted_at IS NULL
        `).run(next.result_summary, next.status, next.decision, next.follow_up_task_id, timestamp, actor.id, next.version, next.id, current.version)
        kernel.appendAudit({ spaceId: next.space_id, actor, action: 'research_experiment.record_result', objectType: 'research_experiment', objectId: next.id, requestId: options.requestId, changed: ['decision', 'follow_up_task_id', 'result_summary', 'status'] })
        kernel.appendOutbox({ spaceId: next.space_id, aggregate: next, aggregateType: 'research_experiment', eventType: 'research_experiment.result_recorded' })
        return { experiment: next, follow_up_task: task }
      },
    })
  }

  function createResearchClaim(session, questionId, input, options) {
    const actor = kernel.actorForSession(session)
    const question = requireQuestion(actor, questionId)
    const project = professionalProject(actor, question.project_id, 'research', { writable: true })
    const experiment = requireResearchExperiment(actor, input.experiment_id)
    if (experiment.research_question_id !== question.id || experiment.project_id !== project.id) {
      throw publicError(ERROR_CODES.RELATION_CONFLICT, '实验与研究问题不属于同一研究链路。', { statusCode: 409 })
    }
    return kernel.executeIdempotent({
      actor,
      commandScope: `research.claim.create:${questionId}`,
      key: options.idempotencyKey,
      request: input,
      statusCode: 201,
      operation() {
        const evidence = database.prepare(`
          SELECT d.body_text, d.project_id AS document_project_id, s.project_id AS source_project_id
          FROM sources s
          JOIN source_versions v ON v.id = ? AND v.source_id = s.id AND v.space_id = s.space_id
          JOIN documents d ON d.id = ? AND d.source_version_id = v.id AND d.space_id = v.space_id
          WHERE s.id = ? AND s.space_id = ? AND s.deleted_at IS NULL AND s.status = 'ready'
            AND v.status = 'ready' AND d.deleted_at IS NULL
        `).get(input.evidence.source_version_id, input.evidence.document_id, input.evidence.source_id, project.space_id)
        if (!evidence || (evidence.source_project_id && evidence.source_project_id !== project.id)) {
          throw publicError(ERROR_CODES.OBJECT_NOT_AVAILABLE, '所选证据不在当前研究项目的授权范围内。', { statusCode: 404 })
        }
        const { start_char: start, end_char: end } = input.evidence
        if (end > evidence.body_text.length || end - start > 5_000 || !evidence.body_text.slice(start, end).trim()) {
          throw publicError(ERROR_CODES.VALIDATION_FAILED, '证据字符范围无效或超过 5000 字符。', { statusCode: 422, field: 'evidence' })
        }
        const timestamp = kernel.nowIso()
        const claim = {
          id: kernel.newId(), space_id: project.space_id, project_id: project.id,
          research_question_id: question.id, experiment_id: experiment.id,
          statement: input.statement, evidence_direction: input.evidence_direction,
          evidence_strength: input.evidence_strength, source_id: input.evidence.source_id,
          source_version_id: input.evidence.source_version_id, document_id: input.evidence.document_id,
          start_char: start, end_char: end, text_sha256: sha256(evidence.body_text.slice(start, end)),
          created_at: timestamp, created_by: actor.id, version: 1, deleted_at: null, deleted_by: null,
        }
        database.prepare(`
          INSERT INTO research_claims (
            id, space_id, project_id, research_question_id, experiment_id, statement, evidence_direction,
            evidence_strength, source_id, source_version_id, document_id, start_char, end_char, text_sha256,
            created_at, created_by, version, deleted_at, deleted_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NULL, NULL)
        `).run(claim.id, claim.space_id, claim.project_id, claim.research_question_id, claim.experiment_id,
          claim.statement, claim.evidence_direction, claim.evidence_strength, claim.source_id,
          claim.source_version_id, claim.document_id, claim.start_char, claim.end_char, claim.text_sha256,
          timestamp, actor.id)
        kernel.appendAudit({ spaceId: claim.space_id, actor, action: 'research_claim.create', objectType: 'research_claim', objectId: claim.id, requestId: options.requestId, changed: ['evidence_direction', 'evidence_strength', 'experiment_id', 'locator', 'statement'] })
        kernel.appendOutbox({ spaceId: claim.space_id, aggregate: { ...claim, status: 'recorded' }, aggregateType: 'research_claim', eventType: 'research_claim.created' })
        return claim
      },
    })
  }

  function createAiOpportunity(session, projectId, input, options) {
    const actor = kernel.actorForSession(session)
    const project = professionalProject(actor, projectId, 'ai_exploration', { writable: true })
    return kernel.executeIdempotent({
      actor,
      commandScope: `ai.opportunity.create:${projectId}`,
      key: options.idempotencyKey,
      request: input,
      statusCode: 201,
      operation() {
        const timestamp = kernel.nowIso()
        const opportunity = {
          id: kernel.newId(), space_id: project.space_id, project_id: project.id, ...input,
          status: 'draft', created_at: timestamp, created_by: actor.id, updated_at: timestamp,
          updated_by: actor.id, version: 1, deleted_at: null, deleted_by: null,
        }
        database.prepare(`
          INSERT INTO ai_opportunities (
            id, space_id, project_id, title, problem_statement, target_user, value_hypothesis,
            feasibility_hypothesis, status, created_at, created_by, updated_at, updated_by, version,
            deleted_at, deleted_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, 1, NULL, NULL)
        `).run(opportunity.id, opportunity.space_id, opportunity.project_id, opportunity.title,
          opportunity.problem_statement, opportunity.target_user, opportunity.value_hypothesis,
          opportunity.feasibility_hypothesis, timestamp, actor.id, timestamp, actor.id)
        kernel.appendAudit({ spaceId: opportunity.space_id, actor, action: 'ai_opportunity.create', objectType: 'ai_opportunity', objectId: opportunity.id, requestId: options.requestId, changed: ['feasibility_hypothesis', 'problem_statement', 'project_id', 'target_user', 'title', 'value_hypothesis'] })
        kernel.appendOutbox({ spaceId: opportunity.space_id, aggregate: opportunity, aggregateType: 'ai_opportunity', eventType: 'ai_opportunity.created' })
        return opportunity
      },
    })
  }

  function transitionAiOpportunity(session, opportunityId, action, options) {
    const actor = kernel.actorForSession(session)
    return kernel.executeIdempotent({
      actor,
      commandScope: `ai.opportunity.transition:${opportunityId}`,
      key: options.idempotencyKey,
      request: { action, expected_version: options.expectedVersion },
      operation() {
        const current = requireOpportunity(actor, opportunityId)
        professionalProject(actor, current.project_id, 'ai_exploration', { writable: true })
        assertVersion(current, options.expectedVersion)
        const status = OPPORTUNITY_TRANSITIONS[action]?.get(current.status)
        if (!status) throw publicError(ERROR_CODES.INVALID_STATE_TRANSITION, '当前机会卡状态不允许该操作。', { statusCode: 409 })
        const timestamp = kernel.nowIso()
        const next = { ...current, status, updated_at: timestamp, updated_by: actor.id, version: current.version + 1 }
        const result = database.prepare('UPDATE ai_opportunities SET status = ?, updated_at = ?, updated_by = ?, version = ? WHERE id = ? AND version = ? AND deleted_at IS NULL')
          .run(status, timestamp, actor.id, next.version, next.id, current.version)
        if (result.changes !== 1) throw publicError(ERROR_CODES.VERSION_CONFLICT, '对象已被修改，请刷新后比较差异。', { statusCode: 409 })
        kernel.appendAudit({ spaceId: next.space_id, actor, action: `ai_opportunity.${action}`, objectType: 'ai_opportunity', objectId: next.id, requestId: options.requestId, changed: ['status'] })
        kernel.appendOutbox({ spaceId: next.space_id, aggregate: next, aggregateType: 'ai_opportunity', eventType: `ai_opportunity.${status}` })
        return next
      },
    })
  }

  function createAiExperiment(session, opportunityId, input, options) {
    const actor = kernel.actorForSession(session)
    const opportunity = requireOpportunity(actor, opportunityId)
    const project = professionalProject(actor, opportunity.project_id, 'ai_exploration', { writable: true })
    if (opportunity.status === 'archived') throw publicError(ERROR_CODES.INVALID_STATE_TRANSITION, '已归档机会卡不能新增评测。', { statusCode: 409 })
    return kernel.executeIdempotent({
      actor,
      commandScope: `ai.experiment.create:${opportunityId}`,
      key: options.idempotencyKey,
      request: input,
      statusCode: 201,
      operation() {
        const timestamp = kernel.nowIso()
        const experiment = {
          id: kernel.newId(), space_id: project.space_id, project_id: project.id, opportunity_id: opportunity.id,
          ...input, observed_value: null, evidence_summary: '', status: 'planned', decision: 'pending',
          follow_up_task_id: null, created_at: timestamp, created_by: actor.id, updated_at: timestamp,
          updated_by: actor.id, version: 1, deleted_at: null, deleted_by: null,
        }
        database.prepare(`
          INSERT INTO ai_experiments (
            id, space_id, project_id, opportunity_id, title, evaluation_method, metric_name,
            baseline_value, target_value, observed_value, evidence_summary, status, decision,
            follow_up_task_id, created_at, created_by, updated_at, updated_by, version, deleted_at, deleted_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, '', 'planned', 'pending', NULL, ?, ?, ?, ?, 1, NULL, NULL)
        `).run(experiment.id, experiment.space_id, experiment.project_id, experiment.opportunity_id,
          experiment.title, experiment.evaluation_method, experiment.metric_name, experiment.baseline_value,
          experiment.target_value, timestamp, actor.id, timestamp, actor.id)
        kernel.appendAudit({ spaceId: experiment.space_id, actor, action: 'ai_experiment.create', objectType: 'ai_experiment', objectId: experiment.id, requestId: options.requestId, changed: ['baseline_value', 'evaluation_method', 'metric_name', 'opportunity_id', 'target_value', 'title'] })
        kernel.appendOutbox({ spaceId: experiment.space_id, aggregate: experiment, aggregateType: 'ai_experiment', eventType: 'ai_experiment.created' })
        return experiment
      },
    })
  }

  function recordAiResult(session, experimentId, input, options) {
    const actor = kernel.actorForSession(session)
    return kernel.executeIdempotent({
      actor,
      commandScope: `ai.experiment.result:${experimentId}`,
      key: options.idempotencyKey,
      request: { ...input, expected_version: options.expectedVersion },
      operation() {
        const current = requireAiExperiment(actor, experimentId)
        professionalProject(actor, current.project_id, 'ai_exploration', { writable: true })
        assertVersion(current, options.expectedVersion)
        if (current.status !== 'planned') throw publicError(ERROR_CODES.INVALID_STATE_TRANSITION, '该 AI 评测已经形成结果。', { statusCode: 409 })
        const task = input.follow_up_task_title
          ? kernel.createTaskInTransaction(actor, current.project_id, {
              title: input.follow_up_task_title,
              description: `由 AI 评测“${current.title}”的 ${input.decision.toUpperCase()} 决定生成。`,
              priority: 'normal', due_at: null, due_date: null, milestone_id: null, parent_task_id: null,
            }, { requestId: options.requestId, sourceKind: 'manual' })
          : null
        const timestamp = kernel.nowIso()
        const next = {
          ...current, observed_value: input.observed_value, evidence_summary: input.evidence_summary,
          status: input.decision === 'stop' ? 'stopped' : 'completed', decision: input.decision,
          follow_up_task_id: task?.id ?? null, updated_at: timestamp, updated_by: actor.id, version: current.version + 1,
        }
        database.prepare(`
          UPDATE ai_experiments SET observed_value = ?, evidence_summary = ?, status = ?, decision = ?,
            follow_up_task_id = ?, updated_at = ?, updated_by = ?, version = ?
          WHERE id = ? AND version = ? AND deleted_at IS NULL
        `).run(next.observed_value, next.evidence_summary, next.status, next.decision, next.follow_up_task_id,
          timestamp, actor.id, next.version, next.id, current.version)
        kernel.appendAudit({ spaceId: next.space_id, actor, action: 'ai_experiment.record_result', objectType: 'ai_experiment', objectId: next.id, requestId: options.requestId, changed: ['decision', 'evidence_summary', 'follow_up_task_id', 'observed_value', 'status'] })
        kernel.appendOutbox({ spaceId: next.space_id, aggregate: next, aggregateType: 'ai_experiment', eventType: 'ai_experiment.result_recorded' })
        return { experiment: next, follow_up_task: task }
      },
    })
  }

  return Object.freeze({
    createAiExperiment,
    createAiOpportunity,
    createResearchClaim,
    createResearchExperiment,
    createResearchQuestion,
    getWorkspace,
    recordAiResult,
    recordResearchResult,
    transitionAiOpportunity,
    transitionResearchQuestion,
  })
}
