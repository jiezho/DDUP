import { createHash, createHmac, randomBytes } from 'node:crypto'

import { ERROR_CODES, publicError } from '../../shared/contracts/errors.mjs'
import { createUuidV7 } from '../../shared/contracts/ids.mjs'
import { validateProjectDates } from './project-contracts.mjs'

const PROJECT_COLUMNS = `
  id, space_id, name, summary, template_type, status, start_date, target_date,
  context_policy, color_token, created_at, created_by, updated_at, updated_by,
  version, deleted_at, deleted_by
`

const MILESTONE_COLUMNS = `
  id, space_id, project_id, title, status, target_date, sort_order,
  created_at, created_by, updated_at, updated_by, version, deleted_at, deleted_by
`

const TASK_COLUMNS = `
  id, space_id, project_id, milestone_id, parent_task_id, title, description,
  status, priority, due_at, due_date, source_kind, completed_at,
  created_at, created_by, updated_at, updated_by, version, deleted_at, deleted_by
`

const DISCUSSION_COLUMNS = `
  id, space_id, project_id, title, status, created_at, created_by,
  updated_at, updated_by, version, deleted_at, deleted_by
`

const DISCUSSION_ENTRY_COLUMNS = `
  id, space_id, project_id, discussion_id, author_kind, body, run_id,
  created_at, created_by, deleted_at, deleted_by
`

const DECISION_COLUMNS = `
  id, space_id, project_id, discussion_id, title, statement, rationale, status,
  supersedes_id, decided_at, created_at, created_by, updated_at, updated_by,
  version, deleted_at, deleted_by
`

const CAPTURE_COLUMNS = `
  id, space_id, project_id, kind, title, body, canonical_uri, status, captured_at,
  created_by, updated_at, updated_by, version, deleted_at, deleted_by
`

const TRANSITIONS = Object.freeze({
  activate: new Map([
    ['draft', 'active'],
    ['paused', 'active'],
  ]),
  pause: new Map([['active', 'paused']]),
  complete: new Map([
    ['active', 'completed'],
    ['paused', 'completed'],
  ]),
  archive: new Map([
    ['paused', 'archived'],
    ['completed', 'archived'],
  ]),
  reopen: new Map([
    ['completed', 'active'],
    ['archived', 'active'],
  ]),
})

const TASK_STATE_TRANSITIONS = Object.freeze({
  plan: new Map([['inbox', 'planned']]),
  start: new Map([
    ['inbox', 'in_progress'],
    ['planned', 'in_progress'],
    ['blocked', 'in_progress'],
  ]),
  block: new Map([['in_progress', 'blocked']]),
  complete: new Map([['in_progress', 'done']]),
  cancel: new Map([
    ['inbox', 'cancelled'],
    ['planned', 'cancelled'],
    ['in_progress', 'cancelled'],
    ['blocked', 'cancelled'],
  ]),
  reopen: new Map([
    ['done', 'in_progress'],
    ['cancelled', 'in_progress'],
  ]),
})

const MILESTONE_STATE_TRANSITIONS = Object.freeze({
  planned: new Set(['active', 'completed', 'cancelled']),
  active: new Set(['completed', 'cancelled']),
  completed: new Set(),
  cancelled: new Set(),
})

const CAPTURE_STATE_TRANSITIONS = Object.freeze({
  process: new Map([['inbox', 'processed']]),
  archive: new Map([['inbox', 'archived'], ['processed', 'archived']]),
  reopen: new Map([['processed', 'inbox'], ['archived', 'inbox']]),
})

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function isoNow(now) {
  return new Date(now()).toISOString()
}

function begin(database) {
  database.exec('BEGIN IMMEDIATE')
}

function rollback(database) {
  try {
    database.exec('ROLLBACK')
  } catch {
    // The original error is more useful when SQLite already rolled back.
  }
}

function projectFromRow(row) {
  return row ? { ...row } : null
}

export function createProjectStore({ database, now = Date.now, idGenerator = createUuidV7 } = {}) {
  if (!database) throw new TypeError('database is required')
  const cursorSecret = randomBytes(32)

  function newId() {
    return idGenerator(now)
  }

  function appendAudit({ spaceId, actor, action, objectType = 'project', objectId, requestId, outcome = 'succeeded', reasonCode = null, changed = [] }) {
    const id = newId()
    const occurredAt = isoNow(now)
    const previous = database
      .prepare('SELECT event_hash FROM audit_events WHERE space_id = ? ORDER BY occurred_at DESC, id DESC LIMIT 1')
      .get(spaceId)?.event_hash ?? '0'.repeat(64)
    const changeDigest = changed.length ? sha256(stableJson([...changed].sort())) : null
    const event = {
      id,
      space_id: spaceId,
      occurred_at: occurredAt,
      actor_id: actor.id,
      actor_kind: actor.kind,
      action,
      object_type: objectId ? objectType : 'space',
      object_id: objectId,
      request_id: requestId ?? null,
      run_id: null,
      outcome,
      reason_code: reasonCode,
      change_digest: changeDigest,
      previous_hash: previous,
    }
    const eventHash = sha256(`${previous}\n${stableJson(event)}`)
    database
      .prepare(`
        INSERT INTO audit_events (
          id, space_id, occurred_at, actor_id, actor_kind, action, object_type, object_id,
          request_id, run_id, outcome, reason_code, change_digest, previous_hash, event_hash
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        event.id,
        event.space_id,
        event.occurred_at,
        event.actor_id,
        event.actor_kind,
        event.action,
        event.object_type,
        event.object_id,
        event.request_id,
        event.run_id,
        event.outcome,
        event.reason_code,
        event.change_digest,
        event.previous_hash,
        eventHash,
      )
  }

  function appendOutbox({ spaceId, aggregate, aggregateType = 'project', eventType }) {
    database
      .prepare(`
        INSERT INTO outbox_events (
          id, space_id, aggregate_type, aggregate_id, event_type, event_version,
          payload_json, status, attempt_count, next_attempt_at, created_at, delivered_at
        ) VALUES (?, ?, ?, ?, ?, 1, ?, 'pending', 0, NULL, ?, NULL)
      `)
      .run(
        newId(),
        spaceId,
        aggregateType,
        aggregate.id,
        eventType,
        stableJson({ id: aggregate.id, space_id: spaceId, status: aggregate.status, version: aggregate.version }),
        isoNow(now),
      )
  }

  function ensureIdentity() {
    const existing = database
      .prepare(`
        SELECT p.id AS principal_id, p.kind, s.id AS space_id, s.name AS space_name,
               s.classification, s.status AS space_status, s.version AS space_version
        FROM principals p
        JOIN spaces s ON s.owner_id = p.id
        WHERE p.kind = 'local_owner' AND p.status = 'active' AND s.deleted_at IS NULL
        ORDER BY p.created_at, s.created_at
        LIMIT 1
      `)
      .get()
    if (existing) return existing

    begin(database)
    try {
      const principalId = newId()
      const spaceId = newId()
      const createdAt = isoNow(now)
      database
        .prepare('INSERT INTO principals (id, kind, display_name, status, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(principalId, 'local_owner', '本地拥有者', 'active', createdAt)
      database
        .prepare(`
          INSERT INTO spaces (
            id, owner_id, name, classification, default_ai_policy, status,
            created_at, created_by, updated_at, updated_by, version, deleted_at, deleted_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NULL, NULL)
        `)
        .run(
          spaceId,
          principalId,
          '个人工作台',
          'personal_local',
          'local_only',
          'active',
          createdAt,
          principalId,
          createdAt,
          principalId,
        )
      appendAudit({
        spaceId,
        actor: { id: principalId, kind: 'local_owner' },
        action: 'space.initialize',
        objectId: null,
        requestId: null,
        changed: ['classification', 'default_ai_policy', 'name', 'status'],
      })
      database.exec('COMMIT')
      return {
        principal_id: principalId,
        kind: 'local_owner',
        space_id: spaceId,
        space_name: '个人工作台',
        classification: 'personal_local',
        space_status: 'active',
        space_version: 1,
      }
    } catch (error) {
      rollback(database)
      throw error
    }
  }

  const identity = ensureIdentity()

  function actorForSession(session) {
    if (!session?.principalId || session.principalId !== identity.principal_id) {
      throw publicError(ERROR_CODES.SESSION_REQUIRED, '本地会话缺失或已过期。', { statusCode: 401 })
    }
    return { id: identity.principal_id, kind: identity.kind }
  }

  function visibleSpace(actor, spaceId) {
    const row = database
      .prepare(`
        SELECT id, name, classification, default_ai_policy, status, version, created_at, updated_at
        FROM spaces
        WHERE id = ? AND owner_id = ? AND status = 'active' AND deleted_at IS NULL
      `)
      .get(spaceId, actor.id)
    if (!row) {
      throw publicError(ERROR_CODES.OBJECT_NOT_AVAILABLE, '请求的资源不可用。', { statusCode: 404 })
    }
    return row
  }

  function requireProject(actor, projectId, { includeDeleted = false } = {}) {
    const row = database
      .prepare(`
        SELECT ${PROJECT_COLUMNS}
        FROM projects
        WHERE id = ? AND space_id IN (
          SELECT id FROM spaces WHERE owner_id = ? AND status = 'active' AND deleted_at IS NULL
        ) ${includeDeleted ? '' : 'AND deleted_at IS NULL'}
      `)
      .get(projectId, actor.id)
    if (!row) {
      throw publicError(ERROR_CODES.OBJECT_NOT_AVAILABLE, '请求的资源不可用。', { statusCode: 404 })
    }
    return projectFromRow(row)
  }

  function executeIdempotent({ actor, commandScope, key, request, prepare, cleanup, operation, statusCode = 200 }) {
    if (typeof key !== 'string' || key.length < 16 || key.length > 200 || !/^[A-Za-z0-9._~-]+$/.test(key)) {
      throw publicError(ERROR_CODES.INVALID_REQUEST, '缺少有效的 Idempotency-Key。', {
        statusCode: 400,
        field: 'Idempotency-Key',
      })
    }
    const requestDigest = sha256(stableJson(request))
    const stored = database
      .prepare(`
        SELECT request_digest, response_json, status_code
        FROM idempotency_keys
        WHERE principal_id = ? AND command_scope = ? AND idempotency_key = ? AND expires_at > ?
      `)
      .get(actor.id, commandScope, key, isoNow(now))
    if (stored) {
      if (stored.request_digest !== requestDigest) {
        throw publicError(ERROR_CODES.IDEMPOTENCY_CONFLICT, '该幂等键已用于不同请求。', { statusCode: 409 })
      }
      return { data: JSON.parse(stored.response_json), replayed: true, statusCode: stored.status_code }
    }

    const prepared = prepare?.()
    begin(database)
    try {
      database
        .prepare(`
          DELETE FROM idempotency_keys
          WHERE principal_id = ? AND command_scope = ? AND idempotency_key = ? AND expires_at <= ?
        `)
        .run(actor.id, commandScope, key, isoNow(now))
      const data = operation(prepared)
      const createdAt = isoNow(now)
      const expiresAt = new Date(now() + 24 * 60 * 60 * 1000).toISOString()
      database
        .prepare(`
          INSERT INTO idempotency_keys (
            principal_id, command_scope, idempotency_key, request_digest,
            response_json, status_code, created_at, expires_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `)
      .run(actor.id, commandScope, key, requestDigest, stableJson(data), statusCode, createdAt, expiresAt)
      database.exec('COMMIT')
      return { data, replayed: false, statusCode }
    } catch (error) {
      rollback(database)
      try {
        cleanup?.(prepared, error)
      } catch {
        // Cleanup must not hide the durable command failure.
      }
      throw error
    }
  }

  function encodeCursor(row) {
    const payload = Buffer.from(stableJson({ updated_at: row.updated_at, id: row.id })).toString('base64url')
    const signature = createHmac('sha256', cursorSecret).update(payload).digest('base64url')
    return `${payload}.${signature}`
  }

  function decodeCursor(cursor) {
    if (cursor == null || cursor === '') return null
    if (typeof cursor !== 'string' || cursor.length > 512) {
      throw publicError(ERROR_CODES.INVALID_CURSOR, '分页游标无效或已过期。', { statusCode: 400 })
    }
    const [payload, signature, extra] = cursor.split('.')
    if (!payload || !signature || extra) {
      throw publicError(ERROR_CODES.INVALID_CURSOR, '分页游标无效或已过期。', { statusCode: 400 })
    }
    const expected = createHmac('sha256', cursorSecret).update(payload).digest('base64url')
    if (signature !== expected) {
      throw publicError(ERROR_CODES.INVALID_CURSOR, '分页游标无效或已过期。', { statusCode: 400 })
    }
    try {
      const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
      if (typeof parsed.updated_at !== 'string' || typeof parsed.id !== 'string') throw new Error('invalid')
      return parsed
    } catch {
      throw publicError(ERROR_CODES.INVALID_CURSOR, '分页游标无效或已过期。', { statusCode: 400 })
    }
  }

  function listSpaces(session) {
    const actor = actorForSession(session)
    return database
      .prepare(`
        SELECT id, name, classification, default_ai_policy, status, version, created_at, updated_at
        FROM spaces WHERE owner_id = ? AND deleted_at IS NULL ORDER BY created_at, id
      `)
      .all(actor.id)
  }

  function getSpace(session, spaceId) {
    return visibleSpace(actorForSession(session), spaceId)
  }

  function listProjects(session, { spaceId, status = null, templateType = null, cursor = null, limit = 50 }) {
    const actor = actorForSession(session)
    visibleSpace(actor, spaceId)
    const pageSize = Number(limit)
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 200) {
      throw publicError(ERROR_CODES.INVALID_REQUEST, 'limit 必须是 1–200 的整数。', {
        statusCode: 400,
        field: 'limit',
      })
    }
    const after = decodeCursor(cursor)
    const rows = database
      .prepare(`
        SELECT ${PROJECT_COLUMNS}
        FROM projects
        WHERE space_id = ? AND deleted_at IS NULL
          AND (? IS NULL OR status = ?)
          AND (? IS NULL OR template_type = ?)
          AND (? IS NULL OR updated_at < ? OR (updated_at = ? AND id < ?))
        ORDER BY updated_at DESC, id DESC
        LIMIT ?
      `)
      .all(
        spaceId,
        status,
        status,
        templateType,
        templateType,
        after?.updated_at ?? null,
        after?.updated_at ?? null,
        after?.updated_at ?? null,
        after?.id ?? null,
        pageSize + 1,
      )
    const hasMore = rows.length > pageSize
    const items = rows.slice(0, pageSize).map(projectFromRow)
    return { items, hasMore, nextCursor: hasMore ? encodeCursor(items.at(-1)) : null }
  }

  function createProject(session, input, { idempotencyKey, requestId }) {
    const actor = actorForSession(session)
    visibleSpace(actor, input.space_id)
    return executeIdempotent({
      actor,
      commandScope: 'project.create',
      key: idempotencyKey,
      request: input,
      statusCode: 201,
      operation() {
        const project = {
          id: newId(),
          space_id: input.space_id,
          name: input.name,
          summary: input.summary,
          template_type: input.template_type,
          status: 'draft',
          start_date: input.start_date,
          target_date: input.target_date,
          context_policy: input.context_policy,
          color_token: input.color_token,
          created_at: isoNow(now),
          created_by: actor.id,
          updated_at: isoNow(now),
          updated_by: actor.id,
          version: 1,
          deleted_at: null,
          deleted_by: null,
        }
        database
          .prepare(`
            INSERT INTO projects (${PROJECT_COLUMNS})
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)
          `)
          .run(
            project.id,
            project.space_id,
            project.name,
            project.summary,
            project.template_type,
            project.status,
            project.start_date,
            project.target_date,
            project.context_policy,
            project.color_token,
            project.created_at,
            project.created_by,
            project.updated_at,
            project.updated_by,
            project.version,
          )
        appendAudit({
          spaceId: project.space_id,
          actor,
          action: 'project.create',
          objectId: project.id,
          requestId,
          changed: ['color_token', 'context_policy', 'name', 'start_date', 'summary', 'target_date', 'template_type'],
        })
        appendOutbox({ spaceId: project.space_id, aggregate: project, eventType: 'project.created' })
        return project
      },
    })
  }

  function getProject(session, projectId) {
    return requireProject(actorForSession(session), projectId)
  }

  function updateProject(session, projectId, patch, { expectedVersion, idempotencyKey, requestId }) {
    const actor = actorForSession(session)
    return executeIdempotent({
      actor,
      commandScope: `project.update:${projectId}`,
      key: idempotencyKey,
      request: { expectedVersion, patch },
      operation() {
        const current = requireProject(actor, projectId)
        if (current.version !== expectedVersion) {
          throw publicError(ERROR_CODES.VERSION_CONFLICT, '对象已被修改，请刷新后比较差异。', {
            statusCode: 409,
          })
        }
        const next = { ...current, ...patch }
        if (!validateProjectDates(next)) {
          throw publicError(ERROR_CODES.VALIDATION_FAILED, '目标日期不能早于开始日期。', {
            statusCode: 422,
            field: 'target_date',
          })
        }
        const changed = Object.keys(patch).filter((key) => patch[key] !== current[key])
        if (changed.length === 0) return current
        next.updated_at = isoNow(now)
        next.updated_by = actor.id
        next.version = current.version + 1
        const result = database
          .prepare(`
            UPDATE projects SET
              name = ?, summary = ?, start_date = ?, target_date = ?, context_policy = ?, color_token = ?,
              updated_at = ?, updated_by = ?, version = ?
            WHERE id = ? AND space_id = ? AND version = ? AND deleted_at IS NULL
          `)
          .run(
            next.name,
            next.summary,
            next.start_date,
            next.target_date,
            next.context_policy,
            next.color_token,
            next.updated_at,
            next.updated_by,
            next.version,
            next.id,
            next.space_id,
            current.version,
          )
        if (result.changes !== 1) {
          throw publicError(ERROR_CODES.VERSION_CONFLICT, '对象已被修改，请刷新后比较差异。', {
            statusCode: 409,
          })
        }
        appendAudit({ spaceId: next.space_id, actor, action: 'project.update', objectId: next.id, requestId, changed })
        appendOutbox({ spaceId: next.space_id, aggregate: next, eventType: 'project.updated' })
        return next
      },
    })
  }

  function transitionProject(session, projectId, action, { expectedVersion, idempotencyKey, requestId }) {
    const actor = actorForSession(session)
    return executeIdempotent({
      actor,
      commandScope: `project.transition:${projectId}`,
      key: idempotencyKey,
      request: { action, expectedVersion },
      operation() {
        const current = requireProject(actor, projectId)
        if (current.version !== expectedVersion) {
          throw publicError(ERROR_CODES.VERSION_CONFLICT, '对象已被修改，请刷新后比较差异。', { statusCode: 409 })
        }
        const nextStatus = TRANSITIONS[action]?.get(current.status)
        if (!nextStatus) {
          throw publicError(ERROR_CODES.INVALID_STATE_TRANSITION, '当前项目状态不允许该操作。', {
            statusCode: 409,
          })
        }
        const next = {
          ...current,
          status: nextStatus,
          updated_at: isoNow(now),
          updated_by: actor.id,
          version: current.version + 1,
        }
        database
          .prepare(`
            UPDATE projects SET status = ?, updated_at = ?, updated_by = ?, version = ?
            WHERE id = ? AND space_id = ? AND version = ? AND deleted_at IS NULL
          `)
          .run(next.status, next.updated_at, next.updated_by, next.version, next.id, next.space_id, current.version)
        appendAudit({
          spaceId: next.space_id,
          actor,
          action: `project.${action}`,
          objectId: next.id,
          requestId,
          changed: ['status'],
        })
        appendOutbox({ spaceId: next.space_id, aggregate: next, eventType: `project.${action}d` })
        return next
      },
    })
  }

  function deleteProject(session, projectId, { expectedVersion, idempotencyKey, requestId }) {
    const actor = actorForSession(session)
    return executeIdempotent({
      actor,
      commandScope: `project.delete:${projectId}`,
      key: idempotencyKey,
      request: { expectedVersion },
      operation() {
        const current = requireProject(actor, projectId)
        if (current.version !== expectedVersion) {
          throw publicError(ERROR_CODES.VERSION_CONFLICT, '对象已被修改，请刷新后比较差异。', { statusCode: 409 })
        }
        const deletedAt = isoNow(now)
        const next = {
          ...current,
          updated_at: deletedAt,
          updated_by: actor.id,
          version: current.version + 1,
          deleted_at: deletedAt,
          deleted_by: actor.id,
        }
        database
          .prepare(`
            UPDATE projects SET updated_at = ?, updated_by = ?, version = ?, deleted_at = ?, deleted_by = ?
            WHERE id = ? AND space_id = ? AND version = ? AND deleted_at IS NULL
          `)
          .run(deletedAt, actor.id, next.version, deletedAt, actor.id, next.id, next.space_id, current.version)
        appendAudit({
          spaceId: next.space_id,
          actor,
          action: 'project.delete',
          objectId: next.id,
          requestId,
          changed: ['deleted_at'],
        })
        appendOutbox({ spaceId: next.space_id, aggregate: next, eventType: 'project.deleted' })
        return { id: next.id, space_id: next.space_id, version: next.version, deleted_at: deletedAt, recoverable_until: new Date(now() + 30 * 86400000).toISOString() }
      },
    })
  }

  function restoreProject(session, projectId, { expectedVersion, idempotencyKey, requestId }) {
    const actor = actorForSession(session)
    return executeIdempotent({
      actor,
      commandScope: `project.restore:${projectId}`,
      key: idempotencyKey,
      request: { expectedVersion },
      operation() {
        const current = requireProject(actor, projectId, { includeDeleted: true })
        if (!current.deleted_at) {
          throw publicError(ERROR_CODES.INVALID_STATE_TRANSITION, '项目当前未处于已删除状态。', { statusCode: 409 })
        }
        if (current.version !== expectedVersion) {
          throw publicError(ERROR_CODES.VERSION_CONFLICT, '对象已被修改，请刷新后比较差异。', { statusCode: 409 })
        }
        if (Date.parse(current.deleted_at) + 30 * 86400000 < now()) {
          throw publicError(ERROR_CODES.RESTORE_WINDOW_EXPIRED, '项目已超过可恢复期限。', { statusCode: 410 })
        }
        const next = {
          ...current,
          updated_at: isoNow(now),
          updated_by: actor.id,
          version: current.version + 1,
          deleted_at: null,
          deleted_by: null,
        }
        database
          .prepare(`
            UPDATE projects SET updated_at = ?, updated_by = ?, version = ?, deleted_at = NULL, deleted_by = NULL
            WHERE id = ? AND space_id = ? AND version = ? AND deleted_at IS NOT NULL
          `)
          .run(next.updated_at, actor.id, next.version, next.id, next.space_id, current.version)
        appendAudit({
          spaceId: next.space_id,
          actor,
          action: 'project.restore',
          objectId: next.id,
          requestId,
          changed: ['deleted_at'],
        })
        appendOutbox({ spaceId: next.space_id, aggregate: next, eventType: 'project.restored' })
        return next
      },
    })
  }

  function writableProject(actor, projectId) {
    const project = requireProject(actor, projectId)
    if (['completed', 'archived'].includes(project.status)) {
      throw publicError(ERROR_CODES.INVALID_STATE_TRANSITION, '项目需重新打开后才能新增工作项。', {
        statusCode: 409,
      })
    }
    return project
  }

  function requireMilestone(actor, milestoneId) {
    const row = database
      .prepare(`
        SELECT m.*
        FROM milestones m
        JOIN projects p ON p.id = m.project_id AND p.space_id = m.space_id
        JOIN spaces s ON s.id = m.space_id
        WHERE m.id = ? AND s.owner_id = ? AND s.status = 'active' AND s.deleted_at IS NULL
          AND p.deleted_at IS NULL AND m.deleted_at IS NULL
      `)
      .get(milestoneId, actor.id)
    if (!row) throw publicError(ERROR_CODES.OBJECT_NOT_AVAILABLE, '请求的资源不可用。', { statusCode: 404 })
    return { ...row }
  }

  function requireTask(actor, taskId) {
    const row = database
      .prepare(`
        SELECT t.*
        FROM tasks t
        JOIN projects p ON p.id = t.project_id AND p.space_id = t.space_id
        JOIN spaces s ON s.id = t.space_id
        WHERE t.id = ? AND s.owner_id = ? AND s.status = 'active' AND s.deleted_at IS NULL
          AND p.deleted_at IS NULL AND t.deleted_at IS NULL
      `)
      .get(taskId, actor.id)
    if (!row) throw publicError(ERROR_CODES.OBJECT_NOT_AVAILABLE, '请求的资源不可用。', { statusCode: 404 })
    return { ...row }
  }

  function validateTaskLinks(project, { milestone_id: milestoneId, parent_task_id: parentTaskId }, taskId = null) {
    if (milestoneId) {
      const milestone = database
        .prepare('SELECT id FROM milestones WHERE id = ? AND project_id = ? AND space_id = ? AND deleted_at IS NULL')
        .get(milestoneId, project.id, project.space_id)
      if (!milestone) {
        throw publicError(ERROR_CODES.RELATION_CONFLICT, '里程碑与当前项目不匹配。', {
          statusCode: 409,
          field: 'milestone_id',
        })
      }
    }
    if (parentTaskId) {
      if (parentTaskId === taskId) {
        throw publicError(ERROR_CODES.RELATION_CONFLICT, '任务不能成为自己的父任务。', { statusCode: 409 })
      }
      const parent = database
        .prepare(`
          SELECT id, parent_task_id FROM tasks
          WHERE id = ? AND project_id = ? AND space_id = ? AND deleted_at IS NULL
        `)
        .get(parentTaskId, project.id, project.space_id)
      if (!parent || parent.parent_task_id) {
        throw publicError(ERROR_CODES.RELATION_CONFLICT, '父任务必须属于当前项目且层级不能超过一层。', {
          statusCode: 409,
          field: 'parent_task_id',
        })
      }
      if (taskId) {
        const hasChildren = database
          .prepare('SELECT 1 AS found FROM tasks WHERE parent_task_id = ? AND deleted_at IS NULL LIMIT 1')
          .get(taskId)
        if (hasChildren) {
          throw publicError(ERROR_CODES.RELATION_CONFLICT, '已有子任务的任务不能再设为子任务。', {
            statusCode: 409,
          })
        }
      }
    }
  }

  function listMilestones(session, projectId) {
    const actor = actorForSession(session)
    const project = requireProject(actor, projectId)
    return database
      .prepare(`
        SELECT ${MILESTONE_COLUMNS} FROM milestones
        WHERE project_id = ? AND space_id = ? AND deleted_at IS NULL
        ORDER BY sort_order, target_date IS NULL, target_date, id
      `)
      .all(project.id, project.space_id)
      .map((row) => ({ ...row }))
  }

  function createMilestone(session, projectId, input, { idempotencyKey, requestId }) {
    const actor = actorForSession(session)
    return executeIdempotent({
      actor,
      commandScope: `milestone.create:${projectId}`,
      key: idempotencyKey,
      request: input,
      statusCode: 201,
      operation() {
        const project = writableProject(actor, projectId)
        const timestamp = isoNow(now)
        const milestone = {
          id: newId(), space_id: project.space_id, project_id: project.id,
          title: input.title, status: 'planned', target_date: input.target_date,
          sort_order: input.sort_order, created_at: timestamp, created_by: actor.id,
          updated_at: timestamp, updated_by: actor.id, version: 1, deleted_at: null, deleted_by: null,
        }
        database.prepare(`
          INSERT INTO milestones (${MILESTONE_COLUMNS})
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NULL, NULL)
        `).run(
          milestone.id, milestone.space_id, milestone.project_id, milestone.title, milestone.status,
          milestone.target_date, milestone.sort_order, timestamp, actor.id, timestamp, actor.id,
        )
        appendAudit({ spaceId: project.space_id, actor, action: 'milestone.create', objectType: 'milestone', objectId: milestone.id, requestId, changed: ['project_id', 'sort_order', 'target_date', 'title'] })
        appendOutbox({ spaceId: project.space_id, aggregate: milestone, aggregateType: 'milestone', eventType: 'milestone.created' })
        return milestone
      },
    })
  }

  function updateMilestone(session, milestoneId, patch, { expectedVersion, idempotencyKey, requestId }) {
    const actor = actorForSession(session)
    return executeIdempotent({
      actor,
      commandScope: `milestone.update:${milestoneId}`,
      key: idempotencyKey,
      request: { expectedVersion, patch },
      operation() {
        const current = requireMilestone(actor, milestoneId)
        writableProject(actor, current.project_id)
        if (current.version !== expectedVersion) throw publicError(ERROR_CODES.VERSION_CONFLICT, '对象已被修改，请刷新后比较差异。', { statusCode: 409 })
        if (patch.status && patch.status !== current.status && !MILESTONE_STATE_TRANSITIONS[current.status].has(patch.status)) {
          throw publicError(ERROR_CODES.INVALID_STATE_TRANSITION, '当前里程碑状态不允许该操作。', { statusCode: 409 })
        }
        const next = { ...current, ...patch }
        const changed = Object.keys(patch).filter((key) => patch[key] !== current[key])
        if (!changed.length) return current
        next.updated_at = isoNow(now); next.updated_by = actor.id; next.version = current.version + 1
        database.prepare(`
          UPDATE milestones SET title = ?, status = ?, target_date = ?, sort_order = ?,
            updated_at = ?, updated_by = ?, version = ?
          WHERE id = ? AND version = ? AND deleted_at IS NULL
        `).run(next.title, next.status, next.target_date, next.sort_order, next.updated_at, actor.id, next.version, next.id, current.version)
        appendAudit({ spaceId: next.space_id, actor, action: 'milestone.update', objectType: 'milestone', objectId: next.id, requestId, changed })
        appendOutbox({ spaceId: next.space_id, aggregate: next, aggregateType: 'milestone', eventType: 'milestone.updated' })
        return next
      },
    })
  }

  function deleteMilestone(session, milestoneId, { expectedVersion, idempotencyKey, requestId }) {
    const actor = actorForSession(session)
    return executeIdempotent({
      actor,
      commandScope: `milestone.delete:${milestoneId}`,
      key: idempotencyKey,
      request: { expectedVersion },
      operation() {
        const current = requireMilestone(actor, milestoneId)
        if (current.version !== expectedVersion) throw publicError(ERROR_CODES.VERSION_CONFLICT, '对象已被修改，请刷新后比较差异。', { statusCode: 409 })
        if (database.prepare('SELECT 1 AS found FROM tasks WHERE milestone_id = ? AND deleted_at IS NULL LIMIT 1').get(current.id)) {
          throw publicError(ERROR_CODES.RELATION_CONFLICT, '里程碑仍有关联任务，不能直接删除。', { statusCode: 409 })
        }
        const timestamp = isoNow(now)
        const next = { ...current, updated_at: timestamp, updated_by: actor.id, version: current.version + 1, deleted_at: timestamp, deleted_by: actor.id }
        database.prepare(`UPDATE milestones SET updated_at = ?, updated_by = ?, version = ?, deleted_at = ?, deleted_by = ? WHERE id = ? AND version = ? AND deleted_at IS NULL`)
          .run(timestamp, actor.id, next.version, timestamp, actor.id, next.id, current.version)
        appendAudit({ spaceId: next.space_id, actor, action: 'milestone.delete', objectType: 'milestone', objectId: next.id, requestId, changed: ['deleted_at'] })
        appendOutbox({ spaceId: next.space_id, aggregate: next, aggregateType: 'milestone', eventType: 'milestone.deleted' })
        return { id: next.id, space_id: next.space_id, project_id: next.project_id, version: next.version, deleted_at: timestamp }
      },
    })
  }

  function listTasks(session, projectId) {
    const actor = actorForSession(session)
    const project = requireProject(actor, projectId)
    return database.prepare(`
      SELECT ${TASK_COLUMNS} FROM tasks
      WHERE project_id = ? AND space_id = ? AND deleted_at IS NULL
      ORDER BY CASE status WHEN 'in_progress' THEN 0 WHEN 'blocked' THEN 1 WHEN 'planned' THEN 2 WHEN 'inbox' THEN 3 WHEN 'done' THEN 4 ELSE 5 END,
        due_date IS NULL, due_date, created_at, id
    `).all(project.id, project.space_id).map((row) => ({ ...row }))
  }

  function createTask(session, projectId, input, { idempotencyKey, requestId }) {
    const actor = actorForSession(session)
    return executeIdempotent({
      actor,
      commandScope: `task.create:${projectId}`,
      key: idempotencyKey,
      request: input,
      statusCode: 201,
      operation() {
        const project = writableProject(actor, projectId)
        validateTaskLinks(project, input)
        const timestamp = isoNow(now)
        const task = {
          id: newId(), space_id: project.space_id, project_id: project.id,
          milestone_id: input.milestone_id, parent_task_id: input.parent_task_id,
          title: input.title, description: input.description, status: 'inbox', priority: input.priority,
          due_at: input.due_at ? new Date(input.due_at).toISOString() : null, due_date: input.due_date,
          source_kind: 'manual', completed_at: null, created_at: timestamp, created_by: actor.id,
          updated_at: timestamp, updated_by: actor.id, version: 1, deleted_at: null, deleted_by: null,
        }
        database.prepare(`
          INSERT INTO tasks (${TASK_COLUMNS})
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, 1, NULL, NULL)
        `).run(
          task.id, task.space_id, task.project_id, task.milestone_id, task.parent_task_id,
          task.title, task.description, task.status, task.priority, task.due_at, task.due_date,
          task.source_kind, timestamp, actor.id, timestamp, actor.id,
        )
        appendAudit({ spaceId: task.space_id, actor, action: 'task.create', objectType: 'task', objectId: task.id, requestId, changed: ['description', 'due_at', 'due_date', 'milestone_id', 'parent_task_id', 'priority', 'project_id', 'title'] })
        appendOutbox({ spaceId: task.space_id, aggregate: task, aggregateType: 'task', eventType: 'task.created' })
        return task
      },
    })
  }

  function getTask(session, taskId) {
    return requireTask(actorForSession(session), taskId)
  }

  function updateTask(session, taskId, patch, { expectedVersion, idempotencyKey, requestId }) {
    const actor = actorForSession(session)
    return executeIdempotent({
      actor,
      commandScope: `task.update:${taskId}`,
      key: idempotencyKey,
      request: { expectedVersion, patch },
      operation() {
        const current = requireTask(actor, taskId)
        const project = writableProject(actor, current.project_id)
        if (current.version !== expectedVersion) throw publicError(ERROR_CODES.VERSION_CONFLICT, '对象已被修改，请刷新后比较差异。', { statusCode: 409 })
        const next = { ...current, ...patch }
        if (Object.hasOwn(patch, 'due_at')) next.due_at = patch.due_at ? new Date(patch.due_at).toISOString() : null
        validateTaskLinks(project, next, current.id)
        const changed = Object.keys(patch).filter((key) => next[key] !== current[key])
        if (!changed.length) return current
        next.updated_at = isoNow(now); next.updated_by = actor.id; next.version = current.version + 1
        database.prepare(`
          UPDATE tasks SET milestone_id = ?, parent_task_id = ?, title = ?, description = ?, priority = ?,
            due_at = ?, due_date = ?, updated_at = ?, updated_by = ?, version = ?
          WHERE id = ? AND version = ? AND deleted_at IS NULL
        `).run(
          next.milestone_id, next.parent_task_id, next.title, next.description, next.priority,
          next.due_at, next.due_date, next.updated_at, actor.id, next.version, next.id, current.version,
        )
        appendAudit({ spaceId: next.space_id, actor, action: 'task.update', objectType: 'task', objectId: next.id, requestId, changed })
        appendOutbox({ spaceId: next.space_id, aggregate: next, aggregateType: 'task', eventType: 'task.updated' })
        return next
      },
    })
  }

  function transitionTask(session, taskId, action, { expectedVersion, idempotencyKey, requestId }) {
    const actor = actorForSession(session)
    return executeIdempotent({
      actor,
      commandScope: `task.transition:${taskId}`,
      key: idempotencyKey,
      request: { expectedVersion, action },
      operation() {
        const current = requireTask(actor, taskId)
        writableProject(actor, current.project_id)
        if (current.version !== expectedVersion) throw publicError(ERROR_CODES.VERSION_CONFLICT, '对象已被修改，请刷新后比较差异。', { statusCode: 409 })
        const nextStatus = TASK_STATE_TRANSITIONS[action]?.get(current.status)
        if (!nextStatus) throw publicError(ERROR_CODES.INVALID_STATE_TRANSITION, '当前任务状态不允许该操作。', { statusCode: 409 })
        const timestamp = isoNow(now)
        const next = { ...current, status: nextStatus, completed_at: nextStatus === 'done' ? timestamp : null, updated_at: timestamp, updated_by: actor.id, version: current.version + 1 }
        database.prepare(`UPDATE tasks SET status = ?, completed_at = ?, updated_at = ?, updated_by = ?, version = ? WHERE id = ? AND version = ? AND deleted_at IS NULL`)
          .run(next.status, next.completed_at, timestamp, actor.id, next.version, next.id, current.version)
        appendAudit({ spaceId: next.space_id, actor, action: `task.${action}`, objectType: 'task', objectId: next.id, requestId, changed: ['completed_at', 'status'] })
        appendOutbox({ spaceId: next.space_id, aggregate: next, aggregateType: 'task', eventType: `task.${action}d` })
        return next
      },
    })
  }

  function deleteTask(session, taskId, { expectedVersion, idempotencyKey, requestId }) {
    const actor = actorForSession(session)
    return executeIdempotent({
      actor,
      commandScope: `task.delete:${taskId}`,
      key: idempotencyKey,
      request: { expectedVersion },
      operation() {
        const current = requireTask(actor, taskId)
        if (current.version !== expectedVersion) throw publicError(ERROR_CODES.VERSION_CONFLICT, '对象已被修改，请刷新后比较差异。', { statusCode: 409 })
        const unfinishedChild = database.prepare(`SELECT 1 AS found FROM tasks WHERE parent_task_id = ? AND deleted_at IS NULL AND status NOT IN ('done', 'cancelled') LIMIT 1`).get(current.id)
        if (unfinishedChild) throw publicError(ERROR_CODES.RELATION_CONFLICT, '任务仍有未完成子任务，不能直接删除。', { statusCode: 409 })
        const timestamp = isoNow(now)
        const next = { ...current, updated_at: timestamp, updated_by: actor.id, version: current.version + 1, deleted_at: timestamp, deleted_by: actor.id }
        database.prepare(`UPDATE tasks SET updated_at = ?, updated_by = ?, version = ?, deleted_at = ?, deleted_by = ? WHERE id = ? AND version = ? AND deleted_at IS NULL`)
          .run(timestamp, actor.id, next.version, timestamp, actor.id, next.id, current.version)
        appendAudit({ spaceId: next.space_id, actor, action: 'task.delete', objectType: 'task', objectId: next.id, requestId, changed: ['deleted_at'] })
        appendOutbox({ spaceId: next.space_id, aggregate: next, aggregateType: 'task', eventType: 'task.deleted' })
        return { id: next.id, space_id: next.space_id, project_id: next.project_id, version: next.version, deleted_at: timestamp }
      },
    })
  }

  function requireDiscussion(actor, discussionId) {
    const row = database.prepare(`
      SELECT d.* FROM discussions d
      JOIN projects p ON p.id = d.project_id AND p.space_id = d.space_id
      JOIN spaces s ON s.id = d.space_id
      WHERE d.id = ? AND s.owner_id = ? AND s.status = 'active' AND s.deleted_at IS NULL
        AND p.deleted_at IS NULL AND d.deleted_at IS NULL
    `).get(discussionId, actor.id)
    if (!row) throw publicError(ERROR_CODES.OBJECT_NOT_AVAILABLE, '请求的资源不可用。', { statusCode: 404 })
    return { ...row }
  }

  function listDiscussions(session, projectId) {
    const actor = actorForSession(session)
    const project = requireProject(actor, projectId)
    return database.prepare(`
      SELECT ${DISCUSSION_COLUMNS} FROM discussions
      WHERE project_id = ? AND space_id = ? AND deleted_at IS NULL
      ORDER BY CASE status WHEN 'open' THEN 0 WHEN 'resolved' THEN 1 ELSE 2 END, updated_at DESC, id DESC
    `).all(project.id, project.space_id).map((row) => ({ ...row }))
  }

  function createDiscussion(session, projectId, input, { idempotencyKey, requestId }) {
    const actor = actorForSession(session)
    return executeIdempotent({
      actor,
      commandScope: `discussion.create:${projectId}`,
      key: idempotencyKey,
      request: input,
      statusCode: 201,
      operation() {
        const project = writableProject(actor, projectId)
        const timestamp = isoNow(now)
        const discussion = {
          id: newId(), space_id: project.space_id, project_id: project.id, title: input.title,
          status: 'open', created_at: timestamp, created_by: actor.id, updated_at: timestamp,
          updated_by: actor.id, version: 1, deleted_at: null, deleted_by: null,
        }
        database.prepare(`INSERT INTO discussions (${DISCUSSION_COLUMNS}) VALUES (?, ?, ?, ?, 'open', ?, ?, ?, ?, 1, NULL, NULL)`)
          .run(discussion.id, discussion.space_id, discussion.project_id, discussion.title, timestamp, actor.id, timestamp, actor.id)
        appendAudit({ spaceId: discussion.space_id, actor, action: 'discussion.create', objectType: 'discussion', objectId: discussion.id, requestId, changed: ['project_id', 'title'] })
        appendOutbox({ spaceId: discussion.space_id, aggregate: discussion, aggregateType: 'discussion', eventType: 'discussion.created' })
        return discussion
      },
    })
  }

  function listDiscussionEntries(session, discussionId) {
    const actor = actorForSession(session)
    const discussion = requireDiscussion(actor, discussionId)
    return database.prepare(`
      SELECT ${DISCUSSION_ENTRY_COLUMNS} FROM discussion_entries
      WHERE discussion_id = ? AND space_id = ? AND project_id = ? AND deleted_at IS NULL
      ORDER BY created_at, id
    `).all(discussion.id, discussion.space_id, discussion.project_id).map((row) => ({ ...row }))
  }

  function createDiscussionEntry(session, discussionId, input, { idempotencyKey, requestId }) {
    const actor = actorForSession(session)
    return executeIdempotent({
      actor,
      commandScope: `discussion.entry.create:${discussionId}`,
      key: idempotencyKey,
      request: input,
      statusCode: 201,
      operation() {
        const discussion = requireDiscussion(actor, discussionId)
        writableProject(actor, discussion.project_id)
        if (discussion.status !== 'open') {
          throw publicError(ERROR_CODES.INVALID_STATE_TRANSITION, '讨论已结束，不能继续追加内容。', { statusCode: 409 })
        }
        const timestamp = isoNow(now)
        const entry = {
          id: newId(), space_id: discussion.space_id, project_id: discussion.project_id,
          discussion_id: discussion.id, author_kind: 'principal', body: input.body, run_id: null,
          created_at: timestamp, created_by: actor.id, deleted_at: null, deleted_by: null,
        }
        database.prepare(`INSERT INTO discussion_entries (${DISCUSSION_ENTRY_COLUMNS}) VALUES (?, ?, ?, ?, 'principal', ?, NULL, ?, ?, NULL, NULL)`)
          .run(entry.id, entry.space_id, entry.project_id, entry.discussion_id, entry.body, timestamp, actor.id)
        database.prepare('UPDATE discussions SET updated_at = ?, updated_by = ?, version = version + 1 WHERE id = ? AND deleted_at IS NULL')
          .run(timestamp, actor.id, discussion.id)
        appendAudit({ spaceId: entry.space_id, actor, action: 'discussion.entry.create', objectType: 'discussion_entry', objectId: entry.id, requestId, changed: ['body', 'discussion_id'] })
        appendOutbox({ spaceId: entry.space_id, aggregate: { ...entry, status: 'recorded', version: 1 }, aggregateType: 'discussion_entry', eventType: 'discussion.entry.created' })
        return entry
      },
    })
  }

  function listDecisions(session, projectId) {
    const actor = actorForSession(session)
    const project = requireProject(actor, projectId)
    return database.prepare(`
      SELECT ${DECISION_COLUMNS} FROM decisions
      WHERE project_id = ? AND space_id = ? AND deleted_at IS NULL
      ORDER BY decided_at DESC, created_at DESC, id DESC
    `).all(project.id, project.space_id).map((row) => ({ ...row }))
  }

  function convertDiscussion(session, discussionId, input, { idempotencyKey, requestId }) {
    const actor = actorForSession(session)
    return executeIdempotent({
      actor,
      commandScope: `discussion.convert:${discussionId}`,
      key: idempotencyKey,
      request: input,
      statusCode: 201,
      operation() {
        const discussion = requireDiscussion(actor, discussionId)
        const project = writableProject(actor, discussion.project_id)
        if (discussion.status !== 'open') {
          throw publicError(ERROR_CODES.INVALID_STATE_TRANSITION, '只有进行中的讨论可以形成新决策。', { statusCode: 409 })
        }
        validateTaskLinks(project, { milestone_id: input.milestone_id, parent_task_id: null })
        const timestamp = isoNow(now)
        const decision = {
          id: newId(), space_id: project.space_id, project_id: project.id, discussion_id: discussion.id,
          title: input.decision_title, statement: input.statement, rationale: input.rationale,
          status: 'accepted', supersedes_id: null, decided_at: timestamp, created_at: timestamp,
          created_by: actor.id, updated_at: timestamp, updated_by: actor.id, version: 1,
          deleted_at: null, deleted_by: null,
        }
        database.prepare(`
          INSERT INTO decisions (${DECISION_COLUMNS})
          VALUES (?, ?, ?, ?, ?, ?, ?, 'accepted', NULL, ?, ?, ?, ?, ?, 1, NULL, NULL)
        `).run(
          decision.id, decision.space_id, decision.project_id, decision.discussion_id,
          decision.title, decision.statement, decision.rationale, timestamp, timestamp, actor.id, timestamp, actor.id,
        )
        const task = {
          id: newId(), space_id: project.space_id, project_id: project.id, milestone_id: input.milestone_id,
          parent_task_id: null, title: input.task_title, description: `由决策「${input.decision_title}」形成。`,
          status: 'inbox', priority: input.task_priority, due_at: null, due_date: input.task_due_date,
          source_kind: 'decision', completed_at: null, created_at: timestamp, created_by: actor.id,
          updated_at: timestamp, updated_by: actor.id, version: 1, deleted_at: null, deleted_by: null,
        }
        database.prepare(`
          INSERT INTO tasks (${TASK_COLUMNS})
          VALUES (?, ?, ?, ?, NULL, ?, ?, 'inbox', ?, NULL, ?, 'decision', NULL, ?, ?, ?, ?, 1, NULL, NULL)
        `).run(
          task.id, task.space_id, task.project_id, task.milestone_id, task.title, task.description,
          task.priority, task.due_date, timestamp, actor.id, timestamp, actor.id,
        )
        database.prepare('INSERT INTO decision_task_links (decision_id, task_id, space_id, project_id, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?)')
          .run(decision.id, task.id, project.space_id, project.id, timestamp, actor.id)
        const resolved = { ...discussion, status: 'resolved', updated_at: timestamp, updated_by: actor.id, version: discussion.version + 1 }
        database.prepare("UPDATE discussions SET status = 'resolved', updated_at = ?, updated_by = ?, version = ? WHERE id = ? AND version = ? AND deleted_at IS NULL")
          .run(timestamp, actor.id, resolved.version, discussion.id, discussion.version)
        appendAudit({ spaceId: project.space_id, actor, action: 'discussion.resolve', objectType: 'discussion', objectId: discussion.id, requestId, changed: ['status'] })
        appendAudit({ spaceId: project.space_id, actor, action: 'decision.accept', objectType: 'decision', objectId: decision.id, requestId, changed: ['discussion_id', 'rationale', 'statement', 'status', 'title'] })
        appendAudit({ spaceId: project.space_id, actor, action: 'task.create', objectType: 'task', objectId: task.id, requestId, changed: ['due_date', 'milestone_id', 'priority', 'project_id', 'source_kind', 'title'] })
        appendOutbox({ spaceId: project.space_id, aggregate: resolved, aggregateType: 'discussion', eventType: 'discussion.resolved' })
        appendOutbox({ spaceId: project.space_id, aggregate: decision, aggregateType: 'decision', eventType: 'decision.accepted' })
        appendOutbox({ spaceId: project.space_id, aggregate: task, aggregateType: 'task', eventType: 'task.created' })
        return { discussion: resolved, decision, task }
      },
    })
  }

  function requireCapture(actor, captureId) {
    const row = database.prepare(`
      SELECT c.* FROM captures c
      JOIN spaces s ON s.id = c.space_id
      WHERE c.id = ? AND s.owner_id = ? AND s.status = 'active' AND s.deleted_at IS NULL
        AND c.deleted_at IS NULL
    `).get(captureId, actor.id)
    if (!row) throw publicError(ERROR_CODES.OBJECT_NOT_AVAILABLE, '请求的资源不可用。', { statusCode: 404 })
    return { ...row }
  }

  function listCaptures(session, { spaceId, projectId = null, status = 'inbox', limit = 100 }) {
    const actor = actorForSession(session)
    visibleSpace(actor, spaceId)
    const pageSize = Number(limit)
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 200) {
      throw publicError(ERROR_CODES.INVALID_REQUEST, 'limit 必须是 1–200 的整数。', { statusCode: 400, field: 'limit' })
    }
    if (projectId) {
      const project = requireProject(actor, projectId)
      if (project.space_id !== spaceId) throw publicError(ERROR_CODES.OBJECT_NOT_AVAILABLE, '请求的资源不可用。', { statusCode: 404 })
    }
    const conditions = ['space_id = ?', 'deleted_at IS NULL']
    const params = [spaceId]
    if (status) { conditions.push('status = ?'); params.push(status) }
    if (projectId) { conditions.push('project_id = ?'); params.push(projectId) }
    params.push(pageSize)
    return database.prepare(`
      SELECT ${CAPTURE_COLUMNS} FROM captures
      WHERE ${conditions.join(' AND ')}
      ORDER BY captured_at DESC, id DESC LIMIT ?
    `).all(...params).map((row) => ({ ...row }))
  }

  function createCapture(session, input, { idempotencyKey, requestId }) {
    const actor = actorForSession(session)
    return executeIdempotent({
      actor,
      commandScope: `capture.create:${input.space_id}`,
      key: idempotencyKey,
      request: input,
      statusCode: 201,
      operation() {
        visibleSpace(actor, input.space_id)
        if (input.project_id) {
          const project = writableProject(actor, input.project_id)
          if (project.space_id !== input.space_id) throw publicError(ERROR_CODES.OBJECT_NOT_AVAILABLE, '请求的资源不可用。', { statusCode: 404 })
        }
        const timestamp = isoNow(now)
        const capture = {
          id: newId(), space_id: input.space_id, project_id: input.project_id, kind: input.kind,
          title: input.title, body: input.kind === 'text' ? input.body : '',
          canonical_uri: input.kind === 'link' ? new URL(input.canonical_uri).toString() : null,
          status: 'inbox', captured_at: timestamp, created_by: actor.id, updated_at: timestamp,
          updated_by: actor.id, version: 1, deleted_at: null, deleted_by: null,
        }
        database.prepare(`
          INSERT INTO captures (${CAPTURE_COLUMNS})
          VALUES (?, ?, ?, ?, ?, ?, ?, 'inbox', ?, ?, ?, ?, 1, NULL, NULL)
        `).run(
          capture.id, capture.space_id, capture.project_id, capture.kind, capture.title, capture.body,
          capture.canonical_uri, timestamp, actor.id, timestamp, actor.id,
        )
        appendAudit({ spaceId: capture.space_id, actor, action: 'capture.create', objectType: 'capture', objectId: capture.id, requestId, changed: ['kind', 'project_id', 'title'] })
        appendOutbox({ spaceId: capture.space_id, aggregate: capture, aggregateType: 'capture', eventType: 'capture.created' })
        return capture
      },
    })
  }

  function transitionCapture(session, captureId, action, { expectedVersion, idempotencyKey, requestId }) {
    const actor = actorForSession(session)
    return executeIdempotent({
      actor,
      commandScope: `capture.transition:${captureId}`,
      key: idempotencyKey,
      request: { action, expectedVersion },
      operation() {
        const current = requireCapture(actor, captureId)
        if (current.version !== expectedVersion) throw publicError(ERROR_CODES.VERSION_CONFLICT, '对象已被修改，请刷新后比较差异。', { statusCode: 409 })
        const nextStatus = CAPTURE_STATE_TRANSITIONS[action]?.get(current.status)
        if (!nextStatus) throw publicError(ERROR_CODES.INVALID_STATE_TRANSITION, '当前收件箱状态不允许该操作。', { statusCode: 409 })
        const timestamp = isoNow(now)
        const next = { ...current, status: nextStatus, updated_at: timestamp, updated_by: actor.id, version: current.version + 1 }
        database.prepare('UPDATE captures SET status = ?, updated_at = ?, updated_by = ?, version = ? WHERE id = ? AND version = ? AND deleted_at IS NULL')
          .run(next.status, timestamp, actor.id, next.version, next.id, current.version)
        appendAudit({ spaceId: next.space_id, actor, action: `capture.${action}`, objectType: 'capture', objectId: next.id, requestId, changed: ['status'] })
        appendOutbox({ spaceId: next.space_id, aggregate: next, aggregateType: 'capture', eventType: `capture.${nextStatus}` })
        return next
      },
    })
  }

  function getDailySnapshot(session, { spaceId, date }) {
    const actor = actorForSession(session)
    visibleSpace(actor, spaceId)
    const tasks = database.prepare(`
      SELECT t.*, p.name AS project_name
      FROM tasks t JOIN projects p ON p.id = t.project_id AND p.space_id = t.space_id
      WHERE t.space_id = ? AND t.deleted_at IS NULL AND p.deleted_at IS NULL
        AND p.status IN ('draft', 'active', 'paused')
        AND (
          (t.status NOT IN ('done', 'cancelled') AND (t.due_date IS NULL OR t.due_date <= ? OR t.status IN ('in_progress', 'blocked')))
          OR EXISTS (
            SELECT 1 FROM daily_plan_items dpi JOIN daily_plans dp ON dp.id = dpi.plan_id
            WHERE dpi.task_id = t.id AND dp.space_id = t.space_id AND dp.plan_date = ?
          )
        )
      ORDER BY CASE t.status WHEN 'blocked' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'planned' THEN 2 ELSE 3 END,
        CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
        t.due_date IS NULL, t.due_date, t.created_at, t.id LIMIT 50
    `).all(spaceId, date, date).map((row) => ({ ...row }))
    const plan = database.prepare('SELECT * FROM daily_plans WHERE space_id = ? AND plan_date = ?').get(spaceId, date)
    const focusTaskIds = plan
      ? database.prepare('SELECT task_id FROM daily_plan_items WHERE plan_id = ? ORDER BY sort_order').all(plan.id).map((row) => row.task_id)
      : []
    const review = database.prepare('SELECT * FROM daily_reviews WHERE space_id = ? AND review_date = ?').get(spaceId, date) ?? null
    return { date, plan: plan ? { ...plan, task_ids: focusTaskIds } : null, review: review ? { ...review } : null, tasks }
  }

  function saveDailyPlan(session, { spaceId, date, taskIds }, { expectedVersion = null, idempotencyKey, requestId }) {
    const actor = actorForSession(session)
    return executeIdempotent({
      actor,
      commandScope: `daily_plan.save:${spaceId}:${date}`,
      key: idempotencyKey,
      request: { expectedVersion, taskIds },
      operation() {
        visibleSpace(actor, spaceId)
        for (const taskId of taskIds) {
          const task = requireTask(actor, taskId)
          if (task.space_id !== spaceId || ['done', 'cancelled'].includes(task.status)) {
            throw publicError(ERROR_CODES.OBJECT_NOT_AVAILABLE, '请求的资源不可用。', { statusCode: 404 })
          }
        }
        const existing = database.prepare('SELECT * FROM daily_plans WHERE space_id = ? AND plan_date = ?').get(spaceId, date)
        if ((existing && existing.version !== expectedVersion) || (!existing && expectedVersion != null)) {
          throw publicError(ERROR_CODES.VERSION_CONFLICT, '今日重点已被修改，请刷新后重试。', { statusCode: 409 })
        }
        const timestamp = isoNow(now)
        const plan = existing
          ? { ...existing, updated_at: timestamp, updated_by: actor.id, version: existing.version + 1 }
          : { id: newId(), space_id: spaceId, plan_date: date, created_at: timestamp, created_by: actor.id, updated_at: timestamp, updated_by: actor.id, version: 1 }
        if (existing) {
          database.prepare('UPDATE daily_plans SET updated_at = ?, updated_by = ?, version = ? WHERE id = ? AND version = ?')
            .run(timestamp, actor.id, plan.version, plan.id, existing.version)
          database.prepare('DELETE FROM daily_plan_items WHERE plan_id = ?').run(plan.id)
        } else {
          database.prepare('INSERT INTO daily_plans (id, space_id, plan_date, created_at, created_by, updated_at, updated_by, version) VALUES (?, ?, ?, ?, ?, ?, ?, 1)')
            .run(plan.id, spaceId, date, timestamp, actor.id, timestamp, actor.id)
        }
        taskIds.forEach((taskId, index) => {
          database.prepare('INSERT INTO daily_plan_items (id, space_id, plan_id, task_id, sort_order, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)')
            .run(newId(), spaceId, plan.id, taskId, index, timestamp, actor.id)
        })
        appendAudit({ spaceId, actor, action: existing ? 'daily_plan.update' : 'daily_plan.create', objectType: 'daily_plan', objectId: plan.id, requestId, changed: ['task_ids'] })
        appendOutbox({ spaceId, aggregate: { ...plan, status: 'saved' }, aggregateType: 'daily_plan', eventType: existing ? 'daily_plan.updated' : 'daily_plan.created' })
        return { ...plan, task_ids: taskIds }
      },
    })
  }

  function saveDailyReview(session, { spaceId, date, input }, { expectedVersion = null, idempotencyKey, requestId }) {
    const actor = actorForSession(session)
    return executeIdempotent({
      actor,
      commandScope: `daily_review.save:${spaceId}:${date}`,
      key: idempotencyKey,
      request: { expectedVersion, input },
      operation() {
        visibleSpace(actor, spaceId)
        const existing = database.prepare('SELECT * FROM daily_reviews WHERE space_id = ? AND review_date = ?').get(spaceId, date)
        if ((existing && existing.version !== expectedVersion) || (!existing && expectedVersion != null)) {
          throw publicError(ERROR_CODES.VERSION_CONFLICT, '日终复盘已被修改，请刷新后重试。', { statusCode: 409 })
        }
        const timestamp = isoNow(now)
        const review = existing
          ? { ...existing, ...input, updated_at: timestamp, updated_by: actor.id, version: existing.version + 1 }
          : { id: newId(), space_id: spaceId, review_date: date, ...input, created_at: timestamp, created_by: actor.id, updated_at: timestamp, updated_by: actor.id, version: 1 }
        if (existing) {
          database.prepare(`UPDATE daily_reviews SET summary = ?, wins = ?, blockers = ?, next_focus = ?, updated_at = ?, updated_by = ?, version = ? WHERE id = ? AND version = ?`)
            .run(review.summary, review.wins, review.blockers, review.next_focus, timestamp, actor.id, review.version, review.id, existing.version)
        } else {
          database.prepare(`INSERT INTO daily_reviews (id, space_id, review_date, summary, wins, blockers, next_focus, created_at, created_by, updated_at, updated_by, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`)
            .run(review.id, spaceId, date, review.summary, review.wins, review.blockers, review.next_focus, timestamp, actor.id, timestamp, actor.id)
        }
        appendAudit({ spaceId, actor, action: existing ? 'daily_review.update' : 'daily_review.create', objectType: 'daily_review', objectId: review.id, requestId, changed: ['blockers', 'next_focus', 'summary', 'wins'] })
        appendOutbox({ spaceId, aggregate: { ...review, status: 'saved' }, aggregateType: 'daily_review', eventType: existing ? 'daily_review.updated' : 'daily_review.created' })
        return review
      },
    })
  }

  return {
    convertDiscussion,
    createDiscussion,
    createDiscussionEntry,
    createCapture,
    createProject,
    createMilestone,
    createTask,
    deleteMilestone,
    deleteProject,
    deleteTask,
    getProject,
    getDailySnapshot,
    getSpace,
    getTask,
    identity,
    kernel: Object.freeze({
      actorForSession,
      appendAudit,
      appendOutbox,
      executeIdempotent,
      newId,
      nowIso: () => isoNow(now),
      requireProject,
      visibleSpace,
    }),
    listProjects,
    listDecisions,
    listDiscussionEntries,
    listDiscussions,
    listCaptures,
    listSpaces,
    listMilestones,
    listTasks,
    restoreProject,
    saveDailyPlan,
    saveDailyReview,
    transitionProject,
    transitionTask,
    transitionCapture,
    updateMilestone,
    updateProject,
    updateTask,
  }
}
