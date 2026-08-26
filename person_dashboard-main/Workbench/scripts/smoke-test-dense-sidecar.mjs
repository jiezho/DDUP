import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const MODEL_ID = 'BAAI/bge-m3'
const MODEL_REVISION = '5617a9f61b028005a4858fdac845db406aefb181'

function required(name) {
  const value = String(process.env[name] || '')
  if (!value) throw new Error(`${name} is required`)
  return value
}

const endpoint = new URL(required('WORKBENCH_DENSE_SIDECAR_URL'))
const token = required('WORKBENCH_DENSE_SIDECAR_TOKEN')
const output = resolve(process.argv[2] || '../../product/evidence/BGE-M3-protected-sidecar-smoke.json')

if (endpoint.protocol !== 'http:' || endpoint.hostname !== '127.0.0.1' || !endpoint.port) {
  throw new Error('Smoke test accepts only an explicit loopback HTTP endpoint.')
}
if (token.length < 32 || token.length > 256) throw new Error('Invalid sidecar token length.')

const unauthorized = await fetch(new URL('health', endpoint), { redirect: 'error' })
const authorized = await fetch(new URL('health', endpoint), {
  headers: { Authorization: `Bearer ${token}` },
  redirect: 'error',
})
const health = await authorized.json()
if (
  unauthorized.status !== 401
  || authorized.status !== 200
  || health.status !== 'ok'
  || health.model_id !== MODEL_ID
  || health.model_revision !== MODEL_REVISION
  || health.device !== 'cpu'
) {
  throw new Error('Sidecar health or identity check failed.')
}

const ranked = await fetch(new URL('rank', endpoint), {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    query: '如何为研究项目建立可追溯的实验记录',
    candidates: [
      { candidate_id: 'synthetic-research-log', text: '虚构示例：研究项目使用实验编号、固定数据版本和结果摘要建立可追溯记录。' },
      { candidate_id: 'synthetic-fitness-plan', text: '虚构示例：每周安排三次力量训练并记录睡眠时长。' },
    ],
    limit: 2,
  }),
  redirect: 'error',
})
const ranking = await ranked.json()
if (
  ranked.status !== 200
  || !Array.isArray(ranking.results)
  || ranking.results.length !== 2
  || ranking.results[0]?.candidate_id !== 'synthetic-research-log'
) {
  throw new Error('Sidecar synthetic ranking check failed.')
}

const evidence = {
  schema_version: '1.0',
  generated_at: new Date().toISOString(),
  status: 'passed',
  data_class: 'synthetic_only',
  endpoint_scope: '127.0.0.1_loopback_only',
  authentication: { unauthorized_health_status: unauthorized.status, authorized_health_status: authorized.status },
  model: { model_id: health.model_id, model_revision: health.model_revision, device: health.device },
  ranking: {
    query_id: 'synthetic-traceable-research-log',
    expected_first: 'synthetic-research-log',
    result_ids: ranking.results.map((item) => item.candidate_id),
    scores: ranking.results.map((item) => Number(item.score.toFixed(6))),
  },
  exclusions: ['no_real_data', 'no_generated_answer', 'no_production_enablement'],
}

await writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`, { encoding: 'utf8', flag: 'w' })
console.log(JSON.stringify({ status: 'passed', output }))
