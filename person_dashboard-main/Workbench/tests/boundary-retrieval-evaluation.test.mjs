import assert from 'node:assert/strict'
import test from 'node:test'

import { buildBoundaryReport, createBoundaryChunks } from '../scripts/evaluate-context-bge-m3-boundary.mjs'
import {
  BOUNDARY_RETRIEVAL_FIXTURE_ID,
  BOUNDARY_RETRIEVAL_THRESHOLD,
  SYNTHETIC_BOUNDARY_CORPUS,
  SYNTHETIC_BOUNDARY_EXPECTED,
  SYNTHETIC_BOUNDARY_QUERIES,
} from './fixtures/context-retrieval-boundary-evaluation.mjs'

test('boundary fixture is frozen, synthetic, permission-filtered and covers required categories', () => {
  assert.equal(SYNTHETIC_BOUNDARY_CORPUS.length, SYNTHETIC_BOUNDARY_EXPECTED.documents)
  assert.equal(SYNTHETIC_BOUNDARY_CORPUS.filter((item) => item.access_allowed).length, SYNTHETIC_BOUNDARY_EXPECTED.authorized_documents)
  assert.equal(SYNTHETIC_BOUNDARY_QUERIES.length, SYNTHETIC_BOUNDARY_EXPECTED.queries)
  assert.equal(SYNTHETIC_BOUNDARY_QUERIES.filter((item) => item.relevant.length > 0).length, SYNTHETIC_BOUNDARY_EXPECTED.answerable)
  assert.equal(SYNTHETIC_BOUNDARY_QUERIES.filter((item) => item.category === 'no_answer').length, SYNTHETIC_BOUNDARY_EXPECTED.no_answer)
  assert.equal(SYNTHETIC_BOUNDARY_QUERIES.filter((item) => item.category === 'adversarial').length, SYNTHETIC_BOUNDARY_EXPECTED.adversarial)
  assert.equal(new Set(SYNTHETIC_BOUNDARY_QUERIES.map((item) => item.query)).size, SYNTHETIC_BOUNDARY_QUERIES.length)
  assert.equal(createBoundaryChunks().length, 14)
  assert.equal(createBoundaryChunks().some((item) => item.fixture_document_id === 'boundary-doc-forbidden'), false)
})

test('boundary evaluator applies the prior threshold unchanged and fails closed on unknown candidates', () => {
  const chunks = createBoundaryChunks()
  const firstByDocument = new Map(chunks.map((item) => [item.fixture_document_id, item.chunk_id]))
  const rankings = Object.fromEntries(SYNTHETIC_BOUNDARY_QUERIES.map((query) => {
    const relevant = query.relevant[0]
    if (query.id === 'boundary-none-01') return [query.id, [{ candidate_id: 'chk_0000000000000000000000000000000000000000', score: 0.9 }]]
    if (relevant) return [query.id, [{ candidate_id: firstByDocument.get(relevant), score: 0.8 }]]
    return [query.id, [{ candidate_id: chunks[0].chunk_id, score: 0.49 }]]
  }))
  const report = buildBoundaryReport({ fixture_id: BOUNDARY_RETRIEVAL_FIXTURE_ID, rankings })
  assert.equal(report.metrics.threshold, BOUNDARY_RETRIEVAL_THRESHOLD)
  assert.equal(report.metrics.unauthorized_leak_count, 1)
  assert.equal(report.status, 'boundary_gate_failed_keep_default_disabled')
})

test('boundary gate passes only when retrieval, refusal, authorization and locators all pass', () => {
  const chunks = createBoundaryChunks()
  const firstByDocument = new Map(chunks.map((item) => [item.fixture_document_id, item.chunk_id]))
  const rankings = Object.fromEntries(SYNTHETIC_BOUNDARY_QUERIES.map((query) => {
    const relevant = query.relevant[0]
    return [query.id, relevant
      ? [{ candidate_id: firstByDocument.get(relevant), score: 0.8 }]
      : [{ candidate_id: chunks[0].chunk_id, score: 0.49 }]]
  }))
  const report = buildBoundaryReport({ fixture_id: BOUNDARY_RETRIEVAL_FIXTURE_ID, rankings })
  assert.equal(report.status, 'boundary_gate_passed_candidate_remains_experimental')
  assert.equal(report.metrics.answerable_recall, 1)
  assert.equal(report.metrics.no_answer_false_positive_rate, 0)
  assert.equal(report.metrics.unsafe_refusal_rate, 1)
  assert.equal(report.metrics.unauthorized_leak_count, 0)
  assert.equal(report.metrics.exact_locator_rate, 1)
})
