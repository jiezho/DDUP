import { DEFAULT_FUSION_CONFIG } from './hybrid-search-contracts.mjs'
import { runAuthorizedHybridSearch } from './hybrid-search-pipeline.mjs'
import { classifySearchIntent } from './search-intent-guard.mjs'

const SERVICE_VERSION = 'protected-hybrid-v1'

function scopeFor(input) {
  return {
    space_id: input.space_id,
    project_ids: input.project_id ? [input.project_id] : [],
    object_types: input.types,
    ...(input.from ? { from: input.from } : {}),
    ...(input.to ? { to: input.to } : {}),
  }
}

function publicScope(input, reason) {
  return {
    applied: {
      space_id: input.space_id,
      project_id: input.project_id ?? null,
      types: input.types,
      from: input.from ?? null,
      to: input.to ?? null,
    },
    omitted: [],
    reason,
  }
}

function lexicalProvider(items) {
  return {
    kind: 'lexical',
    async search() {
      return items.map((item, index) => ({
        object_type: item.object_type,
        object_id: item.object_id,
        space_id: item.space_id,
        project_id: item.project_id,
        title: item.title,
        snippet: item.excerpt,
        updated_at: item.updated_at,
        rank: index + 1,
        ...(item.score == null ? {} : { provider_score: item.score }),
        source_id: item.source_id ?? null,
        source_version_id: item.locator?.source_version_id ?? null,
        document_id: item.document_id ?? null,
        locator: item.locator?.type === 'char_range'
          ? { type: 'char_range', start_char: item.locator.start, end_char: item.locator.end }
          : { type: 'object', route: item.locator?.route || `/${item.object_type}s/${item.object_id}` },
      }))
    },
  }
}

function denseProvider(corpus, rankings, minScore) {
  const byId = new Map(corpus.map((item) => [item.candidate_id, item]))
  return {
    kind: 'dense',
    async search() {
      const seen = new Set()
      const seenDocuments = new Set()
      const candidates = []
      for (const item of rankings) {
        if (seen.has(item.candidate_id) || item.score < minScore) continue
        const source = byId.get(item.candidate_id)
        if (!source || seenDocuments.has(source.document_id)) continue
        seen.add(item.candidate_id)
        seenDocuments.add(source.document_id)
        candidates.push({
          object_type: 'document',
          object_id: source.object_id,
          space_id: source.space_id,
          project_id: source.project_id,
          title: source.title,
          snippet: source.snippet,
          updated_at: source.updated_at,
          rank: candidates.length + 1,
          provider_score: item.score,
          source_id: source.source_id,
          source_version_id: source.source_version_id,
          document_id: source.document_id,
          locator: source.locator,
        })
      }
      return candidates
    },
  }
}

function fallback(lexical, reason) {
  return {
    ...lexical,
    hybrid: {
      state: reason === 'feature_flag_off' ? 'disabled' : 'fallback',
      service_version: SERVICE_VERSION,
      reason,
      dense_attempted: ['dense_runtime_unavailable', 'no_qualified_dense_evidence'].includes(reason),
      generated_answer_enabled: false,
    },
  }
}

function apiItems(results) {
  return results.map((item) => ({
    object_type: item.object_type,
    object_id: item.object_id,
    space_id: item.space_id,
    project_id: item.project_id,
    title: item.title,
    updated_at: item.updated_at,
    score: item.fusion_score,
    excerpt: item.snippet,
    match: {
      field: item.locator.type === 'char_range' ? 'body' : 'object',
      strategy: 'rrf_v1',
      providers: item.provider_hits.map((hit) => hit.provider),
    },
    source_id: item.source_id,
    document_id: item.document_id,
    locator: item.locator.type === 'char_range'
      ? {
          type: 'char_range',
          source_version_id: item.source_version_id,
          start: item.locator.start_char,
          end: item.locator.end_char,
          quote: item.snippet,
        }
      : { type: 'object', route: item.locator.route },
    citation: item.citation,
  }))
}

export function createProtectedSearchService({ contextStore, hybridSearch = {} } = {}) {
  if (!contextStore) throw new TypeError('contextStore is required')
  const enabled = hybridSearch.enabled === true
  const adapter = hybridSearch.adapter ?? null
  const minScore = Number(hybridSearch.minScore ?? 0.50)
  if (!Number.isFinite(minScore) || minScore < 0 || minScore > 1) {
    throw new TypeError('hybridSearch.minScore must be between 0 and 1')
  }

  async function search(session, input) {
    contextStore.authorizeSearch(session, input)
    const intent = classifySearchIntent(input.q)
    if (!intent.allowed) {
      return {
        items: [],
        scope: publicScope(input, '请求未进入检索；未返回任何对象或范围存在性。'),
        baseline: { engine: 'not_run', semantic: false, reranked: false },
        hybrid: {
          state: 'refused',
          service_version: SERVICE_VERSION,
          reason: 'unsafe_search_intent',
          reason_code: intent.reason_code,
          dense_attempted: false,
          generated_answer_enabled: false,
        },
      }
    }

    const lexical = contextStore.search(session, input)
    if (!enabled) return fallback(lexical, 'feature_flag_off')
    if (!input.types.includes('document')) return fallback(lexical, 'document_type_not_requested')
    if (!adapter) return fallback(lexical, 'dense_adapter_unavailable')

    try {
      const corpus = contextStore.listAuthorizedDenseCorpus(session, input, { limit: 200 })
      if (corpus.length === 0) return fallback(lexical, 'no_authorized_documents')
      await adapter.health()
      const rankings = await adapter.rank({
        query: input.q,
        candidates: corpus.map((item) => ({ candidate_id: item.candidate_id, text: item.embedding_text })),
        limit: DEFAULT_FUSION_CONFIG.candidate_limit,
      })
      const dense = denseProvider(corpus, rankings, minScore)
      const denseCandidates = await dense.search()
      if (denseCandidates.length === 0) return fallback(lexical, 'no_qualified_dense_evidence')
      const hybrid = await runAuthorizedHybridSearch({
        query: input.q,
        authorizedScope: scopeFor(input),
        providers: [lexicalProvider(lexical.items), dense],
        fusionConfig: { ...DEFAULT_FUSION_CONFIG, result_limit: input.limit },
      })
      return {
        items: apiItems(hybrid.results),
        scope: publicScope(input, '权限过滤和文档范围裁剪先于本地 dense 调用；结果经 RRF 融合。'),
        baseline: { engine: 'sqlite_fts5_plus_bge_m3_rrf', semantic: true, reranked: false },
        hybrid: {
          state: 'active',
          service_version: SERVICE_VERSION,
          reason: 'qualified_dense_evidence',
          dense_attempted: true,
          min_score: minScore,
          fusion_config_version: DEFAULT_FUSION_CONFIG.version,
          generated_answer_enabled: false,
        },
      }
    } catch {
      return fallback(lexical, 'dense_runtime_unavailable')
    }
  }

  return Object.freeze({ search, enabled })
}
