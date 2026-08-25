# FlagEmbedding 依赖元数据解析报告

> 版本：V1.0  
> 日期：2026-08-25  
> 状态：已完成的 metadata-only 审查  
> 真实边界：**没有下载 wheel/sdist，没有安装 Python 包，没有下载模型**

> 后续状态说明（2026-08-25）：本文冻结的是下载前元数据快照。G5a-DL 后已在仓库外按该清单完成下载、哈希校验、离线安装和合成 POC；结果见 `BGE-M3隔离POC运行报告.md`。本文历史边界不改写为当下产品能力。

## 1. 结论

针对 Windows AMD64、CPython 3.12.13 和 `FlagEmbedding==1.4.2`，已通过 PyPI 官方 JSON 元数据闭合出一份候选锁：70 个包、全部具有兼容 wheel、0 个 sdist 构建回退，候选分发包压缩总量 262,686,832 bytes（250.52 MiB）。

该清单证明“依赖可以在元数据层闭合”，**不证明安装、导入、BGE-M3 推理或生产兼容性已经通过**。上游约束较宽，当前候选自动选择了 `torch==2.13.0`、`transformers==5.15.1` 等最新兼容版本，必须通过隔离安装和 smoke test 才能确认运行兼容性。

## 2. 关键候选版本

| 包 | 候选版本 | 候选 wheel 体积 | 说明 |
|---|---:|---:|---|
| FlagEmbedding | 1.4.2 | 0.24 MiB | 根依赖；PyPI 项目页标注 MIT |
| torch | 2.13.0 | 116.40 MiB | 最大运行时包；尚未安装 |
| scipy | 1.18.1 | 34.96 MiB | 数值依赖 |
| pyarrow | 25.0.1 | 26.66 MiB | Datasets 依赖 |
| numpy | 2.5.2 | 11.89 MiB | 数值依赖 |
| transformers | 5.15.1 | 11.21 MiB | 满足 `>=4.44.2,<6`，兼容性待 smoke test |
| pandas | 3.0.5 | 9.38 MiB | 数据处理依赖 |
| scikit-learn | 1.9.0 | 7.83 MiB | 评测/句向量依赖 |
| sentence-transformers | 6.0.0 | 0.53 MiB | 句向量接口 |
| datasets | 5.0.1 | 0.48 MiB | FlagEmbedding 直接依赖 |
| accelerate | 1.14.0 | 0.36 MiB | 推理设备与执行依赖 |
| peft | 0.20.0 | 0.53 MiB | FlagEmbedding 直接依赖 |

完整 70 包版本、文件名、PyPI URL、文件大小、声明 SHA-256、许可证摘要和依赖来源见：

- `product/evidence/FlagEmbedding-1.4.2-py312-win_amd64-metadata-lock.json`；
- 复现脚本：`person_dashboard-main/Workbench/scripts/resolve-flagembedding-metadata.py`。

## 3. 安全与许可证

已把 70 个候选版本提交给 [OSV PyPI 批量查询 API](https://google.github.io/osv.dev/post-v1-querybatch/)；本次快照返回受影响包 0、漏洞记录 0。该结果只代表 2026-08-25 查询时 OSV 已收录的数据，不能证明不存在漏洞。

许可证摘要覆盖 MIT、Apache-2.0、BSD、MPL-2.0、PSF 等常见开放许可证。FlagEmbedding 的 PyPI JSON 摘要未提供简短 SPDX 字段，因此机器清单标记为 `not_declared_in_summary`；[FlagEmbedding 官方 PyPI 页面](https://pypi.org/project/FlagEmbedding/)标注 MIT，实际下载前仍保留人工许可证核验项。

OSV 原始审查证据：`product/evidence/FlagEmbedding-1.4.2-py312-win_amd64-osv-audit.json`。

## 4. 风险与停止条件

- 1.4.2 在本次审查前一天发布，本项目尚无安装和推理证据；
- 70 包依赖面较大，版本满足声明约束不等于组合经过上游测试；
- 当前无 sdist，但任一 wheel 在下载时缺失、哈希不一致或被撤回，都必须停止；
- OSV 结果为空不等于零风险；实际下载前后都应重新查询；
- 安装后若导入失败、CPU 路径隐式要求 CUDA、峰值内存超预算或污染 Workbench 依赖，应删除隔离环境并回退 FTS；
- 本报告不授权下载、安装、真实数据处理或对外服务。

## 5. 下一步

实际下载已通过 `模型POC实际下载授权.md` 的 G5a-DL 确认，并已按仓库外、hash-pinned、固定 revision、synthetic-only 边界完成。隔离 POC 不等于正式依赖或产品集成；下一步等待 G5b。
