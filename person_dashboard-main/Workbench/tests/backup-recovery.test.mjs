import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { createWorkbenchApp } from '../server/app.mjs'
import { restoreBackupBundle, restoreBackupBundleForTest } from '../server/storage/backup-service.mjs'
import { MIGRATIONS } from '../server/storage/migrations.mjs'

const host = '127.0.0.1:8787'
const origin = `http://${host}`
const bootstrapToken = 'synthetic-backup-bootstrap-token-0000000000000000000'
const headers = (extra = {}) => ({ host, ...extra })
const sha256 = (value) => createHash('sha256').update(value).digest('hex')

async function writeBundleManifest(bundle, paths, extra = {}) {
  const files = []
  for (const path of paths) {
    const bytes = await readFile(join(bundle, path))
    files.push({ path, byte_size: bytes.byteLength, sha256: sha256(bytes) })
  }
  await writeFile(join(bundle, 'manifest.json'), JSON.stringify({
    format: 'ddup-backup-v1',
    database: 'workbench.db',
    source_root: 'sources',
    files,
    ...extra,
  }))
}

async function createSyntheticBundle(root, { sourceCount = 1 } = {}) {
  const bundle = join(root, 'bundle')
  await mkdir(join(bundle, 'sources'), { recursive: true })
  const databasePath = join(bundle, 'workbench.db')
  const database = new DatabaseSync(databasePath)
  database.exec('CREATE TABLE synthetic_release_check (id TEXT PRIMARY KEY) STRICT')
  database.close()
  const paths = ['workbench.db']
  for (let index = 0; index < sourceCount; index += 1) {
    const path = `sources/synthetic-${index + 1}.md`
    await writeFile(join(bundle, path), `# 合成恢复文件 ${index + 1}\n`)
    paths.push(path)
  }
  await writeBundleManifest(bundle, paths)
  return bundle
}

async function createHistoricalBundle(root, maximumMigrationVersion = 14) {
  const bundle = join(root, 'historical-bundle')
  await mkdir(join(bundle, 'sources'), { recursive: true })
  const databasePath = join(bundle, 'workbench.db')
  const database = new DatabaseSync(databasePath)
  const appliedAt = '2026-09-01T00:00:00.000Z'
  const principalId = '00000000-0000-7000-8000-000000000001'
  const spaceId = '00000000-0000-7000-8000-000000000002'
  const projectId = '00000000-0000-7000-8000-000000000003'
  try {
    database.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        checksum TEXT NOT NULL,
        applied_at TEXT NOT NULL,
        app_version TEXT NOT NULL
      ) STRICT;
    `)
    for (const migration of MIGRATIONS.filter(({ version }) => version <= maximumMigrationVersion)) {
      database.exec('BEGIN IMMEDIATE')
      try {
        database.exec(migration.sql)
        database.prepare(`
          INSERT INTO schema_migrations (version, name, checksum, applied_at, app_version)
          VALUES (?, ?, ?, ?, ?)
        `).run(migration.version, migration.name, migration.checksum, appliedAt, '0.0.14-test')
        database.exec('COMMIT')
      } catch (error) {
        database.exec('ROLLBACK')
        throw error
      }
    }
    database.prepare(`
      INSERT INTO principals (id, kind, display_name, status, created_at)
      VALUES (?, 'local_owner', '合成历史拥有者', 'active', ?)
    `).run(principalId, appliedAt)
    database.prepare(`
      INSERT INTO spaces (
        id, owner_id, name, classification, default_ai_policy, status,
        created_at, created_by, updated_at, updated_by, version, deleted_at, deleted_by
      ) VALUES (?, ?, '合成历史空间', 'public_demo', 'local_only', 'active', ?, ?, ?, ?, 1, NULL, NULL)
    `).run(spaceId, principalId, appliedAt, principalId, appliedAt, principalId)
    database.prepare(`
      INSERT INTO projects (
        id, space_id, name, summary, template_type, status, start_date, target_date,
        context_policy, color_token, created_at, created_by, updated_at, updated_by,
        version, deleted_at, deleted_by
      ) VALUES (?, ?, '历史迁移保留项目', '只用于迁移恢复验收。', 'general', 'active', NULL, NULL,
        'project_only', 'sky', ?, ?, ?, ?, 1, NULL, NULL)
    `).run(projectId, spaceId, appliedAt, principalId, appliedAt, principalId)
  } finally {
    database.close()
  }
  await writeBundleManifest(bundle, ['workbench.db'], {
    schema_migrations: MIGRATIONS
      .filter(({ version }) => version <= maximumMigrationVersion)
      .map(({ version, name, checksum }) => ({ version, name, checksum })),
  })
  return { bundle, principalId, projectId }
}

test('verified backup restores database objects, relations and controlled source hashes into an empty instance', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workbench-backup-test-'))
  const databasePath = join(root, 'workbench.db')
  const sourceStoragePath = join(root, 'sources')
  const app = createWorkbenchApp({ bootstrapToken, databasePath, sourceStoragePath, now: () => Date.UTC(2026, 8, 8, 8) })
  try {
    const boot = await app.inject({
      method: 'POST', url: '/api/v1/session/bootstrap',
      headers: headers({ 'content-type': 'application/json', origin, 'x-workbench-bootstrap': bootstrapToken }), payload: {},
    })
    const cookie = boot.headers['set-cookie'].split(';', 1)[0]
    const csrf = boot.json().data.csrf_token
    const session = await app.inject({ method: 'GET', url: '/api/v1/session', headers: headers({ cookie }) })
    const spaceId = session.json().data.spaces[0].id
    const writeHeaders = (key) => headers({ 'content-type': 'application/json', origin, cookie, 'x-csrf-token': csrf, 'idempotency-key': key })
    const project = await app.inject({
      method: 'POST', url: '/api/v1/projects', headers: writeHeaders('backup-project-create-000000001'),
      payload: { space_id: spaceId, name: '合成备份恢复项目', summary: '只用于备份恢复验收。', template_type: 'general' },
    })
    assert.equal(project.statusCode, 201, project.body)
    const imported = await app.inject({
      method: 'POST', url: '/api/v1/sources/imports/markdown', headers: writeHeaders('backup-source-import-000000001'),
      payload: { space_id: spaceId, project_id: project.json().data.id, filename: 'synthetic-backup.md', content: '# 合成备份证据\n\n恢复后仍需保持哈希一致。' },
    })
    assert.equal(imported.statusCode, 201, imported.body)

    const created = await app.inject({
      method: 'POST', url: '/api/v1/system/backups', headers: writeHeaders('unused-backup-key'), payload: { space_id: spaceId },
    })
    assert.equal(created.statusCode, 201, created.body)
    assert.equal(created.json().data.state, 'verified')
    const backupId = created.json().data.backup_id
    const verified = await app.inject({
      method: 'GET', url: `/api/v1/system/backups/${backupId}/verify?space_id=${spaceId}`, headers: headers({ cookie }),
    })
    assert.equal(verified.statusCode, 200, verified.body)
    assert.equal(verified.json().data.state, 'verified')

    await app.close()
    await rm(databasePath, { force: true })
    await rm(`${databasePath}-wal`, { force: true })
    await rm(`${databasePath}-shm`, { force: true })
    await rm(sourceStoragePath, { recursive: true, force: true })
    const restoredRoot = join(root, 'restored')
    const restored = await restoreBackupBundle({ bundleRoot: join(root, 'backups', backupId), destinationRoot: restoredRoot })
    const database = new DatabaseSync(restored.databasePath)
    try {
      assert.equal(database.prepare("SELECT count(*) AS count FROM projects WHERE name = '合成备份恢复项目'").get().count, 1)
      assert.equal(database.prepare('SELECT count(*) AS count FROM sources').get().count, 1)
      assert.equal(database.prepare('SELECT count(*) AS count FROM source_versions').get().count, 1)
      assert.equal(database.prepare('PRAGMA quick_check').get().quick_check, 'ok')
    } finally {
      database.close()
    }
    const restoredFiles = (await readdir(restored.sourceStoragePath, { recursive: true })).filter((name) => name.endsWith('.md'))
    assert.equal(restoredFiles.length, 1)
    assert.match(await readFile(join(restored.sourceStoragePath, restoredFiles[0]), 'utf8'), /恢复后仍需保持哈希一致/)
  } finally {
    await app.close().catch(() => {})
    await rm(root, { recursive: true, force: true })
  }
})

test('restore rejects a damaged bundle before creating or changing the destination', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workbench-backup-damaged-test-'))
  const bundle = join(root, 'bundle')
  const destination = join(root, 'restored')
  try {
    await mkdir(join(bundle, 'sources'), { recursive: true })
    await writeFile(join(bundle, 'workbench.db'), 'not-a-database')
    await writeFile(join(bundle, 'manifest.json'), JSON.stringify({
      format: 'ddup-backup-v1',
      database: 'workbench.db',
      source_root: 'sources',
      files: [{ path: 'workbench.db', byte_size: 14, sha256: '0'.repeat(64) }],
    }))

    await assert.rejects(
      restoreBackupBundle({ bundleRoot: bundle, destinationRoot: destination }),
      /backup integrity failure/,
    )
    await assert.rejects(readFile(join(destination, 'workbench.db')), /ENOENT/)

    const invalidDatabase = await readFile(join(bundle, 'workbench.db'))
    await writeFile(join(bundle, 'manifest.json'), JSON.stringify({
      format: 'ddup-backup-v1',
      database: 'workbench.db',
      source_root: 'sources',
      files: [{ path: 'workbench.db', byte_size: invalidDatabase.byteLength, sha256: sha256(invalidDatabase) }],
    }))
    await assert.rejects(
      restoreBackupBundle({ bundleRoot: bundle, destinationRoot: destination }),
      /not a database|quick_check/i,
    )
    assert.equal((await readdir(root)).some((name) => name.startsWith('.restored.restore-')), false)

    await mkdir(destination)
    await writeFile(join(destination, 'keep.txt'), 'synthetic marker')
    await assert.rejects(
      restoreBackupBundle({ bundleRoot: bundle, destinationRoot: destination }),
      /restore destination must be empty/,
    )
    assert.equal(await readFile(join(destination, 'keep.txt'), 'utf8'), 'synthetic marker')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('restore rejects traversal, duplicate and unlisted backup entries', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workbench-backup-manifest-test-'))
  const bundle = join(root, 'bundle')
  const outside = join(root, 'outside.db')
  try {
    await mkdir(join(bundle, 'sources'), { recursive: true })
    await writeFile(outside, 'synthetic outside file')
    await copyFile(outside, join(bundle, 'workbench.db'))
    const placeholder = await readFile(join(bundle, 'workbench.db'))
    await writeFile(join(bundle, 'manifest.json'), JSON.stringify({
      format: 'ddup-backup-v1',
      database: 'workbench.db',
      source_root: 'sources',
      files: [{ path: '../outside.db', byte_size: 22, sha256: '0'.repeat(64) }],
    }))
    await assert.rejects(
      restoreBackupBundle({ bundleRoot: bundle, destinationRoot: join(root, 'traversal') }),
      /unsupported backup manifest/,
    )

    await writeFile(join(bundle, 'manifest.json'), JSON.stringify({
      format: 'ddup-backup-v1',
      database: 'workbench.db',
      source_root: 'sources',
      files: [
        { path: 'workbench.db', byte_size: placeholder.byteLength, sha256: sha256(placeholder) },
        { path: 'workbench.db', byte_size: placeholder.byteLength, sha256: sha256(placeholder) },
      ],
    }))
    await assert.rejects(
      restoreBackupBundle({ bundleRoot: bundle, destinationRoot: join(root, 'duplicate') }),
      /unsupported backup manifest/,
    )

    await rm(join(bundle, 'workbench.db'))
    const database = new DatabaseSync(join(bundle, 'workbench.db'))
    database.exec('CREATE TABLE synthetic_release_check (id TEXT PRIMARY KEY) STRICT')
    database.close()
    const databaseBytes = await readFile(join(bundle, 'workbench.db'))
    await writeFile(join(bundle, 'unlisted.txt'), 'must not be restored')
    await writeFile(join(bundle, 'manifest.json'), JSON.stringify({
      format: 'ddup-backup-v1',
      database: 'workbench.db',
      source_root: 'sources',
      files: [{ path: 'workbench.db', byte_size: databaseBytes.byteLength, sha256: sha256(databaseBytes) }],
    }))
    const restored = join(root, 'listed-only')
    await restoreBackupBundle({ bundleRoot: bundle, destinationRoot: restored })
    await assert.rejects(readFile(join(restored, 'unlisted.txt')), /ENOENT/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('restore fails capacity preflight before staging and preserves an existing empty destination', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workbench-backup-capacity-test-'))
  const destination = join(root, 'restored')
  try {
    const bundle = await createSyntheticBundle(root, { sourceCount: 2 })
    await mkdir(destination)
    await assert.rejects(
      restoreBackupBundleForTest(
        { bundleRoot: bundle, destinationRoot: destination },
        { getAvailableBytes: () => 1n },
      ),
      (error) => error?.code === 'RESTORE_INSUFFICIENT_SPACE'
        && BigInt(error.requiredBytes) > BigInt(error.availableBytes),
    )
    assert.deepEqual(await readdir(destination), [])
    assert.equal((await readdir(root)).some((name) => name.startsWith('.restored.restore-')), false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('restore removes staging data after an ENOSPC write failure and leaves the destination absent', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workbench-backup-interrupted-test-'))
  const destination = join(root, 'restored')
  try {
    const bundle = await createSyntheticBundle(root, { sourceCount: 2 })
    await assert.rejects(
      restoreBackupBundleForTest(
        { bundleRoot: bundle, destinationRoot: destination },
        { afterFileWrite: ({ index }) => {
          if (index === 0) {
            const error = new Error('synthetic disk full')
            error.code = 'ENOSPC'
            throw error
          }
        } },
      ),
      (error) => error?.code === 'ENOSPC' && /synthetic disk full/.test(error.message),
    )
    await assert.rejects(stat(destination), /ENOENT/)
    assert.equal((await readdir(root)).some((name) => name.startsWith('.restored.restore-')), false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('a restored historical database migrates forward and an unknown newer schema fails closed without data loss', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workbench-backup-migration-test-'))
  const destination = join(root, 'restored')
  let app
  try {
    const historical = await createHistoricalBundle(root, 14)
    const restored = await restoreBackupBundle({ bundleRoot: historical.bundle, destinationRoot: destination })
    app = createWorkbenchApp({
      bootstrapToken: `${bootstrapToken}-historical`,
      databasePath: restored.databasePath,
      sourceStoragePath: restored.sourceStoragePath,
      now: () => Date.UTC(2026, 8, 16, 8),
    })
    const boot = await app.inject({
      method: 'POST', url: '/api/v1/session/bootstrap',
      headers: headers({
        'content-type': 'application/json',
        origin,
        'x-workbench-bootstrap': `${bootstrapToken}-historical`,
      }),
      payload: {},
    })
    assert.equal(boot.statusCode, 200, boot.body)
    const project = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${historical.projectId}`,
      headers: headers({ cookie: boot.headers['set-cookie'].split(';', 1)[0] }),
    })
    assert.equal(project.statusCode, 200, project.body)
    assert.equal(project.json().data.name, '历史迁移保留项目')
    await app.close()
    app = null

    const upgraded = new DatabaseSync(restored.databasePath)
    try {
      assert.equal(upgraded.prepare('SELECT max(version) AS version FROM schema_migrations').get().version, MIGRATIONS.at(-1).version)
      assert.equal(upgraded.prepare("SELECT count(*) AS count FROM projects WHERE id = ?").get(historical.projectId).count, 1)
      upgraded.prepare(`
        INSERT INTO schema_migrations (version, name, checksum, applied_at, app_version)
        VALUES (999, 'synthetic_future_schema', ?, '2026-09-17T00:00:00.000Z', '9.9.9-test')
      `).run('f'.repeat(64))
    } finally {
      upgraded.close()
    }

    assert.throws(
      () => createWorkbenchApp({
        bootstrapToken: `${bootstrapToken}-rollback`,
        databasePath: restored.databasePath,
        sourceStoragePath: restored.sourceStoragePath,
      }),
      (error) => error?.code === 'MIGRATION_REQUIRED' && error?.statusCode === 503,
    )
    const preserved = new DatabaseSync(restored.databasePath, { readOnly: true })
    try {
      assert.equal(preserved.prepare('SELECT name FROM projects WHERE id = ?').get(historical.projectId).name, '历史迁移保留项目')
      assert.equal(preserved.prepare('PRAGMA quick_check').get().quick_check, 'ok')
    } finally {
      preserved.close()
    }
  } finally {
    await app?.close().catch(() => {})
    await rm(root, { recursive: true, force: true })
  }
})

test('two restores racing for one destination publish exactly one verified result', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workbench-backup-race-test-'))
  const destination = join(root, 'restored')
  try {
    const bundle = await createSyntheticBundle(root, { sourceCount: 2 })
    const results = await Promise.allSettled([
      restoreBackupBundle({ bundleRoot: bundle, destinationRoot: destination }),
      restoreBackupBundle({ bundleRoot: bundle, destinationRoot: destination }),
    ])
    assert.equal(results.filter(({ status }) => status === 'fulfilled').length, 1)
    assert.equal(results.filter(({ status }) => status === 'rejected').length, 1)
    const database = new DatabaseSync(join(destination, 'workbench.db'))
    try {
      assert.equal(database.prepare('PRAGMA quick_check').get().quick_check, 'ok')
    } finally {
      database.close()
    }
    assert.equal((await readdir(root)).some((name) => name.startsWith('.restored.restore-')), false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
