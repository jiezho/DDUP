#!/usr/bin/env node

const minimum = { major: 24, minor: 15, patch: 0 }
const current = process.versions.node.split('.').map(Number)
const [major, minor, patch] = current

const supported =
  major === minimum.major &&
  (minor > minimum.minor || (minor === minimum.minor && patch >= minimum.patch))

if (!supported) {
  process.stderr.write(
    `Unsupported Node.js ${process.version}. Use Node.js >=24.15.0 <25; the recommended version is in .nvmrc/.node-version.\n`,
  )
  process.exit(1)
}

const { DatabaseSync } = await import('node:sqlite')
const database = new DatabaseSync(':memory:', {
  allowExtension: false,
  enableDoubleQuotedStringLiterals: false,
  enableForeignKeyConstraints: true,
})

try {
  database.enableDefensive?.(true)
  database.exec("CREATE VIRTUAL TABLE runtime_fts USING fts5(body, tokenize='trigram')")
  database.prepare('INSERT INTO runtime_fts (body) VALUES (?)').run('个人上下文知识库')
  const match = database.prepare('SELECT count(*) AS count FROM runtime_fts WHERE runtime_fts MATCH ?').get('知识库')
  if (match.count !== 1) throw new Error('FTS5 trigram Chinese smoke check failed')
} finally {
  database.close()
}

process.stdout.write(`Runtime check passed: Node.js ${process.version}, node:sqlite, FTS5 trigram.\n`)
