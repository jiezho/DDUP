# G6a DeepSeek Harness 隔离 POC 运行报告

> 状态：已完成，官方 Windows 运行时连接 Stop
> 日期：2026-09-01
> 数据边界：synthetic-only、无凭据、无模型请求、无 Workbench 数据、仅本地子进程

## 1. 结论

G6a 的供应链审计和客户端传输预检通过，但官方运行时 POC 未达到连接验收：批准的 `@deepseek-ai/dsh@0.1.1-rc.2` 与 `@deepseek-ai/dsh-sdk-client@0.1.1-rc.2` 不包含可启动的 SDK JSON-RPC 服务端或 `sdk-minimal` Profile；官方 Python runtime 又没有 Windows wheel。继续补装服务端、示例 Agent 组合或执行 PTY/子进程原生安装脚本会扩大授权和执行面，因此按 Stop 条件收口。

Workbench 继续以 Native Runtime 为唯一可运行主 Runtime。Harness 保持 `connected=false`、`poc_not_connected`，不得创建正式 Run。

## 2. 可复现供应链证据

| 检查项 | 结果 |
|---|---|
| 顶层版本 | 两包均固定为 `0.1.1-rc.2` |
| dsh integrity | `sha512-UP1UIh6q3Gme/yXRn/QL2P8IsVlv8Shpg22TRJIZPsCRWLm4CBiA1MUvXmJAfsOEETBMLAl+xWPtFw6ICsN3wg==` |
| SDK client integrity | `sha512-wCaNAKzmBOy/ZHAS4MX31qnBawf78ZK9QSr8/MZxWxolSeoNiQ9BizDMWj54vS8CF+3fUbI26G0ziTmpJTk9DQ==` |
| 锁定条目 | 513；513 条均有 integrity；resolved host 仅 `registry.npmjs.org` |
| 实际安装条目 | 456；其余为当前平台未安装的 optional/peer 条目 |
| 缓存 / node_modules | 88.85 MiB / 203.41 MiB |
| 合计 | 292.26 MiB，小于 1 GiB 上限 |
| npm audit | 生产闭包 0 low / moderate / high / critical（2026-09-01 点时结果） |
| 生命周期脚本 | 首轮安装全部禁用，执行数 0 |

安装闭包中声明生命周期脚本的包有 5 个：`@deepseek-ai/dsh-subprocess-local`、`@google/genai`、`koffi`、`node-pty`、`protobufjs`。其中 PTY、FFI 和 spawn helper 涉及平台二进制或构建流程，本轮没有执行。

许可证统计以实际安装的 456 个包为准：MIT 361、Apache-2.0 64、BSD-3-Clause 15、ISC 10、BSD-2-Clause 2、0BSD 1、Python-2.0 1，以及含 LGPL-3.0-or-later 的 sharp 平台包 2。该结果不构成正式发布许可证批准。

## 3. 运行证据

独立实验位于 `experiments/harness-poc/`，不进入 Workbench 生产依赖。

| 验证 | 结果 |
|---|---|
| 官方 CLI 精确版本 | `dsh --version` 返回 `0.1.1-rc.2`，退出 0 |
| 官方 `sdk-minimal` 启动 | 退出 1，stdout 为空，分类为 `approved_packages_do_not_ship_sdk_runtime_profile` |
| 官方 SDK client + synthetic fixture | 初始化身份 `deepseek-harness-sdk-runtime/0.0.1` 通过 |
| 事件 | `session.status → session.event → session.status` 顺序通过 |
| 退出 | `shutdown` 响应后子进程退出，receipt 显示无残留 |
| 环境 | 显式白名单环境；无 API/key/token/secret/credential 类变量 |
| POC 测试 | 2/2 通过 |

第二项证明官方运行时缺失；第三至第六项只证明官方客户端传输和进程所有权，不等价于真实 Harness 服务端已运行。

## 4. 失败根因

1. 固定 npm 版本的 `dsh` 已发布 Profile 模板只有 `web/headless`；`sdk/sdk-minimal` 是后续官方文档/源码中的发行组合，在本次精确包中不可用。
2. TypeScript SDK client 明确不负责解析或捆绑 runtime，调用方必须提供可执行命令。
3. `@deepseek-ai/dsh-sdk-jsonrpc-server` 与 `@deepseek-ai/dsh-sdk-jsonrpc-demo` 是额外包，不在 G6a 固定顶层清单内；官方示例还依赖完整 Cordis Agent 配置。
4. PyPI 的 `deepseek-harness-runtime-bin` 当前只发布 Linux x86-64/aarch64 和 macOS arm64 wheel，没有 Windows wheel。

## 5. 替代方案判断

| 方案 | 判断 | 原因 |
|---|---|---|
| A. 继续使用 Native Runtime | **采用** | 当前唯一完成权限、审计、恢复和正式 UI 的主 Runtime |
| B. Windows 上手工拼 Node JSON-RPC runtime | 暂缓 | 需新增包、Cordis 配置和原生脚本，维护与执行面明显扩大 |
| C. WSL2/Linux 容器运行官方 wheel | 可作为后续独立 POC | 官方有 Linux wheel，但需要新的隔离、资源、目录挂载和进程清理授权 |
| D. 等待官方 Windows runtime / 稳定版 | **推荐** | 供应链与平台边界最清楚，降低预发布兼容成本 |

后续只有在用户单独批准新的平台/依赖边界后，才可进入 G6b；不得从本报告推导为已授权补装、容器化、真实模型或付费请求。

## 6. 官方来源

- [DeepSeek Harness Developer Preview](https://deepseek.com/harness/en/)
- [TypeScript SDK client：调用方显式提供 runtime](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/sdk/client/README.md)
- [SDK JSON-RPC server](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/sdk/server/README.md)
- [官方 JSON-RPC 示例配置](https://github.com/deepseek-ai/deepseek-harness/blob/master/examples/jsonrpc-agent/cordis.yml)
- [Python SDK runtime carrier 说明](https://github.com/deepseek-ai/deepseek-harness/blob/master/python/sdk-runtime/README.md)
- [PyPI：deepseek-harness-runtime-bin](https://pypi.org/project/deepseek-harness-runtime-bin/)
