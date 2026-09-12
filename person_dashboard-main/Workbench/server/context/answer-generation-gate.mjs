const MODEL_GATE = Object.freeze({
  available: false,
  runtime_id: null,
  profile_id: null,
})

export function projectAnswerGenerationGate({ status, integrity, provider = null } = {}) {
  if (status !== 'evidence_ready') {
    return Object.freeze({
      state: 'blocked_refusal',
      reason_code: 'ANSWER_ATTEMPT_REFUSED',
      reason: '当前回答尝试已被安全规则拒绝，不得进入生成运行时。',
      ...MODEL_GATE,
    })
  }
  if (integrity?.state !== 'verified') {
    return Object.freeze({
      state: 'blocked_integrity',
      reason_code: 'CITATION_INTEGRITY_NOT_VERIFIED',
      reason: '固定引用未通过当前完整性复核，不得进入生成运行时。',
      ...MODEL_GATE,
    })
  }
  if (provider?.available && provider.runtime_key) {
    return Object.freeze({
      state: 'ready',
      reason_code: null,
      reason: '固定引用已通过复核，可进入本地保守回答运行时。',
      available: true,
      runtime_id: provider.runtime_key,
      profile_id: 'direct-quote-entailment-v1',
    })
  }
  return Object.freeze({
    state: 'blocked_model_unavailable',
    reason_code: 'ANSWER_RUNTIME_UNAVAILABLE',
    reason: '证据已通过前置检查，但尚未配置获准的回答运行时。',
    ...MODEL_GATE,
  })
}
