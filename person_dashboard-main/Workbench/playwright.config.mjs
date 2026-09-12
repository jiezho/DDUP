import { mkdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { defineConfig } from '@playwright/test'

const runtimeRoot = join(tmpdir(), `personal-ai-workbench-e2e-${process.pid}-${randomUUID()}`)
mkdirSync(runtimeRoot, { recursive: true })

export default defineConfig({
  timeout: 120_000,
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  outputDir: join(runtimeRoot, 'results'),
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4178',
    browserName: process.env.WORKBENCH_E2E_BROWSER || 'chromium',
    headless: true,
    locale: 'zh-CN',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    viewport: { width: 1440, height: 1000 },
  },
  webServer: {
    command: 'node scripts/start-e2e-server.mjs',
    env: {
      ...process.env,
      WORKBENCH_DATA_DIR: join(runtimeRoot, 'data'),
    },
    reuseExistingServer: false,
    stderr: 'pipe',
    stdout: 'pipe',
    timeout: 240_000,
    url: 'http://127.0.0.1:4178/api/health',
  },
})
