# 模型 POC 实际下载授权（待确认）

> 文档版本：V1.0  
> 日期：2026-08-25  
> 状态：待确认  
> 确认门：G5a-DL（实际分发包与模型文件下载）  
> 前置决定：G5a-D 已确认  
> 当前真实状态：**所有包和模型仍未下载、未安装**

## 0. 需要确认的决定

| ID | 决策 | 推荐默认项 | 替代方案 | 不确认的影响 |
|---|---|---|---|---|
| G5a-DL1 | Python 包下载 | **允许下载候选锁中的 70 个 Windows/Python 3.12 wheel，合计 250.52 MiB；逐个校验 PyPI 声明 SHA-256** | 手工裁剪依赖；改用 llama.cpp | 无法建立 FlagEmbedding 隔离运行时 |
| G5a-DL2 | 模型下载 | **允许下载固定 revision `5617a9f61b028005a4858fdac845db406aefb181` 的 12 个 BGE-M3 必需文件，合计 2.138 GiB** | 下载全仓约 4.59 GB；改用更小模型 | 无法运行 dense POC |
| G5a-DL3 | 总量与磁盘 | **本轮网络下载上限 2,558,106,823 bytes（2.382 GiB）；预留至少 8 GiB 本地磁盘作为隔离环境、缓存和回退余量** | 不设上限；边下边扩 | 防止不可控下载和磁盘占满 |
| G5a-DL4 | 排除项 | **不下载 reranker、ONNX 重复权重、图片、训练 extras、CUDA 专用包、sqlite-vec 或其他模型** | 一次下载全部候选 | 控制供应链、体积和实验变量 |
| G5a-DL5 | 安装边界 | **仓库外隔离 Python 3.12 CPU 环境；不写 `package.json`，不修改 Workbench 业务依赖，不启动对外服务** | 安装到全局 Python；嵌入 Node 进程 | 避免污染本机和产品运行时 |
| G5a-DL6 | 校验与停止 | **哈希、许可证、OSV、导入、CPU 路径任一失败立即停止；不自动换版本或降安全门** | 自动选择其他最新版继续 | 防止不可复现和静默扩大范围 |
| G5a-DL7 | POC 范围 | **只处理 60 条全合成 qrels；先 smoke test，再跑 dense 与 RRF；不接 reranker、不开放生成式回答** | 直接接现有知识库或真实文档 | 保持隐私和评测可比性 |
| G5a-DL8 | 下载后下一门 | **完成资源/兼容性证据后生成 POC 运行记录；只有质量达 G5b 门才继续** | 安装成功即视为可用 | 防止把“能运行”误写成“有效/生产可用” |

### 推荐确认方式

回复：`G5a-DL全部按推荐项确认。`

---

## 1. 精确下载预算

| 类别 | 数量 | 精确/声明体积 | 来源与校验 |
|---|---:|---:|---|
| PyPI wheels | 70 | 262,686,832 bytes / 250.52 MiB | PyPI 官方文件 URL 与声明 SHA-256；下载后本地重算 |
| BGE-M3 必需文件 | 12 | 2,295,419,991 bytes / 2.138 GiB | Hugging Face 固定 revision；LFS SHA-256 + 下载后全文件本地重算 |
| **合计上限** | **82** | **2,558,106,823 bytes / 2.382 GiB** | 超出即停止并重新确认 |

8 GiB 是保守的本地空间预留建议，不是已测安装占用；实际安装尺寸和峰值内存必须在隔离环境中测量后报告。

## 2. 模型身份

- 模型：`BAAI/bge-m3`；
- 完整 revision：`5617a9f61b028005a4858fdac845db406aefb181`；
- 许可证：MIT；
- 必需文件元数据：`product/evidence/BGE-M3-5617a9f61b028005a4858fdac845db406aefb181-metadata-manifest.json`；
- 官方来源：[BGE-M3 模型卡](https://huggingface.co/BAAI/bge-m3)与[模型 API](https://huggingface.co/api/models/BAAI/bge-m3?blobs=true)。

其中 LFS 文件已取得官方声明 SHA-256；非 LFS 小文件当前只有 Git blob SHA-1。所有 12 个文件都必须在下载后重新计算本地 SHA-256，写入运行 manifest 后才能加载。

## 3. 下载后的强制验证

1. 每个 wheel 与模型文件大小、SHA-256、固定 revision 一致；
2. 重新运行 OSV 查询并记录时间；
3. 隔离环境中导入 `torch`、`transformers`、`FlagEmbedding`；
4. 确认 CPU-only 加载，不拉取未列入 manifest 的文件；
5. 用一条合成短文本执行 embedding，记录维度、时延、进程峰值内存和错误；
6. smoke test 通过后才运行 60 条 dense/RRF 评测；
7. 任一步失败，保留错误证据、删除隔离环境并回退 FTS。

