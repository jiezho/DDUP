function normalized(value) {
  return String(value ?? '').normalize('NFC').replace(/\r\n?/g, '\n').trim()
}

function boundedClaim(value, maxLength = 500) {
  const text = normalized(value)
  if (text.length <= maxLength) return text
  const boundary = Math.max(text.lastIndexOf('。', maxLength), text.lastIndexOf('！', maxLength), text.lastIndexOf('？', maxLength), text.lastIndexOf('\n', maxLength))
  return text.slice(0, boundary >= 40 ? boundary + 1 : maxLength).trim()
}

export function createConservativeAnswerProvider() {
  return Object.freeze({
    runtime_key: 'local-extractive-v1',
    available: true,
    generate({ citations }) {
      const claims = citations.slice(0, 3).map((citation) => ({
        text: boundedClaim(citation.text),
        claim_kind: 'direct_quote',
        citation_ordinals: [citation.ordinal],
      })).filter((claim) => claim.text)
      return { claims }
    },
  })
}

export function validateEntailment(claims, citations) {
  const byOrdinal = new Map(citations.map((citation) => [citation.ordinal, normalized(citation.text)]))
  return claims.map((claim, index) => {
    const text = normalized(claim.text)
    const cited = claim.citation_ordinals.map((ordinal) => byOrdinal.get(ordinal)).filter(Boolean)
    const supported = claim.claim_kind === 'direct_quote' && cited.some((evidence) => evidence.includes(text))
    return {
      ordinal: index + 1,
      supported,
      reason_code: supported ? 'DIRECT_QUOTE_ENTAILED' : 'SEMANTIC_ENTAILMENT_NOT_VERIFIED',
    }
  })
}
