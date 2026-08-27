# BGE-M3 sidecar 退化分析检查单

## Identity

- campaign id：`bge-m3-sidecar-degradation-2026-08-27`
- parent run：`product/evidence/BGE-M3-sidecar-short-endurance.json`

## Launch

- [x] claim under test is explicit
- [x] selected outline is not applicable
- [x] `PLAN.md` created
- [x] `CHECKLIST.md` created
- [x] slices prioritized by decision value

## Assets And Comparators

- [x] reviewed offline model and synthetic workload confirmed
- [x] failed short-endurance baseline identified
- [x] no new download or external service required

## Slice Execution

- D1：smoke 2/2、主样本 8/8 完成；主样本总耗时 1.25–1.79 秒，RSS 首次推理后约 2.04 GB 并基本稳定。
- D2：候选向量预计算后直接调用 8/8 完成；接入进程内缓存后 HTTP 8/8 完成，P50 255.74 ms、P95 306.49 ms。
- D3：并发两请求中 1 条成功、1 条 3.22 ms 有界 busy；身份稳定，无超时。
- [x] D1 direct phase loop smoke and main sample complete
- [x] D1 result recorded durably
- [x] D2 passage-cache ablation complete
- [x] D2 result recorded durably
- [x] D3 bounded backpressure complete
- [x] D3 result recorded durably
- [x] any redesign reflected in `PLAN.md`

## Aggregation

- [x] stable support vs contradiction vs ambiguity classified
- [x] highest-impact slices summarized first
- [x] campaign report written

## Closeout

- [x] campaign outcome summarized in 1–2 sentences
- [x] next route recorded explicitly
