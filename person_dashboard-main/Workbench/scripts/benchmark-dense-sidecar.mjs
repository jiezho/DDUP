import { performance } from 'node:perf_hooks'
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const MODEL_ID = 'BAAI/bge-m3'
const MODEL_REVISION = '5617a9f61b028005a4858fdac845db406aefb181'
const WARMUP_REQUESTS = 2
const SEQUENTIAL_REQUESTS = 8
const CONCURRENT_ROUNDS = 1
const CONCURRENCY = 2
const REQUEST_TIMEOUT_MS = 120_000

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

const endpoint = new URL(required('WORKBENCH_DENSE_SIDECAR_URL'))
const token = required('WORKBENCH_DENSE_SIDECAR_TOKEN')
const output = resolve(process.argv[2] || '../../product/evidence/BGE-M3-sidecar-short-endurance.json')
if (endpoint.protocol !== 'http:' || endpoint.hostname !== '127.0.0.1' || !endpoint.port) {
  throw new Error('Benchmark accepts only an explicit loopback HTTP endpoint.')
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
    const latency = performance.now() - started
    const valid = response.status === 200
      && Array.isArray(body.results)
      && body.results.length === 4
      && body.results[0]?.candidate_id === 'synthetic-repro-log'
    return { latency, valid, status: response.status, error_code: valid ? null : 'invalid_response' }
  } catch (error) {
    return {
      latency: performance.now() - started,
      valid: false,
      status: null,
      error_code: error?.name === 'TimeoutError' ? 'request_timeout' : 'transport_error',
    }
  }
}

const unauthorized = await fetch(new URL('health', endpoint), { redirect: 'error' })
const preHealth = await health()
for (let index = 0; index < WARMUP_REQUESTS; index += 1) {
  const warmup = await rankOnce()
  if (!warmup.valid) throw new Error('Sidecar warmup ranking failed.')
}

const started = performance.now()
const sequential = []
for (let index = 0; index < SEQUENTIAL_REQUESTS; index += 1) sequential.push(await rankOnce())
const concurrent = []
for (let round = 0; round < CONCURRENT_ROUNDS; round += 1) {
  concurrent.push(...await Promise.all(Array.from({ length: CONCURRENCY }, () => rankOnce())))
}
const elapsedMs = performance.now() - started
let postHealth = null
try {
  postHealth = await health()
} catch {
  postHealth = null
}
const all = [...sequential, ...concurrent]
const errorCount = all.filter((item) => !item.valid).length
const identityStable = postHealth?.model_id === preHealth.model_id && postHealth?.model_revision === preHealth.model_revision
const status = unauthorized.status === 401 && errorCount === 0 && identityStable
  ? 'passed_short_local_sample'
  : 'failed_keep_experimental_disabled'

const summarize = (items) => ({
  requests: items.length,
  p50_ms: percentile(items.map((item) => item.latency), 0.5),
  p95_ms: percentile(items.map((item) => item.latency), 0.95),
  max_ms: Number(Math.max(...items.map((item) => item.latency)).toFixed(2)),
  errors: items.filter((item) => !item.valid).length,
})
const evidence = {
  schema_version: 'dd-up-sidecar-short-endurance-v1',
  generated_at: new Date().toISOString(),
  status,
  data_classification: 'explicitly_synthetic',
  endpoint_scope: '127.0.0.1_loopback_only',
  authentication: { unauthorized_health_status: unauthorized.status },
  model: { model_id: preHealth.model_id, model_revision: preHealth.model_revision, device: preHealth.device },
  workload: {
    warmup_requests: WARMUP_REQUESTS,
    sequential_requests: SEQUENTIAL_REQUESTS,
    concurrent_rounds: CONCURRENT_ROUNDS,
    concurrency: CONCURRENCY,
    request_timeout_ms: REQUEST_TIMEOUT_MS,
    candidate_count: requestBody.candidates.length,
    total_measured_requests: all.length,
  },
  measurements: {
    elapsed_ms: Number(elapsedMs.toFixed(2)),
    throughput_requests_per_second: Number((all.length / (elapsedMs / 1000)).toFixed(3)),
    sequential: summarize(sequential),
    concurrent: summarize(concurrent),
    total_errors: errorCount,
    error_codes: [...new Set(all.map((item) => item.error_code).filter(Boolean))],
    identity_stable_after_run: identityStable,
  },
  interpretation_limits: [
    'short_local_cpu_sample_not_production_capacity',
    'model_runtime_serializes_inference_so_concurrent_requests_queue',
    'no_memory_leak_or_long_duration_stability_conclusion',
    'no_real_data_no_generated_answer_no_production_enablement',
  ],
}

await writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`, { encoding: 'utf8', flag: 'w' })
console.log(JSON.stringify({ status, output, measurements: evidence.measurements }, null, 2))
if (status !== 'passed_short_local_sample') process.exitCode = 1
