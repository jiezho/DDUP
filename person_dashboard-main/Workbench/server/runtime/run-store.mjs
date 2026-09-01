import { createHash } from 'node:crypto'

import { ERROR_CODES, publicError } from '../../shared/contracts/errors.mjs'
import { TERMINAL_RUN_STATUSES } from '../../shared/contracts/runtime.mjs'

const RUN_COLUMNS = `
  id, space_id, context_package_id, context_package_version, context_digest,
  runtime_key, runtime_version, profile_key, profile_version, goal, status,
  max_steps, max_tool_calls, created_at, created_by, started_at, ended_at,
  updated_at, updated_by, version, error_code, retry_of_run_id
`

const RETRYABLE_RUN_ERRORS = new Set([
  ERROR_CODES.RUNTIME_PROTOCOL_ERROR,
  ERROR_CODES.RUNTIME_UNAVAILABLE,
  ERROR_CODES.RUNTIME_RECOVERY_REQUIRED,
])

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

function runFromRow(row) {
  return row ? { ...row, terminal: TERMINAL_RUN_STATUSES.includes(row.status) } : null
}

function checkpointFromRow(row) {
  return row ? {
    id: row.id,
    run_id: row.run_id,
    event_seq: row.event_seq,
    checkpoint_version: row.checkpoint_version,
    run_version: row.run_version,
    run_status: row.run_status,
    context_digest: row.context_digest,
    completed_tool_call_ids: JSON.parse(row.completed_tool_call_ids_json),
    candidate_ids: JSON.parse(row.candidate_ids_json),
    runtime_state_ref: row.runtime_state_ref,
    created_at: row.created_at,
  } : null
}

export function createRunStore({ database, kernel, contextPackageStore, runtimeRegistry, toolGateway } = {}) {
  if (!database || !kernel || !contextPackageStore || !runtimeRegistry || !toolGateway) throw new TypeError('run store dependencies are required')

  function runWithRetryability(row) {
    const run = runFromRow(row)
    if (!run) return null
    if (run.status !== 'failed' || run.max_tool_calls !== 0 || !RETRYABLE_RUN_ERRORS.has(run.error_code)) {
      return { ...run, retryable: false }
    }
    const latestFailure = database.prepare(`
      SELECT payload_json FROM run_events
      WHERE run_id = ? AND event_type = 'run.failed'
      ORDER BY seq DESC LIMIT 1
    `).get(run.id)
    const payload = latestFailure ? JSON.parse(latestFailure.payload_json) : {}
    return { ...run, retryable: payload.retryable === true }
  }

  function requireRun(actor, runId, spaceId) {
    kernel.visibleSpace(actor, spaceId)
    const row = database.prepare(`SELECT ${RUN_COLUMNS} FROM agent_runs WHERE id = ? AND space_id = ?`).get(runId, spaceId)
    if (!row) throw publicError(ERROR_CODES.OBJECT_NOT_AVAILABLE, '请求的资源不可用。', { statusCode: 404 })
    return runWithRetryability(row)
  }

  function appendEvent(run, type, payload = {}) {
    const seq = database.prepare('SELECT COALESCE(max(seq), 0) + 1 AS seq FROM run_events WHERE run_id = ?').get(run.id).seq
    const event = {
      id: kernel.newId(), run_id: run.id, space_id: run.space_id, seq,
      event_version: 1, event_type: type, occurred_at: kernel.nowIso(), payload,
    }
    database.prepare(`
      INSERT INTO run_events (id, run_id, space_id, seq, event_version, event_type, occurred_at, payload_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(event.id, event.run_id, event.space_id, event.seq, event.event_version, event.event_type, event.occurred_at, stableJson(event.payload))
    return event
  }

  function appendCheckpoint(run, actor, eventSeq, { completedToolCallIds = [], candidateIds = [], runtimeStateRef = null } = {}) {
    const checkpoint = {
      id: kernel.newId(),
      run_id: run.id,
      space_id: run.space_id,
      event_seq: eventSeq,
      checkpoint_version: 1,
      run_version: run.version,
      run_status: run.status,
      context_digest: run.context_digest,
      completed_tool_call_ids_json: stableJson(completedToolCallIds),
      candidate_ids_json: stableJson(candidateIds),
      runtime_state_ref: runtimeStateRef,
      created_at: kernel.nowIso(),
      created_by: actor.id,
    }
    database.prepare(`
      INSERT INTO run_checkpoints (
        id, run_id, space_id, event_seq, checkpoint_version, run_version, run_status,
        context_digest, completed_tool_call_ids_json, candidate_ids_json,
        runtime_state_ref, created_at, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(...Object.values(checkpoint))
    appendEvent(run, 'checkpoint.created', {
      checkpoint_id: checkpoint.id,
      context_digest: checkpoint.context_digest,
      event_seq: checkpoint.event_seq,
      run_status: checkpoint.run_status,
    })
    return checkpointFromRow(checkpoint)
  }

  function getRun(session, runId, spaceId) {
    return requireRun(kernel.actorForSession(session), runId, spaceId)
  }

  function listRuns(session, { space_id: spaceId, status, limit }) {
    const actor = kernel.actorForSession(session)
    kernel.visibleSpace(actor, spaceId)
    const rows = database.prepare(`
      SELECT ${RUN_COLUMNS} FROM agent_runs
      WHERE space_id = ? AND (? IS NULL OR status = ?)
      ORDER BY updated_at DESC, id DESC LIMIT ?
    `).all(spaceId, status ?? null, status ?? null, limit)
    return rows.map(runWithRetryability)
  }

  function listEvents(session, runId, { space_id: spaceId, after_seq: afterSeq, limit }) {
    const actor = kernel.actorForSession(session)
    requireRun(actor, runId, spaceId)
    return database.prepare(`
      SELECT id, run_id, seq, event_version, event_type, occurred_at, payload_json
      FROM run_events WHERE run_id = ? AND space_id = ? AND seq > ?
      ORDER BY seq LIMIT ?
    `).all(runId, spaceId, afterSeq, limit).map((row) => ({
      id: row.id,
      run_id: row.run_id,
      seq: row.seq,
      event_version: row.event_version,
      type: row.event_type,
      occurred_at: row.occurred_at,
      payload: JSON.parse(row.payload_json),
    }))
  }

  function listCheckpoints(session, runId, { space_id: spaceId, after_seq: afterSeq, limit }) {
    const actor = kernel.actorForSession(session)
    requireRun(actor, runId, spaceId)
    return database.prepare(`
      SELECT id, run_id, event_seq, checkpoint_version, run_version, run_status,
             context_digest, completed_tool_call_ids_json, candidate_ids_json,
             runtime_state_ref, created_at
      FROM run_checkpoints
      WHERE run_id = ? AND space_id = ? AND event_seq > ?
      ORDER BY event_seq, id LIMIT ?
    `).all(runId, spaceId, afterSeq, limit).map(checkpointFromRow)
  }

  function executeRunLifecycle(session, input, { actor, adapter, descriptor, requestId, retryOfRunId = null }) {
    const contextPackage = contextPackageStore.getPackage(session, input.context_package_id, input.space_id)
    if (contextPackage.effective_status !== 'active') {
      throw publicError(ERROR_CODES.INVALID_STATE_TRANSITION, '只能使用当前有效的上下文篮创建运行。', { statusCode: 409 })
    }
    if (contextPackage.version !== input.context_package_version) {
      throw publicError(ERROR_CODES.VERSION_CONFLICT, '上下文篮已更新，请重新确认范围。', { statusCode: 409 })
    }
    const contextManifest = {
      package_id: contextPackage.id,
      package_version: contextPackage.version,
      space_id: contextPackage.space_id,
      purpose: contextPackage.purpose,
      included: contextPackage.items.filter((item) => item.included).map((item) => ({
        object_type: item.object_type,
        object_id: item.object_id,
        source_version_id: item.source_version_id,
        start_char: item.start_char,
        end_char: item.end_char,
      })),
      excluded_count: contextPackage.resolution.excluded_count,
    }
    const contextDigest = digest(contextManifest)
    const timestamp = kernel.nowIso()
    const run = {
      id: kernel.newId(), space_id: input.space_id, context_package_id: contextPackage.id,
      context_package_version: contextPackage.version, context_digest: contextDigest,
      runtime_key: descriptor.runtime_key, runtime_version: descriptor.runtime_version,
      profile_key: input.profile_key, profile_version: input.profile_version, goal: input.goal,
      status: 'queued', max_steps: input.budget.max_steps, max_tool_calls: input.budget.max_tool_calls,
      created_at: timestamp, created_by: actor.id, started_at: null, ended_at: null,
      updated_at: timestamp, updated_by: actor.id, version: 1, error_code: null,
      retry_of_run_id: retryOfRunId,
    }
    const columns = RUN_COLUMNS.split(',').map((column) => column.trim())
    database.prepare(`INSERT INTO agent_runs (${RUN_COLUMNS}) VALUES (${columns.map(() => '?').join(', ')})`)
      .run(...columns.map((column) => run[column]))
    appendEvent(run, 'run.queued', {
      runtime_key: run.runtime_key,
      profile_key: run.profile_key,
      context_digest: contextDigest,
      ...(retryOfRunId ? { retry_of_run_id: retryOfRunId } : {}),
    })
    kernel.appendAudit({
      spaceId: run.space_id,
      actor,
      action: retryOfRunId ? 'agent_run.retry' : 'agent_run.start',
      objectType: 'agent_run',
      objectId: run.id,
      requestId,
      changed: retryOfRunId
        ? ['context_package_id', 'goal', 'profile_key', 'retry_of_run_id', 'runtime_key']
        : ['context_package_id', 'goal', 'profile_key', 'runtime_key'],
    })
    kernel.appendOutbox({ spaceId: run.space_id, aggregate: run, aggregateType: 'agent_run', eventType: 'agent_run.created' })

    const startedAt = kernel.nowIso()
    database.prepare("UPDATE agent_runs SET status = 'running', started_at = ?, updated_at = ?, updated_by = ?, version = version + 1 WHERE id = ?")
      .run(startedAt, startedAt, actor.id, run.id)
    run.status = 'running'; run.started_at = startedAt; run.updated_at = startedAt; run.version += 1
    const startedEvent = appendEvent(run, 'run.started', { started_at: startedAt, runtime_version: run.runtime_version })
    appendCheckpoint(run, actor, startedEvent.seq)
    try {
      const result = adapter.start({
        workbench_run_id: run.id,
        goal: run.goal,
        task_candidate: input.task_candidate,
        context: {
          digest: contextDigest,
          included_count: contextManifest.included.length,
          excluded_count: contextManifest.excluded_count,
        },
      })
      for (const event of result.events ?? []) appendEvent(run, event.type, event.payload)
      const toolCalls = result.tool_calls ?? []
      if (toolCalls.length > run.max_tool_calls) {
        throw publicError(ERROR_CODES.BUDGET_EXCEEDED, 'Runtime 返回的 ToolCall 超过本次预算。', { statusCode: 409 })
      }
      const candidateIds = []
      const completedToolCallIds = []
      for (const call of toolCalls) {
        appendEvent(run, 'tool.requested', {
          runtime_tool_call_id: call.runtime_tool_call_id,
          tool_key: call.tool_key,
          tool_version: call.tool_version,
          action_level: 'L1',
        })
        const toolResult = toolGateway.executeCandidateTaskCall(session, run, call, { requestId })
        candidateIds.push(toolResult.candidate.id)
        completedToolCallIds.push(call.runtime_tool_call_id)
        appendEvent(run, 'candidate.created', { candidate_id: toolResult.candidate.id, candidate_type: 'task' })
        const toolEvent = appendEvent(run, 'tool.completed', {
          runtime_tool_call_id: call.runtime_tool_call_id,
          tool_key: call.tool_key,
          candidate_id: toolResult.candidate.id,
          replayed: toolResult.replayed,
        })
        appendCheckpoint(run, actor, toolEvent.seq, { completedToolCallIds, candidateIds })
      }
      if (result.outcome === 'running') return requireRun(actor, run.id, run.space_id)
      const endedAt = kernel.nowIso()
      database.prepare("UPDATE agent_runs SET status = 'succeeded', ended_at = ?, updated_at = ?, updated_by = ?, version = version + 1 WHERE id = ?")
        .run(endedAt, endedAt, actor.id, run.id)
      run.status = 'succeeded'; run.ended_at = endedAt; run.updated_at = endedAt; run.version += 1
      const succeededEvent = appendEvent(run, 'run.succeeded', { artifact_ids: [], candidate_ids: candidateIds, generated_answer: false })
      appendCheckpoint(run, actor, succeededEvent.seq, { completedToolCallIds, candidateIds })
      kernel.appendOutbox({ spaceId: run.space_id, aggregate: run, aggregateType: 'agent_run', eventType: 'agent_run.succeeded' })
    } catch (error) {
      const endedAt = kernel.nowIso()
      const errorCode = [
        ERROR_CODES.RUNTIME_PROTOCOL_ERROR,
        ERROR_CODES.RUNTIME_UNAVAILABLE,
        ERROR_CODES.BUDGET_EXCEEDED,
        ERROR_CODES.TOOL_NOT_REGISTERED,
        ERROR_CODES.TOOL_SCHEMA_INVALID,
        ERROR_CODES.TOOL_CALL_CONFLICT,
        ERROR_CODES.TOOL_NOT_ALLOWED,
      ].includes(error?.code)
        ? error.code
        : ERROR_CODES.RUNTIME_PROTOCOL_ERROR
      database.prepare("UPDATE agent_runs SET status = 'failed', ended_at = ?, updated_at = ?, updated_by = ?, version = version + 1, error_code = ? WHERE id = ?")
        .run(endedAt, endedAt, actor.id, errorCode, run.id)
      run.status = 'failed'; run.ended_at = endedAt; run.updated_at = endedAt; run.version += 1; run.error_code = errorCode
      const retryable = run.max_tool_calls === 0 && Boolean(error?.retryable) && RETRYABLE_RUN_ERRORS.has(errorCode)
      const failedEvent = appendEvent(run, 'run.failed', { error_code: errorCode, retryable })
      appendCheckpoint(run, actor, failedEvent.seq)
      kernel.appendOutbox({ spaceId: run.space_id, aggregate: run, aggregateType: 'agent_run', eventType: 'agent_run.failed' })
    }
    return requireRun(actor, run.id, run.space_id)
  }

  function createRun(session, input, { idempotencyKey, requestId } = {}) {
    const actor = kernel.actorForSession(session)
    const space = kernel.visibleSpace(actor, input.space_id)
    if (space.default_ai_policy === 'deny_ai') {
      throw publicError(ERROR_CODES.ACTION_NOT_ALLOWED, '当前空间策略禁止 AI Runtime。', { statusCode: 403 })
    }
    const adapter = runtimeRegistry.requireAvailable(input.runtime_key)
    const descriptor = adapter.descriptor()
    return kernel.executeIdempotent({
      actor,
      commandScope: 'agent_run.start',
      key: idempotencyKey,
      request: input,
      statusCode: 202,
      operation: () => executeRunLifecycle(session, input, { actor, adapter, descriptor, requestId }),
    })
  }

  function cancelRun(session, runId, input, { expectedVersion, idempotencyKey, requestId } = {}) {
    const actor = kernel.actorForSession(session)
    kernel.visibleSpace(actor, input.space_id)
    return kernel.executeIdempotent({
      actor,
      commandScope: `agent_run.cancel:${runId}`,
      key: idempotencyKey,
      request: { runId, expectedVersion, ...input },
      operation: () => {
        const run = requireRun(actor, runId, input.space_id)
        if (run.version !== expectedVersion) {
          throw publicError(ERROR_CODES.VERSION_CONFLICT, '运行已更新，请刷新后重试。', { statusCode: 409 })
        }
        if (run.terminal) return run
        runtimeRegistry.requireAvailable(run.runtime_key).cancel({ workbench_run_id: run.id })
        const timestamp = kernel.nowIso()
        database.prepare("UPDATE agent_runs SET status = 'cancelled', ended_at = ?, updated_at = ?, updated_by = ?, version = version + 1 WHERE id = ?")
          .run(timestamp, timestamp, actor.id, run.id)
        run.status = 'cancelled'; run.ended_at = timestamp; run.updated_at = timestamp; run.version += 1
        const cancelledEvent = appendEvent(run, 'run.cancelled', { cancelled_by: actor.kind, reason_code: input.reason })
        appendCheckpoint(run, actor, cancelledEvent.seq)
        kernel.appendAudit({ spaceId: run.space_id, actor, action: 'agent_run.cancel', objectType: 'agent_run', objectId: run.id, requestId, changed: ['status', 'version'] })
        kernel.appendOutbox({ spaceId: run.space_id, aggregate: run, aggregateType: 'agent_run', eventType: 'agent_run.cancelled' })
        return requireRun(actor, run.id, run.space_id)
      },
    })
  }

  function retryRun(session, runId, input, { expectedVersion, idempotencyKey, requestId } = {}) {
    const actor = kernel.actorForSession(session)
    const space = kernel.visibleSpace(actor, input.space_id)
    if (space.default_ai_policy === 'deny_ai') {
      throw publicError(ERROR_CODES.ACTION_NOT_ALLOWED, '当前空间策略禁止 AI Runtime。', { statusCode: 403 })
    }
    const source = requireRun(actor, runId, input.space_id)
    if (source.version !== expectedVersion) {
      throw publicError(ERROR_CODES.VERSION_CONFLICT, '运行已更新，请刷新后重试。', { statusCode: 409 })
    }
    if (source.status !== 'failed' || source.retryable !== true) {
      throw publicError(ERROR_CODES.RUN_RETRY_NOT_SAFE, '该运行不能在不补充输入的情况下安全重试。', { statusCode: 409 })
    }
    const adapter = runtimeRegistry.requireAvailable(source.runtime_key)
    const descriptor = adapter.descriptor()
    const retryInput = {
      space_id: source.space_id,
      context_package_id: source.context_package_id,
      context_package_version: source.context_package_version,
      runtime_key: source.runtime_key,
      profile_key: source.profile_key,
      profile_version: source.profile_version,
      goal: source.goal,
      budget: { max_steps: source.max_steps, max_tool_calls: 0 },
    }
    return kernel.executeIdempotent({
      actor,
      commandScope: `agent_run.retry:${source.id}`,
      key: idempotencyKey,
      request: { run_id: source.id, expected_version: expectedVersion, ...input },
      statusCode: 202,
      operation: () => executeRunLifecycle(session, retryInput, {
        actor,
        adapter,
        descriptor,
        requestId,
        retryOfRunId: source.id,
      }),
    })
  }

  function ensureRecoveryActor() {
    const existing = database.prepare(`
      SELECT id, kind FROM principals
      WHERE kind = 'system_job' AND display_name = 'DDUP Runtime Recovery' AND status = 'active'
      ORDER BY created_at, id LIMIT 1
    `).get()
    if (existing) return existing
    const actor = { id: kernel.newId(), kind: 'system_job' }
    database.prepare(`
      INSERT INTO principals (id, kind, display_name, status, created_at)
      VALUES (?, 'system_job', 'DDUP Runtime Recovery', 'active', ?)
    `).run(actor.id, kernel.nowIso())
    return actor
  }

  function recoverInterruptedRuns() {
    const interrupted = database.prepare(`
      SELECT ${RUN_COLUMNS} FROM agent_runs
      WHERE status IN ('queued', 'running')
      ORDER BY created_at, id
    `).all()
    if (!interrupted.length) return 0
    const actor = ensureRecoveryActor()
    let recovered = 0
    for (const sourceRow of interrupted) {
      database.exec('BEGIN IMMEDIATE')
      try {
        const timestamp = kernel.nowIso()
        const changed = database.prepare(`
          UPDATE agent_runs
          SET status = 'failed', ended_at = ?, updated_at = ?, updated_by = ?,
              version = version + 1, error_code = ?
          WHERE id = ? AND space_id = ? AND status IN ('queued', 'running')
        `).run(timestamp, timestamp, actor.id, ERROR_CODES.RUNTIME_RECOVERY_REQUIRED, sourceRow.id, sourceRow.space_id)
        if (changed.changes === 1) {
          const run = runFromRow(database.prepare(`SELECT ${RUN_COLUMNS} FROM agent_runs WHERE id = ?`).get(sourceRow.id))
          const failedEvent = appendEvent(run, 'run.failed', {
            error_code: ERROR_CODES.RUNTIME_RECOVERY_REQUIRED,
            retryable: run.max_tool_calls === 0,
            recovered_after_restart: true,
          })
          appendCheckpoint(run, actor, failedEvent.seq)
          kernel.appendAudit({
            spaceId: run.space_id,
            actor,
            action: 'agent_run.recover_as_failed',
            objectType: 'agent_run',
            objectId: run.id,
            requestId: null,
            reasonCode: ERROR_CODES.RUNTIME_RECOVERY_REQUIRED,
            changed: ['error_code', 'status', 'version'],
          })
          kernel.appendOutbox({ spaceId: run.space_id, aggregate: run, aggregateType: 'agent_run', eventType: 'agent_run.failed' })
          recovered += 1
        }
        database.exec('COMMIT')
      } catch (error) {
        try { database.exec('ROLLBACK') } catch {}
        throw error
      }
    }
    return recovered
  }

  recoverInterruptedRuns()

  return Object.freeze({ cancelRun, createRun, getRun, listCheckpoints, listEvents, listRuns, retryRun })
}
