import assert from 'node:assert/strict'
import test from 'node:test'

import { validateExtractiveClaims } from '../server/context/answer-draft-validator.mjs'

test('extractive claim validator only passes exact text inside a cited fixed range', () => {
  const result = validateExtractiveClaims([
    { text: '固定来源版本可以支撑可审计的引用定位。', citation_ordinals: [1] },
    { text: '固定来源版本能够支持引用审计。', citation_ordinals: [1] },
  ], [{ ordinal: 1, text: '合成回答证据\n\n固定来源版本可以支撑可审计的引用定位。' }])

  assert.equal(result.state, 'failed')
  assert.equal(result.supported_count, 1)
  assert.equal(result.unsupported_count, 1)
  assert.deepEqual(result.claims, [
    { ordinal: 1, supported: true, reason_code: 'EXACT_TEXT_FOUND', matched_citation_ordinal: 1 },
    { ordinal: 2, supported: false, reason_code: 'EXACT_TEXT_NOT_FOUND', matched_citation_ordinal: null },
  ])
  assert.equal(result.semantic_entailment, false)
  assert.equal(result.persistence_enabled, false)
  assert.equal(result.generation_enabled, false)
  assert.equal('text' in result.claims[0], false)
})

test('extractive claim validator fails closed when the referenced citation is unavailable', () => {
  const result = validateExtractiveClaims([
    { text: '合成候选句', citation_ordinals: [9] },
  ], [{ ordinal: 1, text: '合成证据' }])

  assert.equal(result.state, 'failed')
  assert.equal(result.claims[0].reason_code, 'CITATION_NOT_AVAILABLE')
  assert.equal(result.claims[0].matched_citation_ordinal, null)
})
