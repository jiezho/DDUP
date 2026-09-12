import { createHash } from 'node:crypto'
import { cp, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { backup as sqliteBackup } from 'node:sqlite'

import { ERROR_CODES, publicError } from '../../shared/contracts/errors.mjs'

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function safeChild(root, name) {
  const target = resolve(root, name)
  const prefix = resolve(root).endsWith(sep) ? resolve(root) : `${resolve(root)}${sep}`
  if (!target.startsWith(prefix)) throw new Error('backup path escaped its controlled root')
  return target
}

async function filesUnder(root) {
  try {
    const entries = await readdir(root, { recursive: true, withFileTypes: true })
    return entries.filter((entry) => entry.isFile()).map((entry) => join(entry.parentPath, entry.name))
  } catch (error) {
    if (error?.code === 'ENOENT') return []
    throw error
  }
}

async function fileRecord(root, absolute) {
  const bytes = await readFile(absolute)
  return {
    path: relative(root, absolute).split(sep).join('/'),
    byte_size: bytes.byteLength,
    sha256: sha256(bytes),
  }
}

async function manifestFor(bundleRoot, database, createdAt, backupId) {
  const files = []
  for (const absolute of await filesUnder(bundleRoot)) {
    if (basename(absolute) === 'manifest.json') continue
    files.push(await fileRecord(bundleRoot, absolute))
  }
  files.sort((left, right) => left.path.localeCompare(right.path))
  const tableNames = ['projects', 'tasks', 'decisions', 'knowledge_items', 'captures', 'sources', 'source_versions', 'documents', 'context_packages', 'answer_attempts', 'answers', 'audit_events']
  const objectCounts = Object.fromEntries(tableNames.map((table) => [table, database.prepare(`SELECT count(*) AS count FROM ${table}`).get().count]))
  return {
    format: 'ddup-backup-v1',
    backup_id: backupId,
    created_at: createdAt,
    database: 'workbench.db',
    source_root: 'sources',
    schema_migrations: database.prepare('SELECT version, name, checksum FROM schema_migrations ORDER BY version').all().map((row) => ({ ...row })),
    object_counts: objectCounts,
    files,
  }
}

export function createBackupService({ database, databasePath, sourceStoragePath, backupRoot, kernel } = {}) {
  if (!database || !databasePath || !sourceStoragePath || !backupRoot || !kernel) throw new TypeError('backup service dependencies are required')
  let running = false

  async function verifyPath(bundleRoot) {
    const manifest = JSON.parse(await readFile(join(bundleRoot, 'manifest.json'), 'utf8'))
    if (manifest.format !== 'ddup-backup-v1' || !Array.isArray(manifest.files)) throw new Error('unsupported backup manifest')
    const failures = []
    for (const record of manifest.files) {
      const absolute = safeChild(bundleRoot, record.path)
      try {
        const bytes = await readFile(absolute)
        if (bytes.byteLength !== record.byte_size || sha256(bytes) !== record.sha256) failures.push({ path: record.path, reason: 'hash_mismatch' })
      } catch {
        failures.push({ path: record.path, reason: 'missing' })
      }
    }
    return { backup_id: manifest.backup_id, state: failures.length ? 'invalid' : 'verified', failures, manifest }
  }

  async function createBackup(session, { requestId = null, spaceId } = {}) {
    const actor = kernel.actorForSession(session)
    kernel.visibleSpace(actor, spaceId)
    if (running) throw publicError(ERROR_CODES.INVALID_STATE_TRANSITION, '已有备份正在执行。', { statusCode: 409, retryable: true })
    running = true
    const backupId = kernel.newId()
    const createdAt = kernel.nowIso()
    await mkdir(backupRoot, { recursive: true })
    const temporary = safeChild(backupRoot, `.${backupId}.tmp`)
    const destination = safeChild(backupRoot, backupId)
    try {
      await mkdir(temporary, { recursive: false })
      database.prepare('PRAGMA wal_checkpoint(FULL)').get()
      await sqliteBackup(database, join(temporary, 'workbench.db'))
      const sourceFiles = await filesUnder(sourceStoragePath)
      if (sourceFiles.length) await cp(sourceStoragePath, join(temporary, 'sources'), { recursive: true, errorOnExist: true, force: false })
      else await mkdir(join(temporary, 'sources'), { recursive: true })
      const manifest = await manifestFor(temporary, database, createdAt, backupId)
      await writeFile(join(temporary, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
      const verification = await verifyPath(temporary)
      if (verification.state !== 'verified') throw new Error('backup verification failed')
      await rename(temporary, destination)
      kernel.appendAudit({ spaceId, actor, action: 'backup.create', objectType: 'backup', objectId: backupId, requestId, changed: ['manifest', 'snapshot'] })
      return { backup_id: backupId, created_at: createdAt, state: 'verified', file_count: manifest.files.length, object_counts: manifest.object_counts }
    } catch (error) {
      await rm(temporary, { recursive: true, force: true }).catch(() => {})
      if (error?.code) throw error
      throw publicError(ERROR_CODES.INTERNAL_ERROR, '备份创建或完整性校验失败。', { statusCode: 500, retryable: true, cause: error })
    } finally {
      running = false
    }
  }

  async function listBackups(session) {
    kernel.actorForSession(session)
    await mkdir(backupRoot, { recursive: true })
    const entries = await readdir(backupRoot, { withFileTypes: true })
    const items = []
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue
      try {
        const verification = await verifyPath(safeChild(backupRoot, entry.name))
        items.push({
          backup_id: verification.backup_id,
          created_at: verification.manifest.created_at,
          state: verification.state,
          file_count: verification.manifest.files.length,
          object_counts: verification.manifest.object_counts,
        })
      } catch {
        items.push({ backup_id: entry.name, created_at: null, state: 'invalid', file_count: 0, object_counts: {} })
      }
    }
    return items.sort((left, right) => String(right.created_at).localeCompare(String(left.created_at)))
  }

  async function verifyBackup(session, backupId) {
    kernel.actorForSession(session)
    if (!/^[0-9a-f-]{36}$/i.test(backupId)) throw publicError(ERROR_CODES.OBJECT_NOT_AVAILABLE, '请求的资源不可用。', { statusCode: 404 })
    try {
      const result = await verifyPath(safeChild(backupRoot, backupId))
      return { backup_id: result.backup_id, state: result.state, failures: result.failures, object_counts: result.manifest.object_counts }
    } catch {
      throw publicError(ERROR_CODES.OBJECT_NOT_AVAILABLE, '请求的资源不可用。', { statusCode: 404 })
    }
  }

  return Object.freeze({ createBackup, listBackups, verifyBackup, backupRoot })
}

export async function restoreBackupBundle({ bundleRoot, destinationRoot } = {}) {
  if (!bundleRoot || !destinationRoot) throw new TypeError('bundleRoot and destinationRoot are required')
  const destination = resolve(destinationRoot)
  const existing = await stat(destination).catch((error) => error?.code === 'ENOENT' ? null : Promise.reject(error))
  if (existing) {
    const entries = await readdir(destination)
    if (entries.length) throw new Error('restore destination must be empty')
  } else {
    await mkdir(destination, { recursive: true })
  }
  const manifest = JSON.parse(await readFile(join(bundleRoot, 'manifest.json'), 'utf8'))
  if (manifest.format !== 'ddup-backup-v1') throw new Error('unsupported backup manifest')
  for (const record of manifest.files) {
    const absolute = safeChild(bundleRoot, record.path)
    const bytes = await readFile(absolute)
    if (bytes.byteLength !== record.byte_size || sha256(bytes) !== record.sha256) throw new Error(`backup integrity failure: ${record.path}`)
  }
  await cp(join(bundleRoot, 'workbench.db'), join(destination, 'workbench.db'), { errorOnExist: true, force: false })
  await cp(join(bundleRoot, 'sources'), join(destination, 'sources'), { recursive: true, errorOnExist: true, force: false })
  return { databasePath: join(destination, 'workbench.db'), sourceStoragePath: join(destination, 'sources'), manifest }
}
