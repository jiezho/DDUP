# BGE-M3 边界检索与 sidecar 短时稳定性报告

> 版本：V1.1
> 日期：2026-08-27
> 状态：sidecar 退化机制已修复并通过短样本复测；边界检索质量门仍未通过，保持纯 FTS 默认路径
> 数据边界：9 篇文档、21 条查询和性能请求均为明确虚构数据

## 1. 结论

本轮把已校准的实验阈值 `0.50` 原样应用到一组新的冻结边界集，没有使用边界结果重新调参。结果为回答召回 90%、Top-1 70%、无答案误召回 0、危险查询拒绝 100%、禁返命中 0、精确字符定位 100%。回答召回和 Top-1 未同时达到 80% 硬门，因此边界检索判定失败。

初始仓库外、CPU-only BGE-M3 sidecar 的 10 次计量短样本中有 6 次在 120 秒超时，两个同时提交的请求均超时。2026-08-27 的 D1–D3 诊断进一步确认：同线程直接重复编码 8/8 完成，主要可控耗时来自重复 passage 编码；加入仅存派生向量的临时缓存后，HTTP 串行 8/8 完成，P50 255.74 ms；双并发时一条 262.62 ms 完成，另一条 3.22 ms 有界返回 busy。运行机制的短样本阻塞已解除，但这不修复 Top-1 质量失败，也不构成长时或生产容量证明。

据此维持以下决定：

- `WORKBENCH_HYBRID_SEARCH_MODE` 默认保持 `disabled`，正式检索继续使用 FTS5；
- 不降低 `0.50` 阈值，不用本边界集重新校准，不下载 reranker；
- 不开放生成式 Answer/Citation，不接真实资料，不把 sidecar 纳入生产依赖；
- sidecar 可继续作为默认关闭的本地 POC；下一步转向长文相邻主题错排与英文长尾漏召回，不以运行修复替代质量门。

## 2. 冻结边界集

| 分组 | 数量 | 覆盖内容 |
|---|---:|---|
| 合成文档 | 9 | 8 篇授权文档、1 篇未授权诱饵；含长文、中英混合、噪声符号和文档内提示注入语料 |
| 稳定 chunks | 14 | 授权过滤后才分块；未授权诱饵不进入模型输入 |
| 有答案查询 | 10 | 长文末段、跨语言、code-mixed、噪声表达、安全分析提示注入 |
| 无答案查询 | 6 | 与科研/AI/学习语料无关的开放问题 |
| 对抗查询 | 5 | 绕过权限、内部指令披露、外传、篡改审计和关闭策略 |

硬门在运行前固定为：回答召回与 Top-1 均至少 80%，无答案误召回 0，危险查询拒绝 100%，禁返命中 0，精确 locator 100%。阈值固定沿用独立盲测得到的 `0.50`。

## 3. 边界检索实测

| 指标 | 结果 | 门槛 | 判定 |
|---|---:|---:|---|
| 回答召回 | 90% | ≥ 80% | 通过 |
| Top-1 准确率 | 70% | ≥ 80% | **失败** |
| 无答案误召回 | 0% | 0 | 通过 |
| 危险查询拒绝 | 100% | 100% | 通过 |
| 禁返命中 | 0 | 0 | 通过 |
| 精确字符定位 | 100% | 100% | 通过 |

三条关键错误为：

1. “失败账本”的正确科研文档分数为 `0.55727148`，但 AI 创业长文以 `0.58062351` 排在第一；
2. “学习、训练和睡眠周复盘”的正确计划文档分数为 `0.53734827`，但学习提升文档以 `0.56925809` 排在第一；
3. 英文长尾复现查询的正确科研文档只有 `0.34390837`，最高候选也只有 `0.43146738`，全部低于 `0.50`，因此按安全规则返回空 dense 证据。

这说明短语料盲测的 100% Top-1 不能外推到长文和相邻主题。降低阈值只能改善第三类漏召回，不能解决前两类错排，还会侵蚀无答案边界，因此本轮不调阈值。

## 4. sidecar 短时稳定性实测

工作负载为 2 次预热、8 次串行计量和 1 轮 2 请求同时提交；每次只发送 4 条虚构候选，单请求超时固定为 120 秒。

| 指标 | 结果 |
|---|---:|
| 计量请求 | 10 |
| 总错误/超时 | 6 / 6 |
| 串行错误 | 4 / 8 |
| 并发错误 | 2 / 2 |
| 串行 p50（含超时样本） | 561.10 ms |
| 串行 p95（含超时样本） | 120006.08 ms |
| 并发 p50（含超时样本） | 120001.94 ms |
| 全段耗时 | 602201.12 ms |
| 表观吞吐 | 0.017 请求/秒 |
| 结束后模型身份 | 一致 |
| 结束后端口 | 已关闭 |

当前脚本没有保存进程 RSS 序列，不能把超时归因于内存泄漏；也不能从仍可响应的健康接口推断模型排序正常。可确认的事实只有：短时重复排序发生明显退化，并发样本未在有界时间内完成。

## 5. 后续诊断顺序

1. D1–D3 已完成：定位重复 passage 编码、加入最多 512 条临时向量缓存，并用非阻塞 busy 消除无界排队；
2. 继续分析长文相邻主题错排与英文长尾漏召回；不降低既有 `0.50` 阈值，不把运行通过解释成质量通过；
3. 若需要进一步降低冷缓存时延，再评估“离线预计算授权 chunk 向量、查询时只编码 query”的替代方案；该方案涉及索引生命周期与存储，实施前另行设计与评审；
4. 只有边界 Top-1、长时稳定、资源预算和回退同时通过，才提交新的启用决定。

## 6. 证据与复现

- `product/evidence/BGE-M3-synthetic-boundary-evaluation.json`；
- `product/evidence/BGE-M3-sidecar-short-endurance.json`；
- `person_dashboard-main/Workbench/tests/fixtures/context-retrieval-boundary-evaluation.mjs`；
- `person_dashboard-main/Workbench/scripts/evaluate-context-bge-m3-boundary.mjs`；
- `person_dashboard-main/Workbench/scripts/embed-context-bge-m3-boundary.py`；
- `person_dashboard-main/Workbench/scripts/benchmark-dense-sidecar.mjs`；
- `product/analysis-campaigns/BGE-M3-sidecar-degradation-2026-08-27/REPORT.md`；
- `product/analysis-campaigns/BGE-M3-sidecar-degradation-2026-08-27/D2-http-cached-passages-main.json`；
- `product/analysis-campaigns/BGE-M3-sidecar-degradation-2026-08-27/D3-http-bounded-backpressure-main.json`；
- `person_dashboard-main/Workbench/tests/boundary-retrieval-evaluation.test.mjs`。

复现要求使用已审查的固定 BGE-M3 revision、仓库外离线环境、CPU 与回环临时 token。证据不得包含模型本地路径、token 或真实正文。
