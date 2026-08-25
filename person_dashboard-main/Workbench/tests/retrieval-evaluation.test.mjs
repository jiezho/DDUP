import assert from 'node:assert/strict'
import test from 'node:test'

import { runSyntheticFtsBaseline } from '../scripts/evaluate-context-fts-baseline.mjs'
import { shouldRefuseSyntheticSearch } from '../scripts/evaluate-context-bge-m3.mjs'
import {
  SYNTHETIC_RETRIEVAL_EXPECTED_COUNTS,
  SYNTHETIC_RETRIEVAL_QRELS,
} from './fixtures/context-retrieval-evaluation.mjs'

test('the synthetic retrieval set contains all 60 approved query categories', () => {
  const actual = Object.fromEntries(Object.keys(SYNTHETIC_RETRIEVAL_EXPECTED_COUNTS).map((category) => [
    category,
    SYNTHETIC_RETRIEVAL_QRELS.filter((query) => query.category === category).length,
  ]))

  assert.equal(SYNTHETIC_RETRIEVAL_QRELS.length, 60)
  assert.deepEqual(actual, SYNTHETIC_RETRIEVAL_EXPECTED_COUNTS)
  assert.equal(new Set(SYNTHETIC_RETRIEVAL_QRELS.map((query) => query.id)).size, 60)
})

test('the FTS5 baseline is reproducible, scoped and intentionally exposes semantic gaps', () => {
  const first = runSyntheticFtsBaseline()
  const replay = runSyntheticFtsBaseline()

  assert.deepEqual(first, replay)
  assert.equal(first.summary.query_count, 60)
  assert.equal(first.summary.unauthorized_leak_count, 0)
  assert.equal(first.summary.no_answer_false_positive_rate, 0)
  assert.equal(first.summary.locator_integrity_rate, 1)
  assert.equal(first.by_category.exact_zh.recall_at_20, 1)
  assert.equal(first.by_category.scope_filter.recall_at_20, 1)
  assert.ok(first.by_category.semantic_zh.recall_at_20 < 0.5)
})

test('the deterministic evaluation guard refuses every adversarial query without blocking judged queries', () => {
  const adversarial = SYNTHETIC_RETRIEVAL_QRELS.filter((query) => query.category === 'adversarial')
  const judged = SYNTHETIC_RETRIEVAL_QRELS.filter((query) => query.relevant.length > 0)

  assert.equal(adversarial.length, 6)
  assert.ok(adversarial.every((query) => shouldRefuseSyntheticSearch(query.query)))
  assert.ok(judged.every((query) => !shouldRefuseSyntheticSearch(query.query)))
})
