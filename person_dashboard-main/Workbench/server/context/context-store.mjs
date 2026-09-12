import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'

import remarkParse from 'remark-parse'
import { unified } from 'unified'

import { ERROR_CODES, publicError } from '../../shared/contracts/errors.mjs'
import { chunkDocumentBody } from './document-chunker.mjs'

const SOURCE_COLUMNS = `
  s.id, s.space_id, s.project_id, s.kind, s.title, s.status,
  s.current_version_number, s.created_at, s.updated_at, s.version,
  v.id AS source_version_id, v.content_sha256, v.media_type,
  v.original_filename, v.byte_size, v.created_at AS version_created_at,
  d.id AS document_id, d.language, d.indexed_at
`

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

function normalizeMarkdown(value) {
  return value.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim()
}

function searchableText(node) {
  if (!node || typeof node !== 'object') return ''
  if (['text', 'inlineCode', 'code'].includes(node.type)) return String(node.value ?? '')
  if (node.type === 'image') return String(node.alt ?? '')
  if (!Array.isArray(node.children)) return ''
  const separator = ['root', 'paragraph', 'heading', 'list', 'listItem', 'blockquote', 'table', 'tableRow'].includes(node.type) ? '\n' : ' '
  return node.children.map(searchableText).filter(Boolean).join(separator)
}

function markdownProjection(markdown) {
  const tree = unified().use(remarkParse).parse(markdown)
  const heading = tree.children.find((node) => node.type === 'heading' && node.depth === 1)
  const plainText = searchableText(tree).replace(/[\t ]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
  return { heading: heading ? searchableText(heading).replace(/\s+/g, ' ').trim() : '', plainText }
}

function filenameTitle(filename) {
  return filename.replace(/\.(md|markdown)$/i, '').trim()
}

function detectLanguage(text) {
  const cjk = /[\u3400-\u9fff]/.test(text)
  const latin = /[A-Za-z]/.test(text)
  if (cjk && latin) return 'mixed'
  if (cjk) return 'zh'
  if (latin) return 'en'
  return 'und'
}

function safeBlobPath(sourceRoot, digest) {
  const absolute = join(sourceRoot, 'blobs', 'sha256', digest.slice(0, 2), `${digest}.md`)
  const root = sourceRoot.endsWith(sep) ? sourceRoot : `${sourceRoot}${sep}`
  if (!absolute.startsWith(root)) throw new Error('computed source path escaped the controlled root')
  return absolute
}

function ensureBlob(sourceRoot, digest, bytes) {
  const absolute = safeBlobPath(sourceRoot, digest)
  mkdirSync(dirname(absolute), { recursive: true })
  let created = false
  try {
    writeFileSync(absolute, bytes, { flag: 'wx', mode: 0o600 })
    created = true
  } catch (error) {
    if (error?.code !== 'EEXIST') {
      throw publicError(ERROR_CODES.INTERNAL_ERROR, '来源文件暂时无法安全保存。', { statusCode: 500, retryable: true, cause: error })
    }
    const existing = readFileSync(absolute)
    if (sha256(existing) !== digest) {
      throw publicError(ERROR_CODES.INTERNAL_ERROR, '来源存储完整性校验失败。', { statusCode: 500 })
    }
  }
  return { absolute, created, storageRef: relative(sourceRoot, absolute).split(sep).join('/') }
}

function sourceFromRow(row) {
  return row ? { ...row } : null
}

function quotedFtsQuery(query) {
  return query
    .split(/\s+/u)
    .filter(Boolean)
    .map((term) => `"${term.replaceAll('"', '""')}"`)
    .join(' AND ')
}

function boundedEvidenceRange(body, matchStart, matchEnd, maxLength = 600) {
  const hardStart = Math.max(0, matchEnd - maxLength)
  const hardEnd = Math.min(body.length, matchStart + maxLength)
  const before = body.slice(hardStart, matchStart)
  const after = body.slice(matchEnd, hardEnd)
  const leftBoundary = Math.max(
    before.lastIndexOf('\n'),
    before.lastIndexOf('。'),
    before.lastIndexOf('！'),
    before.lastIndexOf('？'),
    before.lastIndexOf('. '),
    before.lastIndexOf('! '),
    before.lastIndexOf('? '),
  )
  const rightCandidates = [
    after.indexOf('\n'),
    after.indexOf('。'),
    after.indexOf('！'),
    after.indexOf('？'),
    after.indexOf('. '),
    after.indexOf('! '),
    after.indexOf('? '),
  ].filter((value) => value >= 0)
  let start = leftBoundary >= 0 ? hardStart + leftBoundary + 1 : hardStart
  let end = rightCandidates.length ? matchEnd + Math.min(...rightCandidates) + 1 : hardEnd
  while (start < matchStart && /\s/u.test(body[start])) start += 1
  while (end > matchEnd && /\s/u.test(body[end - 1])) end -= 1
  return { start, end }
}

function findMatch(title, body, query) {
  const candidates = [query, ...query.split(/\s+/u)].filter(Boolean)
  for (const candidate of candidates) {
    const needle = candidate.toLocaleLowerCase('zh-CN')
    const titleAt = title.toLocaleLowerCase('zh-CN').indexOf(needle)
    if (titleAt >= 0) return { field: 'title', start: titleAt, end: titleAt + candidate.length, quote: title }
    const bodyAt = body.toLocaleLowerCase('zh-CN').indexOf(needle)
    if (bodyAt >= 0) {
      const evidence = boundedEvidenceRange(body, bodyAt, bodyAt + candidate.length)
      const start = Math.max(0, evidence.start - 70)
      const end = Math.min(body.length, evidence.end + 110)
      const prefix = start > 0 ? '…' : ''
      const suffix = end < body.length ? '…' : ''
      return {
        field: 'body', start: evidence.start, end: evidence.end,
        quote: `${prefix}${body.slice(start, end).replace(/\s+/g, ' ')}${suffix}`,
      }
    }
  }
  return { field: 'body', start: 0, end: 0, quote: body.slice(0, 180).replace(/\s+/g, ' ') }
}

export function createContextStore({ database, kernel, sourceRoot } = {}) {
  if (!database) throw new TypeError('database is required')
  if (!kernel) throw new TypeError('kernel is required')
  if (typeof sourceRoot !== 'string' || !sourceRoot) throw new TypeError('sourceRoot is required')

  function authorizeSearch(session, { space_id: spaceId, project_id: projectId }) {
    const actor = kernel.actorForSession(session)
    kernel.visibleSpace(actor, spaceId)
    if (projectId) {
      const project = kernel.requireProject(actor, projectId)
      if (project.space_id !== spaceId) throw publicError(ERROR_CODES.OBJECT_NOT_AVAILABLE, '请求的资源不可用。', { statusCode: 404 })
    }
    return actor
  }

  function existingByDigest(spaceId, projectId, digest) {
    return database.prepare(`
      SELECT ${SOURCE_COLUMNS}
      FROM source_versions v
      JOIN sources s ON s.id = v.source_id AND s.space_id = v.space_id
      JOIN documents d ON d.source_version_id = v.id AND d.space_id = v.space_id
      WHERE v.space_id = ? AND COALESCE(v.project_id, '') = COALESCE(?, '')
        AND v.content_sha256 = ? AND v.status = 'ready' AND s.deleted_at IS NULL AND d.deleted_at IS NULL
      LIMIT 1
    `).get(spaceId, projectId, digest)
  }

  function importMarkdown(session, input, { idempotencyKey, requestId } = {}) {
    const actor = kernel.actorForSession(session)
    kernel.visibleSpace(actor, input.space_id)
    if (input.project_id) {
      const project = kernel.requireProject(actor, input.project_id)
      if (project.space_id !== input.space_id) {
        throw publicError(ERROR_CODES.OBJECT_NOT_AVAILABLE, '请求的资源不可用。', { statusCode: 404 })
      }
    }

    const markdown = normalizeMarkdown(input.content)
    const bytes = Buffer.from(markdown, 'utf8')
    if (!markdown || bytes.byteLength > 1_048_576) {
      throw publicError(ERROR_CODES.VALIDATION_FAILED, 'Markdown 文件必须包含内容且不超过 1 MiB。', { statusCode: 422, field: 'content' })
    }
    const projection = markdownProjection(markdown)
    if (!projection.plainText) {
      throw publicError(ERROR_CODES.VALIDATION_FAILED, 'Markdown 未包含可检索正文。', { statusCode: 422, field: 'content' })
    }
    const digest = sha256(bytes)
    const title = (input.title || projection.heading || filenameTitle(input.filename)).trim()
    if (!title || title.length > 200) {
      throw publicError(ERROR_CODES.VALIDATION_FAILED, '无法确定来源标题。', { statusCode: 422, field: 'title' })
    }

    return kernel.executeIdempotent({
      actor,
      commandScope: 'source.import_markdown',
      key: idempotencyKey,
      request: { ...input, content_sha256: digest, content: undefined },
      statusCode: 201,
      prepare: () => ensureBlob(sourceRoot, digest, bytes),
      cleanup: (prepared) => {
        if (!prepared?.created) return
        const referenced = database.prepare('SELECT 1 FROM source_versions WHERE content_sha256 = ? LIMIT 1').get(digest)
        if (!referenced) unlinkSync(prepared.absolute)
      },
      operation: (prepared) => {
        const storageRef = prepared.storageRef
        const duplicate = existingByDigest(input.space_id, input.project_id, digest)
        if (duplicate) return { source: sourceFromRow(duplicate), deduplicated: true }

        const timestamp = kernel.nowIso()
        const source = {
          id: kernel.newId(), space_id: input.space_id, project_id: input.project_id,
          kind: 'markdown_upload', title, status: 'ready', current_version_number: 1,
          created_at: timestamp, created_by: actor.id, updated_at: timestamp, updated_by: actor.id, version: 1,
        }
        const sourceVersion = {
          id: kernel.newId(), source_id: source.id, space_id: source.space_id, project_id: source.project_id,
          version_number: 1, content_sha256: digest, media_type: 'text/markdown', original_filename: input.filename,
          byte_size: bytes.byteLength, storage_ref: storageRef, status: 'ready', created_at: timestamp, created_by: actor.id,
        }
        const document = {
          id: kernel.newId(), space_id: source.space_id, project_id: source.project_id, source_id: source.id,
          source_version_id: sourceVersion.id, title, body_text: projection.plainText, content_sha256: digest,
          language: detectLanguage(projection.plainText), indexed_at: timestamp, created_at: timestamp,
          created_by: actor.id, updated_at: timestamp, updated_by: actor.id, version: 1,
        }
        database.prepare(`INSERT INTO sources (id, space_id, project_id, kind, title, status, current_version_number, created_at, created_by, updated_at, updated_by, version, deleted_at, deleted_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)`)
          .run(source.id, source.space_id, source.project_id, source.kind, source.title, source.status, source.current_version_number, source.created_at, source.created_by, source.updated_at, source.updated_by, source.version)
        database.prepare(`INSERT INTO source_versions (id, space_id, project_id, source_id, version_number, content_sha256, media_type, original_filename, byte_size, storage_ref, status, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(sourceVersion.id, sourceVersion.space_id, sourceVersion.project_id, sourceVersion.source_id, sourceVersion.version_number, sourceVersion.content_sha256, sourceVersion.media_type, sourceVersion.original_filename, sourceVersion.byte_size, sourceVersion.storage_ref, sourceVersion.status, sourceVersion.created_at, sourceVersion.created_by)
        database.prepare(`INSERT INTO documents (id, space_id, project_id, source_id, source_version_id, title, body_text, content_sha256, language, indexed_at, created_at, created_by, updated_at, updated_by, version, deleted_at, deleted_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NULL, NULL)`)
          .run(document.id, document.space_id, document.project_id, document.source_id, document.source_version_id, document.title, document.body_text, document.content_sha256, document.language, document.indexed_at, document.created_at, document.created_by, document.updated_at, document.updated_by)
        kernel.appendAudit({ spaceId: source.space_id, actor, action: 'source.import', objectType: 'source', objectId: source.id, requestId, changed: ['content_sha256', 'kind', 'project_id', 'title'] })
        kernel.appendOutbox({ spaceId: source.space_id, aggregate: source, aggregateType: 'source', eventType: 'source.imported' })
        return { source: sourceFromRow({ ...source, source_version_id: sourceVersion.id, content_sha256: digest, media_type: sourceVersion.media_type, original_filename: sourceVersion.original_filename, byte_size: sourceVersion.byte_size, version_created_at: timestamp, document_id: document.id, language: document.language, indexed_at: document.indexed_at }), deduplicated: false }
      },
    })
  }

  function listSources(session, { space_id: spaceId, project_id: projectId, status, limit }) {
    const actor = kernel.actorForSession(session)
    kernel.visibleSpace(actor, spaceId)
    if (projectId) {
      const project = kernel.requireProject(actor, projectId)
      if (project.space_id !== spaceId) throw publicError(ERROR_CODES.OBJECT_NOT_AVAILABLE, '请求的资源不可用。', { statusCode: 404 })
    }
    const rows = database.prepare(`
      SELECT ${SOURCE_COLUMNS}
      FROM sources s
      JOIN source_versions v ON v.source_id = s.id AND v.space_id = s.space_id AND v.version_number = s.current_version_number
      JOIN documents d ON d.source_version_id = v.id AND d.space_id = v.space_id
      WHERE s.space_id = ? AND s.status = ? AND s.deleted_at IS NULL
        AND (? IS NULL OR s.project_id = ?)
      ORDER BY s.updated_at DESC, s.id DESC
      LIMIT ?
    `).all(spaceId, status, projectId ?? null, projectId ?? null, limit)
    return rows.map(sourceFromRow)
  }

  function requireSource(actor, sourceId, spaceId, { includeArchived = false } = {}) {
    kernel.visibleSpace(actor, spaceId)
    const row = database.prepare(`
      SELECT ${SOURCE_COLUMNS}
      FROM sources s
      JOIN source_versions v ON v.source_id = s.id AND v.space_id = s.space_id AND v.version_number = s.current_version_number
      JOIN documents d ON d.source_id = s.id AND d.space_id = s.space_id
      WHERE s.id = ? AND s.space_id = ? AND s.deleted_at IS NULL
        ${includeArchived ? '' : "AND s.status = 'ready' AND d.deleted_at IS NULL"}
      LIMIT 1
    `).get(sourceId, spaceId)
    if (!row) throw publicError(ERROR_CODES.OBJECT_NOT_AVAILABLE, '请求的资源不可用。', { statusCode: 404 })
    return row
  }

  function updateMarkdown(session, sourceId, input, { expectedVersion, idempotencyKey, requestId } = {}) {
    const actor = kernel.actorForSession(session)
    const markdown = normalizeMarkdown(input.content)
    const bytes = Buffer.from(markdown, 'utf8')
    if (!markdown || bytes.byteLength > 1_048_576) {
      throw publicError(ERROR_CODES.VALIDATION_FAILED, 'Markdown 文件必须包含内容且不超过 1 MiB。', { statusCode: 422, field: 'content' })
    }
    const projection = markdownProjection(markdown)
    if (!projection.plainText) throw publicError(ERROR_CODES.VALIDATION_FAILED, 'Markdown 未包含可检索正文。', { statusCode: 422, field: 'content' })
    const contentSha256 = sha256(bytes)
    return kernel.executeIdempotent({
      actor,
      commandScope: `source.update:${sourceId}`,
      key: idempotencyKey,
      request: { ...input, content: undefined, content_sha256: contentSha256, expected_version: expectedVersion },
      statusCode: 201,
      prepare: () => ensureBlob(sourceRoot, contentSha256, bytes),
      cleanup: (prepared) => {
        if (!prepared?.created) return
        const referenced = database.prepare('SELECT 1 FROM source_versions WHERE content_sha256 = ? LIMIT 1').get(contentSha256)
        if (!referenced) unlinkSync(prepared.absolute)
      },
      operation: (prepared) => {
        const current = requireSource(actor, sourceId, input.space_id)
        if (current.version !== expectedVersion) throw publicError(ERROR_CODES.VERSION_CONFLICT, '来源已更新，请刷新后重试。', { statusCode: 409 })
        if (current.content_sha256 === contentSha256) return { source: sourceFromRow(current), deduplicated: true }
        const duplicate = existingByDigest(current.space_id, current.project_id, contentSha256)
        if (duplicate) throw publicError(ERROR_CODES.RELATION_CONFLICT, '相同内容已由当前项目中的其他来源持有。', { statusCode: 409 })
        const title = (input.title || projection.heading || current.title).trim()
        const timestamp = kernel.nowIso()
        const nextVersion = current.current_version_number + 1
        const sourceVersionId = kernel.newId()
        database.prepare(`
          INSERT INTO source_versions (
            id, space_id, project_id, source_id, version_number, content_sha256, media_type,
            original_filename, byte_size, storage_ref, status, created_at, created_by
          ) VALUES (?, ?, ?, ?, ?, ?, 'text/markdown', ?, ?, ?, 'ready', ?, ?)
        `).run(
          sourceVersionId, current.space_id, current.project_id, current.id, nextVersion,
          contentSha256, input.filename, bytes.byteLength, prepared.storageRef, timestamp, actor.id,
        )
        database.prepare(`
          UPDATE sources SET title = ?, current_version_number = ?, updated_at = ?, updated_by = ?, version = version + 1
          WHERE id = ? AND space_id = ? AND version = ? AND status = 'ready' AND deleted_at IS NULL
        `).run(title, nextVersion, timestamp, actor.id, current.id, current.space_id, current.version)
        database.prepare(`
          UPDATE documents SET source_version_id = ?, title = ?, body_text = ?, content_sha256 = ?, language = ?,
            indexed_at = ?, updated_at = ?, updated_by = ?, version = version + 1
          WHERE id = ? AND space_id = ? AND source_id = ? AND deleted_at IS NULL
        `).run(
          sourceVersionId, title, projection.plainText, contentSha256, detectLanguage(projection.plainText),
          timestamp, timestamp, actor.id, current.document_id, current.space_id, current.id,
        )
        kernel.appendAudit({ spaceId: current.space_id, actor, action: 'source.version.create', objectType: 'source', objectId: current.id, requestId, changed: ['content_sha256', 'current_version_number', 'title', 'version'] })
        kernel.appendOutbox({ spaceId: current.space_id, aggregate: { id: current.id, version: current.version + 1 }, aggregateType: 'source', eventType: 'source.updated' })
        return {
          source: sourceFromRow(requireSource(actor, sourceId, input.space_id)),
          deduplicated: false,
        }
      },
    })
  }

  function transitionSource(session, sourceId, input, { expectedVersion, idempotencyKey, requestId } = {}) {
    const actor = kernel.actorForSession(session)
    return kernel.executeIdempotent({
      actor,
      commandScope: `source.${input.action}:${sourceId}`,
      key: idempotencyKey,
      request: { source_id: sourceId, expected_version: expectedVersion, ...input },
      operation: () => {
        const current = requireSource(actor, sourceId, input.space_id, { includeArchived: true })
        if (current.version !== expectedVersion) throw publicError(ERROR_CODES.VERSION_CONFLICT, '来源已更新，请刷新后重试。', { statusCode: 409 })
        const targetStatus = input.action === 'archive' ? 'archived' : 'ready'
        if (current.status === targetStatus) return sourceFromRow(current)
        if (!['ready', 'archived'].includes(current.status)) throw publicError(ERROR_CODES.INVALID_STATE_TRANSITION, '当前来源状态不能执行该操作。', { statusCode: 409 })
        const timestamp = kernel.nowIso()
        database.prepare(`UPDATE sources SET status = ?, updated_at = ?, updated_by = ?, version = version + 1 WHERE id = ? AND space_id = ? AND version = ?`)
          .run(targetStatus, timestamp, actor.id, current.id, current.space_id, current.version)
        database.prepare(`UPDATE documents SET deleted_at = ?, deleted_by = ?, updated_at = ?, updated_by = ?, version = version + 1 WHERE source_id = ? AND space_id = ?`)
          .run(targetStatus === 'archived' ? timestamp : null, targetStatus === 'archived' ? actor.id : null, timestamp, actor.id, current.id, current.space_id)
        kernel.appendAudit({ spaceId: current.space_id, actor, action: `source.${input.action}`, objectType: 'source', objectId: current.id, requestId, changed: ['status', 'version'] })
        kernel.appendOutbox({ spaceId: current.space_id, aggregate: { id: current.id, version: current.version + 1 }, aggregateType: 'source', eventType: `source.${input.action}d` })
        return sourceFromRow(requireSource(actor, sourceId, input.space_id, { includeArchived: true }))
      },
    })
  }

  function readSourceRange(session, sourceId, query) {
    const actor = kernel.actorForSession(session)
    const source = requireSource(actor, sourceId, query.space_id)
    if (source.source_version_id !== query.source_version_id) {
      throw publicError(ERROR_CODES.RELATION_CONFLICT, '来源版本已变化，请从最新检索结果重新定位。', { statusCode: 409 })
    }
    const row = database.prepare('SELECT body_text FROM documents WHERE id = ? AND space_id = ? AND deleted_at IS NULL').get(source.document_id, source.space_id)
    if (!row || query.end_char > row.body_text.length) throw publicError(ERROR_CODES.RELATION_CONFLICT, '原文定位范围已失效。', { statusCode: 409 })
    const text = row.body_text.slice(query.start_char, query.end_char)
    return {
      source_id: source.id,
      source_version_id: source.source_version_id,
      document_id: source.document_id,
      locator_type: 'char_range',
      start_char: query.start_char,
      end_char: query.end_char,
      text,
      text_sha256: sha256(text),
    }
  }

  function search(session, { space_id: spaceId, project_id: projectId, q, types, from, to, limit }) {
    authorizeSearch(session, { space_id: spaceId, project_id: projectId })
    const typePlaceholders = types.map(() => '?').join(', ')
    const fromTime = from ? `${from}T00:00:00.000Z` : null
    const toTime = to ? `${to}T23:59:59.999Z` : null
    const useFts = [...q].length >= 3
    const matchClause = useFts ? 'context_search MATCH ?' : '(context_search.title LIKE ? ESCAPE \'\\\' OR context_search.body LIKE ? ESCAPE \'\\\')'
    const escapedLike = `%${q.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`
    const matchParams = useFts ? [quotedFtsQuery(q)] : [escapedLike, escapedLike]
    const rows = database.prepare(`
      SELECT context_search.object_type, context_search.object_id, context_search.space_id,
             context_search.project_id, context_search.title, context_search.body,
             context_search.source_version_id, context_search.updated_at,
             d.source_id AS source_id, d.id AS document_id,
             ${useFts ? 'bm25(context_search)' : 'NULL'} AS rank
      FROM context_search
      LEFT JOIN documents d
        ON context_search.object_type = 'document'
        AND d.id = context_search.object_id
        AND d.space_id = context_search.space_id
        AND d.deleted_at IS NULL
      WHERE ${matchClause}
        AND context_search.space_id = ?
        AND (? IS NULL OR context_search.project_id = ?)
        AND context_search.object_type IN (${typePlaceholders})
        AND (? IS NULL OR context_search.updated_at >= ?)
        AND (? IS NULL OR context_search.updated_at <= ?)
      ORDER BY ${useFts ? 'rank ASC,' : ''} context_search.updated_at DESC, context_search.object_id
      LIMIT ?
    `).all(...matchParams, spaceId, projectId ?? null, projectId ?? null, ...types, fromTime, fromTime, toTime, toTime, limit)
    const items = rows.map((row) => {
      const match = findMatch(row.title, row.body || '', q)
      return {
        object_type: row.object_type,
        object_id: row.object_id,
        space_id: row.space_id,
        project_id: row.project_id,
        title: row.title,
        updated_at: row.updated_at,
        score: row.rank == null ? null : Number(row.rank),
        excerpt: match.quote,
        source_id: row.source_id ?? null,
        document_id: row.document_id ?? null,
        match: { field: match.field, strategy: useFts ? 'fts5_trigram' : 'bounded_like' },
        locator: row.object_type === 'document'
          ? { type: 'char_range', source_version_id: row.source_version_id, start: match.start, end: match.end, quote: match.quote }
          : { type: 'object' },
      }
    })
    return {
      items,
      scope: {
        applied: { space_id: spaceId, project_id: projectId ?? null, types, from: from ?? null, to: to ?? null },
        omitted: [],
        reason: '仅在会话授权空间内检索；过滤在正文返回前执行。',
      },
      baseline: { engine: useFts ? 'sqlite_fts5_trigram' : 'sqlite_bounded_like', semantic: false, reranked: false },
    }
  }

  function listAuthorizedDenseCorpus(session, { space_id: spaceId, project_id: projectId, types, from, to }, { limit = 200 } = {}) {
    authorizeSearch(session, { space_id: spaceId, project_id: projectId })
    if (!types.includes('document')) return []
    const fromTime = from ? `${from}T00:00:00.000Z` : null
    const toTime = to ? `${to}T23:59:59.999Z` : null
    const safeLimit = Math.min(Math.max(Number(limit) || 1, 1), 200)
    const rows = database.prepare(`
      SELECT d.id, d.space_id, d.project_id, d.source_id, d.source_version_id,
             d.title, d.body_text, d.updated_at
      FROM documents d
      WHERE d.space_id = ? AND d.deleted_at IS NULL
        AND (? IS NULL OR d.project_id = ?)
        AND (? IS NULL OR d.updated_at >= ?)
        AND (? IS NULL OR d.updated_at <= ?)
      ORDER BY d.updated_at DESC, d.id
      LIMIT ?
    `).all(spaceId, projectId ?? null, projectId ?? null, fromTime, fromTime, toTime, toTime, safeLimit)
    const corpus = []
    for (const row of rows) {
      const chunks = chunkDocumentBody({
        body: row.body_text,
        spaceId: row.space_id,
        projectId: row.project_id,
        sourceId: row.source_id,
        sourceVersionId: row.source_version_id,
        documentId: row.id,
      })
      for (const chunk of chunks) {
        corpus.push({
          candidate_id: chunk.chunk_id,
          object_type: 'document',
          object_id: row.id,
          space_id: row.space_id,
          project_id: row.project_id,
          source_id: row.source_id,
          source_version_id: row.source_version_id,
          document_id: row.id,
          title: row.title,
          updated_at: row.updated_at,
          snippet: chunk.text,
          locator: { type: 'char_range', start_char: chunk.start_char, end_char: chunk.end_char },
          embedding_text: `${row.title}\n${chunk.text}`,
          text_sha256: chunk.text_sha256,
          chunker_version: chunk.chunker_version,
        })
        if (corpus.length >= safeLimit) return corpus
      }
    }
    return corpus
  }

  return {
    authorizeSearch, importMarkdown, listAuthorizedDenseCorpus, listSources, readSourceRange,
    search, transitionSource, updateMarkdown,
  }
}
