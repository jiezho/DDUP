# 飞书文档索引

记录所有已创建的飞书长文档引用信息，避免重复创建，支持跨会话检索。

## 文档清单

| # | 文档名 | doc_token | blocks | 最后更新 | 类型 |
|---|--------|-----------|--------|----------|------|
| 1 | 风力发电机组塔筒监巡修调研报告 | ICgCdXUWHoCMKBxH1XjcHb48nyh | ~200 | 2026-05 | 可研报告 |
| 2 | 可研报告三维度分析 | U7jDdmmydoqnPXxNF6yc4GZInPf | ~180 | 2026-05 | 分析报告 |
| 3 | 蛇形/多节机器人巡检可行性报告 | V6XydOP97orBZax0Qqdc2YSYncf | 272 | 2026-05 | 可行性报告 |
| 4 | 华润电力具身智能巡检战略研究报告 | Q3kXdzlS5ojGbOx1Qqqc2P4rnwc | 338 | 2026-05 | 战略研究 |
| 5 | 发电行业巡检任务全面调研报告 | YnDPdZ7T8oTsXGxDzVach88Cneb | 456 | 2026-05 | 全面调研 |
| 6 | 具身智能巡检博士课题方案(综合版) | QntHdsn3woTX9jxjantc8iNsnGh | 542 | 2026-05 | 课题方案 |
| 7 | 具身智能巡检博士课题方案(初版) | DawEdhslUoh73SxnWvzcQWhGnJe | 252 | 2026-05 | 课题方案 |
| 8 | Hermes全景文档 | Ut7Ld9SO1oU5OixVpcMcXgQ8nde | ~300 | 自动更新 | 系统文档 |
| 9 | 学习计划文档 | EFyAddic7ojABDxUJsPcx1pXnOb | ~100 | 2026-05 | 学习计划 |
| 10 | 数据集周报 | K0aedIntSoW3GpxB3ZkcI | ~41 | 每周六 | 数据集周报 |
| 11 | 机器人传感器行业综合调研报告 | UPOydYKLso59HgxSrAvcNRu1nrb | 438 | 2026-05 | 行业调研 |
| | **合计** | | **~3121** | | |

## 写入经验
- 分批写入：每批 10-15 blocks
- 最大单篇已验证：542 blocks（分 4 批写入）
- 飞书 API 限制：无原生表格、无法插入图片、无 bullet/callout
- 写入失败需检查幂等性（已写入部分不会重复）
