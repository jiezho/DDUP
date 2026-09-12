import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const manifestUrl = new URL('../public/manifest.webmanifest', import.meta.url)
const workerUrl = new URL('../public/service-worker.js', import.meta.url)
const mainUrl = new URL('../src/main.jsx', import.meta.url)
const htmlUrl = new URL('../index.html', import.meta.url)

test('PWA manifest exposes an installable local-first shell', async () => {
  const [manifest, html] = await Promise.all([
    readFile(manifestUrl, 'utf8').then(JSON.parse),
    readFile(htmlUrl, 'utf8'),
  ])
  assert.equal(manifest.start_url, '/')
  assert.equal(manifest.scope, '/')
  assert.equal(manifest.display, 'standalone')
  assert.equal(manifest.lang, 'zh-CN')
  assert.ok(manifest.icons.some((icon) => icon.src === '/apple-touch-icon.png'))
  assert.match(html, /rel="manifest" href="\/manifest\.webmanifest"/)
})

test('service worker caches only the static shell and never API responses', async () => {
  const [worker, main] = await Promise.all([
    readFile(workerUrl, 'utf8'),
    readFile(mainUrl, 'utf8'),
  ])
  assert.match(worker, /request\.method !== "GET"/)
  assert.match(worker, /url\.pathname\.startsWith\("\/api\/"\)/)
  assert.match(worker, /request\.mode === "navigate"/)
  assert.match(worker, /fetch\(request\).*catch\(\(\) => caches\.match\("\/"\)\)/s)
  assert.doesNotMatch(worker, /cache\.put\([^\n]*api/i)
  assert.match(main, /import\.meta\.env\.PROD && "serviceWorker" in navigator/)
})
