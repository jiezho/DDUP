import { z } from 'zod'

import { isUuidV7 } from './ids.mjs'
import { TaskCandidateProposalSchema } from './tool-gateway.mjs'

export const RUNTIME_KEYS = Object.freeze(['native-v1', 'deepseek-harness-poc', 'hermes-candidate'])
export const RUN_STATUSES = Object.freeze(['queued', 'running', 'succeeded', 'failed', 'cancelled'])
export const TERMINAL_RUN_STATUSES = Object.freeze(['succeeded', 'failed', 'cancelled'])
export const NATIVE_PROFILE = Object.freeze({ key: 'native-safe-readonly-v1', version: 1 })

const UuidV7Schema = z.string().refine(isUuidV7, '必须是 UUIDv7。')

export const CreateRunSchema = z.object({
  space_id: UuidV7Schema,
  context_package_id: UuidV7Schema,
  context_package_version: z.number().int().positive(),
  runtime_key: z.literal('native-v1').default('native-v1'),
  profile_key: z.literal(NATIVE_PROFILE.key).default(NATIVE_PROFILE.key),
  profile_version: z.literal(NATIVE_PROFILE.version).default(NATIVE_PROFILE.version),
  goal: z.string().trim().min(1).max(2000),
  task_candidate: TaskCandidateProposalSchema.optional(),
  budget: z.object({
    max_steps: z.number().int().min(1).max(10).default(3),
    max_tool_calls: z.number().int().min(0).max(1).default(0),
  }).strict().default({ max_steps: 3, max_tool_calls: 0 }),
}).strict().superRefine((value, context) => {
  if (value.task_candidate && value.budget.max_tool_calls !== 1) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['budget', 'max_tool_calls'], message: '任务候选运行必须显式允许一次 L1 ToolCall。' })
  }
  if (!value.task_candidate && value.budget.max_tool_calls !== 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['budget', 'max_tool_calls'], message: '没有候选请求时不得预留 ToolCall。' })
  }
})

export const ListRunsQuerySchema = z.object({
  space_id: UuidV7Schema,
  status: z.enum(RUN_STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
}).strict()

export const RunSpaceQuerySchema = z.object({ space_id: UuidV7Schema }).strict()

export const RunEventsQuerySchema = z.object({
  space_id: UuidV7Schema,
  after_seq: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(200).default(100),
}).strict()

export const RunCheckpointsQuerySchema = z.object({
  space_id: UuidV7Schema,
  after_seq: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(50),
}).strict()

export const CancelRunSchema = z.object({
  space_id: UuidV7Schema,
  reason: z.enum(['user_requested', 'budget_stop', 'superseded']).default('user_requested'),
}).strict()

export const RetryRunSchema = z.object({
  space_id: UuidV7Schema,
}).strict()
