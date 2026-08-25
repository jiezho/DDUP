import { createHash } from 'node:crypto'

import { z } from 'zod'

import { isUuidV7 } from '../../shared/contracts/ids.mjs'
import { CONTEXT_OBJECT_TYPES } from './context-contracts.mjs'

export const SEARCH_PROVIDER_KINDS = Object.freeze(['lexical', 'dense'])
export const DEFAULT_FUSION_CONFIG = Object.freeze({
  version: 'rrf-v1',
  k: 60,
  provider_weights: Object.freeze({ lexical: 1, dense: 1 }),
  candidate_limit: 30,
  result_limit: 10,
})

const UuidV7Schema = z.string().refine(isUuidV7, '必须是 UUIDv7。')
const LocalDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/)

export const AuthorizedSearchScopeSchema = z
  .object({
    space_id: UuidV7Schema,
    project_ids: z.array(UuidV7Schema).max(100).default([]),
    object_types: z.array(z.enum(CONTEXT_OBJECT_TYPES)).min(1).max(CONTEXT_OBJECT_TYPES.length),
    from: LocalDateSchema.optional(),
    to: LocalDateSchema.optional(),
  })
  .strict()
  .refine((scope) => !scope.from || !scope.to || scope.to >= scope.from, {
    message: '结束日期不能早于开始日期。',
    path: ['to'],
  })

export const SearchCandidateSchema = z
  .object({
    provider: z.enum(SEARCH_PROVIDER_KINDS),
    object_type: z.enum(CONTEXT_OBJECT_TYPES),
    object_id: UuidV7Schema,
    space_id: UuidV7Schema,
    project_id: UuidV7Schema.nullable().default(null),
    title: z.string().trim().min(1).max(300),
    snippet: z.string().max(2_000).default(''),
    updated_at: z.string().datetime({ offset: true }),
    rank: z.number().int().min(1),
    provider_score: z.number().finite().optional(),
    source_id: UuidV7Schema.nullable().default(null),
    source_version_id: UuidV7Schema.nullable().default(null),
    document_id: UuidV7Schema.nullable().default(null),
    locator: z
      .object({
        type: z.enum(['char_range', 'object']),
        start_char: z.number().int().min(0).optional(),
        end_char: z.number().int().positive().optional(),
        route: z.string().max(500).optional(),
      })
      .strict(),
  })
  .strict()

export const ChunkInputSchema = z
  .object({
    space_id: UuidV7Schema,
    project_id: UuidV7Schema.nullable().default(null),
    source_id: UuidV7Schema,
    source_version_id: UuidV7Schema,
    document_id: UuidV7Schema,
    heading_path: z.array(z.string().trim().min(1).max(200)).max(12).default([]),
    start_char: z.number().int().min(0),
    end_char: z.number().int().positive(),
    token_count: z.number().int().min(1).max(1_000),
    text: z.string().min(1).max(100_000),
    parser_version: z.string().trim().min(1).max(80),
    chunker_version: z.string().trim().min(1).max(80),
  })
  .strict()
  .refine((chunk) => chunk.end_char > chunk.start_char, {
    message: '片段结束位置必须晚于开始位置。',
    path: ['end_char'],
  })

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

export function createChunkRecord(input) {
  const chunk = ChunkInputSchema.parse(input)
  const textSha256 = sha256(chunk.text)
  const identity = [
    chunk.source_version_id,
    chunk.document_id,
    chunk.start_char,
    chunk.end_char,
    chunk.parser_version,
    chunk.chunker_version,
    textSha256,
  ].join(':')

  return Object.freeze({
    chunk_id: `chk_${sha256(identity).slice(0, 40)}`,
    ...chunk,
    text_sha256: textSha256,
    embedding_model: null,
    embedding_version: null,
    embedding_dimension: null,
  })
}

export function assertSearchProvider(provider) {
  if (!provider || !SEARCH_PROVIDER_KINDS.includes(provider.kind) || typeof provider.search !== 'function') {
    throw new TypeError('SearchProvider 必须声明 lexical/dense kind 并实现 search。')
  }
  return provider
}

export function citationEligibility(candidate) {
  const parsed = SearchCandidateSchema.passthrough().parse(candidate)
  const fixedRange = parsed.locator.type === 'char_range'
    && Number.isInteger(parsed.locator.start_char)
    && Number.isInteger(parsed.locator.end_char)
    && parsed.locator.end_char > parsed.locator.start_char
  const eligible = parsed.object_type === 'document'
    && Boolean(parsed.source_id && parsed.source_version_id && parsed.document_id)
    && fixedRange

  return Object.freeze({
    eligible,
    kind: eligible ? 'source_citation' : 'object_locator',
    reason: eligible ? 'fixed_source_version_range' : 'object_without_fixed_source_range',
  })
}

export function validateTextDigest(text, digest) {
  Sha256Schema.parse(digest)
  return sha256(text) === digest
}
