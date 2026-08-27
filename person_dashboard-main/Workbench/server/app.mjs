import Fastify, { LogController } from 'fastify'
import { dirname, join } from 'node:path'

import { createUuidV7 } from '../shared/contracts/ids.mjs'
import { errorEnvelope, okEnvelope } from '../shared/contracts/envelopes.mjs'
import { ERROR_CODES, WorkbenchError, publicError } from '../shared/contracts/errors.mjs'
import { CapabilitiesDataSchema, HealthDataSchema } from '../shared/contracts/system.mjs'
import { registerContextRoutes } from './context/context-routes.mjs'
import { createContextStore } from './context/context-store.mjs'
import { createContextPackageStore } from './context/context-package-store.mjs'
import { createProtectedSearchService } from './context/protected-search-service.mjs'
import {
  createLocalSessionStore,
  parseHost,
  requestIsSameOrigin,
  SESSION_COOKIE,
} from './http/local-security.mjs'
import { registerProjectRoutes } from './projects/project-routes.mjs'
import { createProjectStore } from './projects/project-store.mjs'
import { openWorkbenchDatabase } from './storage/database.mjs'

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

function sessionCookie(token, maxAgeSeconds) {
  return `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAgeSeconds}`
}

function clearedSessionCookie() {
  return `${SESSION_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`
}

export function createWorkbenchApp({
  appVersion = '0.1.0',
  allowedHosts = ['127.0.0.1', 'localhost'],
  bootstrapToken,
  databasePath = null,
  sourceStoragePath = null,
  now = Date.now,
  sessionTtlMs = 8 * 60 * 60 * 1000,
  hybridSearch = { enabled: false, adapter: null, minScore: 0.50 },
} = {}) {
  const allowed = new Set(allowedHosts.map((host) => host.toLowerCase()))
  const sessions = createLocalSessionStore({ bootstrapToken, now, ttlMs: sessionTtlMs })
  const database = databasePath ? openWorkbenchDatabase({ databasePath, appVersion, now }) : null
  const projectStore = database ? createProjectStore({ database, now }) : null
  const contextStore = database
    ? createContextStore({
        database,
        kernel: projectStore.kernel,
        sourceRoot: sourceStoragePath ?? join(dirname(databasePath), 'sources'),
      })
    : null
  const protectedSearchService = contextStore
    ? createProtectedSearchService({ contextStore, hybridSearch })
    : null
  const contextPackageStore = database
    ? createContextPackageStore({ database, kernel: projectStore.kernel })
    : null
  const app = Fastify({
    bodyLimit: 1024 * 1024,
    genReqId: () => createUuidV7(now),
    handlerTimeout: 30_000,
    logController: new LogController({ disableRequestLogging: true }),
    logger: false,
    requestTimeout: 30_000,
    trustProxy: false,
  })

  if (database) {
    app.addHook('onClose', async () => database.close())
  }

  app.addHook('onRequest', async (request, reply) => {
    const parsedHost = parseHost(request.headers.host)
    if (!parsedHost || !allowed.has(parsedHost.hostname)) {
      const error = publicError(ERROR_CODES.INVALID_HOST, '请求目标无效。', { statusCode: 400 })
      return reply.code(error.statusCode).send(errorEnvelope(request.id, error))
    }

    if (UNSAFE_METHODS.has(request.method)) {
      const contentType = request.headers['content-type'] ?? ''
      if (!String(contentType).toLowerCase().startsWith('application/json')) {
        const error = publicError(ERROR_CODES.INVALID_REQUEST, '写请求必须使用 application/json。', {
          statusCode: 415,
        })
        return reply.code(error.statusCode).send(errorEnvelope(request.id, error))
      }
      if (!requestIsSameOrigin(request)) {
        const error = publicError(ERROR_CODES.CSRF_REJECTED, '写请求的来源校验失败。', {
          statusCode: 403,
        })
        return reply.code(error.statusCode).send(errorEnvelope(request.id, error))
      }
    }
  })

  async function requireSession(request) {
    const session = sessions.authenticate(request.headers.cookie)
    if (!session) {
      throw publicError(ERROR_CODES.SESSION_REQUIRED, '本地会话缺失或已过期。', {
        statusCode: 401,
      })
    }
    request.workbenchSession = session
  }

  async function requireCsrf(request) {
    await requireSession(request)
    if (!sessions.verifyCsrf(request.workbenchSession, request.headers['x-csrf-token'])) {
      throw publicError(ERROR_CODES.CSRF_REJECTED, 'CSRF 校验失败。', { statusCode: 403 })
    }
  }

  app.get('/api/health', async (request) =>
    okEnvelope(
      request.id,
      HealthDataSchema.parse({
        service: 'personal-ai-workbench',
        status: 'ok',
        app_version: appVersion,
        runtime: { node: process.version, sqlite: 'available' },
      }),
    ),
  )

  app.post('/api/v1/session/bootstrap', async (request, reply) => {
    const provided = request.headers['x-workbench-bootstrap']
    const created = sessions.bootstrap(provided, {
      principalId: projectStore?.identity.principal_id ?? null,
    })
    reply.header('set-cookie', sessionCookie(created.sessionToken, Math.floor(sessionTtlMs / 1000)))
    return okEnvelope(request.id, {
      principal: {
        kind: 'local_owner',
        ...(projectStore ? { id: projectStore.identity.principal_id } : {}),
      },
      csrf_token: created.csrfToken,
      expires_at: new Date(created.expiresAt).toISOString(),
      persistence: projectStore ? 'available' : 'not_implemented',
    })
  })

  app.get('/api/v1/session', { preHandler: requireSession }, async (request) => {
    const spaces = projectStore ? projectStore.listSpaces(request.workbenchSession) : []
    return okEnvelope(request.id, {
      principal: {
        kind: 'local_owner',
        ...(projectStore ? { id: projectStore.identity.principal_id } : {}),
      },
      expires_at: new Date(request.workbenchSession.expiresAt).toISOString(),
      csrf_token: request.workbenchSession.csrfToken,
      spaces,
      persistence: projectStore ? 'available' : 'not_implemented',
    })
  })

  app.delete('/api/v1/session', { preHandler: requireCsrf }, async (request, reply) => {
    sessions.revoke(request.workbenchSession)
    reply.header('set-cookie', clearedSessionCookie())
    return okEnvelope(request.id, { revoked: true })
  })

  app.get('/api/v1/system/capabilities', { preHandler: requireSession }, async (request) =>
    okEnvelope(
      request.id,
      CapabilitiesDataSchema.parse({
        local_session: sessions.isBootstrapAvailable() ? 'not_implemented' : 'available',
        projects: projectStore ? 'available' : 'prototype',
        knowledge: 'prototype',
        hybrid_search: protectedSearchService?.enabled ? 'prototype' : 'disabled',
        native_runtime: 'not_implemented',
        deepseek_harness: 'poc_not_connected',
        hermes: 'candidate_not_connected',
        persistence: projectStore ? 'available' : 'not_implemented',
      }),
    ),
  )

  if (projectStore) {
    registerProjectRoutes(app, { projectStore, requireSession, requireCsrf })
  }
  if (contextStore) {
    registerContextRoutes(app, { contextStore, contextPackageStore, protectedSearchService, requireSession, requireCsrf })
  }

  app.setNotFoundHandler(async (request, reply) => {
    const error = publicError(ERROR_CODES.OBJECT_NOT_AVAILABLE, '请求的资源不可用。', {
      statusCode: 404,
    })
    return reply.code(error.statusCode).send(errorEnvelope(request.id, error))
  })

  app.setErrorHandler(async (error, request, reply) => {
    const safeError =
      error instanceof WorkbenchError
        ? error
        : error?.code === 'FST_ERR_CTP_BODY_TOO_LARGE'
          ? publicError(ERROR_CODES.INVALID_REQUEST, '请求正文超过允许大小。', {
              statusCode: 413,
              field: 'body',
            })
        : publicError(ERROR_CODES.INTERNAL_ERROR, '服务暂时无法完成请求。', {
            statusCode: 500,
          })
    return reply.code(safeError.statusCode).send(errorEnvelope(request.id, safeError))
  })

  return app
}
