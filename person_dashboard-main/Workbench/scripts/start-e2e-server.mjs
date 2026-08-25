import { createServer } from 'vite'

import viteConfig from '../vite.config.mjs'

const host = '127.0.0.1'
const port = Number.parseInt(process.env.WORKBENCH_E2E_PORT ?? '4178', 10)
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  throw new Error('WORKBENCH_E2E_PORT must be an integer between 1024 and 65535')
}

const e2eShutdownPlugin = {
  name: 'workbench-e2e-shutdown',
  configureServer(devServer) {
    devServer.middlewares.use('/__e2e_shutdown', (request, response, next) => {
      if (request.method !== 'POST') return next()
      response.writeHead(204, { 'Cache-Control': 'no-store' })
      response.end()
      setTimeout(async () => {
        await Promise.race([
          devServer.close(),
          new Promise((resolve) => setTimeout(resolve, 2_000)),
        ])
        process.exit(0)
      }, 50)
    })
  },
}

const server = await createServer({
  ...viteConfig,
  configFile: false,
  plugins: [...viteConfig.plugins, e2eShutdownPlugin],
  server: {
    ...viteConfig.server,
    host,
    port,
    strictPort: true,
  },
})

let closing = false
async function close() {
  if (closing) return
  closing = true
  await server.close()
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, async () => {
    await Promise.race([
      close(),
      new Promise((resolve) => setTimeout(resolve, 2_000)),
    ])
    process.exit(0)
  })
}

await server.listen()
process.stdout.write(`Synthetic E2E server listening on http://${host}:${port}\n`)
