import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { createWorkbenchApp } from '../server/app.mjs'

const host = '127.0.0.1:8787'
const origin = `http://${host}`
const bootstrapToken = 'synthetic-daily-bootstrap-token-00000000000000000000'
const date = '2026-08-24'
const headers = (extra = {}) => ({ host, ...extra })

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'workbench-daily-test-'))
  const databasePath = join(root, 'workbench.db')
  const app = createWorkbenchApp({ bootstrapToken, databasePath, now: () => Date.UTC(2026, 7, 24, 12) })
  t.after(async () => { await app.close(); await rm(root, { recursive: true, force: true }) })
  const boot = await app.inject({ method: 'POST', url: '/api/v1/session/bootstrap', headers: headers({ 'content-type': 'application/json', origin, 'x-workbench-bootstrap': bootstrapToken }), payload: {} })
  const cookie = boot.headers['set-cookie'].split(';', 1)[0]
  const csrf = boot.json().data.csrf_token
  const session = await app.inject({ method: 'GET', url: '/api/v1/session', headers: headers({ cookie }) })
  const spaceId = session.json().data.spaces[0].id
  const writeHeaders = (key, version = null) => headers({ 'content-type': 'application/json', origin, cookie, 'x-csrf-token': csrf, 'idempotency-key': key, ...(version == null ? {} : { 'if-match': `"v${version}"` }) })
  const projectResponse = await app.inject({
    method: 'POST', url: '/api/v1/projects', headers: writeHeaders('daily-project-create-000000001'),
    payload: { space_id: spaceId, name: '合成今日项目', summary: '完全虚构。', template_type: 'general', start_date: null, target_date: null, context_policy: 'project_only', color_token: 'sky' },
  })
  const project = projectResponse.json().data
  const createTask = async (title, key) => {
    const response = await app.inject({
      method: 'POST', url: `/api/v1/projects/${project.id}/tasks`, headers: writeHeaders(key),
      payload: { title, description: '', priority: 'high', due_at: null, due_date: date, milestone_id: null, parent_task_id: null },
    })
    return response.json().data
  }
  return { app, cookie, spaceId, writeHeaders, createTask }
}

test('today snapshot aggregates task truth and saves at most three focus references', async (t) => {
  const f = await fixture(t)
  const first = await f.createTask('合成今日任务一', 'daily-task-one-00000000000001')
  const second = await f.createTask('合成今日任务二', 'daily-task-two-00000000000001')
  const snapshot = await f.app.inject({ method: 'GET', url: `/api/v1/daily/${date}?space_id=${f.spaceId}`, headers: headers({ cookie: f.cookie }) })
  assert.equal(snapshot.statusCode, 200)
  assert.equal(snapshot.json().data.tasks.length, 2)
  const plan = await f.app.inject({
    method: 'PUT', url: `/api/v1/daily-plans/${date}`, headers: f.writeHeaders('daily-plan-create-00000000001'),
    payload: { space_id: f.spaceId, task_ids: [first.id, second.id] },
  })
  assert.equal(plan.statusCode, 200, plan.body)
  assert.deepEqual(plan.json().data.task_ids, [first.id, second.id])
  const after = await f.app.inject({ method: 'GET', url: `/api/v1/daily/${date}?space_id=${f.spaceId}`, headers: headers({ cookie: f.cookie }) })
  assert.deepEqual(after.json().data.plan.task_ids, [first.id, second.id])
})

test('daily plan edits are versioned and do not duplicate the underlying task', async (t) => {
  const f = await fixture(t)
  const task = await f.createTask('唯一任务真源', 'daily-task-truth-000000000001')
  await f.app.inject({ method: 'PUT', url: `/api/v1/daily-plans/${date}`, headers: f.writeHeaders('daily-plan-truth-create-00001'), payload: { space_id: f.spaceId, task_ids: [task.id] } })
  const stale = await f.app.inject({ method: 'PUT', url: `/api/v1/daily-plans/${date}`, headers: f.writeHeaders('daily-plan-truth-stale-000001'), payload: { space_id: f.spaceId, task_ids: [] } })
  assert.equal(stale.statusCode, 409)
  const updated = await f.app.inject({ method: 'PUT', url: `/api/v1/daily-plans/${date}`, headers: f.writeHeaders('daily-plan-truth-update-00001', 1), payload: { space_id: f.spaceId, task_ids: [] } })
  assert.equal(updated.json().data.version, 2)
  const allTasks = await f.app.inject({ method: 'GET', url: `/api/v1/daily/${date}?space_id=${f.spaceId}`, headers: headers({ cookie: f.cookie }) })
  assert.equal(allTasks.json().data.tasks.filter((item) => item.id === task.id).length, 1)
})

test('daily review create, replay and update preserve explicit user-authored fields', async (t) => {
  const f = await fixture(t)
  const initial = { space_id: f.spaceId, summary: '完成虚构流程验证。', wins: '状态一致。', blockers: '无真实数据。', next_focus: '继续合成验收。' }
  const created = await f.app.inject({ method: 'PUT', url: `/api/v1/daily-reviews/${date}`, headers: f.writeHeaders('daily-review-create-00000001'), payload: initial })
  assert.equal(created.statusCode, 200, created.body)
  assert.equal(created.json().data.version, 1)
  const replay = await f.app.inject({ method: 'PUT', url: `/api/v1/daily-reviews/${date}`, headers: f.writeHeaders('daily-review-create-00000001'), payload: initial })
  assert.equal(replay.json().meta.idempotency_replayed, true)
  const revised = { ...initial, next_focus: '补充恢复演练。' }
  const updated = await f.app.inject({ method: 'PUT', url: `/api/v1/daily-reviews/${date}`, headers: f.writeHeaders('daily-review-update-00000001', 1), payload: revised })
  assert.equal(updated.json().data.version, 2)
  const snapshot = await f.app.inject({ method: 'GET', url: `/api/v1/daily/${date}?space_id=${f.spaceId}`, headers: headers({ cookie: f.cookie }) })
  assert.equal(snapshot.json().data.review.next_focus, '补充恢复演练。')
})
