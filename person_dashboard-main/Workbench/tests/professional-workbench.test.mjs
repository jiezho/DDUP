import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'

import { createWorkbenchApp } from '../server/app.mjs'

const host = '127.0.0.1:8787'
const origin = `http://${host}`
const bootstrapToken = 'synthetic-professional-bootstrap-token-000000000000'

test('professional routes and schemas are present in the machine contract', async () => {
  const openapi = await readFile(new URL('../shared/contracts/openapi.yaml', import.meta.url), 'utf8')
  assert.match(openapi, /version: 1\.20\.0/)
  assert.match(openapi, /\/api\/v1\/professional\/projects\/\{projectId\}:/)
  assert.match(openapi, /ResearchQuestionCreate:/)
  assert.match(openapi, /ResearchClaimCreate:/)
  assert.match(openapi, /AiOpportunityCreate:/)
  assert.match(openapi, /AiResultRecord:/)
})

function baseHeaders(extra = {}) {
  return { host, ...extra }
}

function cookieFrom(response) {
  return response.headers['set-cookie'].split(';', 1)[0]
}

async function openSession(app) {
  const bootstrap = await app.inject({
    method: 'POST',
    url: '/api/v1/session/bootstrap',
    headers: baseHeaders({
      'content-type': 'application/json',
      origin,
      'x-workbench-bootstrap': bootstrapToken,
    }),
    payload: {},
  })
  assert.equal(bootstrap.statusCode, 200, bootstrap.body)
  const cookie = cookieFrom(bootstrap)
  const csrf = bootstrap.json().data.csrf_token
  const session = await app.inject({ method: 'GET', url: '/api/v1/session', headers: baseHeaders({ cookie }) })
  assert.equal(session.statusCode, 200, session.body)
  return { cookie, csrf, spaceId: session.json().data.spaces[0].id }
}

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'workbench-professional-test-'))
  const databasePath = join(root, 'workbench.db')
  const sourceStoragePath = join(root, 'sources')
  let app = createWorkbenchApp({ bootstrapToken, databasePath, sourceStoragePath })
  let session = await openSession(app)
  t.after(async () => {
    await app.close().catch(() => {})
    await rm(root, { recursive: true, force: true })
  })
  return {
    get app() { return app },
    get cookie() { return session.cookie },
    get csrf() { return session.csrf },
    get spaceId() { return session.spaceId },
    databasePath,
    async restart() {
      await app.close()
      app = createWorkbenchApp({ bootstrapToken, databasePath, sourceStoragePath })
      session = await openSession(app)
    },
    readHeaders() {
      return baseHeaders({ cookie: session.cookie })
    },
    writeHeaders(key, version = null) {
      return baseHeaders({
        cookie: session.cookie,
        origin,
        'content-type': 'application/json',
        'x-csrf-token': session.csrf,
        'idempotency-key': key,
        ...(version == null ? {} : { 'if-match': `"v${version}"` }),
      })
    },
  }
}

async function createProject(f, templateType, name, key) {
  const response = await f.app.inject({
    method: 'POST',
    url: '/api/v1/projects',
    headers: f.writeHeaders(key),
    payload: {
      space_id: f.spaceId,
      name,
      summary: '完全虚构的专业工作台测试项目。',
      template_type: templateType,
      start_date: null,
      target_date: null,
      context_policy: 'project_only',
      color_token: 'sky',
    },
  })
  assert.equal(response.statusCode, 201, response.body)
  return response.json().data
}

test('research workspace keeps question, experiment, exact evidence claim and follow-up task in one project truth', async (t) => {
  const f = await fixture(t)
  const project = await createProject(f, 'research', '合成科研工作台', 'professional-research-project-0001')
  const questionPayload = {
    title: '窗口化是否改善长文主题区分？',
    problem_statement: '完全虚构：长文相邻主题可能产生错排。',
    hypothesis: '固定窗口和重叠可改善主题区分。',
    success_criteria: '冻结数据集 Top-1 达到 100%。',
  }
  const questionResponse = await f.app.inject({
    method: 'POST',
    url: `/api/v1/professional/projects/${project.id}/research/questions`,
    headers: f.writeHeaders('research-question-create-000001'),
    payload: questionPayload,
  })
  assert.equal(questionResponse.statusCode, 201, questionResponse.body)
  const question = questionResponse.json().data

  const replay = await f.app.inject({
    method: 'POST',
    url: `/api/v1/professional/projects/${project.id}/research/questions`,
    headers: f.writeHeaders('research-question-create-000001'),
    payload: questionPayload,
  })
  assert.equal(replay.statusCode, 201, replay.body)
  assert.equal(replay.json().meta.idempotency_replayed, true)
  assert.equal(replay.json().data.id, question.id)

  const conflict = await f.app.inject({
    method: 'POST',
    url: `/api/v1/professional/projects/${project.id}/research/questions`,
    headers: f.writeHeaders('research-question-create-000001'),
    payload: { ...questionPayload, title: '不同问题' },
  })
  assert.equal(conflict.statusCode, 409, conflict.body)
  assert.equal(conflict.json().errors[0].code, 'IDEMPOTENCY_CONFLICT')

  const testing = await f.app.inject({
    method: 'POST',
    url: `/api/v1/professional/research/questions/${question.id}/transitions`,
    headers: f.writeHeaders('research-question-testing-0001', question.version),
    payload: { action: 'start_testing' },
  })
  assert.equal(testing.statusCode, 200, testing.body)
  assert.equal(testing.json().data.status, 'testing')

  const stale = await f.app.inject({
    method: 'POST',
    url: `/api/v1/professional/research/questions/${question.id}/transitions`,
    headers: f.writeHeaders('research-question-stale-00001', question.version),
    payload: { action: 'answer' },
  })
  assert.equal(stale.statusCode, 409, stale.body)
  assert.equal(stale.json().errors[0].code, 'VERSION_CONFLICT')

  const experimentResponse = await f.app.inject({
    method: 'POST',
    url: `/api/v1/professional/research/questions/${question.id}/experiments`,
    headers: f.writeHeaders('research-experiment-create-0001'),
    payload: {
      title: '冻结边界集窗口实验',
      method: '使用完全虚构的冻结边界集比较固定窗口。',
      variables: '窗口 160 字符、重叠 40 字符。',
      expected_outcome: 'Top-1 不低于基线且定位保持一致。',
    },
  })
  assert.equal(experimentResponse.statusCode, 201, experimentResponse.body)
  const experiment = experimentResponse.json().data

  const resultResponse = await f.app.inject({
    method: 'POST',
    url: `/api/v1/professional/research/experiments/${experiment.id}/results`,
    headers: f.writeHeaders('research-experiment-result-0001', experiment.version),
    payload: {
      result_summary: '完全虚构：冻结集 Top-1 达到 100%，定位一致。',
      decision: 'continue',
      follow_up_task_title: '复核合成窗口实验边界',
    },
  })
  assert.equal(resultResponse.statusCode, 200, resultResponse.body)
  assert.equal(resultResponse.json().data.experiment.decision, 'continue')
  assert.equal(resultResponse.json().data.follow_up_task.title, '复核合成窗口实验边界')

  const source = await f.app.inject({
    method: 'POST',
    url: '/api/v1/sources/imports/markdown',
    headers: f.writeHeaders('research-evidence-source-00001'),
    payload: {
      space_id: f.spaceId,
      project_id: project.id,
      filename: 'synthetic-professional-evidence.md',
      content: '# 合成实验记录\n\n冻结集 Top-1 达到 100%，并保持精确字符定位。',
    },
  })
  assert.equal(source.statusCode, 201, source.body)
  const importedSource = source.json().data.source
  const search = await f.app.inject({
    method: 'POST',
    url: '/api/v1/context/search',
    headers: baseHeaders({ cookie: f.cookie, origin, 'content-type': 'application/json' }),
    payload: { space_id: f.spaceId, project_id: project.id, q: '精确字符定位', types: ['document'] },
  })
  assert.equal(search.statusCode, 200, search.body)
  const hit = search.json().data.items[0]
  assert.ok(hit)

  const claimResponse = await f.app.inject({
    method: 'POST',
    url: `/api/v1/professional/research/questions/${question.id}/claims`,
    headers: f.writeHeaders('research-claim-create-00000001'),
    payload: {
      experiment_id: experiment.id,
      statement: '窗口实验在冻结边界集上满足预设标准。',
      evidence_direction: 'supports',
      evidence_strength: 'moderate',
      evidence: {
        source_id: hit.source_id,
        source_version_id: hit.locator.source_version_id,
        document_id: hit.document_id,
        start_char: hit.locator.start,
        end_char: hit.locator.end,
      },
    },
  })
  assert.equal(claimResponse.statusCode, 201, claimResponse.body)
  assert.match(claimResponse.json().data.text_sha256, /^[a-f0-9]{64}$/)
  assert.equal('body_text' in claimResponse.json().data, false)

  const workspace = await f.app.inject({
    method: 'GET',
    url: `/api/v1/professional/projects/${project.id}`,
    headers: f.readHeaders(),
  })
  assert.equal(workspace.statusCode, 200, workspace.body)
  assert.equal(workspace.json().data.research.questions.length, 1)
  assert.equal(workspace.json().data.research.experiments.length, 1)
  assert.equal(workspace.json().data.research.claims.length, 1)

  const tasks = await f.app.inject({ method: 'GET', url: `/api/v1/projects/${project.id}/tasks`, headers: f.readHeaders() })
  assert.equal(tasks.statusCode, 200, tasks.body)
  assert.equal(tasks.json().data.items.some((item) => item.id === resultResponse.json().data.follow_up_task.id), true)

  await f.restart()
  const recovered = await f.app.inject({ method: 'GET', url: `/api/v1/professional/projects/${project.id}`, headers: f.readHeaders() })
  assert.equal(recovered.statusCode, 200, recovered.body)
  assert.equal(recovered.json().data.research.claims[0].statement, '窗口实验在冻结边界集上满足预设标准。')
  assert.equal(recovered.json().data.research.claims[0].evidence_integrity, 'valid')

  const archiveSource = await f.app.inject({
    method: 'POST',
    url: `/api/v1/sources/${importedSource.id}/transitions`,
    headers: f.writeHeaders('research-evidence-archive-0001', importedSource.version),
    payload: { space_id: f.spaceId, action: 'archive' },
  })
  assert.equal(archiveSource.statusCode, 200, archiveSource.body)
  const invalidated = await f.app.inject({ method: 'GET', url: `/api/v1/professional/projects/${project.id}`, headers: f.readHeaders() })
  assert.equal(invalidated.statusCode, 200, invalidated.body)
  assert.equal(invalidated.json().data.research.claims[0].evidence_integrity, 'invalid')

  const database = new DatabaseSync(f.databasePath)
  try {
    assert.equal(database.prepare("SELECT count(*) AS count FROM audit_events WHERE action LIKE 'research_%'").get().count, 5)
    assert.equal(database.prepare("SELECT count(*) AS count FROM outbox_events WHERE aggregate_type = 'research_claim'").get().count, 1)
  } finally {
    database.close()
  }
})

test('AI lab persists opportunity, metric result, explicit Stop and one governed follow-up task', async (t) => {
  const f = await fixture(t)
  const aiProject = await createProject(f, 'ai_exploration', '合成 AI 应用实验室', 'professional-ai-project-0000001')
  const researchProject = await createProject(f, 'research', '合成错误模板项目', 'professional-wrong-project-0001')

  const wrongTemplate = await f.app.inject({
    method: 'POST',
    url: `/api/v1/professional/projects/${researchProject.id}/ai/opportunities`,
    headers: f.writeHeaders('ai-opportunity-wrong-template-01'),
    payload: {
      title: '不应创建', problem_statement: '模板错误。', target_user: '虚构用户',
      value_hypothesis: '无。', feasibility_hypothesis: '无。',
    },
  })
  assert.equal(wrongTemplate.statusCode, 422, wrongTemplate.body)

  const opportunityResponse = await f.app.inject({
    method: 'POST',
    url: `/api/v1/professional/projects/${aiProject.id}/ai/opportunities`,
    headers: f.writeHeaders('ai-opportunity-create-00000001'),
    payload: {
      title: '本地引用检查助手',
      problem_statement: '完全虚构：研究者需要快速核对引用定位。',
      target_user: '使用本地虚构资料的研究者',
      value_hypothesis: '减少手工定位时间。',
      feasibility_hypothesis: '可复用现有固定字符范围。',
    },
  })
  assert.equal(opportunityResponse.statusCode, 201, opportunityResponse.body)
  const opportunity = opportunityResponse.json().data

  const missingVersion = await f.app.inject({
    method: 'POST',
    url: `/api/v1/professional/ai/opportunities/${opportunity.id}/transitions`,
    headers: f.writeHeaders('ai-opportunity-missing-version-01'),
    payload: { action: 'start_exploring' },
  })
  assert.equal(missingVersion.statusCode, 400, missingVersion.body)

  const exploring = await f.app.inject({
    method: 'POST',
    url: `/api/v1/professional/ai/opportunities/${opportunity.id}/transitions`,
    headers: f.writeHeaders('ai-opportunity-start-000000001', opportunity.version),
    payload: { action: 'start_exploring' },
  })
  assert.equal(exploring.statusCode, 200, exploring.body)
  assert.equal(exploring.json().data.status, 'exploring')

  const experimentResponse = await f.app.inject({
    method: 'POST',
    url: `/api/v1/professional/ai/opportunities/${opportunity.id}/experiments`,
    headers: f.writeHeaders('ai-experiment-create-000000001'),
    payload: {
      title: '引用定位完成率评测',
      evaluation_method: '在完全虚构的 20 条任务上测量精确定位完成率。',
      metric_name: '完成率',
      baseline_value: 0.6,
      target_value: 0.9,
    },
  })
  assert.equal(experimentResponse.statusCode, 201, experimentResponse.body)
  const experiment = experimentResponse.json().data

  const resultPayload = {
    observed_value: 0.75,
    evidence_summary: '完全虚构：20 条任务中完成 15 条，未达到目标。',
    decision: 'stop',
    follow_up_task_title: '分析合成定位失败样本',
  }
  const resultResponse = await f.app.inject({
    method: 'POST',
    url: `/api/v1/professional/ai/experiments/${experiment.id}/results`,
    headers: f.writeHeaders('ai-experiment-result-000000001', experiment.version),
    payload: resultPayload,
  })
  assert.equal(resultResponse.statusCode, 200, resultResponse.body)
  assert.equal(resultResponse.json().data.experiment.status, 'stopped')
  assert.equal(resultResponse.json().data.experiment.decision, 'stop')

  const replay = await f.app.inject({
    method: 'POST',
    url: `/api/v1/professional/ai/experiments/${experiment.id}/results`,
    headers: f.writeHeaders('ai-experiment-result-000000001', experiment.version),
    payload: resultPayload,
  })
  assert.equal(replay.statusCode, 200, replay.body)
  assert.equal(replay.json().meta.idempotency_replayed, true)
  assert.equal(replay.json().data.follow_up_task.id, resultResponse.json().data.follow_up_task.id)

  const workspace = await f.app.inject({ method: 'GET', url: `/api/v1/professional/projects/${aiProject.id}`, headers: f.readHeaders() })
  assert.equal(workspace.statusCode, 200, workspace.body)
  assert.equal(workspace.json().data.ai_lab.opportunities.length, 1)
  assert.equal(workspace.json().data.ai_lab.experiments[0].observed_value, 0.75)

  const unauthenticated = await f.app.inject({ method: 'GET', url: `/api/v1/professional/projects/${aiProject.id}`, headers: baseHeaders() })
  assert.equal(unauthenticated.statusCode, 401, unauthenticated.body)
})
