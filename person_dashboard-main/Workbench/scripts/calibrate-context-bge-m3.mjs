import { spawnSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { shouldRefuseSearch } from '../server/context/search-intent-guard.mjs'
import {
  BLIND_RETRIEVAL_FIXTURE_ID,
  SYNTHETIC_BLIND_CORPUS,
  SYNTHETIC_BLIND_QUERIES,
} from '../tests/fixtures/context-retrieval-blind-evaluation.mjs'

const DEFAULT_THRESHOLDS = Object.freeze(Array.from({ length: 41 }, (_, index) => Number((0.5 + index * 0.01).toFixed(2))))

function argument(name) {
  const index = process.argv.indexOf(name)
  if (index < 0 || !process.argv[index + 1]) throw new Error(`Missing ${name}`)
  return process.argv[index + 1]
}

function evaluateSplit(rankingOutput, split, threshold) {
  const queries = SYNTHETIC_BLIND_QUERIES.filter((item) => item.split === split)
  const rows = queries.map((query) => {
    const refused = shouldRefuseSearch(query.query)
    const accepted = refused
      ? []
      : (rankingOutput.rankings[query.id] || []).filter((item) => item.score >= threshold).slice(0, 10)
    const relevant = new Set(query.relevant)
    const forbidden = new Set(query.forbidden_ids)
    return {
      id: query.id,
      category: query.category,
      refused,
      relevant_hit: query.relevant.length > 0 && accepted.some((item) => relevant.has(item.document_id)),
      top1_relevant: query.relevant.length > 0 && relevant.has(accepted[0]?.document_id),
      false_positive: query.category === 'no_answer' && accepted.length > 0,
      unauthorized_hits: accepted.filter((item) => forbidden.has(item.document_id)).length,
      accepted: accepted.map((item) => ({ document_id: item.document_id, score: item.score })),
    }
  })
  const answerable = rows.filter((item) => item.category !== 'no_answer' && item.category !== 'adversarial')
  const noAnswer = rows.filter((item) => item.category === 'no_answer')
  const adversarial = rows.filter((item) => item.category === 'adversarial')
  return {
    threshold,
    query_count: rows.length,
    answerable_recall: answerable.length ? answerable.filter((item) => item.relevant_hit).length / answerable.length : null,
    top1_accuracy: answerable.length ? answerable.filter((item) => item.top1_relevant).length / answerable.length : null,
    no_answer_false_positive_rate: noAnswer.length ? noAnswer.filter((item) => item.false_positive).length / noAnswer.length : null,
    unsafe_refusal_rate: adversarial.length ? adversarial.filter((item) => item.refused).length / adversarial.length : null,
    unauthorized_leak_count: rows.reduce((sum, item) => sum + item.unauthorized_hits, 0),
    per_query: rows,
  }
}

function passesCalibration(metrics) {
  return metrics.answerable_recall >= 0.8
    && metrics.top1_accuracy >= 0.8
    && metrics.no_answer_false_positive_rate === 0
}

function scoreEnvelope(rankingOutput, split) {
  const queries = SYNTHETIC_BLIND_QUERIES.filter((item) => item.split === split)
  const relevantScores = []
  const noAnswerTopScores = []
  for (const query of queries) {
    const ranking = rankingOutput.rankings[query.id] || []
    if (query.relevant.length > 0) {
      const relevant = new Set(query.relevant)
      const match = ranking.find((item) => relevant.has(item.document_id))
      if (match) relevantScores.push(match.score)
    } else if (query.category === 'no_answer' && ranking[0]) {
      noAnswerTopScores.push(ranking[0].score)
    }
  }
  return {
    minimum_relevant_score: relevantScores.length ? Math.min(...relevantScores) : null,
    maximum_no_answer_top1_score: noAnswerTopScores.length ? Math.max(...noAnswerTopScores) : null,
    separation_margin: relevantScores.length && noAnswerTopScores.length
      ? Math.min(...relevantScores) - Math.max(...noAnswerTopScores)
      : null,
  }
}

function summary(metrics) {
  return {
    threshold: metrics.threshold,
    answerable_recall: metrics.answerable_recall,
    top1_accuracy: metrics.top1_accuracy,
    no_answer_false_positive_rate: metrics.no_answer_false_positive_rate,
    unsafe_refusal_rate: metrics.unsafe_refusal_rate,
    unauthorized_leak_count: metrics.unauthorized_leak_count,
  }
}

export function calibrateThreshold(rankingOutput, thresholds = DEFAULT_THRESHOLDS) {
  if (rankingOutput?.fixture_id !== BLIND_RETRIEVAL_FIXTURE_ID) throw new Error('Unexpected blind fixture identity')
  const frontier = thresholds.map((threshold) => evaluateSplit(rankingOutput, 'calibration', threshold))
  const selected = frontier.find(passesCalibration) ?? null
  const blind = selected ? evaluateSplit(rankingOutput, 'blind', selected.threshold) : null
  const blindPassed = Boolean(blind
    && blind.answerable_recall >= 0.8
    && blind.top1_accuracy >= 0.8
    && blind.no_answer_false_positive_rate === 0
    && blind.unsafe_refusal_rate === 1
    && blind.unauthorized_leak_count === 0)
  return {
    selected_threshold: selected?.threshold ?? null,
    calibration_gate_passed: Boolean(selected),
    blind_gate_passed: blindPassed,
    calibration: selected,
    blind,
    frontier: frontier.map((item) => ({
      threshold: item.threshold,
      answerable_recall: item.answerable_recall,
      top1_accuracy: item.top1_accuracy,
      no_answer_false_positive_rate: item.no_answer_false_positive_rate,
    })),
  }
}

export function buildBlindCalibrationReport(rankingOutput) {
  const result = calibrateThreshold(rankingOutput)
  const currentDefault = {
    calibration: evaluateSplit(rankingOutput, 'calibration', 0.72),
    blind: evaluateSplit(rankingOutput, 'blind', 0.72),
  }
  return {
    schema_version: 'dd-up-g5b-blind-calibration-v1',
    generated_at: new Date().toISOString(),
    status: result.blind_gate_passed ? 'blind_gate_passed_candidate_remains_experimental' : 'blind_gate_failed_keep_default_disabled',
    boundary: {
      fixture_id: BLIND_RETRIEVAL_FIXTURE_ID,
      data_classification: 'explicitly_synthetic',
      production_enabled: false,
      generated_answer_enabled: false,
      reranker_used: false,
      threshold_selected_from: 'calibration_split_only',
      model: rankingOutput.model,
    },
    counts: { corpus: SYNTHETIC_BLIND_CORPUS.length, queries: SYNTHETIC_BLIND_QUERIES.length },
    score_envelope: {
      calibration: scoreEnvelope(rankingOutput, 'calibration'),
      blind: scoreEnvelope(rankingOutput, 'blind'),
    },
    current_experimental_default_0_72: {
      calibration: summary(currentDefault.calibration),
      blind: summary(currentDefault.blind),
    },
    ...result,
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const python = resolve(argument('--python'))
  const modelRoot = resolve(argument('--model-root'))
  const output = resolve(argument('--output'))
  const embedded = spawnSync(
    python,
    ['-I', fileURLToPath(new URL('./embed-context-bge-m3-blind.py', import.meta.url)), '--model-root', modelRoot],
    {
      input: JSON.stringify({
        fixture_id: BLIND_RETRIEVAL_FIXTURE_ID,
        data_classification: 'explicitly_synthetic',
        corpus: SYNTHETIC_BLIND_CORPUS,
        queries: SYNTHETIC_BLIND_QUERIES,
      }),
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
      env: { ...process.env, PYTHONNOUSERSITE: '1' },
    },
  )
  if (embedded.status !== 0) {
    process.stderr.write(embedded.stderr || embedded.stdout)
    process.exit(embedded.status || 1)
  }
  const report = buildBlindCalibrationReport(JSON.parse(embedded.stdout))
  writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify({
    status: report.status,
    selected_threshold: report.selected_threshold,
    calibration: report.calibration && {
      answerable_recall: report.calibration.answerable_recall,
      top1_accuracy: report.calibration.top1_accuracy,
      no_answer_false_positive_rate: report.calibration.no_answer_false_positive_rate,
    },
    blind: report.blind && {
      answerable_recall: report.blind.answerable_recall,
      top1_accuracy: report.blind.top1_accuracy,
      no_answer_false_positive_rate: report.blind.no_answer_false_positive_rate,
      unsafe_refusal_rate: report.blind.unsafe_refusal_rate,
      unauthorized_leak_count: report.blind.unauthorized_leak_count,
    },
  }, null, 2))
}
