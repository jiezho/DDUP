import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'

import { createWorkbenchApp } from '../server/app.mjs'

const host = '127.0.0.1:8787'
const origin = `http://${host}`
const bootstrapToken = 'synthetic-work-items-bootstrap-token-0000000000000000'

function headers(extra = {}) {
  return { host, ...extra }
}

function cookieFrom(response) {
  return response.headers['set-cookie'].split(';', 1)[0]
}

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'workbench-items-test-'))
  const databasePath = join(root, 'workbench.db')
  let clock = Date.UTC(2026, 7, 24, 12)
  let projectSequence = 0
  let closed = false
  const app = createWorkbenchApp({ bootstrapToken, databasePath, now: () => clock })
  t.after(async () => {
    if (!closed) await app.close()
    await rm(root, { recursive: true, force: true })
  })
  const boot = await app.inject({
    method: 'POST', url: '/api/v1/session/bootstrap',
    headers: headers({ 'content-type': 'application/json', origin, 'x-workbench-bootstrap': bootstrapToken }),
    payload: {},
  })
  const cookie = cookieFrom(boot)
  const csrf = boot.json().data.csrf_token
  const session = await app.inject({ method: 'GET', url: '/api/v1/session', headers: headers({ cookie }) })
  const spaceId = session.json().data.spaces[0].id
  const writeHeaders = (key, version = null) => headers({
    'content-type': 'application/json', origin, cookie, 'x-csrf-token': csrf,
    'idempotency-key': key,
    ...(version == null ? {} : { 'if-match': `"v${version}"` }),
  })
  async function createProject(name = '合成任务项目') {
    projectSequence += 1
    const response = await app.inject({
      method: 'POST', url: '/api/v1/projects', headers: writeHeaders(`project-${projectSequence}-0000000000000001`),
      payload: { space_id: spaceId, name, summary: '完全虚构。', template_type: 'general', start_date: null, target_date: null, context_policy: 'project_only', color_token: 'sky' },
    })
    assert.equal(response.statusCode, 201, response.body)
    return response.json().data
  }
  return {
    app, databasePath, headers, cookie, csrf, spaceId, writeHeaders, createProject,
    close: async () => { if (!closed) { closed = true; await app.close() } },
    now: () => clock,
    tick: () => { clock += 1 },
  }
}

async function createMilestone(f, projectId, key = 'milestone-create-00000000000001', overrides = {}) {
  return f.app.inject({
    method: 'POST', url: `/api/v1/projects/${projectId}/milestones`, headers: f.writeHeaders(key),
    payload: { title: '合成里程碑', target_date: '2026-10-01', sort_order: 1, ...overrides },
  })
}

async function createTask(f, projectId, key = 'task-create-000000000000000001', overrides = {}) {
  return f.app.inject({
    method: 'POST', url: `/api/v1/projects/${projectId}/tasks`, headers: f.writeHeaders(key),
    payload: { title: '合成任务', description: '仅用于测试。', priority: 'normal', due_at: null, due_date: null, milestone_id: null, parent_task_id: null, ...overrides },
  })
}

test('milestone and task creation are idempotent and transactionally audited', async (t) => {
  const f = await fixture(t)
  const project = await f.createProject()
  const milestoneResponse = await createMilestone(f, project.id)
  assert.equal(milestoneResponse.statusCode, 201, milestoneResponse.body)
  const milestone = milestoneResponse.json().data
  const taskResponse = await createTask(f, project.id, 'task-create-000000000000000002', { milestone_id: milestone.id })
  assert.equal(taskResponse.statusCode, 201, taskResponse.body)
  const task = taskResponse.json().data
  assert.equal(task.status, 'inbox')
  assert.equal(task.milestone_id, milestone.id)

  const replay = await createTask(f, project.id, 'task-create-000000000000000002', { milestone_id: milestone.id })
  assert.equal(replay.statusCode, 201)
  assert.equal(replay.json().data.id, task.id)
  assert.equal(replay.json().meta.idempotency_replayed, true)

  const database = new DatabaseSync(f.databasePath)
  try {
    assert.equal(database.prepare('SELECT count(*) AS count FROM milestones').get().count, 1)
    assert.equal(database.prepare('SELECT count(*) AS count FROM tasks').get().count, 1)
    assert.equal(database.prepare("SELECT count(*) AS count FROM audit_events WHERE object_type IN ('milestone', 'task')").get().count, 2)
    assert.equal(database.prepare("SELECT count(*) AS count FROM outbox_events WHERE aggregate_type IN ('milestone', 'task')").get().count, 2)
  } finally {
    database.close()
  }
})

test('milestone and parent task links must remain inside the same project with one child level', async (t) => {
  const f = await fixture(t)
  const first = await f.createProject('合成项目一')
  const second = await f.createProject('合成项目二')
  const milestone = (await createMilestone(f, first.id, 'milestone-first-000000000001')).json().data
  const foreignMilestone = await createTask(f, second.id, 'task-foreign-milestone-000000001', { milestone_id: milestone.id })
  assert.equal(foreignMilestone.statusCode, 409)
  const foreignPayload = foreignMilestone.json()
  assert.equal(foreignPayload.errors?.[0]?.code, 'RELATION_CONFLICT', foreignMilestone.body)

  const parent = (await createTask(f, first.id, 'task-parent-000000000000000001')).json().data
  const child = (await createTask(f, first.id, 'task-child-000000000000000001', { parent_task_id: parent.id })).json().data
  const grandchild = await createTask(f, first.id, 'task-grandchild-00000000000001', { parent_task_id: child.id })
  assert.equal(grandchild.statusCode, 409)
  assert.equal(grandchild.json().errors[0].code, 'RELATION_CONFLICT')

  const deleteParent = await f.app.inject({
    method: 'DELETE', url: `/api/v1/tasks/${parent.id}`, headers: f.writeHeaders('delete-parent-0000000000000001', 1), payload: {},
  })
  assert.equal(deleteParent.statusCode, 409)
  assert.equal(deleteParent.json().errors[0].code, 'RELATION_CONFLICT')
})

test('task state transitions set and clear completed_at with optimistic versions', async (t) => {
  const f = await fixture(t)
  const project = await f.createProject()
  const task = (await createTask(f, project.id, 'task-state-000000000000000001')).json().data
  const transition = async (action, version, key) => f.app.inject({
    method: 'POST', url: `/api/v1/tasks/${task.id}/transitions`, headers: f.writeHeaders(key, version), payload: { action },
  })
  const planned = await transition('plan', 1, 'task-plan-0000000000000000001')
  assert.equal(planned.json().data.status, 'planned')
  const started = await transition('start', 2, 'task-start-000000000000000001')
  assert.equal(started.json().data.status, 'in_progress')
  const completed = await transition('complete', 3, 'task-complete-00000000000001')
  assert.equal(completed.json().data.status, 'done')
  assert.match(completed.json().data.completed_at, /^2026-08-24T/)
  const reopened = await transition('reopen', 4, 'task-reopen-000000000000001')
  assert.equal(reopened.json().data.status, 'in_progress')
  assert.equal(reopened.json().data.completed_at, null)

  const stale = await transition('block', 4, 'task-stale-0000000000000001')
  assert.equal(stale.statusCode, 409)
  assert.equal(stale.json().errors[0].code, 'VERSION_CONFLICT')
})

test('archived projects reject new work items and invalid milestone transitions roll back', async (t) => {
  const f = await fixture(t)
  const project = await f.createProject()
  const milestone = (await createMilestone(f, project.id, 'milestone-state-000000000001')).json().data
  const invalid = await f.app.inject({
    method: 'PATCH', url: `/api/v1/milestones/${milestone.id}`,
    headers: f.writeHeaders('milestone-invalid-000000000001', 1), payload: { status: 'cancelled' },
  })
  assert.equal(invalid.statusCode, 200)
  const invalidReverse = await f.app.inject({
    method: 'PATCH', url: `/api/v1/milestones/${milestone.id}`,
    headers: f.writeHeaders('milestone-reverse-000000000001', 2), payload: { status: 'active' },
  })
  assert.equal(invalidReverse.statusCode, 409)

  const activate = await f.app.inject({ method: 'POST', url: `/api/v1/projects/${project.id}/transitions`, headers: f.writeHeaders('project-activate-items-000000001', 1), payload: { action: 'activate' } })
  assert.equal(activate.statusCode, 200)
  const pause = await f.app.inject({ method: 'POST', url: `/api/v1/projects/${project.id}/transitions`, headers: f.writeHeaders('project-pause-items-00000000001', 2), payload: { action: 'pause' } })
  assert.equal(pause.statusCode, 200)
  const archive = await f.app.inject({ method: 'POST', url: `/api/v1/projects/${project.id}/transitions`, headers: f.writeHeaders('project-archive-items-00000001', 3), payload: { action: 'archive' } })
  assert.equal(archive.statusCode, 200)

  const blockedTask = await createTask(f, project.id, 'task-after-archive-000000000001')
  assert.equal(blockedTask.statusCode, 409)
  assert.equal(blockedTask.json().errors[0].code, 'INVALID_STATE_TRANSITION')
  const blockedMilestone = await createMilestone(f, project.id, 'milestone-after-archive-000001')
  assert.equal(blockedMilestone.statusCode, 409)
})

test('task and milestone lists survive application restart', async (t) => {
  const f = await fixture(t)
  const project = await f.createProject()
  const milestone = (await createMilestone(f, project.id, 'milestone-restart-00000000001')).json().data
  const task = (await createTask(f, project.id, 'task-restart-0000000000000001', { milestone_id: milestone.id })).json().data
  await f.close()
  const restartToken = `${bootstrapToken}-restart`
  const restarted = createWorkbenchApp({ bootstrapToken: restartToken, databasePath: f.databasePath, now: () => f.now() + 1 })
  try {
    const boot = await restarted.inject({
      method: 'POST', url: '/api/v1/session/bootstrap',
      headers: headers({ 'content-type': 'application/json', origin, 'x-workbench-bootstrap': restartToken }), payload: {},
    })
    const restartCookie = cookieFrom(boot)
    const tasks = await restarted.inject({ method: 'GET', url: `/api/v1/projects/${project.id}/tasks`, headers: headers({ cookie: restartCookie }) })
    const milestones = await restarted.inject({ method: 'GET', url: `/api/v1/projects/${project.id}/milestones`, headers: headers({ cookie: restartCookie }) })
    assert.equal(tasks.json().data.items[0].id, task.id)
    assert.equal(milestones.json().data.items[0].id, milestone.id)
  } finally {
    await restarted.close()
  }
})
