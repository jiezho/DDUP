# ADR-015：Native 确定性运行生命周期与外部候选隔离

> 状态：已接受  
> 日期：2026-08-28  
> 关联：ADR-005、ADR-014；S5-01

## 背景

Workbench 已具备显式 ContextPackage，但尚缺少一个能够验证 Runtime 边界、持久化事件、取消、故障和重启恢复的最小执行器。直接接入 DeepSeek Harness 或 Hermes 会同时引入外部协议、运行隔离和供应链变量，无法先证明 Workbench 自身契约稳定。

## 决定

1. 首个可用适配器固定为进程内 `native-v1`，只执行确定性生命周期演练；它不调用模型、不生成回答、不调用 Tool，也不写长期知识。
2. 创建 Run 必须绑定一个当前有效且版本一致的 ContextPackage；Workbench 在执行前重新授权，并只向适配器传递范围摘要与纳入/排除数量。
3. `agent_runs` 与 `run_events` 由 SQLite 持久化。事件按 Run 内序号回放，默认不复制目标、ContextPackage 用途、引用正文、密钥或绝对路径。
4. 首个接口只提供有界 JSON 事件回放与乐观锁取消；SSE、Checkpoint、Tool/Approval、steer/resume 和模型输出继续留在 S5-02/S5-03。
5. Runtime Registry 明确列出 DeepSeek Harness 为 `poc`、Hermes 为 `candidate`，两者 `connected=false`；未连接候选不得返回伪造健康结果，也不能创建 Run。
6. `deny_ai` 空间在写入 Run 前拒绝；start/cancel 使用幂等键，取消使用 `If-Match`，开始/终态写 Audit/Outbox。

## 结果

- Workbench 可以在不依赖外部 Runtime 的情况下验证 queued → running → succeeded/failed/cancelled、顺序事件、重复请求、跨空间拒绝和重启回放。
- 当前 `native_runtime=available` 只代表上述确定性生命周期，不代表 RAG、生成式回答、工具执行或生产模型已经可用。
- Harness/Hermes 的协议和进程隔离以后可以在 Adapter 后替换，不改变项目、知识、权限和审计真源。

## 退出与升级条件

- 增加 Tool/Approval 时新建或更新相应 ADR，并完成无审批无副作用、参数变更后批准失效和外部结果未知测试。
- 增加 SSE/Checkpoint 时必须证明断线重放、终态唯一和重启恢复。
- Harness/Hermes 只有在 G6 对应 POC 通过后才能把状态改为可连接能力；不得通过修改展示文案绕过证据门。

## 证据

- `server/runtime/`、`shared/contracts/runtime.mjs`、migration 008；
- `tests/native-runtime.test.mjs`；
- `shared/contracts/openapi.yaml` 1.8.0。
