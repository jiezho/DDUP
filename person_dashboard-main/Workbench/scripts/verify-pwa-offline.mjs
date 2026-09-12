import { chromium, firefox, webkit } from '@playwright/test'
import { preview } from 'vite'

const browserName = process.env.WORKBENCH_E2E_BROWSER || 'chromium'
const browserType = { chromium, firefox, webkit }[browserName]
if (!browserType) throw new Error('WORKBENCH_E2E_BROWSER must be chromium, firefox or webkit')

const host = '127.0.0.1'
const port = 4181
const server = await preview({
  configFile: false,
  build: { outDir: 'dist/client' },
  preview: { host, port, strictPort: true },
})
let browser
try {
  browser = await browserType.launch({ headless: true })
  const context = await browser.newContext({ locale: 'zh-CN', serviceWorkers: 'allow' })
  const page = await context.newPage()
  await page.goto(`http://${host}:${port}/`, { waitUntil: 'networkidle' })
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload({ waitUntil: 'networkidle' })
  const controlled = await page.evaluate(() => Boolean(navigator.serviceWorker.controller))
  if (!controlled) throw new Error('production page is not controlled by its service worker')

  await context.setOffline(true)
  const shell = await page.evaluate(async () => {
    const response = await caches.match('/')
    return { ok: Boolean(response?.ok), html: response ? await response.text() : '' }
  })
  if (!shell.ok || !shell.html.includes('DDUP · 个人上下文智能工作台')) {
    throw new Error('offline static shell was not served from the application cache')
  }
  // WebKit on Windows reports an internal navigation error for Playwright's
  // offline reload even when the controlling worker serves the cached shell.
  if (browserName !== 'webkit') {
    await page.reload({ waitUntil: 'domcontentloaded' })
    if ((await page.title()) !== 'DDUP · 个人上下文智能工作台') {
      throw new Error('offline static shell did not render the expected page')
    }
  }
  const apiCached = await page.evaluate(() => caches.match('/api/health').then(Boolean))
  if (apiCached) throw new Error('service worker must not cache an API response')
  if (browserName !== 'webkit') {
    const apiOutcome = await page.evaluate(() => fetch('/api/health').then(() => 'resolved', () => 'rejected'))
    if (apiOutcome !== 'rejected') throw new Error('service worker must not satisfy an offline API request')
  }
  process.stdout.write(`PWA offline shell passed in ${browserName}; API responses remained uncached.\n`)
  await context.close()
} finally {
  await browser?.close()
  await new Promise((resolve, reject) => server.httpServer.close((error) => error ? reject(error) : resolve()))
}
