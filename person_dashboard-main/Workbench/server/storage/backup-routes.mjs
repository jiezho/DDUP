import { z, ZodError } from 'zod'

import { okEnvelope } from '../../shared/contracts/envelopes.mjs'
import { ERROR_CODES, publicError } from '../../shared/contracts/errors.mjs'
import { isUuidV7 } from '../../shared/contracts/ids.mjs'

const BackupScopeSchema = z.object({ space_id: z.string().refine(isUuidV7, '必须是 UUIDv7。') }).strict()

function parse(schema, value) {
  try { return schema.parse(value) } catch (error) {
    if (!(error instanceof ZodError)) throw error
    throw publicError(ERROR_CODES.VALIDATION_FAILED, '请求字段未通过校验。', { statusCode: 422, field: error.issues[0]?.path?.join('.') || null })
  }
}

export function registerBackupRoutes(app, { backupService, projectStore, requireSession, requireCsrf }) {
  app.get('/api/v1/system/backups', { preHandler: requireSession }, async (request) => {
    const query = parse(BackupScopeSchema, request.query)
    projectStore.getSpace(request.workbenchSession, query.space_id)
    return okEnvelope(request.id, { items: await backupService.listBackups(request.workbenchSession) }, { scope: { space_id: query.space_id } })
  })

  app.post('/api/v1/system/backups', { preHandler: requireCsrf }, async (request, reply) => {
    const input = parse(BackupScopeSchema, request.body)
    projectStore.getSpace(request.workbenchSession, input.space_id)
    const data = await backupService.createBackup(request.workbenchSession, { requestId: request.id, spaceId: input.space_id })
    reply.code(201)
    return okEnvelope(request.id, data, { scope: { space_id: input.space_id } })
  })

  app.get('/api/v1/system/backups/:backupId/verify', { preHandler: requireSession }, async (request) => {
    const query = parse(BackupScopeSchema, request.query)
    projectStore.getSpace(request.workbenchSession, query.space_id)
    return okEnvelope(request.id, await backupService.verifyBackup(request.workbenchSession, request.params.backupId), { scope: { space_id: query.space_id } })
  })
}
