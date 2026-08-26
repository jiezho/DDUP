const DEFAULT_MODEL_ID = 'BAAI/bge-m3'
const DEFAULT_MODEL_REVISION = '5617a9f61b028005a4858fdac845db406aefb181'
const MAX_RESPONSE_BYTES = 64 * 1024
const MAX_CANDIDATES = 200
const MAX_TEXT_CHARS = 2_300

function loopbackEndpoint(value) {
  const endpoint = new URL(String(value || ''))
  if (
    endpoint.protocol !== 'http:'
    || endpoint.hostname !== '127.0.0.1'
    || endpoint.username
    || endpoint.password
    || endpoint.search
    || endpoint.hash
    || !endpoint.port
    || endpoint.pathname !== '/'
  ) {
    throw new TypeError('Dense sidecar endpoint must be an explicit http://127.0.0.1:<port>/ URL.')
  }
  const port = Number(endpoint.port)
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new TypeError('Dense sidecar port must be between 1024 and 65535.')
  }
  return endpoint
}

async function boundedJson(response) {
  if (!response?.ok) throw new Error('dense sidecar request failed')
  const text = await response.text()
  if (Buffer.byteLength(text, 'utf8') > MAX_RESPONSE_BYTES) {
    throw new Error('dense sidecar response exceeded the safe limit')
  }
  return JSON.parse(text)
}

function withTimeout(timeoutMs, operation) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  timeout.unref?.()
  return operation(controller.signal).finally(() => clearTimeout(timeout))
}

export function createLoopbackDenseAdapter({
  endpoint,
  fetchImpl = globalThis.fetch,
  timeoutMs = 1_500,
  authToken,
  expectedModelId = DEFAULT_MODEL_ID,
  expectedRevision = DEFAULT_MODEL_REVISION,
} = {}) {
  const base = loopbackEndpoint(endpoint)
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl is required')
  if (typeof authToken !== 'string' || authToken.length < 32 || authToken.length > 256) {
    throw new TypeError('Dense sidecar token must contain between 32 and 256 characters.')
  }
  const authorization = `Bearer ${authToken}`
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 5_000) {
    throw new TypeError('Dense sidecar timeout must be between 100 and 5000 ms.')
  }

  async function health() {
    const payload = await withTimeout(timeoutMs, async (signal) => boundedJson(await fetchImpl(new URL('health', base), {
      method: 'GET',
      headers: { Accept: 'application/json', Authorization: authorization },
      redirect: 'error',
      signal,
    })))
    if (
      payload?.status !== 'ok'
      || payload?.model_id !== expectedModelId
      || payload?.model_revision !== expectedRevision
      || payload?.device !== 'cpu'
    ) {
      throw new Error('dense sidecar identity did not match the reviewed model')
    }
    return Object.freeze({
      status: 'ok',
      model_id: expectedModelId,
      model_revision: expectedRevision,
      device: 'cpu',
    })
  }

  async function rank({ query, candidates, limit }) {
    if (!Array.isArray(candidates) || candidates.length > MAX_CANDIDATES) {
      throw new RangeError('Dense sidecar candidate count exceeded the safe limit.')
    }
    const safeCandidates = candidates.map((candidate) => {
      const candidateId = String(candidate?.candidate_id || '')
      const text = String(candidate?.text || '')
      if (!candidateId || text.length < 1 || text.length > MAX_TEXT_CHARS) {
        throw new TypeError('Dense sidecar candidate is invalid.')
      }
      return { candidate_id: candidateId, text }
    })
    const safeLimit = Math.min(Math.max(Number(limit) || 1, 1), 30)
    const payload = await withTimeout(timeoutMs, async (signal) => boundedJson(await fetchImpl(new URL('rank', base), {
      method: 'POST',
      headers: { Accept: 'application/json', Authorization: authorization, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: String(query), candidates: safeCandidates, limit: safeLimit }),
      redirect: 'error',
      signal,
    })))
    if (!Array.isArray(payload?.results) || payload.results.length > safeCandidates.length) {
      throw new Error('dense sidecar returned an invalid ranking')
    }
    return payload.results.map((item) => {
      const candidateId = String(item?.candidate_id || '')
      const score = Number(item?.score)
      if (!candidateId || !Number.isFinite(score) || score < -1 || score > 1) {
        throw new Error('dense sidecar returned an invalid score')
      }
      return Object.freeze({ candidate_id: candidateId, score })
    })
  }

  return Object.freeze({ health, rank })
}

export function hybridSearchRuntimeFromEnv(env = process.env, options = {}) {
  const mode = String(env.WORKBENCH_HYBRID_SEARCH_MODE || 'disabled').trim().toLowerCase()
  if (mode === 'disabled') return Object.freeze({ enabled: false, adapter: null, minScore: 0.72 })
  if (mode !== 'experimental') {
    throw new TypeError('WORKBENCH_HYBRID_SEARCH_MODE must be disabled or experimental.')
  }
  const rawScore = env.WORKBENCH_DENSE_MIN_SCORE ?? '0.72'
  const minScore = Number(rawScore)
  if (!Number.isFinite(minScore) || minScore < 0 || minScore > 1) {
    throw new TypeError('WORKBENCH_DENSE_MIN_SCORE must be between 0 and 1.')
  }
  return Object.freeze({
    enabled: true,
    minScore,
    adapter: createLoopbackDenseAdapter({
      endpoint: env.WORKBENCH_DENSE_SIDECAR_URL,
      authToken: env.WORKBENCH_DENSE_SIDECAR_TOKEN,
      fetchImpl: options.fetchImpl,
      timeoutMs: options.timeoutMs,
    }),
  })
}
