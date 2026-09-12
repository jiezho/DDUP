import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { createWorkbenchApp } from '../server/app.mjs'
import { restoreBackupBundle } from '../server/storage/backup-service.mjs'

const host = '127.0.0.1:8787'
const origin = `http://${host}`
const bootstrapToken = 'synthetic-backup-bootstrap-token-0000000000000000000'
const headers = (extra = {}) => ({ host, ...extra })

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
