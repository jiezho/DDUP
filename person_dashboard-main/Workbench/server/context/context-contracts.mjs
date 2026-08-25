import { z } from 'zod'

import { isUuidV7 } from '../../shared/contracts/ids.mjs'

export const CONTEXT_OBJECT_TYPES = Object.freeze(['project', 'task', 'capture', 'document'])

const UuidV7Schema = z.string().refine(isUuidV7, '必须是 UUIDv7。')
const LocalDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const [year, month, day] = value.split('-').map(Number)
    const parsed = new Date(Date.UTC(year, month - 1, day))
    return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day
  }, '日期无效。')

const MarkdownFilenameSchema = z
  .string()
  .trim()
  .min(1)
  .max(180)
  .refine((value) => !/[\\/\u0000-\u001f\u007f]/.test(value), '文件名不能包含路径或控制字符。')
  .refine((value) => /\.(md|markdown)$/i.test(value), '首版只接收 .md 或 .markdown 文件。')

export const ImportMarkdownSchema = z
  .object({
    space_id: UuidV7Schema,
    project_id: UuidV7Schema.nullable().default(null),
    filename: MarkdownFilenameSchema,
    title: z.string().trim().min(1).max(200).optional(),
    content: z.string().min(1).max(1_000_000),
  })
  .strict()

export const ListSourcesQuerySchema = z
  .object({
    space_id: UuidV7Schema,
    project_id: UuidV7Schema.optional(),
    status: z.enum(['ready', 'archived', 'failed']).default('ready'),
    limit: z.coerce.number().int().min(1).max(200).default(100),
  })
  .strict()

export const ContextSearchQuerySchema = z
  .object({
    space_id: UuidV7Schema,
    project_id: UuidV7Schema.optional(),
    q: z.string().trim().min(2).max(200).refine((value) => /[\p{L}\p{N}]/u.test(value), '查询必须包含文字或数字。'),
    types: z.array(z.enum(CONTEXT_OBJECT_TYPES)).min(1).max(CONTEXT_OBJECT_TYPES.length)
      .refine((items) => new Set(items).size === items.length, '检索类型不能重复。')
      .default([...CONTEXT_OBJECT_TYPES]),
    from: LocalDateSchema.optional(),
    to: LocalDateSchema.optional(),
    limit: z.number().int().min(1).max(50).default(20),
  })
  .strict()
  .refine((value) => !value.from || !value.to || value.to >= value.from, {
    message: '结束日期不能早于开始日期。',
    path: ['to'],
  })
