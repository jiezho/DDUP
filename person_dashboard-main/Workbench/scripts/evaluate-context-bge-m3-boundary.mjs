import { spawnSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { chunkDocumentBody } from '../server/context/document-chunker.mjs'
import { shouldRefuseSearch } from '../server/context/search-intent-guard.mjs'
import {
  BOUNDARY_RETRIEVAL_FIXTURE_ID,
  BOUNDARY_RETRIEVAL_THRESHOLD,
  SYNTHETIC_BOUNDARY_CORPUS,
  SYNTHETIC_BOUNDARY_EXPECTED,
  SYNTHETIC_BOUNDARY_QUERIES,
} from '../tests/fixtures/context-retrieval-boundary-evaluation.mjs'

const UUID_PREFIX = '019c9c00-0000-7000-8000-'
const fixedUuid = (suffix) => `${UUID_PREFIX}${String(suffix).padStart(12, '0')}`

function argument(name) {
  const index = process.argv.indexOf(name)
  if (index < 0 || !process.argv[index + 1]) throw new Error(`Missing ${name}`)
  return process.argv[index + 1]
}

export function createBoundaryChunks() {
  const chunks = []
  const authorized = SYNTHETIC_BOUNDARY_CORPUS.filter((document) => document.access_allowed)
  for (const [index, document] of authorized.entries()) {
    for (const chunk of chunkDocumentBody({
      body: document.body,
      spaceId: fixedUuid(1),
      projectId: fixedUuid(2),
      sourceId: fixedUuid(index + 10),
      sourceVersionId: fixedUuid(index + 30),
      documentId: fixedUuid(index + 50),
    })) {
      chunks.push(Object.freeze({ ...chunk, fixture_document_id: document.id, title: document.title }))
    }
  }
  return Object.freeze(chunks)
}

function metricsFor(rankingOutput, chunks) {
  const chunkById = new Map(chunks.map((item) => [item.chunk_id, item]))
  const rows = SYNTHETIC_BOUNDARY_QUERIES.map((query) => {
    const refused = shouldRefuseSearch(query.query)
    const raw = rankingOutput.rankings[query.id] || []
    const unknownCandidateIds = raw.filter((item) => !chunkById.has(item.candidate_id)).map((item) => item.candidate_id)
    const acceptedChunks = refused
      ? []
      : raw.filter((item) => item.score >= BOUNDARY_RETRIEVAL_THRESHOLD).slice(0, 10)
    const acceptedDocuments = []
    for (const item of acceptedChunks) {
      const documentId = chunkById.get(item.candidate_id)?.fixture_document_id
      if (documentId && !acceptedDocuments.some((entry) => entry.document_id === documentId)) {
        acceptedDocuments.push({ document_id: documentId, chunk_id: item.candidate_id, score: item.score })
      }
    }
    const relevant = new Set(query.relevant)
    const forbidden = new Set(query.forbidden_ids)
    const rawWithDocuments = raw.map((item) => ({
      document_id: chunkById.get(item.candidate_id)?.fixture_document_id ?? null,
      chunk_id: item.candidate_id,
      score: item.score,
    }))
    return {
      id: query.id,
      category: query.category,
      refused,
      relevant_hit: query.relevant.length > 0 && acceptedDocuments.some((item) => relevant.has(item.document_id)),
      top1_relevant: query.relevant.length > 0 && relevant.has(acceptedDocuments[0]?.document_id),
      false_positive: query.category === 'no_answer' && acceptedDocuments.length > 0,
      unauthorized_hits: acceptedDocuments.filter((item) => forbidden.has(item.document_id)).length + unknownCandidateIds.length,
      top_raw: rawWithDocuments[0] ?? null,
      best_relevant_score: rawWithDocuments.find((item) => relevant.has(item.document_id))?.score ?? null,
      accepted: acceptedDocuments,
    }
  })
  const answerable = rows.filter((item) => item.category !== 'no_answer' && item.category !== 'adversarial')
  const noAnswer = rows.filter((item) => item.category === 'no_answer')
  const adversarial = rows.filter((item) => item.category === 'adversarial')
  const locatorMatches = chunks.filter((chunk) => {
    const document = SYNTHETIC_BOUNDARY_CORPUS.find((item) => item.id === chunk.fixture_document_id)
    return document?.body.slice(chunk.start_char, chunk.end_char) === chunk.text
  }).length
  return {
    threshold: BOUNDARY_RETRIEVAL_THRESHOLD,
    answerable_recall: answerable.filter((item) => item.relevant_hit).length / answerable.length,
    top1_accuracy: answerable.filter((item) => item.top1_relevant).length / answerable.length,
    no_answer_false_positive_rate: noAnswer.filter((item) => item.false_positive).length / noAnswer.length,
    unsafe_refusal_rate: adversarial.filter((item) => item.refused).length / adversarial.length,
    unauthorized_leak_count: rows.reduce((sum, item) => sum + item.unauthorized_hits, 0),
    exact_locator_rate: locatorMatches / chunks.length,
    per_query: rows,
  }
}

export function buildBoundaryReport(rankingOutput) {
  if (rankingOutput?.fixture_id !== BOUNDARY_RETRIEVAL_FIXTURE_ID) throw new Error('Unexpected boundary fixture identity')
  const chunks = createBoundaryChunks()
  if (chunks.length !== 14) throw new Error('Frozen boundary fixture must produce exactly 14 authorized chunks')
  const metrics = metricsFor(rankingOutput, chunks)
  const passed = metrics.answerable_recall >= 0.8
    && metrics.top1_accuracy >= 0.8
    && metrics.no_answer_false_positive_rate === 0
    && metrics.unsafe_refusal_rate === 1
    && metrics.unauthorized_leak_count === 0
    && metrics.exact_locator_rate === 1
  return {
    schema_version: 'dd-up-g5b-boundary-evaluation-v1',
    generated_at: new Date().toISOString(),
    status: passed ? 'boundary_gate_passed_candidate_remains_experimental' : 'boundary_gate_failed_keep_default_disabled',
    boundary: {
      fixture_id: BOUNDARY_RETRIEVAL_FIXTURE_ID,
      data_classification: 'explicitly_synthetic',
      threshold_source: 'prior_blind_calibration_unchanged',
      production_enabled: false,
      generated_answer_enabled: false,
      reranker_used: false,
      permission_filtering: 'before_chunk_embedding',
      retrieved_instructions_are_data_only: true,
      model: rankingOutput.model,
    },
    counts: {
      ...SYNTHETIC_BOUNDARY_EXPECTED,
      authorized_chunks: chunks.length,
    },
    metrics,
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const python = resolve(argument('--python'))
  const modelRoot = resolve(argument('--model-root'))
  const output = resolve(argument('--output'))
  const chunks = createBoundaryChunks()
  const embedded = spawnSync(
    python,
    ['-I', fileURLToPath(new URL('./embed-context-bge-m3-boundary.py', import.meta.url)), '--model-root', modelRoot],
    {
      input: JSON.stringify({
        fixture_id: BOUNDARY_RETRIEVAL_FIXTURE_ID,
        data_classification: 'explicitly_synthetic',
        candidates: chunks.map((item) => ({
          candidate_id: item.chunk_id,
          document_id: item.fixture_document_id,
          title: item.title,
          text: item.text,
        })),
        queries: SYNTHETIC_BOUNDARY_QUERIES,
      }),
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
      env: { ...process.env, PYTHONNOUSERSITE: '1' },
    },
  )
  if (embedded.status !== 0) {
    process.stderr.write(embedded.stderr || embedded.stdout)
    process.exit(embedded.status || 1)
  }
  const report = buildBoundaryReport(JSON.parse(embedded.stdout))
  writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify({ status: report.status, metrics: {
    threshold: report.metrics.threshold,
    answerable_recall: report.metrics.answerable_recall,
    top1_accuracy: report.metrics.top1_accuracy,
    no_answer_false_positive_rate: report.metrics.no_answer_false_positive_rate,
    unsafe_refusal_rate: report.metrics.unsafe_refusal_rate,
    unauthorized_leak_count: report.metrics.unauthorized_leak_count,
    exact_locator_rate: report.metrics.exact_locator_rate,
  } }, null, 2))
}
