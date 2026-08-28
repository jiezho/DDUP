import { createHash } from 'node:crypto'

import { ERROR_CODES, publicError } from '../../shared/contracts/errors.mjs'
import { TERMINAL_RUN_STATUSES } from '../../shared/contracts/runtime.mjs'

const RUN_COLUMNS = `
  id, space_id, context_package_id, context_package_version, context_digest,
  runtime_key, runtime_version, profile_key, profile_version, goal, status,
  max_steps, max_tool_calls, created_at, created_by, started_at, ended_at,
  updated_at, updated_by, version, error_code
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

function runFromRow(row) {
  return row ? { ...row, terminal: TERMINAL_RUN_STATUSES.includes(row.status) } : null
}

export function createRunStore({ database, kernel, contextPackageStore, runtimeRegistry } = {}) {
  if (!database || !kernel || !contextPackageStore || !runtimeRegistry) throw new TypeError('run store dependencies are required')

  function requireRun(actor, runId, spaceId) {
    kernel.visibleSpace(actor, spaceId)
    const row = database.prepare(`SELECT ${RUN_COLUMNS} FROM agent_runs WHERE id = ? AND space_id = ?`).get(runId, spaceId)
    if (!row) throw publicError(ERROR_CODES.OBJECT_NOT_AVAILABLE, '请求的资源不可用。', { statusCode: 404 })
    return runFromRow(row)
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
    return rows.map(runFromRow)
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
      operation: () => {
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
        }
        database.prepare(`INSERT INTO agent_runs (${RUN_COLUMNS}) VALUES (${Array(21).fill('?').join(', ')})`)
          .run(...RUN_COLUMNS.split(',').map((column) => run[column.trim()]))
        appendEvent(run, 'run.queued', { runtime_key: run.runtime_key, profile_key: run.profile_key, context_digest: contextDigest })
        kernel.appendAudit({ spaceId: run.space_id, actor, action: 'agent_run.start', objectType: 'agent_run', objectId: run.id, requestId, changed: ['context_package_id', 'goal', 'profile_key', 'runtime_key'] })
        kernel.appendOutbox({ spaceId: run.space_id, aggregate: run, aggregateType: 'agent_run', eventType: 'agent_run.created' })

        const startedAt = kernel.nowIso()
        database.prepare("UPDATE agent_runs SET status = 'running', started_at = ?, updated_at = ?, updated_by = ?, version = version + 1 WHERE id = ?")
          .run(startedAt, startedAt, actor.id, run.id)
        run.status = 'running'; run.started_at = startedAt; run.updated_at = startedAt; run.version += 1
        appendEvent(run, 'run.started', { started_at: startedAt, runtime_version: run.runtime_version })
        try {
          const result = adapter.start({
            workbench_run_id: run.id,
            goal: run.goal,
            context: {
              digest: contextDigest,
              included_count: contextManifest.included.length,
              excluded_count: contextManifest.excluded_count,
            },
          })
          for (const event of result.events ?? []) appendEvent(run, event.type, event.payload)
          if (result.outcome === 'running') return requireRun(actor, run.id, run.space_id)
          const endedAt = kernel.nowIso()
          database.prepare("UPDATE agent_runs SET status = 'succeeded', ended_at = ?, updated_at = ?, updated_by = ?, version = version + 1 WHERE id = ?")
            .run(endedAt, endedAt, actor.id, run.id)
          run.status = 'succeeded'; run.ended_at = endedAt; run.updated_at = endedAt; run.version += 1
          appendEvent(run, 'run.succeeded', { artifact_ids: [], candidate_ids: [], generated_answer: false })
          kernel.appendOutbox({ spaceId: run.space_id, aggregate: run, aggregateType: 'agent_run', eventType: 'agent_run.succeeded' })
        } catch (error) {
          const endedAt = kernel.nowIso()
          const errorCode = [ERROR_CODES.RUNTIME_PROTOCOL_ERROR, ERROR_CODES.RUNTIME_UNAVAILABLE].includes(error?.code)
            ? error.code
            : ERROR_CODES.RUNTIME_PROTOCOL_ERROR
          database.prepare("UPDATE agent_runs SET status = 'failed', ended_at = ?, updated_at = ?, updated_by = ?, version = version + 1, error_code = ? WHERE id = ?")
            .run(endedAt, endedAt, actor.id, errorCode, run.id)
          run.status = 'failed'; run.ended_at = endedAt; run.updated_at = endedAt; run.version += 1; run.error_code = errorCode
          appendEvent(run, 'run.failed', { error_code: errorCode, retryable: Boolean(error?.retryable) })
          kernel.appendOutbox({ spaceId: run.space_id, aggregate: run, aggregateType: 'agent_run', eventType: 'agent_run.failed' })
        }
        return requireRun(actor, run.id, run.space_id)
      },
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
        appendEvent(run, 'run.cancelled', { cancelled_by: actor.kind, reason_code: input.reason })
        kernel.appendAudit({ spaceId: run.space_id, actor, action: 'agent_run.cancel', objectType: 'agent_run', objectId: run.id, requestId, changed: ['status', 'version'] })
        kernel.appendOutbox({ spaceId: run.space_id, aggregate: run, aggregateType: 'agent_run', eventType: 'agent_run.cancelled' })
        return requireRun(actor, run.id, run.space_id)
      },
    })
  }

  return Object.freeze({ cancelRun, createRun, getRun, listEvents, listRuns })
}
