import {
  AuthorizedSearchScopeSchema,
  DEFAULT_FUSION_CONFIG,
  SearchCandidateSchema,
  assertSearchProvider,
  citationEligibility,
} from './hybrid-search-contracts.mjs'

function cloneFrozen(value) {
  const clone = structuredClone(value)
  Object.freeze(clone.project_ids)
  Object.freeze(clone.object_types)
  return Object.freeze(clone)
}

function isCandidateAuthorized(candidate, scope) {
  if (candidate.space_id !== scope.space_id) return false
  if (!scope.object_types.includes(candidate.object_type)) return false
  if (scope.project_ids.length > 0 && !candidate.project_id) return false
  if (scope.project_ids.length > 0 && !scope.project_ids.includes(candidate.project_id)) return false
  const localDate = candidate.updated_at.slice(0, 10)
  if (scope.from && localDate < scope.from) return false
  if (scope.to && localDate > scope.to) return false
  return true
}

function candidateKey(candidate) {
  return `${candidate.object_type}:${candidate.object_id}`
}

export function reciprocalRankFusion(candidateLists, config = DEFAULT_FUSION_CONFIG) {
  const k = Number(config.k)
  if (!Number.isFinite(k) || k <= 0) throw new RangeError('RRF k 必须大于 0。')
  const weights = config.provider_weights || DEFAULT_FUSION_CONFIG.provider_weights
  const fused = new Map()

  for (const list of candidateLists) {
    for (const candidate of list) {
      const key = candidateKey(candidate)
      const weight = Number(weights[candidate.provider] ?? 1)
      const contribution = weight / (k + candidate.rank)
      const current = fused.get(key) || {
        ...candidate,
        fusion_score: 0,
        provider_hits: [],
      }
      current.fusion_score += contribution
      current.provider_hits.push(Object.freeze({
        provider: candidate.provider,
        rank: candidate.rank,
        provider_score: candidate.provider_score ?? null,
        contribution,
      }))
      if (candidate.rank < current.rank) {
        current.rank = candidate.rank
        current.snippet = candidate.snippet
      }
      fused.set(key, current)
    }
  }

  return [...fused.values()]
    .sort((left, right) => right.fusion_score - left.fusion_score || candidateKey(left).localeCompare(candidateKey(right)))
}

export async function runAuthorizedHybridSearch({
  query,
  authorizedScope,
  providers,
  filters = {},
  fusionConfig = DEFAULT_FUSION_CONFIG,
}) {
  const normalizedQuery = String(query || '').trim()
  if (normalizedQuery.length < 2) throw new RangeError('检索词至少需要 2 个字符。')
  const scope = cloneFrozen(AuthorizedSearchScopeSchema.parse(authorizedScope))
  const providerList = providers.map(assertSearchProvider)
  if (providerList.length === 0) throw new RangeError('至少需要一个 SearchProvider。')

  const candidateLists = []
  const diagnostics = []
  for (const provider of providerList) {
    const raw = await provider.search({
      query: normalizedQuery,
      authorized_scope: scope,
      filters: structuredClone(filters),
      limit: fusionConfig.candidate_limit,
    })
    const accepted = []
    let rejectedCount = 0
    for (const item of raw || []) {
      const candidate = SearchCandidateSchema.parse({ ...item, provider: provider.kind })
      if (!isCandidateAuthorized(candidate, scope)) {
        rejectedCount += 1
        continue
      }
      accepted.push(candidate)
    }
    candidateLists.push(accepted)
    diagnostics.push(Object.freeze({
      provider: provider.kind,
      accepted_count: accepted.length,
      rejected_count: rejectedCount,
    }))
  }

  const results = reciprocalRankFusion(candidateLists, fusionConfig)
    .slice(0, fusionConfig.result_limit)
    .map((candidate, index) => Object.freeze({
      ...candidate,
      final_rank: index + 1,
      citation: citationEligibility(candidate),
      scope: Object.freeze({
        space_id: scope.space_id,
        project_ids: scope.project_ids,
        object_types: scope.object_types,
        from: scope.from || null,
        to: scope.to || null,
      }),
      fusion_config_version: fusionConfig.version,
      reranked: false,
    }))

  return Object.freeze({
    query: normalizedQuery,
    scope,
    results: Object.freeze(results),
    diagnostics: Object.freeze(diagnostics),
    capabilities: Object.freeze({
      lexical: providerList.some((provider) => provider.kind === 'lexical'),
      dense: providerList.some((provider) => provider.kind === 'dense'),
      reranker: false,
    }),
  })
}
