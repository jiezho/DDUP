import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { defineConfig } from '@playwright/test'

const runtimeRoot = join(tmpdir(), `personal-ai-workbench-e2e-${process.pid}`)
mkdirSync(runtimeRoot, { recursive: true })

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  outputDir: join(runtimeRoot, 'results'),
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4178',
    browserName: 'chromium',
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
      VITE_CACHE_DIR: join(runtimeRoot, 'vite-cache'),
      WORKBENCH_DATA_DIR: join(runtimeRoot, 'data'),
    },
    reuseExistingServer: false,
    stderr: 'pipe',
    stdout: 'pipe',
    timeout: 120_000,
    url: 'http://127.0.0.1:4178/api/health',
  },
})
