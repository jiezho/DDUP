import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

import { ERROR_CODES, publicError } from '../../shared/contracts/errors.mjs'

export const SESSION_COOKIE = 'workbench_session'

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function safeEqual(left, right) {
  const leftBytes = Buffer.from(String(left ?? ''))
  const rightBytes = Buffer.from(String(right ?? ''))
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes)
}

function randomToken(bytes = 32) {
  return randomBytes(bytes).toString('base64url')
}

export function parseHost(header) {
  if (typeof header !== 'string' || header.length === 0 || header.length > 255) return null
  try {
    const parsed = new URL(`http://${header}`)
    if (parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) return null
    return { host: parsed.host.toLowerCase(), hostname: parsed.hostname.toLowerCase() }
  } catch {
    return null
  }
}

export function requestIsSameOrigin(request) {
  const originHeader = request.headers.origin
  const hostHeader = request.headers.host
  if (typeof originHeader !== 'string' || typeof hostHeader !== 'string') return false
  try {
    const origin = new URL(originHeader)
    return origin.protocol === 'http:' && origin.host.toLowerCase() === hostHeader.toLowerCase()
  } catch {
    return false
  }
}

function parseCookies(header) {
  if (typeof header !== 'string' || header.length > 4096) return new Map()
  const result = new Map()
  for (const part of header.split(';')) {
    const separator = part.indexOf('=')
    if (separator <= 0) continue
    const key = part.slice(0, separator).trim()
    const value = part.slice(separator + 1).trim()
    if (key && value) result.set(key, value)
  }
  return result
}

export function createLocalSessionStore({ bootstrapToken, ttlMs = 8 * 60 * 60 * 1000, now = Date.now } = {}) {
  const sessions = new Map()
  let bootstrapAvailable = typeof bootstrapToken === 'string' && bootstrapToken.length >= 32

  function removeExpired() {
    const current = now()
    for (const [digest, session] of sessions) {
      if (session.expiresAt <= current) sessions.delete(digest)
    }
  }

  function bootstrap(providedToken, sessionData = {}) {
    if (!bootstrapAvailable) {
      throw publicError(ERROR_CODES.BOOTSTRAP_UNAVAILABLE, '本地会话启动入口当前不可用。', {
        statusCode: 503,
      })
    }
    if (!safeEqual(providedToken, bootstrapToken)) {
      throw publicError(ERROR_CODES.BOOTSTRAP_REJECTED, '本地会话启动请求无效。', {
        statusCode: 403,
      })
    }

    bootstrapAvailable = false
    const sessionToken = randomToken()
    const csrfToken = randomToken()
    const expiresAt = now() + ttlMs
    sessions.set(sha256(sessionToken), { csrfDigest: sha256(csrfToken), csrfToken, expiresAt, ...sessionData })
    return { sessionToken, csrfToken, expiresAt }
  }

  function authenticate(cookieHeader) {
    removeExpired()
    const token = parseCookies(cookieHeader).get(SESSION_COOKIE)
    if (!token) return null
    const session = sessions.get(sha256(token))
    return session ? { token, ...session } : null
  }

  function verifyCsrf(session, value) {
    return Boolean(session && safeEqual(sha256(String(value ?? '')), session.csrfDigest))
  }

  function revoke(session) {
    if (session) sessions.delete(sha256(session.token))
  }

  return {
    authenticate,
    bootstrap,
    isBootstrapAvailable: () => bootstrapAvailable,
    revoke,
    verifyCsrf,
  }
}
