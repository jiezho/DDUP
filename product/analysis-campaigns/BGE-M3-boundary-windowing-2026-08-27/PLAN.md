# BGE-M3 长文边界质量分析计划

## 1. Objective

- campaign id：`bge-m3-boundary-windowing-2026-08-27`
- parent run：`product/evidence/BGE-M3-synthetic-boundary-evaluation.json`
- main claim under test：扩展边界 Top-1 70% 是否主要由 `passage_max_length=128` 对长 chunk 尾部截断造成；能否在不换模型、不调阈值、不加 reranker 的条件下，用可定位的窗口化 embedding 达到既有边界门。
- user's core requirements：继续总体开发计划，自主完成大任务节点；代码、证据、文档、测试、本地试运行和 Git 保持同步。
- campaign outcome needed：得到明确根因边界；若窗口化通过则完成默认关闭的 sidecar 垂直切片，若失败则保持 Stop 并转入离线索引/模型候选设计。
- selected outline ref：不适用，本活动不是论文写作。
- paper experiment matrix path：不适用。
- current matrix execution frontier：先测长度截断，再测固定窗口，最后只集成通过门的最小方案。

## 2. Boundary And Comparability

- baseline comparison contract：固定原冻结 9 文档、14 个授权 chunks、21 查询、阈值 `0.50`、BGE-M3 revision、CPU、离线与权限过滤；基线 Recall 90%、Top-1 70%、无答案误召回 0、危险拒绝 100%、泄漏 0、locator 100%。
- fixed conditions：query 编码、模型、权重、候选 chunk ID、字符范围、评测门、无 reranker、无生成回答。
- variables that may change：passage 最大长度；单 chunk 是否拆成只用于 embedding 的重叠窗口；窗口字符数。
- non-comparable slices：窗口数量会改变编码成本，因此质量与时延分别报告，不把质量提升写成免费收益。

## 3. Slice Plan

| Exp id | Slice id | Tier | Slice class | Experiment type | Research question | Expected value | Priority | Paper placement | Needs code change? | Needs extra baseline? |
|---|---|---|---|---|---|---|---:|---|---|---|
| Q1 | max-length-sensitivity | main_required | claim-carrying | sensitivity | 128→256/512 token 是否恢复尾部长尾查询且不破坏安全门？ | 判断是否只是截断长度问题 | 1 | omit | yes | no |
| Q2 | fixed-window-max-pool | main_required | claim-carrying | ablation | 固定字符窗口取最大相似度能否修复三条错误？ | 达到 Recall/Top-1 ≥80%，其余门不退化 | 2 | omit | yes | no |
| Q3 | sidecar-window-integration | main_optional | supporting | efficiency | 通过质量门的方案能否保留缓存、有界 busy 和可接受短样本时延？ | 8 次串行零错，并发有界回退 | 3 | omit | yes | no |

## 4. Highlight Hypotheses

- H1：英文长尾漏召回主要由关键段落位于 718 字 chunk 尾部、128 token 截断导致。
- H2：固定小窗口最大池化可同时降低相邻主题错排，因为查询只与局部证据段比较，而不是与大量重复填充文本比较。
- 若 H1/H2 失败：不做无证据的 sidecar 改造，保持 FTS 默认路径，转为持久向量索引或替代模型的后续设计。

## 5. Assets And Dependencies

- 已有：冻结边界 fixture、原始基线证据、固定模型与隔离 Python、现有 sidecar、D1–D3 稳定性证据。
- 新下载/服务：无。
- fallback：任何方案未同时通过质量和安全门即不集成；正式 FTS 不受影响。

## 6. Execution Strategy

- Q1/Q2 使用同一自动脚本一次加载模型并输出每个 arm 的逐查询 JSON；先用 3 条失败查询 smoke，再运行完整 21 条。
- Q3 只在 Q2 存在通过 arm 时启动，保持候选 ID/locator 不变，窗口只作为派生向量实现细节。
- 单次外部模型运行超过 10 分钟或出现错误即停止并保存非成功状态。

## 7. Reporting Plan

- stable support：完整 21 查询上 Recall 与 Top-1 均 ≥80%，无答案误召回 0、拒绝 100%、泄漏 0、locator 100%；重复运行排序一致。
- contradiction：所有窗口/长度 arm 仍低于 Top-1 门或引入无答案误召回。
- unresolved ambiguity：质量通过但时延/内存不满足既有短样本边界。
- 汇总先报告质量门，再报告时延代价和仍未覆盖的真实数据/长时稳定边界。

## 8. Checklist Link

- checklist path：`product/analysis-campaigns/BGE-M3-boundary-windowing-2026-08-27/CHECKLIST.md`
- next unchecked item：实现 Q1/Q2 冻结 fixture 自动对照脚本并执行 smoke。

## 9. Revision Log

| Time | What changed | Why it changed | Impact on slices or interpretation |
|---|---|---|---|
| 2026-08-27 | 创建 Q1–Q3 活动 | 三条失败均与长 chunk、局部关键段或相邻主题相关 | 先做无新依赖的可逆诊断，不直接引入 reranker |
| 2026-08-27 | Q1/Q2 三条失败查询 smoke 完成 | 128/256 token 均为 0/3；512 token 与三个窗口 arm 均为 3/3，支持尾部截断假设 | 不据 smoke 接入；必须等待完整 21 条安全门 |
| 2026-08-27 | 完整 21 条运行暂缓 | 外部模型执行审批服务返回 403；禁止绕过或以局部样本替代质量门 | Q3 不启动；开发前沿切换至不依赖模型的 S4-05 上下文篮 |
