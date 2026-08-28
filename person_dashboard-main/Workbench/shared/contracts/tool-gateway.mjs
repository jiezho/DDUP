import { z } from 'zod'

import { isUuidV7 } from './ids.mjs'

const UuidV7Schema = z.string().refine(isUuidV7, '必须是 UUIDv7。')
const LocalDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day
}, '日期无效。').nullable().default(null)

export const TaskCandidateProposalSchema = z.object({
  project_id: UuidV7Schema,
  title: z.string().trim().min(1).max(240),
  description: z.string().max(20_000).default(''),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  due_date: LocalDateSchema,
}).strict()

export const CandidateListQuerySchema = z.object({
  space_id: UuidV7Schema,
  status: z.enum(['pending', 'approved', 'rejected', 'applied', 'failed']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
}).strict()

export const CandidateSpaceQuerySchema = z.object({ space_id: UuidV7Schema }).strict()

export const ApprovalRequestSchema = z.object({
  space_id: UuidV7Schema,
  reason_code: z.enum(['apply_task_candidate']).default('apply_task_candidate'),
}).strict()

export const ApprovalListQuerySchema = z.object({
  space_id: UuidV7Schema,
  status: z.enum(['pending', 'approved', 'rejected', 'expired', 'cancelled']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
}).strict()

export const ApprovalResolveSchema = z.object({
  space_id: UuidV7Schema,
  decision: z.enum(['approve', 'reject']),
}).strict()

export const CandidateApplySchema = z.object({
  space_id: UuidV7Schema,
  approval_id: UuidV7Schema,
}).strict()
