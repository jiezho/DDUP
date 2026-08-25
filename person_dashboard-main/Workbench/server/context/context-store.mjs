import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'

import remarkParse from 'remark-parse'
import { unified } from 'unified'

import { ERROR_CODES, publicError } from '../../shared/contracts/errors.mjs'

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

function findMatch(title, body, query) {
  const candidates = [query, ...query.split(/\s+/u)].filter(Boolean)
  for (const candidate of candidates) {
    const needle = candidate.toLocaleLowerCase('zh-CN')
    const titleAt = title.toLocaleLowerCase('zh-CN').indexOf(needle)
    if (titleAt >= 0) return { field: 'title', start: titleAt, end: titleAt + candidate.length, quote: title }
    const bodyAt = body.toLocaleLowerCase('zh-CN').indexOf(needle)
    if (bodyAt >= 0) {
      const start = Math.max(0, bodyAt - 70)
      const end = Math.min(body.length, bodyAt + candidate.length + 110)
      const prefix = start > 0 ? '…' : ''
      const suffix = end < body.length ? '…' : ''
      return { field: 'body', start: bodyAt, end: bodyAt + candidate.length, quote: `${prefix}${body.slice(start, end).replace(/\s+/g, ' ')}${suffix}` }
    }
  }
  return { field: 'body', start: 0, end: 0, quote: body.slice(0, 180).replace(/\s+/g, ' ') }
}

export function createContextStore({ database, kernel, sourceRoot } = {}) {
  if (!database) throw new TypeError('database is required')
  if (!kernel) throw new TypeError('kernel is required')
  if (typeof sourceRoot !== 'string' || !sourceRoot) throw new TypeError('sourceRoot is required')

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

  function search(session, { space_id: spaceId, project_id: projectId, q, types, from, to, limit }) {
    const actor = kernel.actorForSession(session)
    kernel.visibleSpace(actor, spaceId)
    if (projectId) {
      const project = kernel.requireProject(actor, projectId)
      if (project.space_id !== spaceId) throw publicError(ERROR_CODES.OBJECT_NOT_AVAILABLE, '请求的资源不可用。', { statusCode: 404 })
    }
    const typePlaceholders = types.map(() => '?').join(', ')
    const fromTime = from ? `${from}T00:00:00.000Z` : null
    const toTime = to ? `${to}T23:59:59.999Z` : null
    const useFts = [...q].length >= 3
    const matchClause = useFts ? 'context_search MATCH ?' : '(title LIKE ? ESCAPE \'\\\' OR body LIKE ? ESCAPE \'\\\')'
    const escapedLike = `%${q.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`
    const matchParams = useFts ? [quotedFtsQuery(q)] : [escapedLike, escapedLike]
    const rows = database.prepare(`
      SELECT object_type, object_id, space_id, project_id, title, body, source_version_id, updated_at,
             ${useFts ? 'bm25(context_search)' : 'NULL'} AS rank
      FROM context_search
      WHERE ${matchClause}
        AND space_id = ?
        AND (? IS NULL OR project_id = ?)
        AND object_type IN (${typePlaceholders})
        AND (? IS NULL OR updated_at >= ?)
        AND (? IS NULL OR updated_at <= ?)
      ORDER BY ${useFts ? 'rank ASC,' : ''} updated_at DESC, object_id
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

  return { importMarkdown, listSources, search }
}
