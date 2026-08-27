import { ERROR_CODES, publicError } from '../../shared/contracts/errors.mjs'

const PACKAGE_COLUMNS = `
  id, space_id, name, purpose, status, expires_at,
  created_at, created_by, updated_at, updated_by, version
`

function effectiveStatus(row, nowIso) {
  if (row.status === 'archived') return 'archived'
  return row.expires_at && row.expires_at <= nowIso ? 'expired' : 'active'
}

function packageFromRow(row, nowIso) {
  return row ? { ...row, effective_status: effectiveStatus(row, nowIso) } : null
}

export function createContextPackageStore({ database, kernel } = {}) {
  if (!database) throw new TypeError('database is required')
  if (!kernel) throw new TypeError('kernel is required')

  function requirePackage(actor, packageId, spaceId) {
    kernel.visibleSpace(actor, spaceId)
    const row = database.prepare(`
      SELECT ${PACKAGE_COLUMNS}
      FROM context_packages
      WHERE id = ? AND space_id = ? AND deleted_at IS NULL
    `).get(packageId, spaceId)
    if (!row) throw publicError(ERROR_CODES.OBJECT_NOT_AVAILABLE, '请求的资源不可用。', { statusCode: 404 })
    return packageFromRow(row, kernel.nowIso())
  }

  function assertMutable(item, expectedVersion) {
    if (item.effective_status !== 'active') {
      throw publicError(ERROR_CODES.INVALID_STATE_TRANSITION, '当前上下文篮已过期或归档。', { statusCode: 409 })
    }
    if (item.version !== expectedVersion) {
      throw publicError(ERROR_CODES.VERSION_CONFLICT, '上下文篮已被其他操作更新，请刷新后重试。', { statusCode: 409 })
    }
  }

  function resolveObject(actor, spaceId, input) {
    kernel.visibleSpace(actor, spaceId)
    if (input.object_type === 'project') {
      const row = kernel.requireProject(actor, input.object_id)
      if (row.space_id !== spaceId) throw publicError(ERROR_CODES.OBJECT_NOT_AVAILABLE, '请求的资源不可用。', { statusCode: 404 })
      return { project_id: row.id, title: row.name, locator: { type: 'object' } }
    }
    const table = input.object_type === 'task' ? 'tasks' : input.object_type === 'capture' ? 'captures' : 'documents'
    const row = database.prepare(`SELECT * FROM ${table} WHERE id = ? AND space_id = ? AND deleted_at IS NULL`).get(input.object_id, spaceId)
    if (!row) throw publicError(ERROR_CODES.OBJECT_NOT_AVAILABLE, '请求的资源不可用。', { statusCode: 404 })
    if (input.object_type !== 'document') {
      return { project_id: row.project_id ?? null, title: row.title, locator: { type: 'object' } }
    }
    if (row.source_version_id !== input.source_version_id || input.end_char > row.body_text.length) {
      throw publicError(ERROR_CODES.RELATION_CONFLICT, '文档版本或字符范围已变化，请重新检索后加入。', { statusCode: 409 })
    }
    return {
      project_id: row.project_id ?? null,
      title: row.title,
      locator: {
        type: 'char_range',
        source_version_id: row.source_version_id,
        start: input.start_char,
        end: input.end_char,
        quote: row.body_text.slice(input.start_char, input.end_char),
      },
    }
  }

  function resolveStoredItem(actor, packageItem, packageStatus) {
    if (packageStatus !== 'active') {
      return { ...packageItem, included: false, exclusion_reason: `package_${packageStatus}`, title: null, project_id: null, locator: null }
    }
    try {
      const resolved = resolveObject(actor, packageItem.space_id, packageItem)
      return { ...packageItem, ...resolved, included: true, exclusion_reason: null }
    } catch (error) {
      if (![ERROR_CODES.OBJECT_NOT_AVAILABLE, ERROR_CODES.RELATION_CONFLICT].includes(error?.code)) throw error
      return { ...packageItem, included: false, exclusion_reason: error.code === ERROR_CODES.RELATION_CONFLICT ? 'source_version_changed' : 'object_unavailable', title: null, project_id: null, locator: null }
    }
  }

  function createPackage(session, input, { idempotencyKey, requestId } = {}) {
    const actor = kernel.actorForSession(session)
    kernel.visibleSpace(actor, input.space_id)
    const expiresAt = input.expires_at ? new Date(input.expires_at).toISOString() : null
    if (expiresAt && expiresAt <= kernel.nowIso()) {
      throw publicError(ERROR_CODES.VALIDATION_FAILED, '有效期必须晚于当前时间。', { statusCode: 422, field: 'expires_at' })
    }
    return kernel.executeIdempotent({
      actor,
      commandScope: 'context_package.create',
      key: idempotencyKey,
      request: { ...input, expires_at: expiresAt },
      statusCode: 201,
      operation: () => {
        const timestamp = kernel.nowIso()
        const item = {
          id: kernel.newId(), space_id: input.space_id, name: input.name, purpose: input.purpose,
          status: 'active', expires_at: expiresAt, created_at: timestamp, created_by: actor.id,
          updated_at: timestamp, updated_by: actor.id, version: 1,
        }
        database.prepare(`INSERT INTO context_packages (${PACKAGE_COLUMNS}, deleted_at, deleted_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)`)
          .run(item.id, item.space_id, item.name, item.purpose, item.status, item.expires_at, item.created_at, item.created_by, item.updated_at, item.updated_by, item.version)
        kernel.appendAudit({ spaceId: item.space_id, actor, action: 'context_package.create', objectType: 'context_package', objectId: item.id, requestId, changed: ['expires_at', 'name', 'purpose'] })
        kernel.appendOutbox({ spaceId: item.space_id, aggregate: item, aggregateType: 'context_package', eventType: 'context_package.created' })
        return packageFromRow(item, timestamp)
      },
    })
  }

  function listPackages(session, { space_id: spaceId, status, limit }) {
    const actor = kernel.actorForSession(session)
    kernel.visibleSpace(actor, spaceId)
    const nowIso = kernel.nowIso()
    const rows = database.prepare(`
      SELECT ${PACKAGE_COLUMNS},
        (SELECT count(*) FROM context_package_items i WHERE i.package_id = p.id AND i.space_id = p.space_id) AS item_count
      FROM context_packages p
      WHERE p.space_id = ? AND p.deleted_at IS NULL
        AND (
          (? = 'archived' AND p.status = 'archived')
          OR (? = 'expired' AND p.status = 'active' AND p.expires_at IS NOT NULL AND p.expires_at <= ?)
          OR (? = 'active' AND p.status = 'active' AND (p.expires_at IS NULL OR p.expires_at > ?))
        )
      ORDER BY p.updated_at DESC, p.id DESC
      LIMIT ?
    `).all(spaceId, status, status, nowIso, status, nowIso, limit)
    return rows.map((row) => packageFromRow(row, nowIso))
  }

  function getPackage(session, packageId, spaceId) {
    const actor = kernel.actorForSession(session)
    const item = requirePackage(actor, packageId, spaceId)
    const rows = database.prepare(`
      SELECT id AS item_id, package_id, space_id, object_type, object_id,
             source_version_id, start_char, end_char, added_at
      FROM context_package_items
      WHERE package_id = ? AND space_id = ?
      ORDER BY added_at, id
    `).all(packageId, spaceId)
    const items = rows.map((row) => resolveStoredItem(actor, row, item.effective_status))
    return {
      ...item,
      items,
      resolution: {
        included_count: items.filter((candidate) => candidate.included).length,
        excluded_count: items.filter((candidate) => !candidate.included).length,
        reason: item.effective_status === 'active'
          ? '只解析显式加入且当前仍可访问的对象；缺失或版本漂移项保持排除。'
          : '上下文篮已过期或归档，不向后续运行提供正文。',
      },
    }
  }

  function addItem(session, packageId, input, { expectedVersion, idempotencyKey, requestId } = {}) {
    const actor = kernel.actorForSession(session)
    kernel.visibleSpace(actor, input.space_id)
    return kernel.executeIdempotent({
      actor,
      commandScope: `context_package.item.add:${packageId}`,
      key: idempotencyKey,
      request: { packageId, expectedVersion, ...input },
      operation: () => {
        const current = requirePackage(actor, packageId, input.space_id)
        assertMutable(current, expectedVersion)
        resolveObject(actor, input.space_id, input)
        const duplicate = database.prepare(`
          SELECT id FROM context_package_items
          WHERE package_id = ? AND object_type = ? AND object_id = ?
            AND COALESCE(source_version_id, '') = COALESCE(?, '')
            AND COALESCE(start_char, -1) = COALESCE(?, -1)
            AND COALESCE(end_char, -1) = COALESCE(?, -1)
        `).get(packageId, input.object_type, input.object_id, input.source_version_id, input.start_char, input.end_char)
        if (duplicate) {
          throw publicError(ERROR_CODES.RELATION_CONFLICT, '该对象范围已在当前上下文篮中。', { statusCode: 409 })
        }
        const timestamp = kernel.nowIso()
        const itemId = kernel.newId()
        database.prepare(`
          INSERT INTO context_package_items (
            id, package_id, space_id, object_type, object_id, source_version_id,
            start_char, end_char, added_at, added_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(itemId, packageId, input.space_id, input.object_type, input.object_id, input.source_version_id, input.start_char, input.end_char, timestamp, actor.id)
        database.prepare('UPDATE context_packages SET updated_at = ?, updated_by = ?, version = version + 1 WHERE id = ? AND space_id = ?')
          .run(timestamp, actor.id, packageId, input.space_id)
        const next = requirePackage(actor, packageId, input.space_id)
        kernel.appendAudit({ spaceId: input.space_id, actor, action: 'context_package.item.add', objectType: 'context_package', objectId: packageId, requestId, changed: ['items', 'version'] })
        kernel.appendOutbox({ spaceId: input.space_id, aggregate: next, aggregateType: 'context_package', eventType: 'context_package.updated' })
        return getPackage(session, packageId, input.space_id)
      },
    })
  }

  function removeItem(session, packageId, itemId, spaceId, { expectedVersion, idempotencyKey, requestId } = {}) {
    const actor = kernel.actorForSession(session)
    kernel.visibleSpace(actor, spaceId)
    return kernel.executeIdempotent({
      actor,
      commandScope: `context_package.item.remove:${packageId}`,
      key: idempotencyKey,
      request: { packageId, itemId, spaceId, expectedVersion },
      operation: () => {
        const current = requirePackage(actor, packageId, spaceId)
        assertMutable(current, expectedVersion)
        const existing = database.prepare('SELECT id FROM context_package_items WHERE id = ? AND package_id = ? AND space_id = ?').get(itemId, packageId, spaceId)
        if (!existing) throw publicError(ERROR_CODES.OBJECT_NOT_AVAILABLE, '请求的资源不可用。', { statusCode: 404 })
        const timestamp = kernel.nowIso()
        database.prepare('DELETE FROM context_package_items WHERE id = ? AND package_id = ? AND space_id = ?').run(itemId, packageId, spaceId)
        database.prepare('UPDATE context_packages SET updated_at = ?, updated_by = ?, version = version + 1 WHERE id = ? AND space_id = ?')
          .run(timestamp, actor.id, packageId, spaceId)
        const next = requirePackage(actor, packageId, spaceId)
        kernel.appendAudit({ spaceId, actor, action: 'context_package.item.remove', objectType: 'context_package', objectId: packageId, requestId, changed: ['items', 'version'] })
        kernel.appendOutbox({ spaceId, aggregate: next, aggregateType: 'context_package', eventType: 'context_package.updated' })
        return getPackage(session, packageId, spaceId)
      },
    })
  }

  function archivePackage(session, packageId, spaceId, { expectedVersion, idempotencyKey, requestId } = {}) {
    const actor = kernel.actorForSession(session)
    kernel.visibleSpace(actor, spaceId)
    return kernel.executeIdempotent({
      actor,
      commandScope: `context_package.archive:${packageId}`,
      key: idempotencyKey,
      request: { packageId, spaceId, expectedVersion },
      operation: () => {
        const current = requirePackage(actor, packageId, spaceId)
        assertMutable(current, expectedVersion)
        const timestamp = kernel.nowIso()
        database.prepare("UPDATE context_packages SET status = 'archived', updated_at = ?, updated_by = ?, version = version + 1 WHERE id = ? AND space_id = ?")
          .run(timestamp, actor.id, packageId, spaceId)
        const next = requirePackage(actor, packageId, spaceId)
        kernel.appendAudit({ spaceId, actor, action: 'context_package.archive', objectType: 'context_package', objectId: packageId, requestId, changed: ['status', 'version'] })
        kernel.appendOutbox({ spaceId, aggregate: next, aggregateType: 'context_package', eventType: 'context_package.archived' })
        return getPackage(session, packageId, spaceId)
      },
    })
  }

  return Object.freeze({ addItem, archivePackage, createPackage, getPackage, listPackages, removeItem })
}
