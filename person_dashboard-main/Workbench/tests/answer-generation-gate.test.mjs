import assert from 'node:assert/strict'
import test from 'node:test'

import { projectAnswerGenerationGate } from '../server/context/answer-generation-gate.mjs'

test('generation gate prioritizes safety refusal and citation integrity before runtime availability', () => {
  assert.equal(projectAnswerGenerationGate({ status: 'refused_unsafe_intent', integrity: { state: 'not_applicable' } }).state, 'blocked_refusal')
  assert.equal(projectAnswerGenerationGate({ status: 'refused_no_citable_evidence', integrity: { state: 'not_applicable' } }).state, 'blocked_refusal')
  assert.equal(projectAnswerGenerationGate({ status: 'evidence_ready', integrity: { state: 'invalid' } }).state, 'blocked_integrity')
  assert.equal(projectAnswerGenerationGate({ status: 'evidence_ready', integrity: null }).state, 'blocked_integrity')
})

test('verified evidence still fails closed while no approved answer runtime exists', () => {
  assert.deepEqual(
    projectAnswerGenerationGate({ status: 'evidence_ready', integrity: { state: 'verified' } }),
    {
      state: 'blocked_model_unavailable',
      reason_code: 'ANSWER_RUNTIME_UNAVAILABLE',
      reason: '证据已通过前置检查，但尚未配置获准的回答运行时。',
      available: false,
      runtime_id: null,
      profile_id: null,
    },
  )
})
