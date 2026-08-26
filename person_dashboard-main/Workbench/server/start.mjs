import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

import { createWorkbenchApp } from './app.mjs'
import { hybridSearchRuntimeFromEnv } from './context/dense-sidecar-adapter.mjs'

const host = '127.0.0.1'
const port = Number.parseInt(process.env.WORKBENCH_PORT ?? '8787', 10)
const bootstrapToken = process.env.WORKBENCH_BOOTSTRAP_TOKEN
const dataDirectory = resolve(process.env.WORKBENCH_DATA_DIR ?? '.workbench-data')
const databasePath = resolve(dataDirectory, 'workbench.db')

if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  throw new Error('WORKBENCH_PORT must be an integer between 1024 and 65535')
}
if (typeof bootstrapToken !== 'string' || bootstrapToken.length < 32) {
  throw new Error('WORKBENCH_BOOTSTRAP_TOKEN must be supplied by the controlled local launcher')
}

mkdirSync(dataDirectory, { recursive: true })
const app = createWorkbenchApp({
  bootstrapToken,
  databasePath,
  hybridSearch: hybridSearchRuntimeFromEnv(process.env),
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, async () => {
    await app.close()
    process.exit(0)
  })
}

await app.listen({ host, port })
process.stdout.write(`Workbench local service listening on http://${host}:${port}\n`)
