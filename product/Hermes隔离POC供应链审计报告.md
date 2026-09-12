# Hermes 隔离 POC 供应链与启动面审计报告

> 审计编号：G6b-P1
> 审计日期：2026-09-12
> 审计对象：`experiments/hermes-poc/`
> 结论：**Stop；不安装、不启动，不进入 G6b-P2/P3。**

## 1. 结论

当前下载物的来源、标签签名、归档内容和工作副本完整性均通过，但依赖安全和默认能力面不满足 G6b 的实际运行门槛：

1. 固定版本 `v2026.7.7.2` / Python 包 `0.18.2` 已被 OSV 标记为受两个 Hermes Agent 公告影响；
2. 其锁文件截至审计日共检查 233 个带版本包，19 个包被 OSV 返回至少一个公告。锁文件包含可选与开发依赖，不能把 19 个全部等同于本次运行依赖，但 API Server 所需的 `aiohttp==3.14.1` 和核心依赖 `cryptography==46.0.7` 均在受影响列表；
3. Hermes API Server 默认使用 `hermes-api-server` 完整工具集，包含宿主终端、进程、文件读写、浏览器、技能管理、记忆、代码执行、委派和 Cron；它还注册 session、job、skill 和 toolset 等控制面接口。仅有 Bearer 鉴权和回环监听不足以证明最小权限；
4. 可避开 Hermes 本体两个公告的已签名 `v2026.8.3` / `0.20.0` 候选仍有 4 个锁定包被当前 OSV 返回公告；
5. 最新稳定版 `v2026.9.11` / `0.21.2` 的 GitHub 标签和目标提交均显示 `unsigned`，发布页没有可核验 digest 的构件，暂不替换当前固定版本。

因此按 G6b-3、G6b-5、G6b-6 和既定 Stop 条件，在依赖安装和进程启动前停止。Workbench Registry 保持 `readiness=api_contract_reviewed_not_installed`、`connected=false`，Native 仍是唯一主 Runtime。

## 2. 来源与完整性

| 项目 | 结果 |
|---|---|
| 本地文件总量 | 6,172 个文件，196,761,435 字节 |
| 本地归档 | `.downloads/hermes-agent-v2026.7.7.2.tar.gz` |
| 本地归档 SHA-256 | `F5D1022EED3763A768CF7B0F0844831F0170A35F54EB8D18223F2E93F503025E` |
| 官方标签 | `v2026.7.7.2`，注解标签签名有效 |
| 标签目标提交 | `9de9c25f620ff7f1ce0fd5457d596052d5159596` |
| 归档内容比对 | 本地与官方各 6,171 个文件；相对路径和逐文件 SHA-256 差异为 0 |
| 工作副本比对 | 解压工作副本 6,171 个文件；相对本地归档差异为 0 |
| 许可证 | MIT |
| Python 范围 | `>=3.11,<3.14`；本机可用 Python 3.11.4 |
| 凭据状态 | 工作副本与官方归档完全一致，未发现本地凭据或配置注入 |

归档整体 SHA-256 与 GitHub API 动态生成的标签归档不同，但解压后逐文件完全一致；差异来自归档封装/根目录元数据，不构成内容差异。

## 3. 安装与依赖面

- 没有执行 `setup-hermes.sh`、`setup.py`、`pip`、`uv`、`npm` 或任何 Hermes 入口；
- `setup.py` 自定义 build/egg-info 流程并收集完整 skills 与 optional-skills 文件树；官方源码还包含运行期按需 `pip`/`npm` 安装路径，不能视为零副作用安装；
- 基础项目声明精确固定多数直接依赖，但仍包含区间依赖，并通过 `uv.lock` 固定传递依赖；
- Windows 声明有 `tzdata`、`pywinpty`、`psutil` 等平台依赖，说明上游考虑 Windows，但不等于已通过本项目的隔离门禁；
- 审计日对 `uv.lock` 的 OSV 查询结果是动态外部事实，未来必须重新执行，不能把本报告当作永久无漏洞证明。

### 3.1 阻塞公告摘要

| 包 | 固定版本 | 审计结论 |
|---|---:|---|
| `hermes-agent` | 0.18.2 | OSV 返回 `GHSA-pmqc-57g8-c22c`、`GHSA-xq8w-9jvx-gm3v`；受影响范围包含该版本 |
| `aiohttp` | 3.14.1 | OSV 返回 3 个 GHSA；其中修复版本分别为 3.14.2/3.14.3 |
| `cryptography` | 46.0.7 | OSV 返回多个公告；相关修复线最高需要 50.0.0 |

完整 19 包列表属于审计时点数据；不在此复制全部公告正文，避免把动态数据库快照误当作长期事实。

## 4. API 与能力边界

正向控制：

- 默认监听 `127.0.0.1:8642`；
- CORS 默认不开放；
- API Server 没有 `API_SERVER_KEY` 或密钥短于 16 字符时拒绝启动；
- 能力端点明确声明 `server_agent`、工具在服务端执行且 `split_runtime=false`；
- Runs API 有状态、SSE、审批响应和停止接口。

阻塞风险：

- 默认 `hermes-api-server` 工具集是完整宿主能力，而非消息转发专用最小网关；
- API Server 警告公网绑定与本地终端组合的风险，但只告警、不拒绝；
- 记忆示例默认开启，Blank Slate 虽可关闭记忆、插件和 MCP，但仍强制保留文件与终端作为最小 Agent；
- 显式工具配置、全局禁用、插件自动发现、MCP 和动态 lazy install 之间存在多层恢复逻辑，需要实际隔离测试才能证明“全关闭”；
- 当前版本本体和依赖公告使这一步不应通过真实进程来验证。

## 5. 已执行与未执行

已执行：

- 官方发布/标签/提交元数据只读查询；
- SHA-256、归档逐文件、工作副本逐文件比对；
- 许可证、Python/Windows 条件、安装脚本和默认能力静态审查；
- `uv.lock` 包版本对 OSV 的只读查询；
- 已签名修复候选 `v2026.8.3` 与最新稳定版 `v2026.9.11` 的来源和锁文件比较。

未执行：

- 任何 Hermes 安装脚本或依赖安装；
- Hermes API Server、Agent、Gateway、Cron、MCP、skill、browser 或 terminal；
- 模型供应商、真实或测试 API Key、付费请求；
- 飞书、微信或其他消息平台；
- Workbench Adapter 连接、Registry 状态修改；
- `experiments/hermes-poc/` 的暂存、提交或上传。

## 6. 重新进入 G6b-P2 的条件

满足以下任一路径后重新审查，不自动继续：

1. 上游发布带可验证签名/构件摘要的新固定版本，且 Hermes 本体、API 必需依赖没有阻塞公告；或
2. 用户另行批准受维护的最小补丁分支和容器/低权限账户隔离方案，并接受相应维护成本。

无论选择哪条路径，P2 仍必须使用合成数据、随机 Bearer Key、关闭 CORS、仅监听 `127.0.0.1`，并对无鉴权、能力协商、SSE 上限、拒绝审批、停止、重复请求和重启恢复逐项验收。

## 7. 依据

- [Hermes v2026.7.7.2 官方发布](https://github.com/NousResearch/hermes-agent/releases/tag/v2026.7.7.2)
- [Hermes v2026.8.3 官方发布](https://github.com/NousResearch/hermes-agent/releases/tag/v2026.8.3)
- [Hermes v2026.9.11 官方发布](https://github.com/NousResearch/hermes-agent/releases/tag/v2026.9.11)
- [GHSA-pmqc-57g8-c22c](https://osv.dev/vulnerability/GHSA-pmqc-57g8-c22c)
- [GHSA-xq8w-9jvx-gm3v](https://osv.dev/vulnerability/GHSA-xq8w-9jvx-gm3v)
- [GHSA-cq5v-8q36-5273](https://osv.dev/vulnerability/GHSA-cq5v-8q36-5273)
- [GHSA-mfx4-hv73-q22v](https://osv.dev/vulnerability/GHSA-mfx4-hv73-q22v)
- [GHSA-mq44-7p77-q5h7](https://osv.dev/vulnerability/GHSA-mq44-7p77-q5h7)
- [Hermes API Server 固定版本源码](https://github.com/NousResearch/hermes-agent/blob/9de9c25f620ff7f1ce0fd5457d596052d5159596/gateway/platforms/api_server.py)
