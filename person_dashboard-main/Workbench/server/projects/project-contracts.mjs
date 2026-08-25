import { z } from 'zod'

import { isUuidV7 } from '../../shared/contracts/ids.mjs'

export const PROJECT_STATUSES = Object.freeze(['draft', 'active', 'paused', 'completed', 'archived'])
export const PROJECT_TEMPLATES = Object.freeze([
  'general',
  'research',
  'ai_exploration',
  'frontier_tracking',
  'learning',
])
export const PROJECT_TRANSITIONS = Object.freeze(['activate', 'pause', 'complete', 'archive', 'reopen'])
export const TASK_STATUSES = Object.freeze(['inbox', 'planned', 'in_progress', 'blocked', 'done', 'cancelled'])
export const TASK_TRANSITIONS = Object.freeze(['plan', 'start', 'block', 'complete', 'cancel', 'reopen'])

const UuidV7Schema = z.string().refine(isUuidV7, '必须是 UUIDv7。')
const LocalDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const [year, month, day] = value.split('-').map(Number)
    const parsed = new Date(Date.UTC(year, month - 1, day))
    return (
      parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day
    )
  }, '日期无效。')

export const CreateProjectSchema = z
  .object({
    space_id: UuidV7Schema,
    name: z.string().trim().min(1).max(120),
    summary: z.string().max(2000).default(''),
    template_type: z.enum(PROJECT_TEMPLATES),
    start_date: LocalDateSchema.nullable().default(null),
    target_date: LocalDateSchema.nullable().default(null),
    context_policy: z.enum(['project_only', 'space_allowed']).default('project_only'),
    color_token: z.enum(['sky', 'cyan', 'blue', 'teal', 'indigo']).default('sky'),
  })
  .strict()
  .refine((value) => !value.start_date || !value.target_date || value.target_date >= value.start_date, {
    message: '目标日期不能早于开始日期。',
    path: ['target_date'],
  })

export const UpdateProjectSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    summary: z.string().max(2000).optional(),
    start_date: LocalDateSchema.nullable().optional(),
    target_date: LocalDateSchema.nullable().optional(),
    context_policy: z.enum(['project_only', 'space_allowed']).optional(),
    color_token: z.enum(['sky', 'cyan', 'blue', 'teal', 'indigo']).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, '至少提供一个可修改字段。')

export const TransitionProjectSchema = z
  .object({
    action: z.enum(PROJECT_TRANSITIONS),
  })
  .strict()

export const CreateMilestoneSchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    target_date: LocalDateSchema.nullable().default(null),
    sort_order: z.number().int().min(0).max(1_000_000).default(0),
  })
  .strict()

export const UpdateMilestoneSchema = z
  .object({
    title: z.string().trim().min(1).max(160).optional(),
    status: z.enum(['planned', 'active', 'completed', 'cancelled']).optional(),
    target_date: LocalDateSchema.nullable().optional(),
    sort_order: z.number().int().min(0).max(1_000_000).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, '至少提供一个可修改字段。')

export const CreateTaskSchema = z
  .object({
    title: z.string().trim().min(1).max(240),
    description: z.string().max(20_000).default(''),
    priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
    due_at: z.string().datetime({ offset: true }).nullable().default(null),
    due_date: LocalDateSchema.nullable().default(null),
    milestone_id: UuidV7Schema.nullable().default(null),
    parent_task_id: UuidV7Schema.nullable().default(null),
  })
  .strict()

export const UpdateTaskSchema = z
  .object({
    title: z.string().trim().min(1).max(240).optional(),
    description: z.string().max(20_000).optional(),
    priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
    due_at: z.string().datetime({ offset: true }).nullable().optional(),
    due_date: LocalDateSchema.nullable().optional(),
    milestone_id: UuidV7Schema.nullable().optional(),
    parent_task_id: UuidV7Schema.nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, '至少提供一个可修改字段。')

export const TransitionTaskSchema = z.object({ action: z.enum(TASK_TRANSITIONS) }).strict()

export const CreateDiscussionSchema = z
  .object({ title: z.string().trim().min(1).max(200) })
  .strict()

export const CreateDiscussionEntrySchema = z
  .object({ body: z.string().trim().min(1).max(20_000) })
  .strict()

export const ConvertDiscussionSchema = z
  .object({
    decision_title: z.string().trim().min(1).max(200),
    statement: z.string().trim().min(1).max(20_000),
    rationale: z.string().max(20_000).default(''),
    task_title: z.string().trim().min(1).max(240),
    task_priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
    task_due_date: LocalDateSchema.nullable().default(null),
    milestone_id: UuidV7Schema.nullable().default(null),
  })
  .strict()

const SafeWebUrlSchema = z
  .string()
  .url()
  .max(2048)
  .refine((value) => ['http:', 'https:'].includes(new URL(value).protocol), '只允许 http/https 链接。')

export const CreateCaptureSchema = z
  .discriminatedUnion('kind', [
    z.object({
      kind: z.literal('text'),
      space_id: UuidV7Schema,
      project_id: UuidV7Schema.nullable().default(null),
      title: z.string().trim().min(1).max(200),
      body: z.string().trim().min(1).max(20_000),
    }).strict(),
    z.object({
      kind: z.literal('link'),
      space_id: UuidV7Schema,
      project_id: UuidV7Schema.nullable().default(null),
      title: z.string().trim().min(1).max(200),
      canonical_uri: SafeWebUrlSchema,
    }).strict(),
  ])

export const TransitionCaptureSchema = z
  .object({ action: z.enum(['process', 'archive', 'reopen']) })
  .strict()

export const DailyDateSchema = LocalDateSchema

export const SaveDailyPlanSchema = z
  .object({
    space_id: UuidV7Schema,
    task_ids: z.array(UuidV7Schema).max(3).refine((items) => new Set(items).size === items.length, '任务不能重复。'),
  })
  .strict()

export const SaveDailyReviewSchema = z
  .object({
    space_id: UuidV7Schema,
    summary: z.string().max(10_000).default(''),
    wins: z.string().max(10_000).default(''),
    blockers: z.string().max(10_000).default(''),
    next_focus: z.string().max(10_000).default(''),
  })
  .strict()

export function validateProjectDates(project) {
  return !project.start_date || !project.target_date || project.target_date >= project.start_date
}
