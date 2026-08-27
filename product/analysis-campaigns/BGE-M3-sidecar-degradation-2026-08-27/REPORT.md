# BGE-M3 sidecar 持续调用退化分析结论

> 日期：2026-08-27
> 状态：D1–D3 已完成；运行机制修复通过，产品默认仍为 FTS
> 数据：全部为明确虚构的 4 条候选，不含真实资料、token 或本地模型路径

## 结论

上一轮“10 次请求中 6 次 120 秒超时”没有在同一 Python 调用线程内复现。D1 的 8 次无缓存直接编码全部完成，RSS 在首次推理后约为 2.04 GB 并基本稳定；主要耗时来自每次重复 passage 编码，而不是该短样本内的持续内存增长。

D2 将候选向量改为进程内临时缓存后，真实 HTTP 连续请求 8/8 成功，P50 为 255.74 ms、P95 为 306.49 ms；冷缓存请求为 1396.91 ms。D3 把模型槽改为非阻塞：两个同时提交的请求中一个在 262.62 ms 完成，另一个在 3.22 ms 返回 `503 runtime_busy`，由 Workbench 现有故障路径回退 FTS，不再无界排队。

因此 H1、H2 均得到短样本支持。sidecar 持续调用退化的主要可控因素已经解决，但这不改变扩展边界集 Top-1 仅 70% 的质量失败；BGE-M3 继续默认关闭、仓库外、synthetic-only，不进入生产依赖。

## 变更边界

- 最多缓存 512 个候选 dense vector，键为候选 ID 与正文 SHA-256；缓存不保留正文，进程退出即消失。
- 单 CPU 推理槽被占用时立即返回 `runtime_busy`；不新增排队、重试或隐式写入。
- 未修改模型、revision、阈值、权限顺序、FTS 真源、生成式回答状态或真实数据边界。

## 仍有的限制与替代路线

- 仅完成 8 次串行和 1 轮双并发短样本，不能声明长时稳定性或生产容量。
- 冷缓存约 1.4–1.5 秒，接近默认 1.5 秒超时；缓存未命中时仍可能安全回退 FTS。
- 缓存按请求逐步变热，不是持久向量索引。若后续需要更低冷启动时延，优先替代方案是离线预计算授权 SourceVersion chunk 向量、查询时只编码 query；该方案需另行设计索引版本、失效、权限和备份恢复。
- 质量主阻塞仍是长文相邻主题错排和英文长尾漏召回；在其通过前不应继续产品化 sidecar。

## 证据

- `D1-direct-uncached-main.json`
- `D2-direct-cached-passages-main.json`
- `D2-http-cached-passages-main.json`
- `D3-http-bounded-backpressure-main.json`
- `person_dashboard-main/Workbench/scripts/diagnose-bge-m3-repeated-encoding.py`
- `person_dashboard-main/Workbench/scripts/diagnose-dense-sidecar-campaign.mjs`
- `person_dashboard-main/Workbench/scripts/run-bge-m3-sidecar.py`
