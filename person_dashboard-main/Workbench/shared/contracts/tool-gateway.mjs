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

export const KnowledgeCandidateProposalSchema = z.object({
  project_id: UuidV7Schema,
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(20_000),
  source_refs: z.array(z.object({
    source_id: UuidV7Schema,
    source_version_id: UuidV7Schema,
    document_id: UuidV7Schema,
    start_char: z.number().int().min(0),
    end_char: z.number().int().positive(),
  }).strict()).min(1).max(20),
}).strict()

export const DecisionCandidateProposalSchema = z.object({
  project_id: UuidV7Schema,
  title: z.string().trim().min(1).max(200),
  statement: z.string().trim().min(1).max(20_000),
  rationale: z.string().trim().max(20_000).default(''),
}).strict()

export const CANDIDATE_PROPOSAL_SCHEMAS = Object.freeze({
  task: TaskCandidateProposalSchema,
  knowledge: KnowledgeCandidateProposalSchema,
  decision: DecisionCandidateProposalSchema,
})

export const CandidateListQuerySchema = z.object({
  space_id: UuidV7Schema,
  status: z.enum(['pending', 'approved', 'rejected', 'applied', 'failed', 'reverted']).optional(),
  candidate_type: z.enum(['task', 'knowledge', 'decision']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
}).strict()

export const CandidateSpaceQuerySchema = z.object({ space_id: UuidV7Schema }).strict()

export const ApprovalRequestSchema = z.object({
  space_id: UuidV7Schema,
  reason_code: z.enum(['apply_task_candidate', 'apply_knowledge_candidate', 'apply_decision_candidate']),
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

export const CandidateRevertSchema = z.object({
  space_id: UuidV7Schema,
  reason: z.enum(['owner_requested', 'incorrect_candidate', 'superseded']).default('owner_requested'),
}).strict()

export const GovernanceAuditQuerySchema = z.object({
  space_id: UuidV7Schema,
  action: z.string().trim().min(1).max(120).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
}).strict()
