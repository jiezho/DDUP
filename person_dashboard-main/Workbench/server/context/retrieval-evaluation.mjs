function mean(values) {
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length
}

function dcg(grades) {
  return grades.reduce((sum, grade, index) => sum + ((2 ** grade) - 1) / Math.log2(index + 2), 0)
}

function evaluateOne(query, results) {
  const grades = new Map(query.relevant.map((item) => [item.document_id, item.grade]))
  const ranked = results.map((item) => item.document_id)
  const judged = query.relevant.length > 0
  const topTenGrades = ranked.slice(0, 10).map((id) => grades.get(id) || 0)
  const idealGrades = [...grades.values()].sort((left, right) => right - left).slice(0, 10)
  const idealDcg = dcg(idealGrades)
  const relevantInTopTwenty = new Set(ranked.slice(0, 20).filter((id) => grades.has(id)))
  const firstRelevant = ranked.slice(0, 10).findIndex((id) => grades.has(id))
  const forbidden = new Set(query.forbidden_ids)
  const unauthorized = ranked.filter((id) => forbidden.has(id))
  const citedRelevant = results.filter((item) => grades.has(item.document_id))

  return Object.freeze({
    id: query.id,
    category: query.category,
    judged,
    ndcg_at_10: judged ? dcg(topTenGrades) / idealDcg : null,
    recall_at_20: judged ? relevantInTopTwenty.size / grades.size : null,
    mrr_at_10: judged ? (firstRelevant >= 0 ? 1 / (firstRelevant + 1) : 0) : null,
    no_answer_false_positive: !judged && ranked.length > 0 ? 1 : 0,
    unauthorized_ids: Object.freeze(unauthorized),
    locator_valid_count: citedRelevant.filter((item) => item.locator_valid === true).length,
    locator_checked_count: citedRelevant.length,
  })
}

function aggregate(items) {
  const judged = items.filter((item) => item.judged)
  const locatorChecked = items.reduce((sum, item) => sum + item.locator_checked_count, 0)
  const locatorValid = items.reduce((sum, item) => sum + item.locator_valid_count, 0)
  return Object.freeze({
    query_count: items.length,
    judged_query_count: judged.length,
    ndcg_at_10: mean(judged.map((item) => item.ndcg_at_10)),
    recall_at_20: mean(judged.map((item) => item.recall_at_20)),
    mrr_at_10: mean(judged.map((item) => item.mrr_at_10)),
    no_answer_false_positive_rate: mean(items.filter((item) => !item.judged).map((item) => item.no_answer_false_positive)),
    unauthorized_leak_count: items.reduce((sum, item) => sum + item.unauthorized_ids.length, 0),
    locator_integrity_rate: locatorChecked === 0 ? null : locatorValid / locatorChecked,
  })
}

export function evaluateRetrievalRun({ queries, resultsByQuery }) {
  const perQuery = queries.map((query) => evaluateOne(query, resultsByQuery.get(query.id) || []))
  const categories = [...new Set(perQuery.map((item) => item.category))]
  const byCategory = Object.fromEntries(categories.map((category) => [
    category,
    aggregate(perQuery.filter((item) => item.category === category)),
  ]))
  return Object.freeze({
    summary: aggregate(perQuery),
    by_category: Object.freeze(byCategory),
    per_query: Object.freeze(perQuery),
  })
}
