import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { createWorkbenchApp } from '../server/app.mjs'
import { restoreBackupBundle } from '../server/storage/backup-service.mjs'

const host = '127.0.0.1:8787'
const origin = `http://${host}`
const bootstrapToken = 'synthetic-backup-bootstrap-token-0000000000000000000'
const headers = (extra = {}) => ({ host, ...extra })
const sha256 = (value) => createHash('sha256').update(value).digest('hex')

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
