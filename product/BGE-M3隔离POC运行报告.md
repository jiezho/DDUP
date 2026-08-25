# BGE-M3 隔离 POC 运行报告

> 版本：V1.0  
> 日期：2026-08-25  
> 状态：隔离 POC 已完成，**未接入 Workbench、未生产启用**  
> 数据边界：12 篇文档、60 条查询均为明确标记的全合成数据

## 1. 结论

G5a-DL 授权范围内的下载、哈希校验、离线安装、CPU 冒烟和 60 条合成检索对照已完成。BGE-M3 在本机 CPU 环境中能产生 1024 维归一化向量，RRF 候选相对 FTS 基线取得明显检索增益。

当前结论不是“可以上线”：未经保护的 dense/RRF 会向 6 条对抗请求返回候选，原始 RRF 产生 60 个禁返命中；确定性意图拦截候选能把该数值降为 0，但它尚未接入正式检索。6 条无答案查询仍全部返回最相似候选，误召回率 100%。因此只建议进入带保护和回退的检索工程阶段，生成式回答继续关闭，等待 G5b 确认。

## 2. 下载、安装与供应链证据

| 项目 | 实测结果 |
|---|---:|
| Windows/Python 3.12 wheels | 70 个，262,686,832 bytes |
| BGE-M3 固定 revision 文件 | 12 个，2,295,419,991 bytes |
| 合计网络预算 | 2,558,106,823 bytes，与授权上限完全一致 |
| wheel 校验 | 70/70 重算 SHA-256 并匹配 PyPI 声明 |
| 模型校验 | 12/12 重算 SHA-256；所有 LFS 声明哈希均匹配 |
| 安装方式 | 仓库外 venv，`--no-index --require-hashes` 离线安装 |
| OSV 复查 | 70 包、已收录受影响包 0、记录 0；不等于零风险 |

隔离目录没有写入 Git；报告证据不保存本机绝对路径。Workbench 的 `package.json` 与正式运行依赖未增加 Python、模型或 Runtime 组件。

磁盘实占：wheelhouse 262,686,832 bytes，模型 2,295,419,991 bytes，venv 1,223,751,856 bytes，三者合计约 3.52 GiB。

## 3. CPU 冒烟结果

| 指标 | 结果 |
|---|---:|
| Python / FlagEmbedding | 3.12.13 / 1.4.2 |
| torch / transformers | 2.13.0+cpu / 5.15.1 |
| CUDA | 不可用，符合 CPU-only 边界 |
| 模型加载 | 1.660 s |
| 单条合成短文本编码 | 0.266 s |
| 向量 | 1024 维、全为有限值、L2 范数 1.0 |
| 观测峰值工作集 | 2,031,538,176 bytes，约 1.89 GiB |

## 4. 60 条合成检索对照

| 方案 | nDCG@10 | Recall@20 | MRR@10 | 禁返命中 | 无答案误召回 |
|---|---:|---:|---:|---:|---:|
| FTS5 基线 | 0.5417 | 0.5417 | 0.5417 | 0 | 0% |
| BGE-M3 dense | 0.9705 | 1.0000 | 1.0000 | 72 | 100% |
| FTS + dense，原始 RRF | 0.9705 | 0.9896 | 1.0000 | 60 | 100% |
| RRF + 确定性意图拦截候选 | 0.9705 | 0.9896 | 1.0000 | 0 | 100% |

带拦截候选的 RRF 相对 FTS：nDCG@10 提升 79.17%，Recall@20 提升 44.79 个百分点；零禁返命中、locator 合成检查 100%，满足 G5a-9 四项硬指标。该结论有三项限制：

1. 意图拦截只是评测候选，尚未进入 `runAuthorizedHybridSearch`；
2. locator 使用固定合成文档标记，不等价于真实 SourceVersion 字符范围的端到端验证；
3. 无答案查询没有置信度或证据资格门，不能把近邻候选当作“找到答案”。

## 5. 兼容性与工程限制

- Node → Python 的 Windows 标准输入必须显式固定 UTF-8；未固定时中文会按系统编码误解码。修正编码边界后，FlagEmbedding 官方批量接口正常通过。
- 固定题集的 12 篇文档批量编码 0.965 s，60 条查询批量编码 0.960 s；这是短文本、小语料、本机单次观测，不代表正式索引吞吐或 p95。
- 未下载 reranker、ONNX 重复权重、CUDA 包或其他模型；未启动模型服务。

## 6. 证据与复现入口

- `product/evidence/BGE-M3-FlagEmbedding-1.4.2-isolated-poc-summary.json`；
- `product/evidence/BGE-M3-5617a9f61b028005a4858fdac845db406aefb181-cpu-smoke.json`；
- `product/evidence/BGE-M3-5617a9f61b028005a4858fdac845db406aefb181-synthetic-retrieval-evaluation.json`；
- `product/evidence/FlagEmbedding-1.4.2-py312-win_amd64-osv-audit-post-download.json`；
- `person_dashboard-main/Workbench/scripts/download-model-poc-artifacts.py`；
- `person_dashboard-main/Workbench/scripts/smoke-test-bge-m3.py`；
- `person_dashboard-main/Workbench/scripts/evaluate-context-bge-m3.mjs`。

## 7. 建议

建议 G5b 采用“有条件 Go”：只进入权限先行、意图拦截、无答案阈值/证据资格和 FTS 回退的混合检索工程，不开放回答，不把隔离依赖加入 Workbench 生产包。鉴于当前 nDCG 已接近 0.97，先做失败分析与更强盲测，不下载 reranker；若后续仍有稳定排序缺口，再单独审查其版本、体积和收益。
