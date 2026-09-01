import { appendFileSync, writeFileSync } from 'node:fs'
import { createInterface } from 'node:readline'

const receiptPath = process.env.DDUP_SYNTHETIC_RECEIPT
const receivedMethods = []
let closed = false

function send(value, callback) {
  process.stdout.write(`${JSON.stringify(value)}\n`, callback)
}

function writeReceipt(reason) {
  if (!receiptPath || closed) return
  closed = true
  writeFileSync(receiptPath, `${JSON.stringify({
    fixture: 'synthetic-jsonrpc-runtime-v1',
    reason,
    receivedMethods,
    environmentKeys: Object.keys(process.env).sort(),
  }, null, 2)}\n`)
}

const input = createInterface({ input: process.stdin, crlfDelay: Infinity })
input.on('line', (line) => {
  let request
  try {
    request = JSON.parse(line)
  } catch {
    appendFileSync(receiptPath, '')
    return
  }
  receivedMethods.push(request.method)
  if (request.method === 'initialize') {
    send({
      jsonrpc: '2.0',
      id: request.id,
      result: { serverInfo: { name: 'deepseek-harness-sdk-runtime', version: '0.0.1' } },
    })
    return
  }
  if (request.method === 'session/prompt') {
    const sessionId = request.params.sessionId
    send({ jsonrpc: '2.0', id: request.id, result: { messageId: 'synthetic-message-001' } })
    send({ jsonrpc: '2.0', method: 'session.status', params: { sessionId, status: 'running' } })
    send({
      jsonrpc: '2.0',
      method: 'session.event',
      params: { sessionId, event: { type: 'synthetic/fixture', data: { classification: 'synthetic' } } },
    })
    send({ jsonrpc: '2.0', method: 'session.status', params: { sessionId, status: 'idle' } })
    return
  }
  if (request.method === 'shutdown') {
    send({ jsonrpc: '2.0', id: request.id, result: {} }, () => {
      writeReceipt('protocol_shutdown')
      process.exit(0)
    })
    return
  }
  send({ jsonrpc: '2.0', id: request.id, error: { code: -32601, message: 'Method not found' } })
})

input.on('close', () => {
  writeReceipt('stdin_eof')
  process.exit(0)
})
process.on('SIGTERM', () => {
  writeReceipt('sigterm')
  process.exit(0)
})
