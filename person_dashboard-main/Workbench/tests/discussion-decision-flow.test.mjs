import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'

import { createWorkbenchApp } from '../server/app.mjs'

const host = '127.0.0.1:8787'
const origin = `http://${host}`
const bootstrapToken = 'synthetic-discussion-bootstrap-token-0000000000000000'

function headers(extra = {}) {
  return { host, ...extra }
}

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'workbench-discussion-test-'))
  const databasePath = join(root, 'workbench.db')
  const app = createWorkbenchApp({ bootstrapToken, databasePath, now: () => Date.UTC(2026, 7, 24, 12) })
  t.after(async () => {
    await app.close()
    await rm(root, { recursive: true, force: true })
  })
  const boot = await app.inject({
    method: 'POST', url: '/api/v1/session/bootstrap',
    headers: headers({ 'content-type': 'application/json', origin, 'x-workbench-bootstrap': bootstrapToken }), payload: {},
  })
  const cookie = boot.headers['set-cookie'].split(';', 1)[0]
  const csrf = boot.json().data.csrf_token
  const session = await app.inject({ method: 'GET', url: '/api/v1/session', headers: headers({ cookie }) })
  const spaceId = session.json().data.spaces[0].id
  const writeHeaders = (key, version = null) => headers({
    'content-type': 'application/json', origin, cookie, 'x-csrf-token': csrf, 'idempotency-key': key,
    ...(version == null ? {} : { 'if-match': `"v${version}"` }),
  })
  let sequence = 0
  const createProject = async (name) => {
    sequence += 1
    const response = await app.inject({
      method: 'POST', url: '/api/v1/projects', headers: writeHeaders(`discussion-project-${sequence}-0000000001`),
      payload: { space_id: spaceId, name, summary: '完全虚构。', template_type: 'general', start_date: null, target_date: null, context_policy: 'project_only', color_token: 'sky' },
    })
    assert.equal(response.statusCode, 201, response.body)
    return response.json().data
  }
  return { app, databasePath, cookie, spaceId, writeHeaders, createProject }
}

async function createDiscussion(f, projectId, key = 'discussion-create-000000000001') {
  return f.app.inject({
    method: 'POST', url: `/api/v1/projects/${projectId}/discussions`, headers: f.writeHeaders(key),
    payload: { title: '是否采用合成研究路线' },
  })
}

function conversionPayload(overrides = {}) {
  return {
    decision_title: '采用合成研究路线',
    statement: '先用虚构数据验证端到端流程。',
    rationale: '避免接触真实个人或公司数据。',
    task_title: '准备虚构验证数据集',
    task_priority: 'high',
    task_due_date: '2026-09-01',
    milestone_id: null,
    ...overrides,
  }
}

test('manual discussion conversion atomically accepts one decision and creates one linked task', async (t) => {
  const f = await fixture(t)
  const project = await f.createProject('合成讨论项目')
  const discussionResponse = await createDiscussion(f, project.id)
  assert.equal(discussionResponse.statusCode, 201, discussionResponse.body)
  const discussion = discussionResponse.json().data
  const entry = await f.app.inject({
    method: 'POST', url: `/api/v1/discussions/${discussion.id}/entries`,
    headers: f.writeHeaders('discussion-entry-0000000000001'), payload: { body: '先验证隐私安全与可恢复性。' },
  })
  assert.equal(entry.statusCode, 201, entry.body)

  const converted = await f.app.inject({
    method: 'POST', url: `/api/v1/discussions/${discussion.id}/conversions`,
    headers: f.writeHeaders('discussion-convert-00000000001'), payload: conversionPayload(),
  })
  assert.equal(converted.statusCode, 201, converted.body)
  assert.equal(converted.json().data.discussion.status, 'resolved')
  assert.equal(converted.json().data.decision.status, 'accepted')
  assert.equal(converted.json().data.task.source_kind, 'decision')
  assert.equal(converted.json().data.task.status, 'inbox')

  const replay = await f.app.inject({
    method: 'POST', url: `/api/v1/discussions/${discussion.id}/conversions`,
    headers: f.writeHeaders('discussion-convert-00000000001'), payload: conversionPayload(),
  })
  assert.equal(replay.statusCode, 201)
  assert.equal(replay.json().data.decision.id, converted.json().data.decision.id)
  assert.equal(replay.json().meta.idempotency_replayed, true)

  const database = new DatabaseSync(f.databasePath)
  try {
    assert.equal(database.prepare('SELECT count(*) AS count FROM decisions').get().count, 1)
    assert.equal(database.prepare("SELECT count(*) AS count FROM tasks WHERE source_kind = 'decision'").get().count, 1)
    assert.equal(database.prepare('SELECT count(*) AS count FROM decision_task_links').get().count, 1)
    assert.equal(database.prepare("SELECT count(*) AS count FROM audit_events WHERE action IN ('discussion.resolve', 'decision.accept')").get().count, 2)
    assert.equal(database.prepare("SELECT count(*) AS count FROM outbox_events WHERE aggregate_type IN ('decision', 'task')").get().count, 2)
  } finally {
    database.close()
  }
})

test('an invalid cross-project milestone rolls back the whole discussion conversion', async (t) => {
  const f = await fixture(t)
  const first = await f.createProject('合成讨论项目一')
  const second = await f.createProject('合成讨论项目二')
  const discussion = (await createDiscussion(f, first.id, 'discussion-first-000000000001')).json().data
  const milestoneResponse = await f.app.inject({
    method: 'POST', url: `/api/v1/projects/${second.id}/milestones`,
    headers: f.writeHeaders('discussion-foreign-milestone-00001'), payload: { title: '外部里程碑', target_date: null, sort_order: 0 },
  })
  const milestone = milestoneResponse.json().data
  const converted = await f.app.inject({
    method: 'POST', url: `/api/v1/discussions/${discussion.id}/conversions`,
    headers: f.writeHeaders('discussion-invalid-convert-00001'), payload: conversionPayload({ milestone_id: milestone.id }),
  })
  assert.equal(converted.statusCode, 409)
  assert.equal(converted.json().errors[0].code, 'RELATION_CONFLICT')

  const database = new DatabaseSync(f.databasePath)
  try {
    assert.equal(database.prepare('SELECT status FROM discussions WHERE id = ?').get(discussion.id).status, 'open')
    assert.equal(database.prepare('SELECT count(*) AS count FROM decisions').get().count, 0)
    assert.equal(database.prepare("SELECT count(*) AS count FROM tasks WHERE source_kind = 'decision'").get().count, 0)
    assert.equal(database.prepare("SELECT count(*) AS count FROM idempotency_keys WHERE command_scope LIKE 'discussion.convert:%'").get().count, 0)
  } finally {
    database.close()
  }
})

test('resolved discussions reject later entries and expose durable decisions through project scope', async (t) => {
  const f = await fixture(t)
  const project = await f.createProject('合成决策查询项目')
  const discussion = (await createDiscussion(f, project.id, 'discussion-query-000000000001')).json().data
  await f.app.inject({
    method: 'POST', url: `/api/v1/discussions/${discussion.id}/conversions`,
    headers: f.writeHeaders('discussion-query-convert-000001'), payload: conversionPayload(),
  })
  const lateEntry = await f.app.inject({
    method: 'POST', url: `/api/v1/discussions/${discussion.id}/entries`,
    headers: f.writeHeaders('discussion-late-entry-00000001'), payload: { body: '不应写入。' },
  })
  assert.equal(lateEntry.statusCode, 409)
  assert.equal(lateEntry.json().errors[0].code, 'INVALID_STATE_TRANSITION')
  const decisions = await f.app.inject({
    method: 'GET', url: `/api/v1/projects/${project.id}/decisions`, headers: headers({ cookie: f.cookie }),
  })
  assert.equal(decisions.statusCode, 200)
  assert.equal(decisions.json().data.items[0].title, '采用合成研究路线')
})
