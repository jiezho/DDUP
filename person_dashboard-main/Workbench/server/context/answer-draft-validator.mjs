function normalizeExtractiveText(value) {
  return value.normalize('NFC').replace(/\r\n?/g, '\n').trim()
}

export function validateExtractiveClaims(claims, citationRanges) {
  const rangesByOrdinal = new Map(citationRanges.map((citation) => [citation.ordinal, citation.text]))
  const results = claims.map((claim, index) => {
    const normalizedClaim = normalizeExtractiveText(claim.text)
    const available = claim.citation_ordinals
      .map((ordinal) => ({ ordinal, text: rangesByOrdinal.get(ordinal) }))
      .filter((citation) => typeof citation.text === 'string')
    const matched = available.find((citation) => normalizeExtractiveText(citation.text).includes(normalizedClaim))
    const reasonCode = matched
      ? 'EXACT_TEXT_FOUND'
      : available.length ? 'EXACT_TEXT_NOT_FOUND' : 'CITATION_NOT_AVAILABLE'
    return {
      ordinal: index + 1,
      supported: Boolean(matched),
      reason_code: reasonCode,
      matched_citation_ordinal: matched?.ordinal ?? null,
    }
  })
  const supportedCount = results.filter((claim) => claim.supported).length
  return {
    state: supportedCount === results.length ? 'passed' : 'failed',
    reason_code: supportedCount === results.length ? 'ALL_CLAIMS_EXACTLY_SUPPORTED' : 'CLAIM_NOT_EXACTLY_SUPPORTED',
    reason: supportedCount === results.length
      ? '所有候选句都能在所标注的固定引用范围内原样定位。'
      : '至少一个候选句无法在所标注的固定引用范围内原样定位。',
    claim_count: results.length,
    supported_count: supportedCount,
    unsupported_count: results.length - supportedCount,
    semantic_entailment: false,
    persistence_enabled: false,
    generation_enabled: false,
    claims: results,
  }
}
