import { spawnSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { buildBoundaryReport, createBoundaryChunks } from './evaluate-context-bge-m3-boundary.mjs'
import {
  BOUNDARY_RETRIEVAL_FIXTURE_ID,
  SYNTHETIC_BOUNDARY_QUERIES,
} from '../tests/fixtures/context-retrieval-boundary-evaluation.mjs'

const FAILED_QUERY_IDS = new Set(['boundary-answer-01', 'boundary-answer-08', 'boundary-answer-09'])

function argument(name) {
  const index = process.argv.indexOf(name)
  if (index < 0 || !process.argv[index + 1]) throw new Error(`Missing ${name}`)
  return process.argv[index + 1]
}

const smoke = process.argv.includes('--smoke')
const python = resolve(argument('--python'))
const modelRoot = resolve(argument('--model-root'))
const output = resolve(argument('--output'))
const chunks = createBoundaryChunks()
const queries = smoke
  ? SYNTHETIC_BOUNDARY_QUERIES.filter((item) => FAILED_QUERY_IDS.has(item.id))
  : SYNTHETIC_BOUNDARY_QUERIES
const embedded = spawnSync(
  python,
  ['-I', fileURLToPath(new URL('./embed-context-bge-m3-windowing.py', import.meta.url)), '--model-root', modelRoot],
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
      queries,
    }),
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, PYTHONNOUSERSITE: '1' },
  },
)
if (embedded.status !== 0) {
  process.stderr.write(embedded.stderr || embedded.stdout)
  process.exit(embedded.status || 1)
}
const raw = JSON.parse(embedded.stdout)
const arms = Object.fromEntries(Object.entries(raw.arms).map(([armId, arm]) => {
  if (smoke) {
    const perQuery = queries.map((query) => {
      const ranking = arm.rankings[query.id] || []
      const top = ranking[0]
      const chunk = chunks.find((item) => item.chunk_id === top?.candidate_id)
      return {
        id: query.id,
        top1_document_id: chunk?.fixture_document_id ?? null,
        top1_relevant: query.relevant.includes(chunk?.fixture_document_id),
        top1_score: top?.score ?? null,
      }
    })
    return [armId, {
      configuration: arm.configuration,
      encoded_passages: arm.encoded_passages,
      passage_encode_ms: arm.passage_encode_ms,
      failed_query_top1_accuracy: perQuery.filter((item) => item.top1_relevant).length / perQuery.length,
      per_query: perQuery,
    }]
  }
  const report = buildBoundaryReport({
    fixture_id: BOUNDARY_RETRIEVAL_FIXTURE_ID,
    model: raw.model,
    rankings: arm.rankings,
  })
  return [armId, {
    configuration: arm.configuration,
    encoded_passages: arm.encoded_passages,
    passage_encode_ms: arm.passage_encode_ms,
    status: report.status,
    metrics: report.metrics,
  }]
}))
const evidence = {
  schema_version: 'dd-up-bge-m3-boundary-windowing-v1',
  generated_at: new Date().toISOString(),
  status: smoke ? 'smoke_completed' : 'full_campaign_slice_completed',
  data_classification: 'explicitly_synthetic',
  boundary: {
    fixture_id: BOUNDARY_RETRIEVAL_FIXTURE_ID,
    fixed_threshold: 0.5,
    production_enabled: false,
    generated_answer_enabled: false,
    reranker_used: false,
    permission_filtering: 'before_chunk_embedding',
    chunk_identity_changed: false,
  },
  model: raw.model,
  workload: { query_count: queries.length, authorized_chunks: chunks.length },
  query_encode_ms: raw.query_encode_ms,
  arms,
  interpretation_limits: [
    'frozen_synthetic_boundary_only',
    'windowing_changes_embedding_compute_cost',
    'no_real_data_no_generated_answer_no_production_enablement',
  ],
}
writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
console.log(JSON.stringify({
  status: evidence.status,
  output,
  arms: Object.fromEntries(Object.entries(arms).map(([id, arm]) => [id, smoke
    ? { failed_query_top1_accuracy: arm.failed_query_top1_accuracy, passage_encode_ms: arm.passage_encode_ms }
    : {
        status: arm.status,
        answerable_recall: arm.metrics.answerable_recall,
        top1_accuracy: arm.metrics.top1_accuracy,
        no_answer_false_positive_rate: arm.metrics.no_answer_false_positive_rate,
        passage_encode_ms: arm.passage_encode_ms,
      }])),
}, null, 2))
