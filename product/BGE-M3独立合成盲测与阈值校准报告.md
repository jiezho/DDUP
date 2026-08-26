# BGE-M3 独立合成盲测与阈值校准报告

> 版本：V1.0
> 日期：2026-08-26
> 状态：合成盲测通过；后续扩展边界门未通过，候选继续默认关闭
> 数据边界：10 篇文档、30 条查询均为本轮运行前冻结的明确虚构数据

## 1. 结论

本轮使用与原 12 篇/60 问评测完全分离的合成语料，先用 calibration split 选择阈值，再把该阈值不加修改地应用到 blind split。BGE-M3 选择的候选阈值为 `0.50`；盲测中回答查询召回率和 Top-1 准确率均为 100%，6 条无答案查询误召回率为 0，4 条对抗查询确定性拒绝率为 100%，禁返命中为 0。

结果支持把实验模式默认阈值从无有效召回的 `0.72` 修正为 `0.50`，但**不支持默认启用混合检索或开放生成式回答**。盲测最小相关分与最大无答案 Top-1 分仅相差 `0.01116287`，数据量小且完全合成，真实资料上的分布可能明显不同。

## 2. 冻结设计

| 分组 | 数量 | 用途 |
|---|---:|---|
| 合成文档 | 10 | 科研复现、电力、Agent、文献、英语、创业、储能、实验、记忆、计划 |
| Calibration 查询 | 10 | 6 条有答案、4 条无答案；仅此分组允许选择阈值 |
| Blind 查询 | 20 | 10 条有答案、6 条无答案、4 条对抗；不参与选阈值 |

阈值网格在运行前固定为 `0.50–0.90`、步长 `0.01`。校准硬门为：回答召回至少 80%、Top-1 至少 80%、无答案误召回为 0。盲测额外要求对抗拒绝率 100%、禁返命中为 0。

## 3. 实测结果

| 指标 | Calibration | Blind |
|---|---:|---:|
| 选定阈值 | 0.50 | 0.50（保持不变） |
| 回答查询召回 | 100% | 100% |
| Top-1 准确率 | 100% | 100% |
| 无答案误召回 | 0% | 0% |
| 对抗请求拒绝率 | 不适用 | 100% |
| 禁返命中 | 0 | 0 |
| 最小相关分 | 0.51962399 | 0.50945997 |
| 最大无答案 Top-1 分 | 0.46590525 | 0.49829710 |
| 分数间隔 | 0.05371874 | 0.01116287 |

对照实验中，原实验默认阈值 `0.72` 的无答案误召回也是 0，但 calibration 和 blind 的回答召回均为 0，说明它在这组语料上实质关闭了 dense 证据。修正后的 `0.50` 只用于显式 `experimental` 模式；系统总开关仍为 `disabled`。

## 4. 精确定位与故障隔离

同一切片已把 dense 候选从整篇 Document 改为稳定 chunk：

- chunk ID 由 SourceVersion、Document、字符起止、解析/分块版本和正文哈希确定；
- embedding 输入可包含标题，但返回 locator 只指向真实正文字符范围；
- 测试从数据库读取不可变 `body_text`，验证 `body_text.slice(start, end)` 与返回 quote 完全一致；
- 同一文档多个 chunk 只保留最高 dense 名次，避免对 RRF 重复加分；
- chunk 投影、sidecar、身份、响应或模型失败均不改变业务真源，并回退已经完成授权的 FTS 结果。

## 5. 限制与停止点

- “独立”表示与原评测集分离且 blind split 未参与阈值选择，不表示第三方或真实用户盲测；
- 只有 10 篇短合成文档；后续冻结边界集已补长文、混合语言、噪声和提示注入变体，但 Top-1 仅 70%，验证了本限制不可忽略；表格、代码、图片和真实噪声仍未覆盖；
- `0.0112` 的盲测间隔很窄，不允许把 `0.50` 当成通用置信度；
- 后续 10 次 sidecar 短样本出现 6 次 120 秒超时，持续运行与并发门明确未通过；真实索引重建和模型升级漂移仍未评估；
- 未下载 reranker，未运行生成模型，未创建 Answer/Citation 真源。

若后续扩展合成集出现无答案误召回、相关召回低于 80%、定位不完整或任何禁返命中，保持/恢复纯 FTS，不降低安全门。真实资料接入、默认启用和生成式回答均需新的明确确认。

后续结果见 `product/BGE-M3边界检索与sidecar短时稳定性报告.md`。该报告对本报告的“短集合通过”结论形成更严格的 Stop 约束，不修改 calibration 阈值。

## 6. 证据与复现

- `product/evidence/BGE-M3-synthetic-blind-threshold-calibration.json`；
- `person_dashboard-main/Workbench/tests/fixtures/context-retrieval-blind-evaluation.mjs`；
- `person_dashboard-main/Workbench/scripts/calibrate-context-bge-m3.mjs`；
- `person_dashboard-main/Workbench/scripts/embed-context-bge-m3-blind.py`；
- `person_dashboard-main/Workbench/tests/blind-threshold-calibration.test.mjs`；
- `person_dashboard-main/Workbench/tests/document-chunker.test.mjs`；
- `person_dashboard-main/Workbench/tests/protected-hybrid-search.test.mjs`。

复现仍要求 G5a-DL 已确认的仓库外固定 revision、CPU-only、offline 环境；不得把模型本地路径、token 或真实正文写入证据。
