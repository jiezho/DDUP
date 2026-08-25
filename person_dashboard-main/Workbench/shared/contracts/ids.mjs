import { randomBytes } from 'node:crypto'

const UUID_V7_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

let lastTimestamp = -1
let sequence = 0

function randomSequence() {
  const bytes = randomBytes(2)
  return ((bytes[0] << 8) | bytes[1]) & 0x0fff
}

export function createUuidV7(now = Date.now) {
  const observed = Number(now())
  if (!Number.isSafeInteger(observed) || observed < 0 || observed >= 2 ** 48) {
    throw new RangeError('UUIDv7 timestamp must be a non-negative 48-bit integer')
  }

  let timestamp = observed
  if (timestamp > lastTimestamp) {
    lastTimestamp = timestamp
    sequence = randomSequence()
  } else {
    timestamp = lastTimestamp
    sequence += 1
    if (sequence > 0x0fff) {
      lastTimestamp += 1
      timestamp = lastTimestamp
      sequence = randomSequence()
    }
  }

  const bytes = Buffer.allocUnsafe(16)
  let remaining = BigInt(timestamp)
  for (let index = 5; index >= 0; index -= 1) {
    bytes[index] = Number(remaining & 0xffn)
    remaining >>= 8n
  }

  bytes[6] = 0x70 | ((sequence >> 8) & 0x0f)
  bytes[7] = sequence & 0xff
  const random = randomBytes(8)
  bytes[8] = 0x80 | (random[0] & 0x3f)
  random.copy(bytes, 9, 1)

  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function isUuidV7(value) {
  return typeof value === 'string' && UUID_V7_PATTERN.test(value)
}
