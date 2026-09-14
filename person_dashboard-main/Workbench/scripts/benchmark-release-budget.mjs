import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'

import { createWorkbenchApp } from '../server/app.mjs'

const host = '127.0.0.1:8787'
const origin = `http://${host}`
const bootstrapToken = 'synthetic-release-budget-token-00000000000000000000'
const root = await mkdtemp(join(tmpdir(), 'workbench-release-budget-'))
const databasePath = join(root, 'workbench.db')
const thresholds = Object.freeze({
  startup_ms: 5_000,
  health_p95_ms: 100,
  project_list_p95_ms: 300,
  fts_search_p95_ms: 500,
  project_create_p95_ms: 500,
  rss_mb: 1_024,
})

function percentile(values, quantile) {
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * quantile) - 1)]
}

function summarize(values) {
  return {
    count: values.length,
    p50_ms: Number(percentile(values, 0.5).toFixed(2)),
    p95_ms: Number(percentile(values, 0.95).toFixed(2)),
    max_ms: Number(Math.max(...values).toFixed(2)),
  }
}

async function timeRequests(count, request) {
  const durations = []
  for (let index = 0; index < count; index += 1) {
    const started = performance.now()
    const response = await request(index)
    durations.push(performance.now() - started)
    assert.ok(response.statusCode >= 200 && response.statusCode < 300, response.body)
  }
  return summarize(durations)
}

let app
try {
  const startupStarted = performance.now()
  app = createWorkbenchApp({ databasePath, bootstrapToken })
  await app.ready()
  const startupMs = performance.now() - startupStarted

  const bootstrap = await app.inject({
    method: 'POST',
    url: '/api/v1/session/bootstrap',
    headers: { host, origin, 'content-type': 'application/json', 'x-workbench-bootstrap': bootstrapToken },
    payload: {},
  })
  assert.equal(bootstrap.statusCode, 200, bootstrap.body)
  const cookie = bootstrap.headers['set-cookie'].split(';', 1)[0]
  const csrf = bootstrap.json().data.csrf_token
  const session = await app.inject({ method: 'GET', url: '/api/v1/session', headers: { host, cookie } })
  assert.equal(session.statusCode, 200, session.body)
  const spaceId = session.json().data.spaces[0].id
  const readHeaders = { host, cookie }
  const jsonHeaders = { host, cookie, origin, 'content-type': 'application/json' }
  const writeHeaders = (key) => ({ ...jsonHeaders, 'x-csrf-token': csrf, 'idempotency-key': key })

  const projectIds = []
  for (let index = 0; index < 200; index += 1) {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/projects',
      headers: writeHeaders(`release-seed-project-${String(index).padStart(8, '0')}`),
      payload: {
        space_id: spaceId,
        name: `合成性能项目 ${String(index).padStart(3, '0')}`,
        summary: '完全虚构，仅用于本地发布性能预算。',
        template_type: 'general',
      },
    })
    assert.equal(response.statusCode, 201, response.body)
    projectIds.push(response.json().data.id)
  }

  for (let index = 0; index < 100; index += 1) {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/sources/imports/markdown',
      headers: writeHeaders(`release-seed-source-${String(index).padStart(8, '0')}`),
      payload: {
        space_id: spaceId,
        project_id: projectIds[index % projectIds.length],
        filename: `synthetic-release-${String(index).padStart(3, '0')}.md`,
        content: `# 合成发布预算文档 ${index}\n\n发布预算检索标记 ${index}，只用于本地性能测量。`,
      },
    })
    assert.equal(response.statusCode, 201, response.body)
  }

  const healthRequest = () => app.inject({ method: 'GET', url: '/api/health', headers: { host } })
  const listRequest = () => app.inject({ method: 'GET', url: `/api/v1/projects?space_id=${spaceId}&limit=50`, headers: readHeaders })
  const searchRequest = () => app.inject({
    method: 'POST',
    url: '/api/v1/context/search',
    headers: jsonHeaders,
    payload: { space_id: spaceId, q: '发布预算检索标记', types: ['document'], limit: 20 },
  })

  await healthRequest()
  await listRequest()
  await searchRequest()

  const health = await timeRequests(100, healthRequest)
  const projectList = await timeRequests(100, listRequest)
  const ftsSearch = await timeRequests(100, searchRequest)
  const projectCreate = await timeRequests(30, (index) => app.inject({
    method: 'POST',
    url: '/api/v1/projects',
    headers: writeHeaders(`release-measured-project-${String(index).padStart(8, '0')}`),
    payload: {
      space_id: spaceId,
      name: `合成测量项目 ${String(index).padStart(3, '0')}`,
      summary: '完全虚构，仅用于本地写入延迟测量。',
      template_type: 'general',
    },
  }))
  const rssMb = process.memoryUsage().rss / 1024 / 1024
  const metrics = {
    startup_ms: Number(startupMs.toFixed(2)),
    health,
    project_list: projectList,
    fts_search: ftsSearch,
    project_create: projectCreate,
    rss_mb: Number(rssMb.toFixed(2)),
  }
  const checks = {
    startup: metrics.startup_ms <= thresholds.startup_ms,
    health: health.p95_ms <= thresholds.health_p95_ms,
    project_list: projectList.p95_ms <= thresholds.project_list_p95_ms,
    fts_search: ftsSearch.p95_ms <= thresholds.fts_search_p95_ms,
    project_create: projectCreate.p95_ms <= thresholds.project_create_p95_ms,
    memory: metrics.rss_mb <= thresholds.rss_mb,
  }
  const passed = Object.values(checks).every(Boolean)
  process.stdout.write(`${JSON.stringify({
    status: passed ? 'passed' : 'failed',
    measured_at: new Date().toISOString(),
    runtime: process.version,
    platform: `${process.platform}-${process.arch}`,
    dataset: { projects: 230, documents: 100, search_iterations: 100 },
    thresholds,
    metrics,
    checks,
  }, null, 2)}\n`)
  if (!passed) process.exitCode = 1
} finally {
  await app?.close().catch(() => {})
  await rm(root, { recursive: true, force: true })
}
