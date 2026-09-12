import { createHash } from 'node:crypto'

import { ERROR_CODES, publicError } from '../../shared/contracts/errors.mjs'
import { validateExtractiveClaims } from './answer-draft-validator.mjs'
import { projectAnswerGenerationGate } from './answer-generation-gate.mjs'
import { classifyEvidenceSafety } from './evidence-safety-guard.mjs'
import { classifySearchIntent } from './search-intent-guard.mjs'
import { validateEntailment } from './conservative-answer-provider.mjs'

const ATTEMPT_COLUMNS = `
  id, space_id, context_package_id, context_package_version, context_digest,
  question, question_sha256, status, refusal_code, generation_enabled,
  citation_count, related_object_count, excluded_count, created_at, created_by, version
`

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function digestContext(contextPackage) {
  const items = contextPackage.items.map((item) => ({
    item_id: item.item_id,
    object_type: item.object_type,
    object_id: item.object_id,
    included: item.included,
    exclusion_reason: item.exclusion_reason,
    citation: item.citation?.eligible ? item.citation.locator : null,
  }))
  return sha256(JSON.stringify({
    context_package_id: contextPackage.id,
    context_package_version: contextPackage.version,
    effective_status: contextPackage.effective_status,
    items,
  }))
}

function statusReason(status, refusalCode) {
  if (status === 'evidence_ready') return '引用证据快照已固定；是否可生成由当前回答运行时安全门决定。'
  if (status === 'refused_unsafe_intent' && refusalCode?.startsWith('UNSAFE_EVIDENCE_')) {
    return '来源证据触发确定性安全边界，未保存引用快照，也未进入任何模型或 Runtime。'
  }
  if (status === 'refused_unsafe_intent') return '问题触发确定性安全边界，未进入任何模型或 Runtime。'
  return '当前范围没有固定 SourceVersion 的原文证据，已记录拒答。'
}

function safetyState(row) {
  if (row.status === 'evidence_ready') {
    return { state: 'passed', scope: null, reason_code: null, reason: '问题与固定证据通过当前确定性安全检查。' }
  }
  if (row.status === 'refused_no_citable_evidence') {
    return { state: 'not_applicable', scope: null, reason_code: row.refusal_code, reason: '没有可引用证据，未执行来源内容安全检查。' }
  }
  const evidenceRefusal = row.refusal_code?.startsWith('UNSAFE_EVIDENCE_')
  return {
    state: 'refused',
    scope: evidenceRefusal ? 'evidence' : 'question',
    reason_code: row.refusal_code,
    reason: evidenceRefusal
      ? '来源证据包含不可信指令模式，已失败关闭且不回显命中片段。'
      : '问题触发确定性安全边界，未进入模型或 Runtime。',
  }
}

function baseAttemptFromRow(row, citations = [], integrity = null, provider = null) {
  return row ? {
    ...row,
    generation_enabled: Boolean(row.generation_enabled),
    reason: statusReason(row.status, row.refusal_code),
    citations,
    integrity,
    safety: safetyState(row),
    generation_gate: projectAnswerGenerationGate({ status: row.status, integrity, provider }),
  } : null
}

export function createAnswerAttemptStore({ database, kernel, contextPackageStore, answerProvider = null } = {}) {
  if (!database || !kernel || !contextPackageStore) throw new TypeError('answer attempt store dependencies are required')

  function citationsFor(attemptId, spaceId) {
    return database.prepare(`
      SELECT id, ordinal, source_id, source_version_id, document_id, locator_type,
             start_char, end_char, text_sha256
      FROM answer_attempt_citations
      WHERE answer_attempt_id = ? AND space_id = ?
      ORDER BY ordinal
    `).all(attemptId, spaceId)
  }

  function resolveCitation(citation, spaceId) {
    const document = database.prepare(`
      SELECT d.body_text
      FROM documents d
      JOIN source_versions sv ON sv.id = d.source_version_id AND sv.space_id = d.space_id
      JOIN sources s ON s.id = d.source_id AND s.space_id = d.space_id
      WHERE d.id = ? AND d.space_id = ? AND d.source_id = ? AND d.source_version_id = ?
        AND d.deleted_at IS NULL AND s.deleted_at IS NULL
        AND s.status = 'ready' AND sv.status = 'ready'
    `).get(citation.document_id, spaceId, citation.source_id, citation.source_version_id)
    if (!document) return { state: 'source_unavailable', text: null }
    if (citation.end_char > document.body_text.length) return { state: 'range_invalid', text: null }
    const text = document.body_text.slice(citation.start_char, citation.end_char)
    return sha256(text) === citation.text_sha256
      ? { state: 'verified', text }
      : { state: 'hash_mismatch', text: null }
  }

  function hydrateAttempt(row) {
    if (!row) return null
    const citations = citationsFor(row.id, row.space_id).map((citation) => ({
      ...citation,
      integrity_state: resolveCitation(citation, row.space_id).state,
    }))
    const invalidCount = citations.filter((citation) => citation.integrity_state !== 'verified').length
    const integrityState = row.status !== 'evidence_ready'
      ? 'not_applicable'
      : citations.length > 0 && invalidCount === 0 ? 'verified' : 'invalid'
    const reason = integrityState === 'verified'
      ? '所有固定引用均可重新定位，正文摘要一致。'
      : integrityState === 'invalid'
        ? '至少一条固定引用无法重新定位或正文摘要不一致；后续回答必须停止。'
        : '拒答记录没有引用快照，无需执行证据完整性复核。'
    return baseAttemptFromRow(row, citations, {
      state: integrityState,
      verified_count: citations.length - invalidCount,
      invalid_count: invalidCount,
      reason,
    }, answerProvider)
  }

  function requireAttempt(actor, attemptId, spaceId) {
    kernel.visibleSpace(actor, spaceId)
    const row = database.prepare(`
      SELECT ${ATTEMPT_COLUMNS}
      FROM answer_attempts
      WHERE id = ? AND space_id = ?
    `).get(attemptId, spaceId)
    if (!row) throw publicError(ERROR_CODES.OBJECT_NOT_AVAILABLE, '请求的资源不可用。', { statusCode: 404 })
    return hydrateAttempt(row)
  }

  function classifyAttempt(contextPackage, question) {
    const intent = classifySearchIntent(question)
    if (!intent.allowed) {
      return {
        status: 'refused_unsafe_intent',
        refusalCode: `UNSAFE_INTENT_${intent.reason_code.toUpperCase()}`,
        citations: [],
      }
    }
    const evidenceItems = contextPackage.items
      .filter((item) => item.included && item.citation?.eligible)
    const citations = evidenceItems.map((item) => item.citation.locator)
    if (!citations.length) {
      return { status: 'refused_no_citable_evidence', refusalCode: 'NO_CITABLE_EVIDENCE', citations: [] }
    }
    const evidenceSafety = classifyEvidenceSafety(evidenceItems.map((item) => item.locator?.quote))
    if (!evidenceSafety.allowed) {
      return {
        status: 'refused_unsafe_intent',
        refusalCode: `UNSAFE_EVIDENCE_${evidenceSafety.reason_code.toUpperCase()}`,
        citations: [],
      }
    }
    return { status: 'evidence_ready', refusalCode: null, citations }
  }

  function createAttempt(session, input, { idempotencyKey, requestId } = {}) {
    const actor = kernel.actorForSession(session)
    kernel.visibleSpace(actor, input.space_id)
    const question = input.question.trim()
    const result = kernel.executeIdempotent({
      actor,
      commandScope: 'answer_attempt.create',
      key: idempotencyKey,
      request: { ...input, question },
      statusCode: 201,
      operation: () => {
        const contextPackage = contextPackageStore.getPackage(session, input.context_package_id, input.space_id)
        if (contextPackage.effective_status !== 'active') {
          throw publicError(ERROR_CODES.INVALID_STATE_TRANSITION, '当前上下文篮已过期或归档。', { statusCode: 409 })
        }
        if (contextPackage.version !== input.context_package_version) {
          throw publicError(ERROR_CODES.VERSION_CONFLICT, '上下文篮已变化，请刷新证据后重试。', { statusCode: 409 })
        }

        const classification = classifyAttempt(contextPackage, question)
        const timestamp = kernel.nowIso()
        const attempt = {
          id: kernel.newId(),
          space_id: input.space_id,
          context_package_id: contextPackage.id,
          context_package_version: contextPackage.version,
          context_digest: digestContext(contextPackage),
          question,
          question_sha256: sha256(question),
          status: classification.status,
          refusal_code: classification.refusalCode,
          generation_enabled: answerProvider?.available ? 1 : 0,
          citation_count: classification.citations.length,
          related_object_count: contextPackage.evidence.related_object_count,
          excluded_count: contextPackage.evidence.excluded_count,
          created_at: timestamp,
          created_by: actor.id,
          version: 1,
        }
        database.prepare(`
          INSERT INTO answer_attempts (${ATTEMPT_COLUMNS})
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          attempt.id, attempt.space_id, attempt.context_package_id, attempt.context_package_version,
          attempt.context_digest, attempt.question, attempt.question_sha256, attempt.status,
          attempt.refusal_code, attempt.generation_enabled, attempt.citation_count,
          attempt.related_object_count, attempt.excluded_count, attempt.created_at,
          attempt.created_by, attempt.version,
        )
        const insertCitation = database.prepare(`
          INSERT INTO answer_attempt_citations (
            id, answer_attempt_id, space_id, ordinal, source_id, source_version_id,
            document_id, locator_type, start_char, end_char, text_sha256, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        classification.citations.forEach((citation, index) => {
          insertCitation.run(
            kernel.newId(), attempt.id, attempt.space_id, index + 1, citation.source_id,
            citation.source_version_id, citation.document_id, citation.locator_type,
            citation.start_char, citation.end_char, citation.text_sha256, timestamp,
          )
        })
        kernel.appendAudit({
          spaceId: attempt.space_id,
          actor,
          action: 'answer_attempt.create',
          objectType: 'answer_attempt',
          objectId: attempt.id,
          requestId,
          outcome: attempt.status.startsWith('refused_') ? 'denied' : 'succeeded',
          reasonCode: attempt.refusal_code,
          changed: ['context_digest', 'context_package_version', 'question_sha256', 'status'],
        })
        kernel.appendOutbox({
          spaceId: attempt.space_id,
          aggregate: attempt,
          aggregateType: 'answer_attempt',
          eventType: 'answer_attempt.created',
        })
        return hydrateAttempt(attempt)
      },
    })
    return result.replayed
      ? { ...result, data: requireAttempt(actor, result.data.id, input.space_id) }
      : result
  }

  function getAttempt(session, attemptId, spaceId) {
    const actor = kernel.actorForSession(session)
    return requireAttempt(actor, attemptId, spaceId)
  }

  function listAttempts(session, { space_id: spaceId, context_package_id: packageId, limit }) {
    const actor = kernel.actorForSession(session)
    kernel.visibleSpace(actor, spaceId)
    const packageRow = database.prepare('SELECT id FROM context_packages WHERE id = ? AND space_id = ? AND deleted_at IS NULL').get(packageId, spaceId)
    if (!packageRow) throw publicError(ERROR_CODES.OBJECT_NOT_AVAILABLE, '请求的资源不可用。', { statusCode: 404 })
    return database.prepare(`
      SELECT ${ATTEMPT_COLUMNS}
      FROM answer_attempts
      WHERE space_id = ? AND context_package_id = ?
      ORDER BY created_at DESC, id DESC
      LIMIT ?
    `).all(spaceId, packageId, limit).map((row) => hydrateAttempt(row))
  }

  function validateDraft(session, attemptId, { space_id: spaceId, claims }) {
    const actor = kernel.actorForSession(session)
    const attempt = requireAttempt(actor, attemptId, spaceId)
    const common = {
      claim_count: claims.length,
      supported_count: 0,
      unsupported_count: claims.length,
      semantic_entailment: false,
      persistence_enabled: false,
      generation_enabled: false,
      claims: [],
    }
    if (attempt.status !== 'evidence_ready') {
      return {
        state: 'blocked_refusal',
        reason_code: 'ANSWER_ATTEMPT_REFUSED',
        reason: '该回答安全检查已拒答，不能继续执行候选句预检。',
        ...common,
      }
    }
    if (attempt.integrity.state !== 'verified') {
      return {
        state: 'blocked_integrity',
        reason_code: 'CITATION_INTEGRITY_NOT_VERIFIED',
        reason: '固定引用当前无法通过完整性复核，候选句预检已停止。',
        ...common,
      }
    }
    const citationRanges = attempt.citations.map((citation) => ({
      ordinal: citation.ordinal,
      text: resolveCitation(citation, spaceId).text,
    }))
    return validateExtractiveClaims(claims, citationRanges)
  }

  function hydrateAnswer(row) {
    if (!row) return null
    const claims = database.prepare(`
      SELECT id, ordinal, text, claim_kind, entailment_status, reason_code
      FROM answer_claims WHERE answer_id = ? AND space_id = ? ORDER BY ordinal
    `).all(row.id, row.space_id)
    const citations = database.prepare(`
      SELECT ac.id, ac.claim_id, ac.ordinal, ac.source_id, ac.source_version_id,
             ac.document_id, ac.locator_type, ac.start_char, ac.end_char, ac.text_sha256,
             s.title AS source_title, s.status AS source_status, s.deleted_at AS source_deleted_at,
             d.body_text, d.source_version_id AS current_source_version_id, d.deleted_at AS document_deleted_at
      FROM answer_citations ac
      JOIN sources s ON s.id = ac.source_id AND s.space_id = ac.space_id
      JOIN documents d ON d.id = ac.document_id AND d.space_id = ac.space_id
      WHERE ac.answer_id = ? AND ac.space_id = ? ORDER BY ac.ordinal
    `).all(row.id, row.space_id).map(({ body_text: bodyText, source_status: sourceStatus, source_deleted_at: sourceDeletedAt, document_deleted_at: documentDeletedAt, current_source_version_id: currentSourceVersionId, ...citation }) => {
      const quote = bodyText.slice(citation.start_char, citation.end_char)
      const verified = sourceStatus === 'ready' && !sourceDeletedAt && !documentDeletedAt
        && currentSourceVersionId === citation.source_version_id
        && sha256(quote) === citation.text_sha256
      return { ...citation, quote: verified ? quote : null, integrity_state: verified ? 'verified' : 'invalid' }
    })
    const valid = citations.length > 0 && citations.every((citation) => citation.integrity_state === 'verified')
    return {
      ...row,
      text: valid ? row.text : null,
      claims: valid ? claims : [],
      citations,
      integrity: { state: valid ? 'verified' : 'invalid', reason: valid ? '最终引用均可重新定位。' : '最终引用已漂移或不可访问，回答正文已隐藏。' },
    }
  }

  function getAnswer(session, attemptId, spaceId) {
    const actor = kernel.actorForSession(session)
    requireAttempt(actor, attemptId, spaceId)
    return hydrateAnswer(database.prepare('SELECT * FROM answers WHERE answer_attempt_id = ? AND space_id = ?').get(attemptId, spaceId))
  }

  function generateAnswer(session, attemptId, input, { idempotencyKey, requestId } = {}) {
    const actor = kernel.actorForSession(session)
    kernel.visibleSpace(actor, input.space_id)
    const result = kernel.executeIdempotent({
      actor,
      commandScope: `answer.generate:${attemptId}`,
      key: idempotencyKey,
      request: { attempt_id: attemptId, ...input },
      statusCode: 201,
      operation: () => {
        const attempt = requireAttempt(actor, attemptId, input.space_id)
        const existing = database.prepare('SELECT * FROM answers WHERE answer_attempt_id = ? AND space_id = ?').get(attempt.id, attempt.space_id)
        if (existing) return hydrateAnswer(existing)
        if (attempt.generation_gate.state !== 'ready' || !answerProvider?.available) {
          throw publicError(ERROR_CODES.INVALID_STATE_TRANSITION, attempt.generation_gate.reason, { statusCode: 409 })
        }
        const evidence = attempt.citations.map((citation) => ({
          ...citation,
          text: resolveCitation(citation, attempt.space_id).text,
        }))
        const generated = answerProvider.generate({ question: attempt.question, citations: evidence })
        const claims = generated?.claims
        if (!Array.isArray(claims) || claims.length < 1 || claims.length > 20) {
          throw publicError(ERROR_CODES.VALIDATION_FAILED, '回答运行时未返回有效的逐句声明。', { statusCode: 422 })
        }
        for (const claim of claims) {
          if (!claim || typeof claim.text !== 'string' || !claim.text.trim() || claim.text.length > 5000 || !['direct_quote', 'inference'].includes(claim.claim_kind) || !Array.isArray(claim.citation_ordinals) || !claim.citation_ordinals.length) {
            throw publicError(ERROR_CODES.VALIDATION_FAILED, '回答运行时输出未通过声明 Schema 校验。', { statusCode: 422 })
          }
          if (claim.citation_ordinals.some((ordinal) => !Number.isInteger(ordinal) || !evidence.some((citation) => citation.ordinal === ordinal))) {
            throw publicError(ERROR_CODES.VALIDATION_FAILED, '回答引用超出固定证据范围。', { statusCode: 422 })
          }
        }
        const verdicts = validateEntailment(claims, evidence)
        if (verdicts.some((verdict) => !verdict.supported)) {
          throw publicError(ERROR_CODES.VALIDATION_FAILED, '至少一个回答声明未通过保守蕴含校验，回答未保存。', { statusCode: 422 })
        }
        const timestamp = kernel.nowIso()
        const answerId = kernel.newId()
        let citationOrdinal = 0
        const answerText = claims.map((claim) => {
          const markers = claim.citation_ordinals.map(() => `[${++citationOrdinal}]`).join('')
          return `${claim.text.trim()} ${markers}`
        }).join('\n\n')
        database.prepare(`INSERT INTO answers (id, space_id, answer_attempt_id, text, runtime_key, validation_status, created_at, created_by, version) VALUES (?, ?, ?, ?, ?, 'supported', ?, ?, 1)`)
          .run(answerId, attempt.space_id, attempt.id, answerText, answerProvider.runtime_key, timestamp, actor.id)
        const insertClaim = database.prepare(`INSERT INTO answer_claims (id, answer_id, space_id, ordinal, text, claim_kind, entailment_status, reason_code, created_at) VALUES (?, ?, ?, ?, ?, ?, 'entailed', ?, ?)`)
        const insertCitation = database.prepare(`INSERT INTO answer_citations (id, answer_id, claim_id, space_id, ordinal, source_id, source_version_id, document_id, locator_type, start_char, end_char, text_sha256, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        citationOrdinal = 0
        claims.forEach((claim, index) => {
          const claimId = kernel.newId()
          insertClaim.run(claimId, answerId, attempt.space_id, index + 1, claim.text.trim(), claim.claim_kind, verdicts[index].reason_code, timestamp)
          claim.citation_ordinals.forEach((ordinal) => {
            const citation = attempt.citations.find((item) => item.ordinal === ordinal)
            insertCitation.run(kernel.newId(), answerId, claimId, attempt.space_id, ++citationOrdinal, citation.source_id, citation.source_version_id, citation.document_id, citation.locator_type, citation.start_char, citation.end_char, citation.text_sha256, timestamp)
          })
        })
        kernel.appendAudit({ spaceId: attempt.space_id, actor, action: 'answer.create', objectType: 'answer', objectId: answerId, requestId, changed: ['runtime_key', 'validation_status'] })
        kernel.appendOutbox({ spaceId: attempt.space_id, aggregate: { id: answerId, version: 1 }, aggregateType: 'answer', eventType: 'answer.created' })
        return hydrateAnswer(database.prepare('SELECT * FROM answers WHERE id = ?').get(answerId))
      },
    })
    return result.replayed
      ? { ...result, data: getAnswer(session, attemptId, input.space_id) }
      : result
  }

  return Object.freeze({ createAttempt, generateAnswer, getAnswer, getAttempt, listAttempts, validateDraft })
}
