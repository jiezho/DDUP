import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'

import { createWorkbenchApp } from '../server/app.mjs'

const host = '127.0.0.1:8787'
const origin = `http://${host}`
const bootstrapToken = 'synthetic-growth-bootstrap-token-0000000000000'

function baseHeaders(extra = {}) { return { host, ...extra } }
function cookieFrom(response) { return response.headers['set-cookie'].split(';', 1)[0] }

async function openSession(app) {
  const bootstrap = await app.inject({
    method: 'POST', url: '/api/v1/session/bootstrap',
    headers: baseHeaders({ 'content-type': 'application/json', origin, 'x-workbench-bootstrap': bootstrapToken }),
    payload: {},
  })
  assert.equal(bootstrap.statusCode, 200, bootstrap.body)
  const cookie = cookieFrom(bootstrap)
  const current = await app.inject({ method: 'GET', url: '/api/v1/session', headers: baseHeaders({ cookie }) })
  return { cookie, csrf: bootstrap.json().data.csrf_token, spaceId: current.json().data.spaces[0].id }
}

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'workbench-growth-test-'))
  const databasePath = join(root, 'workbench.db')
  const sourceStoragePath = join(root, 'sources')
  let app = createWorkbenchApp({ bootstrapToken, databasePath, sourceStoragePath })
  let session = await openSession(app)
  t.after(async () => { await app.close().catch(() => {}); await rm(root, { recursive: true, force: true }) })
  return {
    get app() { return app }, get cookie() { return session.cookie }, get csrf() { return session.csrf },
    get spaceId() { return session.spaceId }, databasePath,
    readHeaders() { return baseHeaders({ cookie: session.cookie }) },
    writeHeaders(key, version = null) {
      return baseHeaders({ cookie: session.cookie, origin, 'content-type': 'application/json',
        'x-csrf-token': session.csrf, 'idempotency-key': key,
        ...(version == null ? {} : { 'if-match': `"v${version}"` }) })
    },
    async restart() { await app.close(); app = createWorkbenchApp({ bootstrapToken, databasePath, sourceStoragePath }); session = await openSession(app) },
  }
}

async function createProject(f, templateType, name, key) {
  const response = await f.app.inject({
    method: 'POST', url: '/api/v1/projects', headers: f.writeHeaders(key),
    payload: { space_id: f.spaceId, name, summary: '完全虚构的成长工作台测试项目。', template_type: templateType,
      start_date: null, target_date: null, context_policy: 'project_only', color_token: 'sky' },
  })
  assert.equal(response.statusCode, 201, response.body)
  return response.json().data
}

test('growth routes and schemas are present in the machine contract', async () => {
  const openapi = await readFile(new URL('../shared/contracts/openapi.yaml', import.meta.url), 'utf8')
  assert.match(openapi, /version: 1\.20\.0/)
  assert.match(openapi, /\/api\/v1\/growth\/projects\/\{projectId\}:/)
  assert.match(openapi, /RadarTopicCreate:/)
  assert.match(openapi, /LearningTrackCreate:/)
  assert.match(openapi, /LearningCheckinCreate:/)
})

test('frontier radar preserves exact source evidence, review decision, follow-up task and recovery', async (t) => {
  const f = await fixture(t)
  const project = await createProject(f, 'frontier_tracking', '合成前沿雷达', 'growth-radar-project-000001')
  const source = await f.app.inject({
    method: 'POST', url: '/api/v1/sources/imports/markdown', headers: f.writeHeaders('growth-radar-source-0000001'),
    payload: { space_id: f.spaceId, project_id: project.id, filename: 'synthetic-frontier-signal.md',
      content: '# 合成一手公告\n\n合成工具版本增加了离线评测接口，尚未提供长期稳定性证据。' },
  })
  assert.equal(source.statusCode, 201, source.body)
  const importedSource = source.json().data.source

  const topicPayload = { title: '离线评测接口成熟度', domain: 'ai', synthesis: '完全虚构：接口可用于本地评测。',
    maturity: 'experimental', limitations: '缺少长期稳定性证据。', impact_summary: '可能缩短 AI 应用验证周期。',
    disposition: 'validate', next_review_date: '2026-10-01' }
  const created = await f.app.inject({ method: 'POST', url: `/api/v1/growth/projects/${project.id}/radar/topics`, headers: f.writeHeaders('growth-radar-topic-00000001'), payload: topicPayload })
  assert.equal(created.statusCode, 201, created.body)
  const topic = created.json().data
  const replay = await f.app.inject({ method: 'POST', url: `/api/v1/growth/projects/${project.id}/radar/topics`, headers: f.writeHeaders('growth-radar-topic-00000001'), payload: topicPayload })
  assert.equal(replay.json().meta.idempotency_replayed, true)
  assert.equal(replay.json().data.id, topic.id)

  const search = await f.app.inject({
    method: 'POST', url: '/api/v1/context/search',
    headers: baseHeaders({ cookie: f.cookie, origin, 'content-type': 'application/json' }),
    payload: { space_id: f.spaceId, project_id: project.id, q: '离线评测接口', types: ['document'] },
  })
  assert.equal(search.statusCode, 200, search.body)
  const hit = search.json().data.items[0]
  const signal = await f.app.inject({
    method: 'POST', url: `/api/v1/growth/radar/topics/${topic.id}/signals`, headers: f.writeHeaders('growth-radar-signal-0000001'),
    payload: { summary: '公告说明新增离线评测接口。', classification: 'primary_fact', published_on: '2026-09-12',
      evidence: { source_id: hit.source_id, source_version_id: hit.locator.source_version_id, document_id: hit.document_id,
        start_char: hit.locator.start, end_char: hit.locator.end } },
  })
  assert.equal(signal.statusCode, 201, signal.body)
  assert.match(signal.json().data.text_sha256, /^[a-f0-9]{64}$/)

  const missingVersion = await f.app.inject({ method: 'POST', url: `/api/v1/growth/radar/topics/${topic.id}/reviews`, headers: f.writeHeaders('growth-radar-review-no-version'), payload: { maturity: 'experimental', limitations: '仍需长期复核。', impact_summary: '保持小范围验证。', disposition: 'track', next_review_date: null, follow_up_task_title: null } })
  assert.equal(missingVersion.statusCode, 400, missingVersion.body)

  const reviewed = await f.app.inject({
    method: 'POST', url: `/api/v1/growth/radar/topics/${topic.id}/reviews`, headers: f.writeHeaders('growth-radar-review-0000001', topic.version),
    payload: { maturity: 'early_adoption', limitations: '只完成合成场景验证。', impact_summary: '可进入下一轮受控试验。',
      disposition: 'validate', next_review_date: '2026-10-15', follow_up_task_title: '复核合成前沿信号' },
  })
  assert.equal(reviewed.statusCode, 200, reviewed.body)
  assert.equal(reviewed.json().data.topic.disposition, 'validate')
  assert.equal(reviewed.json().data.follow_up_task.title, '复核合成前沿信号')

  await f.restart()
  let workspace = await f.app.inject({ method: 'GET', url: `/api/v1/growth/projects/${project.id}`, headers: f.readHeaders() })
  assert.equal(workspace.statusCode, 200, workspace.body)
  assert.equal(workspace.json().data.radar.signals[0].evidence_integrity, 'valid')
  const tasks = await f.app.inject({ method: 'GET', url: `/api/v1/projects/${project.id}/tasks`, headers: f.readHeaders() })
  assert.equal(tasks.json().data.items.length, 1)

  const archived = await f.app.inject({ method: 'POST', url: `/api/v1/sources/${importedSource.id}/transitions`, headers: f.writeHeaders('growth-radar-source-archive', importedSource.version), payload: { space_id: f.spaceId, action: 'archive' } })
  assert.equal(archived.statusCode, 200, archived.body)
  workspace = await f.app.inject({ method: 'GET', url: `/api/v1/growth/projects/${project.id}`, headers: f.readHeaders() })
  assert.equal(workspace.json().data.radar.signals[0].evidence_integrity, 'invalid')
})

test('learning track closes practice and routine loops without creating a second task truth', async (t) => {
  const f = await fixture(t)
  const project = await createProject(f, 'learning', '合成学术英语提升', 'growth-learning-project-0001')
  const wrong = await f.app.inject({ method: 'POST', url: `/api/v1/growth/projects/${project.id}/radar/topics`, headers: f.writeHeaders('growth-wrong-template-00001'), payload: { title: '错误模板', domain: 'ai', synthesis: '不应创建。', maturity: 'emerging', limitations: '模板错误。', impact_summary: '无。', disposition: 'ignore', next_review_date: null } })
  assert.equal(wrong.statusCode, 422, wrong.body)

  const trackResponse = await f.app.inject({
    method: 'POST', url: `/api/v1/growth/projects/${project.id}/learning/tracks`, headers: f.writeHeaders('growth-learning-track-00001'),
    payload: { title: '学术英语精读', category: 'english', focus: 'academic_reading', goal: '提取论文论证链。',
      baseline: '完全虚构：目前需要逐段回看。', success_criteria: '连续三次练习能独立写出论证摘要。' },
  })
  assert.equal(trackResponse.statusCode, 201, trackResponse.body)
  const track = trackResponse.json().data
  const practiceResponse = await f.app.inject({
    method: 'POST', url: `/api/v1/growth/learning/tracks/${track.id}/practices`, headers: f.writeHeaders('growth-learning-practice-001'),
    payload: { title: '精读合成摘要', practice_type: 'reading', planned_for: '2026-09-13', instructions: '标注主张、证据与限制。' },
  })
  assert.equal(practiceResponse.statusCode, 201, practiceResponse.body)
  const practice = practiceResponse.json().data
  const result = await f.app.inject({
    method: 'POST', url: `/api/v1/growth/learning/practices/${practice.id}/results`, headers: f.writeHeaders('growth-learning-result-0001', practice.version),
    payload: { reflection: '已找到主张和限制，但证据映射仍慢。', feedback: '下一轮先列证据再写摘要。', self_rating: 3,
      decision: 'adjust', follow_up_task_title: '完成下一次合成精读' },
  })
  assert.equal(result.statusCode, 200, result.body)
  assert.equal(result.json().data.practice.status, 'completed')
  assert.equal(result.json().data.follow_up_task.project_id, project.id)

  const routineResponse = await f.app.inject({
    method: 'POST', url: `/api/v1/growth/learning/tracks/${track.id}/routines`, headers: f.writeHeaders('growth-learning-routine-0001'),
    payload: { title: '每周精读练习', cadence: 'weekly', target_count: 3 },
  })
  assert.equal(routineResponse.statusCode, 201, routineResponse.body)
  const routine = routineResponse.json().data
  const checkinPayload = { local_date: '2026-09-12', completed_count: 2, note: '全部为合成练习记录。' }
  const checkin = await f.app.inject({ method: 'POST', url: `/api/v1/growth/learning/routines/${routine.id}/checkins`, headers: f.writeHeaders('growth-learning-checkin-001'), payload: checkinPayload })
  assert.equal(checkin.statusCode, 201, checkin.body)
  const replay = await f.app.inject({ method: 'POST', url: `/api/v1/growth/learning/routines/${routine.id}/checkins`, headers: f.writeHeaders('growth-learning-checkin-001'), payload: checkinPayload })
  assert.equal(replay.json().meta.idempotency_replayed, true)
  const duplicate = await f.app.inject({ method: 'POST', url: `/api/v1/growth/learning/routines/${routine.id}/checkins`, headers: f.writeHeaders('growth-learning-checkin-002'), payload: checkinPayload })
  assert.equal(duplicate.statusCode, 409, duplicate.body)
  assert.equal(duplicate.json().errors[0].code, 'RELATION_CONFLICT')

  await f.restart()
  const workspace = await f.app.inject({ method: 'GET', url: `/api/v1/growth/projects/${project.id}`, headers: f.readHeaders() })
  assert.equal(workspace.statusCode, 200, workspace.body)
  assert.equal(workspace.json().data.learning.tracks.length, 1)
  assert.equal(workspace.json().data.learning.practices[0].decision, 'adjust')
  assert.equal(workspace.json().data.learning.checkins.length, 1)
  const db = new DatabaseSync(f.databasePath, { readOnly: true })
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE action LIKE 'learning_%'").get().count >= 5, true)
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM outbox_events WHERE aggregate_type LIKE 'learning_%'").get().count >= 5, true)
  db.close()

  const unauthenticated = await f.app.inject({ method: 'GET', url: `/api/v1/growth/projects/${project.id}`, headers: baseHeaders() })
  assert.equal(unauthenticated.statusCode, 401, unauthenticated.body)
})
