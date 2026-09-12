import { z } from 'zod'

import { isUuidV7 } from '../../shared/contracts/ids.mjs'

const UuidV7Schema = z.string().refine(isUuidV7, '必须是 UUIDv7。')
const RequiredText = (max) => z.string().trim().min(1).max(max)
const OptionalTaskTitle = z.string().trim().max(240).nullable().default(null)

export const CreateResearchQuestionSchema = z.object({
  title: RequiredText(200),
  problem_statement: RequiredText(10_000),
  hypothesis: RequiredText(10_000),
  success_criteria: RequiredText(10_000),
}).strict()

export const TransitionResearchQuestionSchema = z.object({
  action: z.enum(['start_testing', 'answer', 'archive', 'reopen']),
}).strict()

export const CreateResearchExperimentSchema = z.object({
  title: RequiredText(200),
  method: RequiredText(20_000),
  variables: RequiredText(10_000),
  expected_outcome: RequiredText(10_000),
}).strict()

export const RecordResearchResultSchema = z.object({
  result_summary: RequiredText(20_000),
  decision: z.enum(['continue', 'stop']),
  follow_up_task_title: OptionalTaskTitle,
}).strict()

export const CreateResearchClaimSchema = z.object({
  experiment_id: UuidV7Schema,
  statement: RequiredText(10_000),
  evidence_direction: z.enum(['supports', 'challenges', 'mixed']),
  evidence_strength: z.enum(['weak', 'moderate', 'strong']),
  evidence: z.object({
    source_id: UuidV7Schema,
    source_version_id: UuidV7Schema,
    document_id: UuidV7Schema,
    start_char: z.number().int().min(0),
    end_char: z.number().int().positive(),
  }).strict().refine((value) => value.end_char > value.start_char, {
    message: '证据结束位置必须大于开始位置。',
    path: ['end_char'],
  }),
}).strict()

export const CreateAiOpportunitySchema = z.object({
  title: RequiredText(200),
  problem_statement: RequiredText(10_000),
  target_user: RequiredText(2_000),
  value_hypothesis: RequiredText(10_000),
  feasibility_hypothesis: RequiredText(10_000),
}).strict()

export const TransitionAiOpportunitySchema = z.object({
  action: z.enum(['start_exploring', 'validate', 'reject', 'archive', 'reopen']),
}).strict()

export const CreateAiExperimentSchema = z.object({
  title: RequiredText(200),
  evaluation_method: RequiredText(10_000),
  metric_name: RequiredText(200),
  baseline_value: z.number().finite().nullable().default(null),
  target_value: z.number().finite(),
}).strict()

export const RecordAiResultSchema = z.object({
  observed_value: z.number().finite(),
  evidence_summary: RequiredText(20_000),
  decision: z.enum(['go', 'stop']),
  follow_up_task_title: OptionalTaskTitle,
}).strict()
