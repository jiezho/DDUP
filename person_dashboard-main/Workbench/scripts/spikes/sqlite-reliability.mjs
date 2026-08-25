import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { copyFile, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { performance } from 'node:perf_hooks'
import { backup, DatabaseSync } from 'node:sqlite'

const scriptPath = fileURLToPath(import.meta.url)
const crashFlag = '--crash-child'

function openDatabase(path) {
  const database = new DatabaseSync(path, {
    allowExtension: false,
    enableDoubleQuotedStringLiterals: false,
    enableForeignKeyConstraints: true,
    timeout: 2_000,
  })
  database.enableDefensive?.(true)
  return database
}

if (process.argv[2] === crashFlag) {
  const database = openDatabase(resolve(process.argv[3]))
  database.exec('BEGIN IMMEDIATE')
  database.prepare('INSERT INTO objects (id, title) VALUES (?, ?)').run('crash-only', '不应提交的合成记录')
  process.exit(17)
}

const isFullRun = process.argv.includes('--full')
const objectCount = isFullRun ? 100_000 : 10_000
const relationCount = isFullRun ? 1_000_000 : 50_000
const startedAt = new Date().toISOString()
const tempRoot = await mkdtemp(join(tmpdir(), 'workbench-sqlite-spike-'))
const databasePath = join(tempRoot, 'primary.db')
const backupPath = join(tempRoot, 'backup.db')
const restoredPath = join(tempRoot, 'restored.db')
const corruptPath = join(tempRoot, 'corrupt.db')
const checks = []
const metrics = {}

function record(name, detail) {
  checks.push({ name, status: 'passed', detail })
}

function scalar(database, sql, ...parameters) {
  const row = database.prepare(sql).get(...parameters)
  return row[Object.keys(row)[0]]
}

function assertSafeTemporaryRoot(path) {
  const resolved = resolve(path)
  assert.equal(dirname(resolved), resolve(tmpdir()))
  assert.match(basename(resolved), /^workbench-sqlite-spike-/)
}

let primary
let reader

try {
  primary = openDatabase(databasePath)
  const journalMode = scalar(primary, 'PRAGMA journal_mode = WAL')
  primary.exec('PRAGMA synchronous = FULL; PRAGMA busy_timeout = 2000')
  assert.equal(String(journalMode).toLowerCase(), 'wal')
  assert.equal(scalar(primary, 'PRAGMA foreign_keys'), 1)
  record('runtime-and-pragmas', `${process.version}; WAL; foreign_keys=ON; defensive=${typeof primary.enableDefensive === 'function'}`)

  primary.exec(`
    CREATE TABLE objects (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL UNIQUE
    ) STRICT;
    CREATE TABLE relations (
      from_id TEXT NOT NULL REFERENCES objects(id),
      to_id TEXT NOT NULL REFERENCES objects(id),
      relation_type TEXT NOT NULL,
      PRIMARY KEY (from_id, to_id, relation_type)
    ) STRICT, WITHOUT ROWID;
    CREATE VIRTUAL TABLE documents_fts USING fts5(
      object_id UNINDEXED,
      title,
      body,
      tokenize='trigram'
    );
  `)

  primary.exec('BEGIN')
  try {
    primary.prepare('INSERT INTO objects (id, title) VALUES (?, ?)').run('rollback-a', '事务回滚样例')
    primary.prepare('INSERT INTO objects (id, title) VALUES (?, ?)').run('rollback-b', '事务回滚样例')
    primary.exec('COMMIT')
    assert.fail('unique constraint should have failed')
  } catch (error) {
    primary.exec('ROLLBACK')
    assert.match(String(error), /constraint/i)
  }
  assert.equal(scalar(primary, 'SELECT count(*) FROM objects'), 0)
  assert.throws(
    () => primary.prepare('INSERT INTO relations VALUES (?, ?, ?)').run('missing-a', 'missing-b', 'related_to'),
    /foreign key constraint/i,
  )
  record('transaction-and-foreign-key', '约束失败后完整回滚；悬空关系被拒绝')

  primary.prepare('INSERT INTO objects (id, title) VALUES (?, ?)').run('object-000000', '个人上下文知识库')
  primary.prepare('INSERT INTO documents_fts (object_id, title, body) VALUES (?, ?, ?)').run(
    'object-000000',
    '个人上下文知识库',
    '这是明确标记的虚构演示文本，用于项目管理、科研学习与引用检索。',
  )
  const ftsMatch = primary.prepare("SELECT object_id FROM documents_fts WHERE documents_fts MATCH ?").get('知识库')
  assert.equal(ftsMatch.object_id, 'object-000000')
  record('fts5-trigram-chinese', '“知识库”命中“个人上下文知识库”')

  reader = openDatabase(databasePath)
  primary.exec('BEGIN IMMEDIATE')
  primary.prepare('INSERT INTO objects (id, title) VALUES (?, ?)').run('wal-pending', 'WAL 未提交记录')
  assert.equal(scalar(reader, "SELECT count(*) FROM objects WHERE id = 'wal-pending'"), 0)
  primary.exec('COMMIT')
  assert.equal(scalar(reader, "SELECT count(*) FROM objects WHERE id = 'wal-pending'"), 1)
  record('wal-read-visibility', '读连接在写事务期间可读取旧快照，提交后可见新记录')

  reader.close()
  reader = undefined
  const crashResult = spawnSync(process.execPath, [scriptPath, crashFlag, databasePath], {
    encoding: 'utf8',
    timeout: 10_000,
  })
  assert.equal(crashResult.status, 17, crashResult.stderr)
  assert.equal(scalar(primary, "SELECT count(*) FROM objects WHERE id = 'crash-only'"), 0)
  assert.equal(scalar(primary, 'PRAGMA integrity_check'), 'ok')
  record('abrupt-process-exit', '子进程在未提交写事务中退出；记录回滚且 integrity_check=ok')

  const insertObject = primary.prepare('INSERT INTO objects (id, title) VALUES (?, ?)')
  const insertRelation = primary.prepare(
    'INSERT INTO relations (from_id, to_id, relation_type) VALUES (?, ?, ?)',
  )
  const performanceStarted = performance.now()
  primary.exec('BEGIN')
  for (let index = 1; index < objectCount; index += 1) {
    insertObject.run(`object-${String(index).padStart(6, '0')}`, `合成对象 ${index}`)
  }
  primary.exec('COMMIT')
  metrics.objectInsertMs = Math.round(performance.now() - performanceStarted)

  const relationStarted = performance.now()
  primary.exec('BEGIN')
  for (let index = 0; index < relationCount; index += 1) {
    const from = index % objectCount
    const offset = Math.floor(index / objectCount) + 1
    const to = (from + offset) % objectCount
    insertRelation.run(
      `object-${String(from).padStart(6, '0')}`,
      `object-${String(to).padStart(6, '0')}`,
      'related_to',
    )
  }
  primary.exec('COMMIT')
  metrics.relationInsertMs = Math.round(performance.now() - relationStarted)
  assert.equal(scalar(primary, 'SELECT count(*) FROM objects'), objectCount + 1)
  assert.equal(scalar(primary, 'SELECT count(*) FROM relations'), relationCount)
  record('synthetic-scale', `${objectCount.toLocaleString()} 对象；${relationCount.toLocaleString()} 关系`)

  const backupStarted = performance.now()
  await backup(primary, backupPath)
  metrics.backupMs = Math.round(performance.now() - backupStarted)
  const backupDatabase = openDatabase(backupPath)
  assert.equal(scalar(backupDatabase, 'PRAGMA integrity_check'), 'ok')
  assert.equal(scalar(backupDatabase, 'SELECT count(*) FROM objects'), objectCount + 1)
  assert.equal(scalar(backupDatabase, 'SELECT count(*) FROM relations'), relationCount)
  backupDatabase.close()

  await copyFile(backupPath, restoredPath)
  const restored = openDatabase(restoredPath)
  assert.equal(scalar(restored, 'PRAGMA integrity_check'), 'ok')
  assert.equal(scalar(restored, 'SELECT count(*) FROM relations'), relationCount)
  restored.close()
  record('online-backup-and-restore', '在线备份与新路径恢复完整，数量和 integrity_check 一致')

  const backupBytes = await readFile(backupPath)
  await writeFile(corruptPath, backupBytes.subarray(0, Math.min(256, backupBytes.length)))
  assert.throws(() => {
    const corrupt = openDatabase(corruptPath)
    try {
      corrupt.prepare('PRAGMA integrity_check').all()
    } finally {
      corrupt.close()
    }
  })
  record('corruption-detection', '截断副本无法通过打开/完整性查询，未误判为可恢复备份')

  const checkpoint = primary.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get()
  assert.equal(checkpoint.busy, 0)
  assert.equal(checkpoint.log, 0)
  assert.equal(checkpoint.checkpointed, 0)
  metrics.databaseBytes = (await stat(databasePath)).size
  metrics.backupBytes = backupBytes.byteLength
  record('wal-checkpoint', 'TRUNCATE checkpoint 完成，无 busy 或待 checkpoint 页面')
  const result = {
    status: 'passed',
    startedAt,
    finishedAt: new Date().toISOString(),
    mode: isFullRun ? 'full' : 'quick',
    runtime: process.version,
    platform: `${process.platform}-${process.arch}`,
    objectCount,
    relationCount,
    checks,
    metrics,
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
} finally {
  reader?.close()
  primary?.close()
  assertSafeTemporaryRoot(tempRoot)
  await rm(tempRoot, { recursive: true, force: true })
}
