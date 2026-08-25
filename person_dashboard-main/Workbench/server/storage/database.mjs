import { DatabaseSync } from 'node:sqlite'

import { ERROR_CODES, publicError } from '../../shared/contracts/errors.mjs'
import { MIGRATIONS } from './migrations.mjs'

function isoNow(now) {
  return new Date(now()).toISOString()
}

export function openWorkbenchDatabase({ databasePath, appVersion = '0.1.0', now = Date.now } = {}) {
  if (typeof databasePath !== 'string' || databasePath.length === 0) {
    throw new TypeError('databasePath is required')
  }

  const database = new DatabaseSync(databasePath, {
    allowExtension: false,
    enableDoubleQuotedStringLiterals: false,
    enableForeignKeyConstraints: true,
    timeout: 2_000,
  })

  try {
    database.enableDefensive?.(true)
    database.exec('PRAGMA foreign_keys = ON; PRAGMA synchronous = FULL; PRAGMA busy_timeout = 2000;')
    if (databasePath !== ':memory:') database.prepare('PRAGMA journal_mode = WAL').get()
    database.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        checksum TEXT NOT NULL,
        applied_at TEXT NOT NULL,
        app_version TEXT NOT NULL
      ) STRICT;
    `)

    const knownVersions = new Set(MIGRATIONS.map((migration) => migration.version))
    for (const row of database.prepare('SELECT version, name, checksum FROM schema_migrations ORDER BY version').all()) {
      const migration = MIGRATIONS.find((candidate) => candidate.version === row.version)
      if (!migration || !knownVersions.has(row.version) || migration.name !== row.name || migration.checksum !== row.checksum) {
        throw publicError(ERROR_CODES.MIGRATION_REQUIRED, '数据库迁移记录无法验证，已停止写入。', {
          statusCode: 503,
        })
      }
    }

    for (const migration of MIGRATIONS) {
      const applied = database.prepare('SELECT checksum FROM schema_migrations WHERE version = ?').get(migration.version)
      if (applied) continue
      database.exec('BEGIN IMMEDIATE')
      try {
        database.exec(migration.sql)
        database
          .prepare(
            'INSERT INTO schema_migrations (version, name, checksum, applied_at, app_version) VALUES (?, ?, ?, ?, ?)',
          )
          .run(migration.version, migration.name, migration.checksum, isoNow(now), appVersion)
        database.exec('COMMIT')
      } catch (error) {
        database.exec('ROLLBACK')
        throw error
      }
    }

    const integrity = database.prepare('PRAGMA quick_check').get()?.quick_check
    if (integrity !== 'ok') {
      throw publicError(ERROR_CODES.MIGRATION_REQUIRED, '数据库完整性检查失败，已停止写入。', {
        statusCode: 503,
      })
    }

    return database
  } catch (error) {
    database.close()
    throw error
  }
}
