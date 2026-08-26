import { createChunkRecord } from './hybrid-search-contracts.mjs'

export const DOCUMENT_CHUNKER_VERSION = 'bounded-char-v1'
export const DOCUMENT_PARSER_VERSION = 'markdown-plain-v1'

function preferredBoundary(text, start, targetEnd, minimumEnd) {
  for (const marker of ['\n\n', '\n', '。', '！', '？', '. ', '! ', '? ']) {
    const index = text.lastIndexOf(marker, targetEnd)
    if (index >= minimumEnd) return index + marker.length
  }
  return targetEnd
}

export function chunkDocumentBody({
  body,
  spaceId,
  projectId = null,
  sourceId,
  sourceVersionId,
  documentId,
  maxChars = 900,
  overlapChars = 120,
} = {}) {
  if (typeof body !== 'string' || body.length === 0) return Object.freeze([])
  if (!Number.isInteger(maxChars) || maxChars < 300 || maxChars > 1_800) {
    throw new RangeError('maxChars must be between 300 and 1800')
  }
  if (!Number.isInteger(overlapChars) || overlapChars < 0 || overlapChars >= maxChars / 2) {
    throw new RangeError('overlapChars must be non-negative and less than half maxChars')
  }

  const chunks = []
  let start = 0
  while (start < body.length) {
    const targetEnd = Math.min(body.length, start + maxChars)
    const end = targetEnd === body.length
      ? targetEnd
      : preferredBoundary(body, start, targetEnd, start + Math.floor(maxChars / 2))
    const text = body.slice(start, end)
    chunks.push(createChunkRecord({
      space_id: spaceId,
      project_id: projectId,
      source_id: sourceId,
      source_version_id: sourceVersionId,
      document_id: documentId,
      heading_path: [],
      start_char: start,
      end_char: end,
      token_count: Math.max(1, Math.min(1_000, [...text].length)),
      text,
      parser_version: DOCUMENT_PARSER_VERSION,
      chunker_version: DOCUMENT_CHUNKER_VERSION,
    }))
    if (end >= body.length) break
    const nextStart = Math.max(0, end - overlapChars)
    if (nextStart <= start) throw new Error('document chunker did not advance')
    start = nextStart
  }
  return Object.freeze(chunks)
}
