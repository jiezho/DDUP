import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { HarnessClient } from '@deepseek-ai/dsh-sdk-client'
import { runOfficialCliPreflight } from '../scripts/official-cli-preflight.mjs'

const root = dirname(dirname(fileURLToPath(import.meta.url)))

function safeRuntimeDirectory(name) {
  const runtimeBase = join(root, '.runtime')
  const target = join(runtimeBase, name)
  assert.equal(target.startsWith(`${runtimeBase}\\`) || target.startsWith(`${runtimeBase}/`), true)
  rmSync(target, { recursive: true, force: true })
  mkdirSync(target, { recursive: true })
  return target
}

test('official CLI is exact but approved packages fail closed without an SDK runtime profile', async () => {
  const result = await runOfficialCliPreflight()
  assert.equal(result.exactVersion, true)
  assert.notEqual(result.sdkMinimalExitCode, 0)
  assert.equal(result.sdkMinimalStdoutPure, true)
  assert.equal(result.sdkRuntimeAvailable, false)
  assert.equal(result.failureClassification, 'approved_packages_do_not_ship_sdk_runtime_profile')
})

test('official SDK client completes synthetic handshake, notifications, and process shutdown with a scrubbed environment', async () => {
  const runtime = safeRuntimeDirectory('sdk-client-fixture')
  const workspace = join(runtime, 'workspace')
  const receipt = join(runtime, 'receipt.json')
  mkdirSync(workspace, { recursive: true })
  const env = {
    DDUP_SYNTHETIC_RECEIPT: receipt,
    DSH_HOME: join(runtime, 'home'),
    TEMP: join(runtime, 'temp'),
    TMP: join(runtime, 'temp'),
  }
  for (const key of ['SystemRoot', 'ComSpec', 'PATH', 'PATHEXT']) {
    if (process.env[key]) env[key] = process.env[key]
  }
  mkdirSync(env.DSH_HOME, { recursive: true })
  mkdirSync(env.TEMP, { recursive: true })

  const client = new HarnessClient({
    command: process.execPath,
    args: [join(root, 'fixtures', 'jsonrpc-runtime-fixture.mjs')],
    cwd: workspace,
    env,
    requestTimeoutMs: 2_000,
    shutdownTimeoutMs: 1_000,
    disposeEofGraceMs: 1_000,
    disposeGraceMs: 1_000,
  })
  const notifications = client.subscribe()
  try {
    const identity = await client.initialize({
      cwd: workspace,
      provider: 'synthetic-no-network',
      model: 'synthetic-no-model',
      maxTokens: 16,
    })
    assert.deepEqual(identity, {
      serverInfo: { name: 'deepseek-harness-sdk-runtime', version: '0.0.1' },
    })
    const messageId = await client.prompt('synthetic-session-001', [
      { type: 'text', text: 'synthetic protocol ping' },
    ])
    assert.equal(messageId, 'synthetic-message-001')
    const delivered = [await notifications.next(), await notifications.next(), await notifications.next()]
    assert.deepEqual(delivered.map((item) => item.method), [
      'session.status',
      'session.event',
      'session.status',
    ])
  } finally {
    notifications.close()
    await client.close()
  }

  assert.equal(existsSync(receipt), true)
  const processReceipt = JSON.parse(readFileSync(receipt, 'utf8'))
  assert.equal(processReceipt.reason, 'protocol_shutdown')
  assert.deepEqual(processReceipt.receivedMethods, ['initialize', 'session/prompt', 'shutdown'])
  assert.equal(processReceipt.environmentKeys.some((key) => /API|KEY|TOKEN|SECRET|CREDENTIAL/i.test(key)), false)
})
