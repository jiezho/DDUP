import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')

test('context UI and machine contract expose citation readiness plus conservative validated answer persistence', async () => {
  const [page, styles, openapi, store, attemptStore, evidenceGuard, generationGate] = await Promise.all([
    read('../src/pages/ContextLibraryPage.jsx'),
    read('../src/styles.css'),
    read('../shared/contracts/openapi.yaml'),
    read('../server/context/context-package-store.mjs'),
    read('../server/context/answer-attempt-store.mjs'),
    read('../server/context/evidence-safety-guard.mjs'),
    read('../server/context/answer-generation-gate.mjs'),
  ])

  assert.match(page, /可引用原文已固定/)
  assert.match(page, /当前没有可引用原文/)
  assert.match(page, /上下文篮自身不会自动生成回答/)
  assert.match(page, /可作为证据引用/)
  assert.match(page, /仅作为相关对象/)
  assert.match(page, /回答安全检查/)
  assert.match(page, /不生成无证据推断/)
  assert.match(page, /证据复核通过/)
  assert.match(page, /证据复核失败/)
  assert.match(page, /来源证据包含不可信指令/)
  assert.match(page, /未配置回答运行时/)
  assert.match(styles, /\.context-package-evidence\.is-ready/)
  assert.match(styles, /\.context-answer-check/)

  assert.match(page, /提取式逐句预检/)
  assert.match(page, /不代表语义蕴含或事实正确/)
  assert.match(styles, /\.context-draft-validator/)

  assert.match(openapi, /version: 1\.20\.0/)
  assert.match(openapi, /ContextCitationLocator:/)
  assert.match(openapi, /ContextAnswerReadiness:/)
  assert.match(openapi, /AnswerAttempt:/)
  assert.match(openapi, /AnswerAttemptIntegrity:/)
  assert.match(openapi, /AnswerAttemptSafety:/)
  assert.match(openapi, /AnswerGenerationGate:/)
  assert.match(openapi, /\/api\/v1\/context\/answer-attempts:/)
  assert.match(openapi, /\/api\/v1\/context\/answer-attempts\/\{attemptId\}\/validate-draft:/)
  assert.match(openapi, /\/api\/v1\/context\/answer-attempts\/\{attemptId\}\/generate:/)
  assert.match(openapi, /FinalAnswer:/)
  assert.match(openapi, /semantic_entailment: \{ const: false \}/)
  assert.match(openapi, /generation_enabled: \{ type: boolean \}/)

  assert.match(store, /citation_manifest_ready/)
  assert.match(store, /refused_no_citable_evidence/)
  assert.doesNotMatch(store, /INSERT INTO (answers|citations)/)
  assert.match(attemptStore, /refused_unsafe_intent/)
  assert.match(attemptStore, /answer_attempt_citations/)
  assert.match(attemptStore, /hash_mismatch/)
  assert.match(attemptStore, /integrity_state/)
  assert.match(attemptStore, /UNSAFE_EVIDENCE_/)
  assert.match(attemptStore, /validateExtractiveClaims/)
  assert.match(evidenceGuard, /instruction_override/)
  assert.match(evidenceGuard, /external_exfiltration/)
  assert.match(generationGate, /ANSWER_RUNTIME_UNAVAILABLE/)
  assert.match(generationGate, /blocked_integrity/)
  assert.match(attemptStore, /INSERT INTO answers/)
  assert.match(attemptStore, /INSERT INTO answer_citations/)
  assert.match(attemptStore, /validateEntailment/)
})
