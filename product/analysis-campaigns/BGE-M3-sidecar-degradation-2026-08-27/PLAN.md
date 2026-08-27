# BGE-M3 sidecar 持续调用退化分析计划

## 1. Objective

- campaign id：`bge-m3-sidecar-degradation-2026-08-27`
- parent run：`product/evidence/BGE-M3-sidecar-short-endurance.json`
- main claim under test：当前超时究竟来自模型编码、重复候选编码还是 HTTP 并发排队；能否在不改变模型、阈值、数据和权限边界的前提下恢复有界稳定性。
- user's core requirements：按既定计划继续开发；代码、证据、文档、发布门和远端 `main` 保持同步。
- campaign outcome needed：已得到可复现根因边界并完成有界修复；运行机制切片通过，但质量边界仍失败，因此只保留默认关闭的 POC 候选。
- selected outline ref：不适用，本活动不是论文写作。
- paper experiment matrix path：不适用。
- current matrix execution frontier：先定位，再做单因素修复，最后验证回退/背压。

## 2. Boundary And Comparability

- baseline comparison contract：固定 BGE-M3 revision、CPU、离线、回环、临时 token、纯虚构 4 候选；对照上一轮 8 串行 + 2 并发、120 秒超时结果。
- fixed conditions：模型、最大长度、batch、候选文本、查询、设备、身份校验、无 reranker、无生成式回答。
- variables that may change：是否缓存 passage dense vector；是否对忙碌请求立即拒绝；诊断采样次数。
- non-comparable slices：直接 Python 编码只用于定位 HTTP 之外的模型行为，不能直接作为端到端吞吐结论。

## 3. Slice Plan

| Exp id | Slice id | Tier | Slice class | Experiment type | Research question | Expected value | Priority | Paper placement | Needs code change? | Needs extra baseline? |
|---|---|---|---|---|---|---|---:|---|---|---|
| D1 | direct-phase-loop | main_required | claim-carrying | error analysis | 重复 query/passages 编码哪一阶段出现退化，RSS/线程如何变化？ | 定位主要耗时或卡死阶段 | 1 | omit | yes | no |
| D2 | passage-cache-ablation | main_required | claim-carrying | ablation | 只缓存候选向量能否消除重复 passage 编码退化？ | 串行请求零超时且延迟稳定 | 2 | omit | yes | no |
| D3 | bounded-backpressure | main_required | claim-carrying | robustness | 两请求同时提交时能否一条执行、一条快速 busy，并由 Workbench 回退 FTS？ | 无排队超时，失败有界且不泄漏 | 3 | omit | yes | no |

## 4. Highlight Hypotheses

- H1：每次 `/rank` 都重复编码相同 candidates，是短时退化的主要可控因素。
- H2：无界等待模型锁使并发请求排队到客户端超时；非阻塞 busy 响应可把失败转为有界 FTS 回退。
- 若 H1 失败：停止缓存优化，保留直接编码证据并转向 FlagEmbedding/PyTorch 运行时隔离诊断。
- 若 H2 失败：保持单请求实验，不声称并发可用。

## 5. Assets And Dependencies

- 已有：固定模型与隔离 Python、现有 sidecar、上一轮失败证据、虚构候选、Node 24。
- 新下载/服务：无。
- fallback：任何诊断超时都记录为失败并关闭 sidecar；正式 FTS 不受影响。

## 6. Execution Strategy

- 先运行 D1 小型 smoke，再运行有界主样本；单阶段超时不超过 30 秒。
- D1 明确定位后才实施 D2；D2 通过后再实施 D3。
- 每个切片单独输出 JSON，不覆盖上一轮失败证据。
- 长运行每 30–60 秒检查一次；超过预设超时立即终止并保留非成功状态。

## 7. Reporting Plan

- stable support：至少 8 次串行零错误、延迟无持续上升，且并发忙碌请求在 2 秒内有界拒绝、执行请求成功。
- contradiction：缓存后仍发生超时，或忙碌请求继续排队。
- unresolved ambiguity：直接编码与 HTTP 结果冲突且资源序列不足以定位。
- 汇总必须区分根因证据、修复效果、仍未覆盖的长期运行/真实数据边界。

## 8. Checklist Link

- checklist path：`product/analysis-campaigns/BGE-M3-sidecar-degradation-2026-08-27/CHECKLIST.md`
- next unchecked item：无；活动已关闭，下一路线为长文相邻主题错排与英文长尾质量分析。

## 9. Revision Log

| Time | What changed | Why it changed | Impact on slices or interpretation |
|---|---|---|---|
| 2026-08-27 | 创建三切片活动 | 上一轮 10 次请求中 6 次超时 | 默认保持 Stop，先定位后修复 |
| 2026-08-27 | D1 smoke 2/2 完成，主样本等待批准 | smoke 显示直接编码约 0.43–0.54 秒且 RSS 首次升高后稳定；8 次调用被执行审批拒绝 | 不据 2 次样本宣称根因，D2/D3 暂不启动 |
| 2026-08-27 | D1 主样本 8/8 完成 | 同进程直接重复编码均成功，RSS 在首次推理升至约 2.04 GB 后基本稳定 | 排除短样本内的模型同线程持续退化；重复 passage 编码是主要时延来源 |
| 2026-08-27 | D2 直接缓存对照与真实 HTTP 连续请求通过 | 缓存后 8 次直接 query 编码约 243–269 ms；HTTP 8/8 成功，P50 255.74 ms | 接入最多 512 条、仅保存派生向量的进程内 LRU 缓存 |
| 2026-08-27 | D3 有界背压通过 | 两个并发请求中一个 262.62 ms 成功，另一个 3.22 ms 返回 `runtime_busy` | 消除无界锁等待；Workbench 将 503 作为可恢复故障回退 FTS |
