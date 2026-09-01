import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')

test('formal runtime center is routed, navigable and bound to implemented APIs', async () => {
  const [app, shell, page, api] = await Promise.all([
    read('../src/App.jsx'),
    read('../src/components/AppShell.jsx'),
    read('../src/pages/RuntimePage.jsx'),
    read('../src/lib/projects-api.js'),
  ])
  assert.match(app, /path="\/runtime" element=\{<RuntimePage/)
  assert.match(shell, /to: "\/runtime", label: "AI 运行中心"/)
  assert.match(page, /title="AI 运行中心"/)
  assert.match(page, /协议预检已准备 · 尚未安装/)
  assert.match(page, /保持候选 · 未接入/)
  assert.match(page, /没有生成模型回答/)
  assert.match(page, /候选不会直接写入项目/)
  assert.match(page, /申请审批、作出决定和应用是三个独立动作/)
  for (const path of [
    '/api/v1/runs?',
    '/api/v1/runs/${encoded}/events?',
    '/api/v1/runs/${encoded}/checkpoints?',
    '/api/v1/runs/${encodeURIComponent(runId)}/events/stream?',
    '/api/v1/runs/${encodeURIComponent(runId)}/retry',
    '/api/v1/candidates/${encodeURIComponent(candidateId)}/approvals',
    '/api/v1/approvals/${encodeURIComponent(approvalId)}/resolve',
    '/api/v1/candidates/${encodeURIComponent(candidateId)}/apply',
  ]) assert.ok(api.includes(path), `missing runtime UI API ${path}`)
  assert.doesNotMatch(page, /Harness.*已连接|Hermes.*已连接|真实模型回答|自动批准/)
})

test('runtime center includes responsive and accessible control states', async () => {
  const [page, styles] = await Promise.all([
    read('../src/pages/RuntimePage.jsx'),
    read('../src/styles.css'),
  ])
  assert.match(page, /aria-label="启动确定性运行"/)
  assert.match(page, /aria-labelledby="runtime-history-title"/)
  assert.match(page, /aria-labelledby="runtime-detail-title"/)
  assert.match(page, /aria-live="polite"/)
  assert.match(styles, /\.page--runtime/)
  assert.match(styles, /@media \(max-width: 760px\)/)
  assert.match(styles, /\.runtime-candidate-list \{ grid-template-columns: 1fr;/)
  assert.match(styles, /\.runtime-detail__columns \{ grid-template-columns: 1fr;/)
})
