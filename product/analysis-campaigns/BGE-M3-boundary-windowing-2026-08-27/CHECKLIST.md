# BGE-M3 长文边界质量分析检查单

## Identity

- campaign id：`bge-m3-boundary-windowing-2026-08-27`
- parent run：`product/evidence/BGE-M3-synthetic-boundary-evaluation.json`

## Launch

- [x] claim under test is explicit
- [x] selected outline is not applicable
- [x] `PLAN.md` created
- [x] `CHECKLIST.md` created
- [x] slices prioritized by decision value

## Assets And Comparators

- [x] frozen synthetic boundary fixture confirmed
- [x] fixed BGE-M3 runtime and baseline evidence confirmed
- [x] no new download or service required

## Slice Execution

- [x] Q1/Q2 diagnostic script complete
- [x] failed-query smoke complete
- [x] full 21-query Q1 result recorded durably
- [x] full 21-query Q2 result recorded durably
- [x] Q3 integration decision recorded
- [x] Q3 sidecar implementation and performance evidence complete when eligible
- [x] any redesign reflected in `PLAN.md`

当前状态：完整 21 条评测已完成，`window_160_40` 的可回答召回与 Top-1 均为 100%，且无答案、危险意图、权限泄漏和 locator 门均通过；默认关闭的实验 sidecar 已采用同一策略并通过本地耐久切片。

## Aggregation

- [x] stable support vs contradiction vs ambiguity classified
- [x] highest-impact slices summarized first
- [x] campaign report written

## Closeout

- [x] campaign outcome summarized in 1–2 sentences
- [x] implementation task plan updated
- [x] next route recorded explicitly
