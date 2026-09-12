import { z } from 'zod'

import { isUuidV7 } from '../../shared/contracts/ids.mjs'

const UuidV7 = z.string().refine(isUuidV7, '必须是 UUIDv7。')
const Text = (max) => z.string().trim().min(1).max(max)
const OptionalDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null)
const OptionalTask = z.string().trim().max(240).nullable().default(null)

export const CreateRadarTopicSchema = z.object({
  title: Text(200),
  domain: z.enum(['ai', 'it', 'energy', 'research_methods', 'custom']),
  synthesis: Text(20_000),
  maturity: z.enum(['emerging', 'experimental', 'early_adoption', 'maturing', 'established']),
  limitations: Text(10_000),
  impact_summary: Text(10_000),
  disposition: z.enum(['track', 'validate', 'ignore']),
  next_review_date: OptionalDate,
}).strict()

export const ReviewRadarTopicSchema = z.object({
  maturity: z.enum(['emerging', 'experimental', 'early_adoption', 'maturing', 'established']),
  limitations: Text(10_000),
  impact_summary: Text(10_000),
  disposition: z.enum(['track', 'validate', 'ignore']),
  next_review_date: OptionalDate,
  follow_up_task_title: OptionalTask,
}).strict()

export const CreateRadarSignalSchema = z.object({
  summary: Text(10_000),
  classification: z.enum(['primary_fact', 'secondary_report', 'opinion', 'inference']),
  published_on: OptionalDate,
  evidence: z.object({
    source_id: UuidV7,
    source_version_id: UuidV7,
    document_id: UuidV7,
    start_char: z.number().int().min(0),
    end_char: z.number().int().positive(),
  }).strict().refine((value) => value.end_char > value.start_char, {
    message: '证据结束位置必须大于开始位置。',
    path: ['end_char'],
  }),
}).strict()

export const CreateLearningTrackSchema = z.object({
  title: Text(200),
  category: z.enum(['english', 'research_methods', 'programming_ai', 'professional', 'custom']),
  focus: z.enum(['academic_reading', 'academic_writing', 'daily_speaking', 'general']),
  goal: Text(10_000),
  baseline: Text(10_000),
  success_criteria: Text(10_000),
}).strict().superRefine((value, context) => {
  if (value.category !== 'english' && value.focus !== 'general') {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['focus'], message: '非英语方向必须使用 general focus。' })
  }
})

export const CreateLearningPracticeSchema = z.object({
  title: Text(200),
  practice_type: z.enum(['reading', 'writing', 'speaking', 'exercise', 'project', 'review']),
  planned_for: OptionalDate,
  instructions: Text(10_000),
}).strict()

export const RecordLearningPracticeSchema = z.object({
  reflection: Text(20_000),
  feedback: Text(20_000),
  self_rating: z.number().int().min(1).max(5).nullable().default(null),
  decision: z.enum(['continue', 'adjust', 'complete']),
  follow_up_task_title: OptionalTask,
}).strict()

export const CreateLearningRoutineSchema = z.object({
  title: Text(200),
  cadence: z.enum(['daily', 'weekly']),
  target_count: z.number().int().min(1).max(100),
}).strict()

export const CreateLearningCheckinSchema = z.object({
  local_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  completed_count: z.number().int().min(0).max(100),
  note: z.string().trim().max(10_000).default(''),
}).strict()
