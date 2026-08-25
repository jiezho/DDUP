import { DatabaseSync } from 'node:sqlite'
import { pathToFileURL } from 'node:url'

import { evaluateRetrievalRun } from '../server/context/retrieval-evaluation.mjs'
import {
  SYNTHETIC_RETRIEVAL_CORPUS,
  SYNTHETIC_RETRIEVAL_QRELS,
} from '../tests/fixtures/context-retrieval-evaluation.mjs'

function quotedMatch(value) {
  return `"${value.replaceAll('"', '""')}"`
}

export function runSyntheticFtsCandidates() {
  const database = new DatabaseSync(':memory:', { allowExtension: false })
  try {
    database.exec("CREATE VIRTUAL TABLE documents_fts USING fts5(document_id UNINDEXED, project_id UNINDEXED, title, body, tokenize='trigram')")
    const insert = database.prepare('INSERT INTO documents_fts(document_id, project_id, title, body) VALUES (?, ?, ?, ?)')
    for (const document of SYNTHETIC_RETRIEVAL_CORPUS) {
      insert.run(document.id, document.project_id, document.title, document.body)
    }

    const resultsByQuery = new Map()
    for (const query of SYNTHETIC_RETRIEVAL_QRELS) {
      const projectIds = query.scope.project_ids
      const projectClause = projectIds.length > 0
        ? ` AND project_id IN (${projectIds.map(() => '?').join(', ')})`
        : ''
      const hasTrigram = [...query.query].length >= 3
      const statement = hasTrigram
        ? database.prepare(`SELECT document_id FROM documents_fts WHERE documents_fts MATCH ?${projectClause} ORDER BY bm25(documents_fts), document_id LIMIT 20`)
        : database.prepare(`SELECT document_id FROM documents_fts WHERE (title LIKE ? OR body LIKE ?)${projectClause} ORDER BY document_id LIMIT 20`)
      const rows = hasTrigram
        ? statement.all(quotedMatch(query.query), ...projectIds)
        : statement.all(`%${query.query}%`, `%${query.query}%`, ...projectIds)
      resultsByQuery.set(query.id, rows.map((row) => ({
        document_id: row.document_id,
        locator_valid: true,
      })))
    }

    return resultsByQuery
  } finally {
    database.close()
  }
}

export function runSyntheticFtsBaseline() {
  return evaluateRetrievalRun({
    queries: SYNTHETIC_RETRIEVAL_QRELS,
    resultsByQuery: runSyntheticFtsCandidates(),
  })
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const report = runSyntheticFtsBaseline()
  console.log(JSON.stringify({
    baseline: 'sqlite-fts5-trigram-exact-phrase-v1',
    corpus_count: SYNTHETIC_RETRIEVAL_CORPUS.length,
    ...report,
  }, null, 2))
}
