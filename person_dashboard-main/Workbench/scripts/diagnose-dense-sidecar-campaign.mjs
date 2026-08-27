import { performance } from 'node:perf_hooks'
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const MODEL_ID = 'BAAI/bge-m3'
const MODEL_REVISION = '5617a9f61b028005a4858fdac845db406aefb181'
const REQUEST_TIMEOUT_MS = 10_000
const SEQUENTIAL_REQUESTS = 8

function required(name) {
  const value = String(process.env[name] || '')
  if (!value) throw new Error(`${name} is required`)
  return value
}

function percentile(values, fraction) {
  const sorted = [...values].sort((left, right) => left - right)
  const index = Math.max(0, Math.ceil(sorted.length * fraction) - 1)
  return Number(sorted[index].toFixed(2))
}

const output = resolve(process.argv[2] || '../../product/evidence/BGE-M3-sidecar-campaign.json')
const mode = String(process.argv[3] || 'sequential')
if (!['sequential', 'concurrent'].includes(mode)) throw new Error('Mode must be sequential or concurrent.')
const endpoint = new URL(required('WORKBENCH_DENSE_SIDECAR_URL'))
const token = required('WORKBENCH_DENSE_SIDECAR_TOKEN')
if (endpoint.protocol !== 'http:' || endpoint.hostname !== '127.0.0.1' || !endpoint.port) {
  throw new Error('Diagnostic accepts only an explicit loopback HTTP endpoint.')
}
if (token.length < 32 || token.length > 256) throw new Error('Invalid sidecar token length.')

const requestBody = Object.freeze({
  query: '如何为可复现实验保留环境哈希、随机种子和停止条件',
  candidates: Object.freeze([
    Object.freeze({ candidate_id: 'synthetic-repro-log', text: '虚构科研台账保存环境哈希、随机种子、停止条件、数据版本与负结果，确保运行可以复现。' }),
    Object.freeze({ candidate_id: 'synthetic-academic-english', text: '虚构学习计划使用 claim evidence limitation 结构练习学术英语问答。' }),
    Object.freeze({ candidate_id: 'synthetic-power-envelope', text: '虚构电力研究记录灵活性包络、荷电状态和上下调节约束。' }),
    Object.freeze({ candidate_id: 'synthetic-weekly-plan', text: '虚构周计划汇总力量训练、睡眠偏差和学习投入。' }),
  ]),
  limit: 4,
})

async function health() {
  const response = await fetch(new URL('health', endpoint), {
    headers: { Authorization: `Bearer ${token}` },
    redirect: 'error',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  const body = await response.json()
  if (response.status !== 200 || body.status !== 'ok' || body.model_id !== MODEL_ID || body.model_revision !== MODEL_REVISION) {
    throw new Error('Sidecar identity check failed.')
  }
  return body
}

async function rankOnce() {
  const started = performance.now()
  try {
    const response = await fetch(new URL('rank', endpoint), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      redirect: 'error',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    const body = await response.json()
    const validRanking = response.status === 200
      && Array.isArray(body.results)
      && body.results.length === 4
      && body.results[0]?.candidate_id === 'synthetic-repro-log'
    const boundedBusy = response.status === 503 && body.error === 'runtime_busy'
    return {
      latency_ms: Number((performance.now() - started).toFixed(2)),
      status: response.status,
      outcome: validRanking ? 'ranked' : boundedBusy ? 'busy' : 'invalid_response',
    }
  } catch (error) {
    return {
      latency_ms: Number((performance.now() - started).toFixed(2)),
      status: null,
      outcome: error?.name === 'TimeoutError' ? 'request_timeout' : 'transport_error',
    }
  }
}

const unauthorized = await fetch(new URL('health', endpoint), { redirect: 'error' })
const preHealth = await health()
const cachePrime = await rankOnce()
if (cachePrime.outcome !== 'ranked') throw new Error('Sidecar cache-prime ranking failed.')

const started = performance.now()
const requests = mode === 'sequential'
  ? await (async () => {
      const items = []
      for (let index = 0; index < SEQUENTIAL_REQUESTS; index += 1) items.push(await rankOnce())
      return items
    })()
  : await Promise.all([rankOnce(), rankOnce()])
const elapsedMs = performance.now() - started
const postHealth = await health()
const latencies = requests.map((item) => item.latency_ms)
const rankedCount = requests.filter((item) => item.outcome === 'ranked').length
const busyCount = requests.filter((item) => item.outcome === 'busy').length
const errorCount = requests.length - rankedCount - busyCount
const identityStable = postHealth.model_id === preHealth.model_id && postHealth.model_revision === preHealth.model_revision
const passed = mode === 'sequential'
  ? rankedCount === SEQUENTIAL_REQUESTS && errorCount === 0
  : rankedCount === 1 && busyCount === 1 && errorCount === 0 && elapsedMs < 2_000
const status = unauthorized.status === 401 && identityStable && passed
  ? `passed_${mode}_campaign_slice`
  : `failed_${mode}_campaign_slice`

const evidence = {
  schema_version: 'dd-up-sidecar-degradation-campaign-v1',
  generated_at: new Date().toISOString(),
  status,
  slice_mode: mode,
  data_classification: 'explicitly_synthetic',
  endpoint_scope: '127.0.0.1_loopback_only',
  authentication: { unauthorized_health_status: unauthorized.status },
  model: { model_id: preHealth.model_id, model_revision: preHealth.model_revision, device: preHealth.device },
  workload: {
    cache_prime: 1,
    measured_requests: requests.length,
    request_timeout_ms: REQUEST_TIMEOUT_MS,
    candidate_count: requestBody.candidates.length,
  },
  measurements: {
    cache_prime: cachePrime,
    requests,
    elapsed_ms: Number(elapsedMs.toFixed(2)),
    p50_ms: percentile(latencies, 0.5),
    p95_ms: percentile(latencies, 0.95),
    max_ms: Number(Math.max(...latencies).toFixed(2)),
    ranked_count: rankedCount,
    busy_count: busyCount,
    error_count: errorCount,
    identity_stable_after_run: identityStable,
  },
  interpretation_limits: [
    'short_local_cpu_sample_not_production_capacity',
    'process_local_vector_cache_is_ephemeral_and_stores_no_plaintext',
    'no_real_data_no_generated_answer_no_production_enablement',
  ],
}

await writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`, { encoding: 'utf8', flag: 'w' })
console.log(JSON.stringify({ status, output, measurements: evidence.measurements }, null, 2))
if (!passed) process.exitCode = 1
