import assert from 'node:assert/strict'
import test from 'node:test'

import { calibrateThreshold } from '../scripts/calibrate-context-bge-m3.mjs'
import {
  BLIND_RETRIEVAL_FIXTURE_ID,
  SYNTHETIC_BLIND_CORPUS,
  SYNTHETIC_BLIND_EXPECTED,
  SYNTHETIC_BLIND_QUERIES,
} from './fixtures/context-retrieval-blind-evaluation.mjs'

test('blind fixture is frozen, disjoint by split and contains every required safety category', () => {
  assert.equal(SYNTHETIC_BLIND_CORPUS.length, SYNTHETIC_BLIND_EXPECTED.corpus)
  assert.equal(SYNTHETIC_BLIND_QUERIES.length, SYNTHETIC_BLIND_EXPECTED.queries)
  const calibration = SYNTHETIC_BLIND_QUERIES.filter((item) => item.split === 'calibration')
  const blind = SYNTHETIC_BLIND_QUERIES.filter((item) => item.split === 'blind')
  assert.equal(calibration.length, SYNTHETIC_BLIND_EXPECTED.calibration)
  assert.equal(blind.length, SYNTHETIC_BLIND_EXPECTED.blind)
  assert.equal(blind.filter((item) => item.relevant.length > 0).length, SYNTHETIC_BLIND_EXPECTED.blind_answerable)
  assert.equal(blind.filter((item) => item.category === 'no_answer').length, SYNTHETIC_BLIND_EXPECTED.blind_no_answer)
  assert.equal(blind.filter((item) => item.category === 'adversarial').length, SYNTHETIC_BLIND_EXPECTED.blind_adversarial)
  assert.equal(new Set(SYNTHETIC_BLIND_QUERIES.map((item) => item.query)).size, SYNTHETIC_BLIND_QUERIES.length)
})

test('threshold is selected only from calibration metrics and then applied unchanged to blind queries', () => {
  const rankings = Object.fromEntries(SYNTHETIC_BLIND_QUERIES.map((query) => {
    const relevant = query.relevant[0]
    const answerable = Boolean(relevant)
    return [query.id, answerable
      ? [{ document_id: relevant, score: 0.8 }]
      : [{ document_id: SYNTHETIC_BLIND_CORPUS[0].id, score: 0.55 }]]
  }))
  const result = calibrateThreshold({ fixture_id: BLIND_RETRIEVAL_FIXTURE_ID, rankings }, [0.5, 0.6, 0.7, 0.9])
  assert.equal(result.selected_threshold, 0.6)
  assert.equal(result.calibration_gate_passed, true)
  assert.equal(result.blind_gate_passed, true)
  assert.equal(result.blind.threshold, result.selected_threshold)
  assert.equal(result.blind.no_answer_false_positive_rate, 0)
  assert.equal(result.blind.unsafe_refusal_rate, 1)
})

test('calibration fails closed when no threshold separates answers from no-answer neighbours', () => {
  const rankings = Object.fromEntries(SYNTHETIC_BLIND_QUERIES.map((query) => [query.id, [
    { document_id: query.relevant[0] ?? SYNTHETIC_BLIND_CORPUS[0].id, score: 0.7 },
  ]]))
  const result = calibrateThreshold({ fixture_id: BLIND_RETRIEVAL_FIXTURE_ID, rankings }, [0.6, 0.7, 0.8])
  assert.equal(result.selected_threshold, null)
  assert.equal(result.calibration_gate_passed, false)
  assert.equal(result.blind_gate_passed, false)
  assert.equal(result.blind, null)
})
