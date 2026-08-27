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
- [ ] full 21-query Q1 result recorded durably
- [ ] full 21-query Q2 result recorded durably
- [ ] Q3 integration decision recorded
- [ ] Q3 sidecar implementation and performance evidence complete when eligible
- [ ] any redesign reflected in `PLAN.md`

当前状态：三条历史失败查询 smoke 已完成；完整 21 条运行因外部模型执行审批服务 403 暂缓。未达到完整质量门前不启动 Q3，也不修改正式 sidecar 排序策略。

## Aggregation

- [ ] stable support vs contradiction vs ambiguity classified
- [ ] highest-impact slices summarized first
- [ ] campaign report written

## Closeout

- [ ] campaign outcome summarized in 1–2 sentences
- [ ] implementation task plan updated
- [ ] next route recorded explicitly
