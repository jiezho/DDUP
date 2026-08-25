import assert from 'node:assert/strict'
import test from 'node:test'

import { createUuidV7 } from '../shared/contracts/ids.mjs'
import {
  DEFAULT_FUSION_CONFIG,
  citationEligibility,
  createChunkRecord,
  validateTextDigest,
} from '../server/context/hybrid-search-contracts.mjs'
import { runAuthorizedHybridSearch } from '../server/context/hybrid-search-pipeline.mjs'

function ids() {
  return {
    space: createUuidV7(),
    project: createUuidV7(),
    foreignProject: createUuidV7(),
    source: createUuidV7(),
    version: createUuidV7(),
    document: createUuidV7(),
    task: createUuidV7(),
  }
}

test('chunk identity is stable, version-bound and validates the text digest', () => {
  const value = ids()
  const input = {
    space_id: value.space,
    project_id: value.project,
    source_id: value.source,
    source_version_id: value.version,
    document_id: value.document,
    heading_path: ['合成研究', '证据'],
    start_char: 10,
    end_char: 38,
    token_count: 18,
    text: '完全虚构的来源片段，仅用于契约测试。',
    parser_version: 'markdown-v1',
    chunker_version: 'structure-v1',
  }
  const first = createChunkRecord(input)
  const replay = createChunkRecord(input)

  assert.equal(first.chunk_id, replay.chunk_id)
  assert.equal(validateTextDigest(first.text, first.text_sha256), true)
  assert.equal(first.embedding_model, null)
  assert.throws(() => createChunkRecord({ ...input, token_count: 1_001 }), /less than or equal to 1000/i)
})

test('the pipeline passes an immutable authorized scope and drops provider scope violations', async () => {
  const value = ids()
  let observedScope
  const provider = {
    kind: 'lexical',
    async search({ authorized_scope: authorizedScope }) {
      observedScope = authorizedScope
      return [
        {
          object_type: 'task',
          object_id: value.task,
          space_id: value.space,
          project_id: value.project,
          title: '授权任务',
          snippet: '完全虚构',
          updated_at: '2026-08-25T08:00:00.000Z',
          rank: 1,
          locator: { type: 'object', route: `/projects/${value.project}` },
        },
        {
          object_type: 'task',
          object_id: createUuidV7(),
          space_id: value.space,
          project_id: value.foreignProject,
          title: '不得披露的其他项目标题',
          snippet: '不得返回',
          updated_at: '2026-08-25T08:00:00.000Z',
          rank: 2,
          locator: { type: 'object', route: `/projects/${value.foreignProject}` },
        },
      ]
    },
  }

  const response = await runAuthorizedHybridSearch({
    query: '虚构任务',
    authorizedScope: {
      space_id: value.space,
      project_ids: [value.project],
      object_types: ['task', 'document'],
    },
    providers: [provider],
  })

  assert.equal(Object.isFrozen(observedScope), true)
  assert.deepEqual(response.results.map((item) => item.title), ['授权任务'])
  assert.deepEqual(response.diagnostics, [{ provider: 'lexical', accepted_count: 1, rejected_count: 1 }])
  assert.equal(JSON.stringify(response).includes('不得披露'), false)
})

test('RRF records both provider reasons while citation eligibility stays source-bound', async () => {
  const value = ids()
  const documentCandidate = {
    object_type: 'document',
    object_id: value.document,
    space_id: value.space,
    project_id: value.project,
    title: '合成证据',
    snippet: '固定版本片段',
    updated_at: '2026-08-25T08:00:00.000Z',
    source_id: value.source,
    source_version_id: value.version,
    document_id: value.document,
    locator: { type: 'char_range', start_char: 4, end_char: 12 },
  }
  const makeProvider = (kind, rank) => ({
    kind,
    async search() {
      return [{ ...documentCandidate, rank, provider_score: kind === 'dense' ? 0.83 : -2.4 }]
    },
  })
  const response = await runAuthorizedHybridSearch({
    query: '证据依据',
    authorizedScope: {
      space_id: value.space,
      project_ids: [value.project],
      object_types: ['document'],
    },
    providers: [makeProvider('lexical', 2), makeProvider('dense', 1)],
    fusionConfig: DEFAULT_FUSION_CONFIG,
  })

  assert.equal(response.results.length, 1)
  assert.deepEqual(response.results[0].provider_hits.map((hit) => hit.provider).sort(), ['dense', 'lexical'])
  assert.deepEqual(response.results[0].citation, {
    eligible: true,
    kind: 'source_citation',
    reason: 'fixed_source_version_range',
  })
  assert.equal(response.capabilities.dense, true)
  assert.equal(response.capabilities.reranker, false)

  assert.equal(citationEligibility({
    ...documentCandidate,
    provider: 'lexical',
    object_type: 'task',
    object_id: value.task,
    rank: 1,
    source_id: null,
    source_version_id: null,
    document_id: null,
    locator: { type: 'object', route: `/tasks/${value.task}` },
  }).eligible, false)
})
