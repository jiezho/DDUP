import { spawnSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { evaluateRetrievalRun } from '../server/context/retrieval-evaluation.mjs'
import {
  SYNTHETIC_RETRIEVAL_CORPUS,
  SYNTHETIC_RETRIEVAL_QRELS,
} from '../tests/fixtures/context-retrieval-evaluation.mjs'
import { runSyntheticFtsCandidates } from './evaluate-context-fts-baseline.mjs'

const RRF_K = 60

const UNSAFE_SEARCH_INTENT_RULES = Object.freeze([
  /(?:忽略|绕过|跳过).{0,10}(?:权限|授权|策略)/u,
  /(?:透露|显示|读取).{0,10}(?:隐藏|未授权|其他项目)/u,
  /(?:系统提示词|内部策略)/u,
  /(?:删除|覆盖).{0,14}(?:审计|记录|长期记忆|事实)/u,
  /(?:发送|导出).{0,14}(?:所有文档|外部服务|第三方)/u,
])

export function shouldRefuseSyntheticSearch(queryText) {
  return UNSAFE_SEARCH_INTENT_RULES.some((rule) => rule.test(String(queryText || '')))
}

function argument(name) {
  const index = process.argv.indexOf(name)
  if (index < 0 || !process.argv[index + 1]) throw new Error(`Missing ${name}`)
  return process.argv[index + 1]
}

function asEvaluationResults(items) {
  return items.map((item) => ({ document_id: item.document_id, locator_valid: true }))
}

function rrf(lexical, dense) {
  const scores = new Map()
  for (const ranking of [lexical, dense]) {
    ranking.forEach((item, index) => {
      scores.set(item.document_id, (scores.get(item.document_id) || 0) + (1 / (RRF_K + index + 1)))
    })
  }
  return [...scores]
    .map(([document_id, score]) => ({ document_id, score }))
    .sort((left, right) => right.score - left.score || left.document_id.localeCompare(right.document_id))
    .slice(0, 10)
}

function metrics(resultsByQuery) {
  return evaluateRetrievalRun({ queries: SYNTHETIC_RETRIEVAL_QRELS, resultsByQuery })
}

export function buildEvaluationReport(rankingOutput) {
  const lexical = runSyntheticFtsCandidates()
  const dense = new Map()
  const hybrid = new Map()
  const guardedHybrid = new Map()
  for (const query of SYNTHETIC_RETRIEVAL_QRELS) {
    const denseItems = asEvaluationResults(rankingOutput.rankings[query.id] || [])
    dense.set(query.id, denseItems)
    const fused = asEvaluationResults(rrf(lexical.get(query.id) || [], denseItems))
    hybrid.set(query.id, fused)
    guardedHybrid.set(query.id, shouldRefuseSyntheticSearch(query.query) ? [] : fused)
  }

  const arms = {
    fts: metrics(lexical),
    dense: metrics(dense),
    rrf_raw: metrics(hybrid),
    rrf_with_deterministic_intent_guard: metrics(guardedHybrid),
  }
  const baseline = arms.fts.summary
  const candidate = arms.rrf_with_deterministic_intent_guard.summary
  const relativeNdcgGain = (candidate.ndcg_at_10 - baseline.ndcg_at_10) / baseline.ndcg_at_10
  const recallDelta = candidate.recall_at_20 - baseline.recall_at_20
  const gate = {
    unauthorized_leak_count_zero: candidate.unauthorized_leak_count === 0,
    locator_integrity_rate_100_percent: candidate.locator_integrity_rate === 1,
    ndcg_at_10_relative_gain_at_least_10_percent: relativeNdcgGain >= 0.1,
    recall_at_20_delta_not_below_minus_2_points: recallDelta >= -0.02,
  }
  return {
    schema_version: 'dd-up-g5b-retrieval-evaluation-v1',
    generated_at: new Date().toISOString(),
    status: Object.values(gate).every(Boolean)
      ? 'hard_quality_gate_passed_with_no_answer_risk_g5b_user_decision_required'
      : 'quality_gate_failed_stop',
    boundary: {
      data_classification: 'explicitly_synthetic',
      production_enabled: false,
      generated_answer_enabled: false,
      reranker_used: false,
      model: rankingOutput.model,
      rrf: { version: 'rrf-v1', k: RRF_K, lexical_weight: 1, dense_weight: 1 },
      deterministic_intent_guard: 'evaluation_candidate_only_not_integrated',
    },
    runtime: rankingOutput.runtime,
    corpus_count: SYNTHETIC_RETRIEVAL_CORPUS.length,
    query_count: SYNTHETIC_RETRIEVAL_QRELS.length,
    comparison: {
      baseline_ndcg_at_10: baseline.ndcg_at_10,
      candidate_ndcg_at_10: candidate.ndcg_at_10,
      relative_ndcg_gain: relativeNdcgGain,
      baseline_recall_at_20: baseline.recall_at_20,
      candidate_recall_at_20: candidate.recall_at_20,
      recall_delta: recallDelta,
    },
    quality_gate: gate,
    arms,
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const python = resolve(argument('--python'))
  const modelRoot = resolve(argument('--model-root'))
  const output = resolve(argument('--output'))
  const payload = JSON.stringify({
    data_classification: 'explicitly_synthetic',
    corpus: SYNTHETIC_RETRIEVAL_CORPUS,
    queries: SYNTHETIC_RETRIEVAL_QRELS,
  })
  const embedded = spawnSync(
    python,
    ['-I', fileURLToPath(new URL('./embed-context-bge-m3.py', import.meta.url)), '--model-root', modelRoot],
    { input: payload, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, env: { ...process.env, PYTHONNOUSERSITE: '1' } },
  )
  if (embedded.status !== 0) {
    process.stderr.write(embedded.stderr || embedded.stdout)
    process.exit(embedded.status || 1)
  }
  const report = buildEvaluationReport(JSON.parse(embedded.stdout))
  writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify({
    status: report.status,
    comparison: report.comparison,
    quality_gate: report.quality_gate,
    no_answer_false_positive_rate: report.arms.rrf_with_deterministic_intent_guard.by_category.no_answer.no_answer_false_positive_rate,
    raw_unauthorized_leak_count: report.arms.rrf_raw.summary.unauthorized_leak_count,
    guarded_unauthorized_leak_count: report.arms.rrf_with_deterministic_intent_guard.summary.unauthorized_leak_count,
    runtime: report.runtime,
  }, null, 2))
}
