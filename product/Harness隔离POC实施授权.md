# G6a：DeepSeek Harness 隔离 POC 实施授权

> 文档状态：已确认，已执行并按 Stop 条件收口
> 生成日期：2026-09-01  
> 确认日期：2026-09-01
> 确认门：G6a  
> 当前事实：固定的 CLI 与 TypeScript 客户端已在独立实验目录完成禁脚本安装与审计；当前 Windows 发行物不包含可启动的官方 SDK 服务端/Profile，Workbench 继续保持未连接

## 0. 最终确认决定

| 编号 | 决定 | 推荐默认项 | 替代方案 | 不确认的影响 |
|---|---|---|---|---|
| G6a-1 | 是否进入官方运行时 POC | **Go，但仅限隔离、只读、synthetic-only POC** | Stop；继续使用 Native | Harness 保持“协议预检已准备、尚未安装” |
| G6a-2 | 固定版本 | **`@deepseek-ai/dsh@0.1.1-rc.2` 与 `@deepseek-ai/dsh-sdk-client@0.1.1-rc.2`，禁止浮动标签** | 跟随 `next/latest` | 浮动版本无法形成可复现证据 |
| G6a-3 | 安装边界 | **独立 `experiments/harness-poc/`，单独 lock，不进入 Workbench 生产依赖** | 加入 Workbench 根依赖 | 会扩大主应用供应链和构建影响 |
| G6a-4 | 下载与磁盘上限 | **npm 下载/缓存与隔离安装合计上限 1 GiB，预计超限立即 Stop** | 不设上限 | 可能无界扩张大型插件闭包 |
| G6a-5 | 生命周期脚本 | **首轮 `ignore-scripts`，先审计 tarball、依赖、许可证和脚本；未通过不执行脚本** | 正常安装 | 第三方脚本会在审查前获得本机执行机会 |
| G6a-6 | 模型与凭据 | **首轮只做官方进程启动、握手、事件与退出测试；不配置真实 API key，不产生付费请求** | 直接接真实模型 | 会把协议验证与凭据/费用风险混在一起 |
| G6a-7 | 数据范围 | **仅使用独立临时目录和明确 synthetic fixture；不读取 Workbench SQLite、Vault 或真实项目数据** | 直接接个人上下文 | POC 未通过前会扩大隐私与权限风险 |
| G6a-8 | 能力状态 | **通过完整 G6a 验收前保持 `poc_not_connected`，不能创建正式 Run** | 安装后即显示可用 | 会把“装上了”误报为“安全可用” |

最终确认：用户于 2026-09-01 确认“G6a 全部按推荐项确认”。G6a-1 至 G6a-8 均采用表中推荐项。该确认只授权无凭据、无付费调用、synthetic-only 的隔离 POC，不授权接入真实模型、真实资料或 Workbench 正式 Run。

## 1. 为什么现在需要单独确认

此前 G1–G5b 只批准了 Workbench 自身 Runtime、检索和审批能力。Harness 属于新的第三方执行面，完整 CLI 当前具有较大的插件依赖闭包，并包含文件、Shell、网络、MCP、子 Agent、Workflow 和动态 Cordis 工具等能力。即使 POC 只使用最小 Profile，下载和安装本身也会改变本机供应链状态，因此不能从“继续开发”推导为已授权安装。

## 2. 2026-09-01 官方状态复核

官方仍将 Harness 标记为 Developer Preview，并明确提示会有兼容性破坏。当前 npm `@deepseek-ai/dsh` 显示版本 `0.1.1-rc.2`；本地只读 `npm view` 结果显示主包本体解包大小约 117 KiB、MIT 许可证，但直接依赖包含约 60 个 Harness/Cordis 与工具包，不能用主包本体大小代表完整安装量。

当前官方 SDK 协议事实：

- 换行分隔 JSON-RPC 2.0，通过 stdio 驱动独立进程；
- 握手稳定名称为 `deepseek-harness-sdk-runtime`，线协议版本为 `0.0.1`；
- `session/prompt` 只确认消息进入队列，不直接返回最终回答；
- 服务端通过 `session.event` 与 `session.status` 通知过程；
- 当前没有协议版本协商、单会话关闭/取消方法，也没有服务端审批请求能力；
- 因而 POC 不能把取消、审批、Resume 或 ToolCall 误标为已具备。

来源：

- [DeepSeek Harness 官方 Developer Preview](https://deepseek.com/harness/en/)
- [官方 SDK JSON-RPC Server 说明](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/sdk/server/README.md)
- [官方 SDK Protocol 说明](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/sdk/protocol/README.md)
- [npm：@deepseek-ai/dsh](https://www.npmjs.com/package/@deepseek-ai/dsh)

## 3. 已完成的零依赖预检

无需安装第三方包的准备工作已经完成：

1. Registry 保持 Harness `connected=false`，但公开 `stdio_jsonrpc`、只读 POC Profile 和协议预检状态；
2. 握手只接受官方服务名和线协议 `0.0.1`，版本漂移时 fail closed；
3. 单帧限制 64 KiB，只接受 `session.event/session.status` 通知；
4. 会话 ID、原始消息、工具参数和路径不进入 Workbench 事件，只保存 SHA-256 摘要、事件类型和帧大小；
5. JSON 破损、超限帧、服务端请求、未知状态和子 Agent 通知均以 `RUNTIME_PROTOCOL_ERROR` 拒绝；
6. UI 显示“协议预检已准备 · 尚未安装”，Native 仍是唯一可运行主 Runtime；
7. 专项测试 16/16 通过，其中 Harness 预检 4/4。

这只是 Adapter 前置边界，不是实际 Harness 集成证据。

## 4. 确认后的实施步骤

1. 建立独立实验目录、忽略规则、单独 manifest/lock 和 1 GiB 预算检查；
2. 只下载固定 tarball 与依赖元数据，记录 integrity、许可证、脚本和依赖清单；
3. 先以禁用生命周期脚本方式安装，执行生产依赖安全审计；
4. 使用无敏感信息的临时 home/workspace 启动官方 SDK Profile；
5. 验证 stdout 纯 JSON-RPC、stderr 诊断分离、握手、通知、EOF/进程退出和超限帧；
6. 增加崩溃、乱序、重复、未知事件、越界路径、环境变量泄漏和进程残留测试；
7. 若协议 POC 通过，再单独形成“模型与只读工具闭环”授权，不自动接入真实模型、真实资料或付费服务；
8. 只有 G6a 最终报告给出 Go，才允许把 Harness 从 `poc_not_connected` 改为受限 POC 可运行状态。

## 5. Stop 条件

出现任一情况即停止，不修改 Workbench 主 Runtime：

- 固定版本或 integrity 无法复现；
- 下载/安装预计超过 1 GiB；
- 必须执行未审查脚本或修改 Harness 核心才能完成握手；
- stdout 混入日志导致协议帧不可可靠分离；
- Windows 环境无法阻止读取实验目录之外的文件或无法清理子进程；
- 事件无法在不保存原始敏感正文的前提下归一化；
- 当前缺失的取消/审批能力导致进程级补偿仍无法满足安全终态；
- 引入的维护成本明显高于 Native 与后续自研 Adapter。

## 6. 确认后才会发生的外部变化

- 从 npm 下载固定的第三方预发布包；
- 在仓库忽略的隔离目录生成依赖和缓存；
- 启动仅访问 synthetic 临时目录的本地子进程；
- 不会写入 Workbench 业务数据库，不会访问真实知识库，不会配置真实模型凭据，不会监听局域网或公网。

## 7. 执行结果

G6a 已按确认边界执行，结果为“供应链与客户端传输预检通过，官方 Windows 运行时连接 Stop”：

- 固定两包的版本、registry integrity、独立 lock、1 GiB 预算和点时漏洞审计通过；
- 生命周期脚本保持禁用，无真实凭据、模型请求、Workbench 数据或外部监听；
- 官方 TypeScript 客户端对 synthetic stdio fixture 的握手、通知和协议级退出通过；
- `@deepseek-ai/dsh@0.1.1-rc.2` 的已发布模板只有 `web/headless`，不含 `sdk/sdk-minimal`；批准包中也没有 JSON-RPC 服务端可执行程序；
- Windows 无对应的官方 PyPI runtime wheel；补装 Node 服务端/示例组合并执行 PTY/子进程脚本超出 G6a 范围；
- 因此不改变 `connected=false/poc_not_connected`，不创建 Harness 正式 Run。完整证据见 `Harness隔离POC运行报告.md`。
