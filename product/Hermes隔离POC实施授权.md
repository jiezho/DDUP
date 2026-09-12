# Hermes 隔离 POC 实施授权（G6b）

> 编号：G6b  
> 日期：2026-09-01  
> 确认日期：2026-09-12
> 最终决定：**G6b-1 至 G6b-9 全部采用推荐项。**
> 执行状态：**G6b-P1 供应链与启动面审查已完成并触发 Stop；未安装、未启动，G6b-P2/P3 未执行，Registry 继续保持 `candidate/connected=false`。**

## 1. 已确认的推荐项

| 编号 | 推荐默认项 | 替代方案 | 不确认的影响 |
|---|---|---|---|
| G6b-1 | **只验证 Hermes 作为可选消息网关/对照 Runtime，保持 BRANCH，不做硬融合** | 将 Hermes 设为主 Runtime | 不确认则保持 `candidate/connected=false`，不下载或启动 Hermes |
| G6b-2 | **第一阶段只用合成消息、合成身份和本地 stub；不接飞书、微信、公司账号** | 直接创建真实平台应用 | 不确认则不能验证真实移动端，但不会产生外部数据或凭据风险 |
| G6b-3 | **先做固定提交/版本、依赖和安装脚本审查；不执行一键安装脚本** | 直接执行官方安装器 | 不确认则不安装 Hermes，只保留当前协议预检 |
| G6b-4 | **不配置真实模型供应商、不发起付费请求；先验证 API/事件/审批/停止契约** | 直接跑真实 Agent 任务 | 不确认则不能比较模型效果，但不产生费用和数据外发 |
| G6b-5 | **若进入实际运行，使用独立实验目录和隔离环境；API 仅监听 `127.0.0.1`，强制随机 Bearer Key，CORS 关闭** | 复用宿主全局 Python 或开放网络监听 | 不确认则不能安全启动服务端 |
| G6b-6 | **禁用/隔离 Hermes 自动记忆、USER/MEMORY、Cron、动态 skill、MCP、浏览器和宿主终端；只开放 POC 明确所需能力** | 使用默认完整工具集 | 不确认则无法满足单一知识真源和最小权限要求 |
| G6b-7 | **Workbench 仍持有项目、知识、身份、审批、审计真源；Hermes 会话和记忆不回写，只能形成待确认候选** | 双向同步 Hermes 记忆 | 不确认则禁止业务数据接入 |
| G6b-8 | **先做消息网关价值实验，再决定是否做同任务 Runtime 对照；不同时推进两条大分支** | 同时铺开消息网关和完整 Agent | 不确认则维持当前顺序，不扩展范围 |
| G6b-9 | **只有真实回环服务通过鉴权、能力协商、事件、拒绝审批、停止、重复请求和重启恢复测试后，Registry 才能改为 `connected=true`** | 安装完成即标记可用 | 不确认则 Hermes 始终不可承接正式 Run |

**最终决定：G6b Go，但限于上述九项边界。** 该 Go 只授权隔离安装审查与 synthetic POC，不授权真实飞书应用、真实知识库、真实模型密钥、外部发送、生产发布或长期运行。2026-09-12 的 G6b-P1 审查发现当前固定版本和可替代版本均存在阻塞项，因此按第 4 节 Stop 条件停止在安装前；详见 [`Hermes隔离POC供应链审计报告.md`](./Hermes隔离POC供应链审计报告.md)。

## 2. 已完成且不需要额外授权的工作

已提交的 Workbench 实现没有安装或执行 Hermes，只完成：

1. 复核官方 `HTTP + SSE` API：`/v1/capabilities`、Runs、状态、事件、审批、steer 和 stop；
2. 确认 API server 是 `server_agent`，工具在 Hermes 服务端宿主执行，默认完整工具面包含终端、文件、网络、记忆和 skills；
3. 在 Workbench 增加零依赖 `hermes-api-contract-poc-v1` 预检：
   - 必须使用 Bearer 鉴权；
   - 必须声明服务端工具执行且 `split_runtime=false`；
   - 必须具备已复核的 Runs API 和精确端点；
   - SSE 单帧不超过 64 KiB，未知事件失败关闭；
   - 消息、命令、路径和运行 ID 不进入 Workbench 事件，只保留类型、布尔状态、大小和 SHA-256 摘要；
   - 审批事件必须保留明确 `deny` 选项，否则拒绝处理。
4. Registry 如实显示 `api_contract_reviewed_not_installed / connected=false`；Native 仍是唯一执行器。

这些代码验证的是“Workbench 能安全识别已复核契约”，不是“当前 Hermes 服务可用”。

### 2.1 当前工作树与审计事实

`experiments/hermes-poc/` 下存在 196,761,435 字节、6,172 个未提交文件，包括 `hermes-agent-v2026.7.7.2.tar.gz` 和解压源码。2026-09-12 已确认：

- 本地归档解压后的 6,171 个文件与官方 `v2026.7.7.2` 标签归档逐文件 SHA-256 完全一致；解压工作副本也与本地归档完全一致；
- 官方标签签名有效，目标提交为 `9de9c25f620ff7f1ce0fd5457d596052d5159596`；本地归档 SHA-256 为 `F5D1022EED3763A768CF7B0F0844831F0170A35F54EB8D18223F2E93F503025E`；
- 上游许可证为 MIT，Python 声明支持 `>=3.11,<3.14`；
- 未发现工作副本相对官方归档的本地修改或凭据注入；
- 未执行一键安装脚本、依赖安装、Hermes 进程、模型调用或消息平台连接；
- 当前锁文件的 OSV 复核和默认能力面不满足进入实际运行的安全门，已 Stop。

审查完成后的约束：

- 不运行安装脚本、服务端或 Agent；
- 不配置模型、消息平台、凭据或业务数据；
- 不将该目录提交为产品依赖或 POC 结果；
- Registry 继续保持 `connected=false`；
- 只有新的、可验证来源且无阻塞公告的固定版本通过重新审查，或用户另行批准补丁分支/容器化方案后，才可重新进入 G6b-P2。

## 3. G6b 后的建议实验顺序

### G6b-P1：供应链与启动面审查

**结果：2026-09-12 已完成，Stop。** 当前 `v2026.7.7.2` 的来源与完整性通过，但依赖安全和默认能力边界未通过；不进入安装。

- 固定 Hermes 版本或提交；
- 解析 Python/Node/桌面依赖、许可证、安装脚本、下载体积和 Windows 支持；
- 验证能否只启动 API Server/消息网关而不启用默认完整 Agent 工具；
- 若无法禁用宿主终端、自动记忆或动态扩展，立即 Stop。

### G6b-P2：本地 synthetic 网关契约

- 独立实验目录、回环监听、强 Bearer Key、无 CORS；
- 合成 Run 创建、SSE、拒绝审批、stop、幂等重放和重启恢复；
- 无真实模型、无真实消息平台、无业务知识正文；
- 与 Workbench Adapter 的事件映射和失败关闭测试。

### G6b-P3：消息价值对照

- 先用本地合成消息适配器验证捕获、项目查询、任务候选与审批；
- 比较 Hermes 网关与自研轻量飞书连接器的代码量、身份边界、重复投递、运维和升级成本；
- 只有 Hermes 明显降低成本且不扩大风险，才单独申请真实飞书 POC（新确认门，不属于 G6b）。

## 4. Stop 条件

出现任一情况即停止，不继续为“必须集成”而修改核心：

- 无法关闭或隔离宿主终端、文件写、自动记忆、Cron、动态 skills/MCP；
- API Server 无法强制鉴权或只能开放到非回环网络；
- approval/stop 不能形成可验证终态，或重复请求可能产生重复写；
- 消息身份无法稳定映射到 Workbench 用户/空间/项目且失败时不能关闭；
- 需要复制 Workbench 项目、知识、审批或长期记忆真源；
- Windows 目标环境只能通过高权限/全局安装运行，且隔离方案维护成本明显高于轻量连接器；
- Hermes 消息网关相较自研连接器没有明显开发或运维收益。

## 5. 不在本确认门内

- 真实飞书/微信应用创建、权限申请和消息发送；
- 真实个人、公司或账号数据；
- 模型 API Key、付费请求或云端部署；
- 局域网/公网暴露；
- Hermes 作为生产主 Runtime；
- 自动记忆同步、自动安装技能、自动外部写入；
- 取代 Workbench UI、项目、知识库、审批或审计。

## 6. 依据

- [Hermes 官方可编程接入文档](https://hermes-agent.nousresearch.com/docs/developer-guide/programmatic-integration)
- [Hermes 官方 API Server 文档](https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server)
- [Hermes API Server 官方源码](https://github.com/NousResearch/hermes-agent/blob/main/gateway/platforms/api_server.py)
- [Hermes Runs API 官方源码](https://github.com/NousResearch/hermes-agent/blob/main/gateway/platforms/api_server_runs.py)
- [Hermes 飞书接入文档](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/messaging/feishu.md)
- [Hermes 官方安全说明](https://github.com/NousResearch/hermes-agent/security)

确认记录：用户于 2026-09-12 回复 **“G6b 全部按推荐项确认”**。该确认不等于 Hermes 已安装、已连接或可用于正式 Run。
