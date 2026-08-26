import assert from 'node:assert/strict'
import test from 'node:test'

import { chunkDocumentBody } from '../server/context/document-chunker.mjs'
import { createUuidV7 } from '../shared/contracts/ids.mjs'

function ids() {
  return {
    spaceId: createUuidV7(),
    projectId: createUuidV7(),
    sourceId: createUuidV7(),
    sourceVersionId: createUuidV7(),
    documentId: createUuidV7(),
  }
}

test('document chunks are stable, bounded and resolve exactly to SourceVersion character ranges', () => {
  const value = ids()
  const body = [
    '第一部分使用明确虚构内容说明科研问题。'.repeat(35),
    '第二部分记录固定数据版本、实验参数和负结果。'.repeat(35),
    '第三部分给出后续复现实验的检查清单。'.repeat(35),
  ].join('\n\n')
  const first = chunkDocumentBody({ body, ...value })
  const replay = chunkDocumentBody({ body, ...value })

  assert.ok(first.length >= 3)
  assert.deepEqual(first.map((item) => item.chunk_id), replay.map((item) => item.chunk_id))
  for (const [index, chunk] of first.entries()) {
    assert.equal(body.slice(chunk.start_char, chunk.end_char), chunk.text)
    assert.ok(chunk.text.length <= 900)
    assert.equal(chunk.source_version_id, value.sourceVersionId)
    if (index > 0) {
      assert.ok(chunk.start_char < first[index - 1].end_char)
      assert.ok(chunk.end_char > first[index - 1].end_char)
    }
  }

  const changedVersion = chunkDocumentBody({ body, ...value, sourceVersionId: createUuidV7() })
  assert.notEqual(first[0].chunk_id, changedVersion[0].chunk_id)
})

test('document chunker rejects unsafe bounds and keeps missing content missing', () => {
  assert.deepEqual(chunkDocumentBody({ body: '' }), [])
  assert.throws(() => chunkDocumentBody({ body: '虚构内容', ...ids(), maxChars: 200 }), /maxChars/)
  assert.throws(() => chunkDocumentBody({ body: '虚构内容', ...ids(), overlapChars: 500 }), /overlapChars/)
})
