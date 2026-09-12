import { createHash } from 'node:crypto'

import { ERROR_CODES, publicError } from '../../shared/contracts/errors.mjs'

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function assertVersion(current, expectedVersion) {
  if (current.version !== expectedVersion) {
    throw publicError(ERROR_CODES.VERSION_CONFLICT, '对象已被修改，请刷新后比较差异。', { statusCode: 409 })
  }
}

export function createGrowthStore({ database, projectStore } = {}) {
  if (!database) throw new TypeError('database is required')
  if (!projectStore) throw new TypeError('projectStore is required')
  const kernel = projectStore.kernel

  function growthProject(actor, projectId, template, { writable = false } = {}) {
    const project = writable ? kernel.writableProject(actor, projectId) : kernel.requireProject(actor, projectId)
    if (project.template_type !== template) {
      throw publicError(ERROR_CODES.VALIDATION_FAILED, `该能力只适用于${template === 'frontier_tracking' ? '前沿跟踪' : '学习提升'}项目。`, {
        statusCode: 422,
        field: 'project_id',
      })
    }
    return project
  }

  function requireOwnedRow(actor, table, id, message) {
    const allowed = new Set(['radar_topics', 'learning_tracks', 'learning_practices', 'learning_routines'])
    if (!allowed.has(table)) throw new TypeError('unsupported table')
    const row = database.prepare(`
      SELECT o.* FROM ${table} o
      JOIN spaces s ON s.id = o.space_id
      JOIN projects p ON p.id = o.project_id AND p.space_id = o.space_id
      WHERE o.id = ? AND s.owner_id = ? AND s.status = 'active' AND s.deleted_at IS NULL
        AND p.deleted_at IS NULL AND o.deleted_at IS NULL
    `).get(id, actor.id)
    if (!row) throw publicError(ERROR_CODES.OBJECT_NOT_AVAILABLE, message, { statusCode: 404 })
    return { ...row }
  }

  function exactEvidence(project, input) {
    const evidence = database.prepare(`
      SELECT d.body_text, s.project_id AS source_project_id
      FROM sources s
      JOIN source_versions v ON v.id = ? AND v.source_id = s.id AND v.space_id = s.space_id
      JOIN documents d ON d.id = ? AND d.source_version_id = v.id AND d.space_id = v.space_id
      WHERE s.id = ? AND s.space_id = ? AND s.deleted_at IS NULL AND s.status = 'ready'
        AND v.status = 'ready' AND d.deleted_at IS NULL
    `).get(input.source_version_id, input.document_id, input.source_id, project.space_id)
    if (!evidence || (evidence.source_project_id && evidence.source_project_id !== project.id)) {
      throw publicError(ERROR_CODES.OBJECT_NOT_AVAILABLE, '所选来源不在当前项目的授权范围内。', { statusCode: 404 })
    }
    const text = evidence.body_text.slice(input.start_char, input.end_char)
    if (input.end_char > evidence.body_text.length || text.length > 5_000 || !text.trim()) {
      throw publicError(ERROR_CODES.VALIDATION_FAILED, '证据字符范围无效或超过 5000 字符。', { statusCode: 422, field: 'evidence' })
    }
    return { text, hash: sha256(text) }
  }

  function getWorkspace(session, projectId) {
    const actor = kernel.actorForSession(session)
    const project = kernel.requireProject(actor, projectId)
    if (!['frontier_tracking', 'learning'].includes(project.template_type)) {
      throw publicError(ERROR_CODES.VALIDATION_FAILED, '成长工作台只读取前沿跟踪或学习提升项目。', { statusCode: 422, field: 'project_id' })
    }
    const topics = database.prepare('SELECT * FROM radar_topics WHERE space_id = ? AND project_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC, id DESC')
      .all(project.space_id, project.id).map((row) => ({ ...row }))
    const signals = database.prepare(`
      SELECT * FROM radar_signals WHERE space_id = ? AND project_id = ? AND deleted_at IS NULL
      ORDER BY created_at DESC, id DESC
    `).all(project.space_id, project.id).map((row) => {
      const evidence = database.prepare(`
        SELECT d.body_text FROM documents d
        JOIN sources s ON s.id = d.source_id AND s.space_id = d.space_id
        JOIN source_versions v ON v.id = d.source_version_id AND v.space_id = d.space_id
        WHERE d.id = ? AND d.space_id = ? AND d.source_id = ? AND d.source_version_id = ?
          AND d.deleted_at IS NULL AND s.deleted_at IS NULL AND s.status = 'ready' AND v.status = 'ready'
      `).get(row.document_id, row.space_id, row.source_id, row.source_version_id)
      const text = evidence?.body_text?.slice(row.start_char, row.end_char) ?? null
      return { ...row, evidence_integrity: text && sha256(text) === row.text_sha256 ? 'valid' : 'invalid' }
    })
    const tracks = database.prepare('SELECT * FROM learning_tracks WHERE space_id = ? AND project_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC, id DESC')
      .all(project.space_id, project.id).map((row) => ({ ...row }))
    const practices = database.prepare('SELECT * FROM learning_practices WHERE space_id = ? AND project_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC, id DESC')
      .all(project.space_id, project.id).map((row) => ({ ...row }))
    const routines = database.prepare('SELECT * FROM learning_routines WHERE space_id = ? AND project_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC, id DESC')
      .all(project.space_id, project.id).map((row) => ({ ...row }))
    const checkins = database.prepare('SELECT * FROM learning_checkins WHERE space_id = ? AND project_id = ? ORDER BY local_date DESC, id DESC')
      .all(project.space_id, project.id).map((row) => ({ ...row }))
    return { project, radar: { topics, signals }, learning: { tracks, practices, routines, checkins } }
  }

  function createRadarTopic(session, projectId, input, options) {
    const actor = kernel.actorForSession(session)
    const project = growthProject(actor, projectId, 'frontier_tracking', { writable: true })
    return kernel.executeIdempotent({
      actor, commandScope: `radar.topic.create:${projectId}`, key: options.idempotencyKey, request: input, statusCode: 201,
      operation() {
        const timestamp = kernel.nowIso()
        const topic = {
          id: kernel.newId(), space_id: project.space_id, project_id: project.id, ...input,
          status: 'active', follow_up_task_id: null, created_at: timestamp, created_by: actor.id,
          updated_at: timestamp, updated_by: actor.id, version: 1, deleted_at: null, deleted_by: null,
        }
        database.prepare(`INSERT INTO radar_topics (
          id, space_id, project_id, title, domain, synthesis, maturity, limitations, impact_summary,
          disposition, next_review_date, status, follow_up_task_id, created_at, created_by, updated_at,
          updated_by, version, deleted_at, deleted_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', NULL, ?, ?, ?, ?, 1, NULL, NULL)`)
          .run(topic.id, topic.space_id, topic.project_id, topic.title, topic.domain, topic.synthesis, topic.maturity,
            topic.limitations, topic.impact_summary, topic.disposition, topic.next_review_date,
            timestamp, actor.id, timestamp, actor.id)
        kernel.appendAudit({ spaceId: topic.space_id, actor, action: 'radar_topic.create', objectType: 'radar_topic', objectId: topic.id, requestId: options.requestId, changed: ['disposition', 'domain', 'impact_summary', 'limitations', 'maturity', 'next_review_date', 'synthesis', 'title'] })
        kernel.appendOutbox({ spaceId: topic.space_id, aggregate: topic, aggregateType: 'radar_topic', eventType: 'radar_topic.created' })
        return topic
      },
    })
  }

  function addRadarSignal(session, topicId, input, options) {
    const actor = kernel.actorForSession(session)
    const topic = requireOwnedRow(actor, 'radar_topics', topicId, '请求的前沿专题不可用。')
    const project = growthProject(actor, topic.project_id, 'frontier_tracking', { writable: true })
    return kernel.executeIdempotent({
      actor, commandScope: `radar.signal.create:${topicId}`, key: options.idempotencyKey, request: input, statusCode: 201,
      operation() {
        const evidence = exactEvidence(project, input.evidence)
        const timestamp = kernel.nowIso()
        const signal = {
          id: kernel.newId(), space_id: project.space_id, project_id: project.id, topic_id: topic.id,
          summary: input.summary, classification: input.classification, published_on: input.published_on,
          source_id: input.evidence.source_id, source_version_id: input.evidence.source_version_id,
          document_id: input.evidence.document_id, start_char: input.evidence.start_char,
          end_char: input.evidence.end_char, text_sha256: evidence.hash,
          created_at: timestamp, created_by: actor.id, version: 1, deleted_at: null, deleted_by: null,
        }
        database.prepare(`INSERT INTO radar_signals (
          id, space_id, project_id, topic_id, summary, classification, published_on, source_id,
          source_version_id, document_id, start_char, end_char, text_sha256, created_at, created_by,
          version, deleted_at, deleted_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NULL, NULL)`)
          .run(signal.id, signal.space_id, signal.project_id, signal.topic_id, signal.summary, signal.classification,
            signal.published_on, signal.source_id, signal.source_version_id, signal.document_id,
            signal.start_char, signal.end_char, signal.text_sha256, timestamp, actor.id)
        kernel.appendAudit({ spaceId: signal.space_id, actor, action: 'radar_signal.create', objectType: 'radar_signal', objectId: signal.id, requestId: options.requestId, changed: ['classification', 'locator', 'published_on', 'summary', 'topic_id'] })
        kernel.appendOutbox({ spaceId: signal.space_id, aggregate: signal, aggregateType: 'radar_signal', eventType: 'radar_signal.created' })
        return signal
      },
    })
  }

  function reviewRadarTopic(session, topicId, input, options) {
    const actor = kernel.actorForSession(session)
    return kernel.executeIdempotent({
      actor, commandScope: `radar.topic.review:${topicId}`, key: options.idempotencyKey,
      request: { ...input, expected_version: options.expectedVersion },
      operation() {
        const current = requireOwnedRow(actor, 'radar_topics', topicId, '请求的前沿专题不可用。')
        growthProject(actor, current.project_id, 'frontier_tracking', { writable: true })
        assertVersion(current, options.expectedVersion)
        const task = input.follow_up_task_title
          ? kernel.createTaskInTransaction(actor, current.project_id, {
              title: input.follow_up_task_title,
              description: `由前沿专题“${current.title}”的${input.disposition === 'validate' ? '验证' : input.disposition === 'track' ? '跟踪' : '忽略'}决定生成。`,
              priority: 'normal', due_at: null, due_date: input.next_review_date, milestone_id: null, parent_task_id: null,
            }, { requestId: options.requestId, sourceKind: 'manual' })
          : null
        const timestamp = kernel.nowIso()
        const next = { ...current, ...input, follow_up_task_id: task?.id ?? current.follow_up_task_id, updated_at: timestamp, updated_by: actor.id, version: current.version + 1 }
        delete next.follow_up_task_title
        const changed = database.prepare(`UPDATE radar_topics SET maturity = ?, limitations = ?, impact_summary = ?,
          disposition = ?, next_review_date = ?, follow_up_task_id = ?, updated_at = ?, updated_by = ?, version = ?
          WHERE id = ? AND version = ? AND deleted_at IS NULL`)
          .run(next.maturity, next.limitations, next.impact_summary, next.disposition, next.next_review_date,
            next.follow_up_task_id, timestamp, actor.id, next.version, next.id, current.version)
        if (changed.changes !== 1) throw publicError(ERROR_CODES.VERSION_CONFLICT, '对象已被修改，请刷新后比较差异。', { statusCode: 409 })
        kernel.appendAudit({ spaceId: next.space_id, actor, action: 'radar_topic.review', objectType: 'radar_topic', objectId: next.id, requestId: options.requestId, changed: ['disposition', 'follow_up_task_id', 'impact_summary', 'limitations', 'maturity', 'next_review_date'] })
        kernel.appendOutbox({ spaceId: next.space_id, aggregate: next, aggregateType: 'radar_topic', eventType: 'radar_topic.reviewed' })
        return { topic: next, follow_up_task: task }
      },
    })
  }

  function createLearningTrack(session, projectId, input, options) {
    const actor = kernel.actorForSession(session)
    const project = growthProject(actor, projectId, 'learning', { writable: true })
    return kernel.executeIdempotent({
      actor, commandScope: `learning.track.create:${projectId}`, key: options.idempotencyKey, request: input, statusCode: 201,
      operation() {
        const timestamp = kernel.nowIso()
        const track = { id: kernel.newId(), space_id: project.space_id, project_id: project.id, ...input, status: 'active', created_at: timestamp, created_by: actor.id, updated_at: timestamp, updated_by: actor.id, version: 1, deleted_at: null, deleted_by: null }
        database.prepare(`INSERT INTO learning_tracks (
          id, space_id, project_id, title, category, focus, goal, baseline, success_criteria, status,
          created_at, created_by, updated_at, updated_by, version, deleted_at, deleted_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, 1, NULL, NULL)`)
          .run(track.id, track.space_id, track.project_id, track.title, track.category, track.focus, track.goal,
            track.baseline, track.success_criteria, timestamp, actor.id, timestamp, actor.id)
        kernel.appendAudit({ spaceId: track.space_id, actor, action: 'learning_track.create', objectType: 'learning_track', objectId: track.id, requestId: options.requestId, changed: ['baseline', 'category', 'focus', 'goal', 'success_criteria', 'title'] })
        kernel.appendOutbox({ spaceId: track.space_id, aggregate: track, aggregateType: 'learning_track', eventType: 'learning_track.created' })
        return track
      },
    })
  }

  function createLearningPractice(session, trackId, input, options) {
    const actor = kernel.actorForSession(session)
    const track = requireOwnedRow(actor, 'learning_tracks', trackId, '请求的学习方向不可用。')
    const project = growthProject(actor, track.project_id, 'learning', { writable: true })
    if (track.status !== 'active') throw publicError(ERROR_CODES.INVALID_STATE_TRANSITION, '非进行中的学习方向不能新增练习。', { statusCode: 409 })
    return kernel.executeIdempotent({
      actor, commandScope: `learning.practice.create:${trackId}`, key: options.idempotencyKey, request: input, statusCode: 201,
      operation() {
        const timestamp = kernel.nowIso()
        const practice = { id: kernel.newId(), space_id: project.space_id, project_id: project.id, track_id: track.id, ...input, reflection: '', feedback: '', self_rating: null, decision: 'pending', status: 'planned', follow_up_task_id: null, created_at: timestamp, created_by: actor.id, updated_at: timestamp, updated_by: actor.id, version: 1, deleted_at: null, deleted_by: null }
        database.prepare(`INSERT INTO learning_practices (
          id, space_id, project_id, track_id, title, practice_type, planned_for, instructions, reflection,
          feedback, self_rating, decision, status, follow_up_task_id, created_at, created_by, updated_at,
          updated_by, version, deleted_at, deleted_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', '', NULL, 'pending', 'planned', NULL, ?, ?, ?, ?, 1, NULL, NULL)`)
          .run(practice.id, practice.space_id, practice.project_id, practice.track_id, practice.title,
            practice.practice_type, practice.planned_for, practice.instructions, timestamp, actor.id, timestamp, actor.id)
        kernel.appendAudit({ spaceId: practice.space_id, actor, action: 'learning_practice.create', objectType: 'learning_practice', objectId: practice.id, requestId: options.requestId, changed: ['instructions', 'planned_for', 'practice_type', 'title', 'track_id'] })
        kernel.appendOutbox({ spaceId: practice.space_id, aggregate: practice, aggregateType: 'learning_practice', eventType: 'learning_practice.created' })
        return practice
      },
    })
  }

  function recordLearningPractice(session, practiceId, input, options) {
    const actor = kernel.actorForSession(session)
    return kernel.executeIdempotent({
      actor, commandScope: `learning.practice.result:${practiceId}`, key: options.idempotencyKey,
      request: { ...input, expected_version: options.expectedVersion },
      operation() {
        const current = requireOwnedRow(actor, 'learning_practices', practiceId, '请求的学习练习不可用。')
        growthProject(actor, current.project_id, 'learning', { writable: true })
        assertVersion(current, options.expectedVersion)
        if (current.status !== 'planned') throw publicError(ERROR_CODES.INVALID_STATE_TRANSITION, '该练习已经完成复盘。', { statusCode: 409 })
        const task = input.follow_up_task_title
          ? kernel.createTaskInTransaction(actor, current.project_id, {
              title: input.follow_up_task_title, description: `由学习练习“${current.title}”的 ${input.decision} 复盘生成。`,
              priority: 'normal', due_at: null, due_date: null, milestone_id: null, parent_task_id: null,
            }, { requestId: options.requestId, sourceKind: 'manual' })
          : null
        const timestamp = kernel.nowIso()
        const next = { ...current, reflection: input.reflection, feedback: input.feedback, self_rating: input.self_rating, decision: input.decision, status: 'completed', follow_up_task_id: task?.id ?? null, updated_at: timestamp, updated_by: actor.id, version: current.version + 1 }
        const changed = database.prepare(`UPDATE learning_practices SET reflection = ?, feedback = ?, self_rating = ?,
          decision = ?, status = 'completed', follow_up_task_id = ?, updated_at = ?, updated_by = ?, version = ?
          WHERE id = ? AND version = ? AND deleted_at IS NULL`)
          .run(next.reflection, next.feedback, next.self_rating, next.decision, next.follow_up_task_id,
            timestamp, actor.id, next.version, next.id, current.version)
        if (changed.changes !== 1) throw publicError(ERROR_CODES.VERSION_CONFLICT, '对象已被修改，请刷新后比较差异。', { statusCode: 409 })
        kernel.appendAudit({ spaceId: next.space_id, actor, action: 'learning_practice.record_result', objectType: 'learning_practice', objectId: next.id, requestId: options.requestId, changed: ['decision', 'feedback', 'follow_up_task_id', 'reflection', 'self_rating', 'status'] })
        kernel.appendOutbox({ spaceId: next.space_id, aggregate: next, aggregateType: 'learning_practice', eventType: 'learning_practice.completed' })
        return { practice: next, follow_up_task: task }
      },
    })
  }

  function createLearningRoutine(session, trackId, input, options) {
    const actor = kernel.actorForSession(session)
    const track = requireOwnedRow(actor, 'learning_tracks', trackId, '请求的学习方向不可用。')
    const project = growthProject(actor, track.project_id, 'learning', { writable: true })
    return kernel.executeIdempotent({
      actor, commandScope: `learning.routine.create:${trackId}`, key: options.idempotencyKey, request: input, statusCode: 201,
      operation() {
        const timestamp = kernel.nowIso()
        const routine = { id: kernel.newId(), space_id: project.space_id, project_id: project.id, track_id: track.id, ...input, status: 'active', created_at: timestamp, created_by: actor.id, updated_at: timestamp, updated_by: actor.id, version: 1, deleted_at: null, deleted_by: null }
        database.prepare(`INSERT INTO learning_routines (
          id, space_id, project_id, track_id, title, cadence, target_count, status, created_at, created_by,
          updated_at, updated_by, version, deleted_at, deleted_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, 1, NULL, NULL)`)
          .run(routine.id, routine.space_id, routine.project_id, routine.track_id, routine.title,
            routine.cadence, routine.target_count, timestamp, actor.id, timestamp, actor.id)
        kernel.appendAudit({ spaceId: routine.space_id, actor, action: 'learning_routine.create', objectType: 'learning_routine', objectId: routine.id, requestId: options.requestId, changed: ['cadence', 'target_count', 'title', 'track_id'] })
        kernel.appendOutbox({ spaceId: routine.space_id, aggregate: routine, aggregateType: 'learning_routine', eventType: 'learning_routine.created' })
        return routine
      },
    })
  }

  function createLearningCheckin(session, routineId, input, options) {
    const actor = kernel.actorForSession(session)
    const routine = requireOwnedRow(actor, 'learning_routines', routineId, '请求的学习习惯不可用。')
    growthProject(actor, routine.project_id, 'learning', { writable: true })
    if (routine.status !== 'active') throw publicError(ERROR_CODES.INVALID_STATE_TRANSITION, '非进行中的习惯不能打卡。', { statusCode: 409 })
    return kernel.executeIdempotent({
      actor, commandScope: `learning.checkin.create:${routineId}`, key: options.idempotencyKey, request: input, statusCode: 201,
      operation() {
        const duplicate = database.prepare('SELECT id FROM learning_checkins WHERE routine_id = ? AND local_date = ?').get(routine.id, input.local_date)
        if (duplicate) throw publicError(ERROR_CODES.RELATION_CONFLICT, '该日期已经记录过，未重复写入。', { statusCode: 409, field: 'local_date' })
        const timestamp = kernel.nowIso()
        const checkin = { id: kernel.newId(), space_id: routine.space_id, project_id: routine.project_id, routine_id: routine.id, ...input, created_at: timestamp, created_by: actor.id, version: 1 }
        database.prepare(`INSERT INTO learning_checkins (
          id, space_id, project_id, routine_id, local_date, completed_count, note, created_at, created_by, version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`)
          .run(checkin.id, checkin.space_id, checkin.project_id, checkin.routine_id, checkin.local_date,
            checkin.completed_count, checkin.note, timestamp, actor.id)
        kernel.appendAudit({ spaceId: checkin.space_id, actor, action: 'learning_checkin.create', objectType: 'learning_checkin', objectId: checkin.id, requestId: options.requestId, changed: ['completed_count', 'local_date', 'note', 'routine_id'] })
        kernel.appendOutbox({ spaceId: checkin.space_id, aggregate: checkin, aggregateType: 'learning_checkin', eventType: 'learning_checkin.created' })
        return checkin
      },
    })
  }

  return Object.freeze({
    addRadarSignal,
    createLearningCheckin,
    createLearningPractice,
    createLearningRoutine,
    createLearningTrack,
    createRadarTopic,
    getWorkspace,
    recordLearningPractice,
    reviewRadarTopic,
  })
}
