import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { createWorkbenchApp } from '../server/app.mjs'
import { createUuidV7 } from '../shared/contracts/ids.mjs'

const host = '127.0.0.1:8787'
const origin = `http://${host}`
const headers = (extra = {}) => ({ host, ...extra })

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'workbench-tool-gateway-test-'))
  const databasePath = join(root, 'workbench.db')
  const sourceStoragePath = join(root, 'controlled-sources')
  const token = `synthetic-tool-${crypto.randomUUID()}`
  const clock = { value: Date.UTC(2026, 7, 28, 6) }
  const apps = []
  const createApp = () => createWorkbenchApp({
    bootstrapToken: token, databasePath, sourceStoragePath, now: () => clock.value,
    sessionTtlMs: 48 * 60 * 60 * 1000,
  })
  const bootstrap = async (app) => {
    const boot = await app.inject({
      method: 'POST', url: '/api/v1/session/bootstrap',
      headers: headers({ 'content-type': 'application/json', origin, 'x-workbench-bootstrap': token }), payload: {},
    })
    assert.equal(boot.statusCode, 200, boot.body)
    return { cookie: boot.headers['set-cookie'].split(';', 1)[0], csrf: boot.json().data.csrf_token }
  }
  let app = createApp(); apps.push(app)
  let auth = await bootstrap(app)
  const session = await app.inject({ method: 'GET', url: '/api/v1/session', headers: headers({ cookie: auth.cookie }) })
  const spaceId = session.json().data.spaces[0].id
  const makeWriteHeaders = (key, version = null) => headers({
    'content-type': 'application/json', origin, cookie: auth.cookie, 'x-csrf-token': auth.csrf,
    'idempotency-key': key, ...(version == null ? {} : { 'if-match': `"v${version}"` }),
  })
  t.after(async () => {
    for (const current of apps.reverse()) await current.close().catch(() => {})
    await rm(root, { recursive: true, force: true })
  })
  const restart = async () => {
    await app.close()
    app = createApp(); apps.push(app)
    auth = await bootstrap(app)
    return { app, cookie: auth.cookie, csrf: auth.csrf }
  }
  return {
    get app() { return app },
    get cookie() { return auth.cookie },
    spaceId, databasePath, clock, restart,
    writeHeaders: makeWriteHeaders,
  }
}

async function prepareScopedProject(f) {
  const projectResponse = await f.app.inject({
    method: 'POST', url: '/api/v1/projects', headers: f.writeHeaders(`tool-project-${crypto.randomUUID()}`),
    payload: {
      space_id: f.spaceId, name: '合成审批桥项目', summary: '完全虚构的工具治理测试。',
      template_type: 'research', start_date: null, target_date: null,
      context_policy: 'project_only', color_token: 'sky',
    },
  })
  assert.equal(projectResponse.statusCode, 201, projectResponse.body)
  const project = projectResponse.json().data
  const packageResponse = await f.app.inject({
    method: 'POST', url: '/api/v1/context/packages', headers: f.writeHeaders(`tool-package-${crypto.randomUUID()}`),
    payload: { space_id: f.spaceId, name: '合成工具范围', purpose: '只允许为已选项目创建待确认任务候选。', expires_at: null },
  })
  assert.equal(packageResponse.statusCode, 201, packageResponse.body)
  const added = await f.app.inject({
    method: 'POST', url: `/api/v1/context/packages/${packageResponse.json().data.id}/items`,
    headers: f.writeHeaders(`tool-package-item-${crypto.randomUUID()}`, 1),
    payload: { space_id: f.spaceId, object_type: 'project', object_id: project.id },
  })
  assert.equal(added.statusCode, 200, added.body)
  return { project, contextPackage: added.json().data }
}

function candidateRunPayload(f, prepared, overrides = {}) {
  return {
    space_id: f.spaceId,
    context_package_id: prepared.contextPackage.id,
    context_package_version: prepared.contextPackage.version,
    goal: '根据用户明确输入创建一个待确认任务候选。',
    task_candidate: {
      project_id: prepared.project.id,
      title: '复核合成研究证据',
      description: '仅用于验证候选、审批和应用边界。',
      priority: 'high',
      due_date: '2026-09-03',
    },
    budget: { max_steps: 3, max_tool_calls: 1 },
    ...overrides,
  }
}

async function startCandidateRun(f, prepared, key = `tool-run-${crypto.randomUUID()}`) {
  const response = await f.app.inject({ method: 'POST', url: '/api/v1/runs', headers: f.writeHeaders(key), payload: candidateRunPayload(f, prepared) })
  assert.equal(response.statusCode, 202, response.body)
  return response
}

async function requestApproval(f, candidate, key = `tool-approval-${crypto.randomUUID()}`) {
  const response = await f.app.inject({
    method: 'POST', url: `/api/v1/candidates/${candidate.id}/approvals`, headers: f.writeHeaders(key),
    payload: { space_id: f.spaceId, reason_code: 'apply_task_candidate' },
  })
  assert.equal(response.statusCode, 201, response.body)
  return response.json().data
}

test('L1 candidate stays non-authoritative until an L2 approval is resolved and applied once', async (t) => {
  const f = await fixture(t)
  const prepared = await prepareScopedProject(f)
  const tools = await f.app.inject({ method: 'GET', url: '/api/v1/tools', headers: headers({ cookie: f.cookie }) })
  assert.equal(tools.statusCode, 200, tools.body)
  assert.deepEqual(tools.json().data.items.map((item) => [item.tool_key, item.action_level, item.approval_required]), [
    ['candidate.task.create.v1', 'L1', false],
    ['candidate.apply.v1', 'L2', true],
  ])
  const key = 'tool-run-approved-0000000001'
  const started = await startCandidateRun(f, prepared, key)
  const run = started.json().data
  assert.equal(run.status, 'succeeded')

  const events = await f.app.inject({
    method: 'GET', url: `/api/v1/runs/${run.id}/events?space_id=${f.spaceId}`, headers: headers({ cookie: f.cookie }),
  })
  assert.deepEqual(events.json().data.items.map((event) => event.type), [
    'run.queued', 'run.started', 'checkpoint.created', 'context.scope.resolved',
    'tool.requested', 'candidate.created', 'tool.completed', 'checkpoint.created',
    'run.succeeded', 'checkpoint.created',
  ])
  assert.doesNotMatch(events.body, /复核合成研究证据|候选、审批和应用边界/)
  const candidateId = events.json().data.items.find((event) => event.type === 'candidate.created').payload.candidate_id
  const candidateResponse = await f.app.inject({
    method: 'GET', url: `/api/v1/candidates/${candidateId}?space_id=${f.spaceId}`, headers: headers({ cookie: f.cookie }),
  })
  const candidate = candidateResponse.json().data
  assert.equal(candidate.status, 'pending')
  assert.equal(candidate.proposal.title, '复核合成研究证据')

  const replay = await startCandidateRun(f, prepared, key)
  assert.equal(replay.json().meta.idempotency_replayed, true)
  const approval = await requestApproval(f, candidate)
  const premature = await f.app.inject({
    method: 'POST', url: `/api/v1/candidates/${candidate.id}/apply`, headers: f.writeHeaders('tool-apply-premature-000001', 1),
    payload: { space_id: f.spaceId, approval_id: approval.id },
  })
  assert.equal(premature.statusCode, 409)
  assert.equal(premature.json().errors[0].code, 'APPROVAL_REQUIRED')

  const resolved = await f.app.inject({
    method: 'POST', url: `/api/v1/approvals/${approval.id}/resolve`, headers: f.writeHeaders('tool-approval-resolve-00001', 1),
    payload: { space_id: f.spaceId, decision: 'approve' },
  })
  assert.equal(resolved.statusCode, 200, resolved.body)
  assert.equal(resolved.json().data.status, 'approved')
  const resolvedReplay = await f.app.inject({
    method: 'POST', url: `/api/v1/approvals/${approval.id}/resolve`, headers: f.writeHeaders('tool-approval-resolve-00001', 1),
    payload: { space_id: f.spaceId, decision: 'approve' },
  })
  assert.equal(resolvedReplay.statusCode, 200, resolvedReplay.body)
  assert.equal(resolvedReplay.json().meta.idempotency_replayed, true)
  const applyKey = 'tool-candidate-apply-0000001'
  const applied = await f.app.inject({
    method: 'POST', url: `/api/v1/candidates/${candidate.id}/apply`, headers: f.writeHeaders(applyKey, 2),
    payload: { space_id: f.spaceId, approval_id: approval.id },
  })
  assert.equal(applied.statusCode, 200, applied.body)
  assert.equal(applied.json().data.candidate.status, 'applied')
  assert.equal(applied.json().data.task.source_kind, 'ai_candidate')
  const applyReplay = await f.app.inject({
    method: 'POST', url: `/api/v1/candidates/${candidate.id}/apply`, headers: f.writeHeaders(applyKey, 2),
    payload: { space_id: f.spaceId, approval_id: approval.id },
  })
  assert.equal(applyReplay.statusCode, 200, applyReplay.body)
  assert.equal(applyReplay.json().meta.idempotency_replayed, true)
  assert.deepEqual(applyReplay.json().data, applied.json().data)

  const database = new DatabaseSync(f.databasePath)
  try {
    assert.equal(database.prepare('SELECT count(*) AS count FROM candidates').get().count, 1)
    assert.equal(database.prepare('SELECT count(*) AS count FROM approvals').get().count, 1)
    assert.equal(database.prepare('SELECT count(*) AS count FROM tool_calls').get().count, 2)
    assert.equal(database.prepare('SELECT count(*) AS count FROM tasks').get().count, 1)
    assert.equal(database.prepare("SELECT source_kind FROM tasks").get().source_kind, 'ai_candidate')
  } finally { database.close() }
})

test('rejection, scope tampering, invalid budgets and out-of-scope projects fail without task writes', async (t) => {
  const f = await fixture(t)
  const prepared = await prepareScopedProject(f)
  const invalidBudget = await f.app.inject({
    method: 'POST', url: '/api/v1/runs', headers: f.writeHeaders('tool-invalid-budget-000001'),
    payload: { ...candidateRunPayload(f, prepared), budget: { max_steps: 3, max_tool_calls: 0 } },
  })
  assert.equal(invalidBudget.statusCode, 422)

  const otherProjectResponse = await f.app.inject({
    method: 'POST', url: '/api/v1/projects', headers: f.writeHeaders('tool-other-project-0000001'),
    payload: {
      space_id: f.spaceId, name: '未纳入范围的合成项目', summary: '', template_type: 'general',
      start_date: null, target_date: null, context_policy: 'project_only', color_token: 'cyan',
    },
  })
  const outOfScope = await f.app.inject({
    method: 'POST', url: '/api/v1/runs', headers: f.writeHeaders('tool-out-of-scope-run-00001'),
    payload: candidateRunPayload(f, prepared, { task_candidate: { ...candidateRunPayload(f, prepared).task_candidate, project_id: otherProjectResponse.json().data.id } }),
  })
  assert.equal(outOfScope.statusCode, 202, outOfScope.body)
  assert.equal(outOfScope.json().data.status, 'failed')
  assert.equal(outOfScope.json().data.error_code, 'TOOL_NOT_ALLOWED')

  const first = await startCandidateRun(f, prepared, 'tool-rejected-run-00000001')
  const runId = first.json().data.id
  const candidate = (await f.app.inject({
    method: 'GET', url: `/api/v1/candidates?space_id=${f.spaceId}`, headers: headers({ cookie: f.cookie }),
  })).json().data.items.find((item) => item.run_id === runId)
  const approval = await requestApproval(f, candidate, 'tool-reject-approval-000001')
  const rejected = await f.app.inject({
    method: 'POST', url: `/api/v1/approvals/${approval.id}/resolve`, headers: f.writeHeaders('tool-reject-resolve-0000001', 1),
    payload: { space_id: f.spaceId, decision: 'reject' },
  })
  assert.equal(rejected.statusCode, 200, rejected.body)
  const deniedApply = await f.app.inject({
    method: 'POST', url: `/api/v1/candidates/${candidate.id}/apply`, headers: f.writeHeaders('tool-rejected-apply-0000001', 2),
    payload: { space_id: f.spaceId, approval_id: approval.id },
  })
  assert.equal(deniedApply.statusCode, 409)
  assert.equal(deniedApply.json().errors[0].code, 'APPROVAL_REQUIRED')

  const tamperRun = await startCandidateRun(f, prepared, 'tool-tamper-run-0000000001')
  const tamperCandidate = (await f.app.inject({
    method: 'GET', url: `/api/v1/candidates?space_id=${f.spaceId}`, headers: headers({ cookie: f.cookie }),
  })).json().data.items.find((item) => item.run_id === tamperRun.json().data.id)
  const tamperApproval = await requestApproval(f, tamperCandidate, 'tool-tamper-approval-000001')
  const database = new DatabaseSync(f.databasePath)
  try {
    database.prepare('UPDATE candidates SET proposal_json = ? WHERE id = ?').run(JSON.stringify({ ...tamperCandidate.proposal, title: '被替换的标题' }), tamperCandidate.id)
  } finally { database.close() }
  const tampered = await f.app.inject({
    method: 'POST', url: `/api/v1/approvals/${tamperApproval.id}/resolve`, headers: f.writeHeaders('tool-tamper-resolve-0000001', 1),
    payload: { space_id: f.spaceId, decision: 'approve' },
  })
  assert.equal(tampered.statusCode, 409)
  assert.equal(tampered.json().errors[0].code, 'APPROVAL_SCOPE_MISMATCH')
  const unknownSpace = createUuidV7(() => Date.UTC(2026, 7, 29))
  const isolated = await f.app.inject({
    method: 'GET', url: `/api/v1/candidates/${candidate.id}?space_id=${unknownSpace}`, headers: headers({ cookie: f.cookie }),
  })
  assert.equal(isolated.statusCode, 404)

  const verify = new DatabaseSync(f.databasePath)
  try {
    assert.equal(verify.prepare('SELECT count(*) AS count FROM tasks').get().count, 0)
    const denied = verify.prepare("SELECT status, error_code FROM tool_calls WHERE status = 'denied'").get()
    assert.deepEqual({ ...denied }, { status: 'denied', error_code: 'TOOL_NOT_ALLOWED' })
    assert.equal(verify.prepare("SELECT count(*) AS count FROM audit_events WHERE action = 'tool_call.denied' AND outcome = 'denied'").get().count, 1)
  } finally { verify.close() }
})

test('approved candidate survives restart while expired approval remains non-executable', async (t) => {
  const f = await fixture(t)
  const prepared = await prepareScopedProject(f)
  const started = await startCandidateRun(f, prepared, 'tool-restart-run-0000000001')
  const candidate = (await f.app.inject({
    method: 'GET', url: `/api/v1/candidates?space_id=${f.spaceId}`, headers: headers({ cookie: f.cookie }),
  })).json().data.items.find((item) => item.run_id === started.json().data.id)
  const approval = await requestApproval(f, candidate, 'tool-restart-approval-00001')
  const resolved = await f.app.inject({
    method: 'POST', url: `/api/v1/approvals/${approval.id}/resolve`, headers: f.writeHeaders('tool-restart-resolve-000001', 1),
    payload: { space_id: f.spaceId, decision: 'approve' },
  })
  assert.equal(resolved.statusCode, 200, resolved.body)
  await f.restart()
  const applied = await f.app.inject({
    method: 'POST', url: `/api/v1/candidates/${candidate.id}/apply`, headers: f.writeHeaders('tool-restart-apply-0000001', 2),
    payload: { space_id: f.spaceId, approval_id: approval.id },
  })
  assert.equal(applied.statusCode, 200, applied.body)
  assert.equal(applied.json().data.task.source_kind, 'ai_candidate')

  const preparedExpired = await prepareScopedProject(f)
  const expiredRun = await startCandidateRun(f, preparedExpired, 'tool-expired-run-0000000001')
  const expiredCandidate = (await f.app.inject({
    method: 'GET', url: `/api/v1/candidates?space_id=${f.spaceId}`, headers: headers({ cookie: f.cookie }),
  })).json().data.items.find((item) => item.run_id === expiredRun.json().data.id)
  const expiredApproval = await requestApproval(f, expiredCandidate, 'tool-expired-approval-00001')
  f.clock.value += 25 * 60 * 60 * 1000
  const expiredResolve = await f.app.inject({
    method: 'POST', url: `/api/v1/approvals/${expiredApproval.id}/resolve`, headers: f.writeHeaders('tool-expired-resolve-000001', 1),
    payload: { space_id: f.spaceId, decision: 'approve' },
  })
  assert.equal(expiredResolve.statusCode, 409)
  assert.equal(expiredResolve.json().errors[0].code, 'APPROVAL_EXPIRED')
})
