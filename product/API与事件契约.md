# 个人上下文智能工作台：API 与事件契约

> 版本：V1.5  
> 日期：2026-08-25  
> 状态：正式设计基线；G3 已确认  
> 范围：MVP 本机单用户、REST JSON + SSE、`/api/v1`  
> 真源关系：对象语义见《领域模型与数据字典》，授权见《权限安全与审计设计》  
> 实现状态：基础会话/安全、Project/Milestone/Task、人工讨论转决策、文本/链接 Capture、DailyPlan/DailyReview、受控 Markdown Source/Document 与权限优先全文检索已实现并进入 OpenAPI；其余领域仍为设计契约，不得称为生产可用

## 1. 契约目标

1. UI、PWA、连接器和 Runtime 不依赖 SQLite、文件路径或 Fastify 内部类型。
2. 每个请求拥有稳定 `request_id`，每个写命令可幂等、可冲突检测、可审计。
3. 所有查询在返回标题、计数或正文前完成 space/object/action 授权。
4. 长任务通过可恢复 SSE 事件表达，不把后台 Job 状态寄托在浏览器内存。
5. 高影响动作返回 Candidate/Approval，不允许客户端或模型伪造已批准状态。
6. OpenAPI、Zod Schema、领域状态枚举和测试从同一机器可读契约生成或校验。

## 2. 协议约定

### 2.1 基础路径与内容类型

- API 前缀：`/api/v1`；健康探针为 `/api/health`，不返回业务数据。
- 请求/响应：`application/json; charset=utf-8`。
- SSE：`text/event-stream; charset=utf-8`。
- 文件上传 P1 使用受控 multipart 端点；MVP 首个切片不接受客户端绝对路径。
- API 不提供 JSONP、任意 CORS 或 form-urlencoded 写入。

### 2.2 通用请求头

| Header | 适用 | 规则 |
|---|---|---|
| `X-Request-ID` | 可选 | 客户端可提供合法 UUID；服务端不信任非法值并重新生成 |
| `X-CSRF-Token` | 所有非安全方法 | 与 HttpOnly 页面会话绑定；缺失/过期拒绝 |
| `Idempotency-Key` | 创建、状态变更、审批应用、外部动作 | UUIDv7/随机高熵文本；同主体+命令范围唯一 |
| `If-Match` | 修改/删除现有对象 | 使用 `"v<version>"`，如 `"v3"` |
| `Last-Event-ID` | SSE 重连 | 最后成功处理的事件游标 |
| `Accept` | 所有请求 | JSON 或 SSE；其他类型返回 406 |

Cookie、CSRF、Origin 和 Host 的具体生成/校验属于服务安全实现，不进入业务请求正文。

### 2.3 通用响应 Envelope

成功：

```json
{
  "request_id": "0198e6a7-89ab-7def-8123-000000000001",
  "status": "ok",
  "data": {},
  "errors": [],
  "meta": {
    "api_version": "v1",
    "scope": { "space_id": "0198e6a7-89ab-7def-8123-000000000002" }
  }
}
```

失败：

```json
{
  "request_id": "0198e6a7-89ab-7def-8123-000000000001",
  "status": "error",
  "data": null,
  "errors": [
    {
      "code": "VERSION_CONFLICT",
      "message": "对象已被修改，请刷新后比较差异。",
      "field": null,
      "retryable": false
    }
  ],
  "meta": { "api_version": "v1" }
}
```

规则：

- `message` 面向用户且不含堆栈、SQL、绝对路径、越权标题或正文。
- `details` 若存在，只能包含 Schema 白名单字段；生产响应不得返回原异常对象。
- 多字段校验可返回多个 `errors`，其顺序稳定。
- 无权限和不存在对外均可归一为 `OBJECT_NOT_AVAILABLE`，避免对象枚举。

### 2.4 列表与游标

```json
{
  "data": { "items": [] },
  "meta": {
    "page": {
      "limit": 50,
      "next_cursor": null,
      "has_more": false
    }
  }
}
```

- 默认 50，最大 200；禁止无上限列表。
- Cursor 是不透明、签名/校验过的排序键快照，不接受客户端拼 SQL 字段。
- 默认排序为稳定业务排序 + `id`；删除/新增不应导致同一 Cursor 重复应用写命令。
- 总数只在权限过滤后计算；昂贵总数可省略而不能返回未过滤计数。

## 3. 错误码

| HTTP | 稳定错误码 | 含义/客户端动作 |
|---:|---|---|
| 400 | `INVALID_REQUEST` | JSON、Header 或字段格式错误；修正后重试 |
| 400 | `INVALID_CURSOR` | Cursor 无效/过期；从第一页重新查询 |
| 401 | `SESSION_REQUIRED` | 本地会话缺失或过期；重新 bootstrap |
| 403 | `CSRF_REJECTED` | Origin/CSRF/Content-Type 安全门拒绝 |
| 403 | `ACTION_NOT_ALLOWED` | 主体或策略不允许动作；不泄露目标正文 |
| 404 | `OBJECT_NOT_AVAILABLE` | 不存在、已清除或不可见 |
| 409 | `VERSION_CONFLICT` | `If-Match` 与当前版本不一致；返回安全的当前 version |
| 409 | `IDEMPOTENCY_CONFLICT` | 同键用于不同请求摘要 |
| 409 | `INVALID_STATE_TRANSITION` | 当前状态不能执行该动作 |
| 409 | `RELATION_CONFLICT` | 重复、跨空间或成环关系 |
| 410 | `RESTORE_WINDOW_EXPIRED` | 已超过对象恢复窗口，保持删除状态 |
| 412 | `SOURCE_VERSION_CHANGED` | 来源/上下文版本与创建候选时不一致 |
| 413 | `PAYLOAD_TOO_LARGE` | 请求、正文、文件或批量超预算 |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | Content-Type 不允许 |
| 422 | `VALIDATION_FAILED` | 语义校验失败，返回安全字段错误 |
| 428 | `APPROVAL_REQUIRED` | 已创建/返回 Approval，客户端展示差异 |
| 429 | `RATE_LIMITED` | 本地滥用或任务预算触发；含安全 `retry_after_ms` |
| 500 | `INTERNAL_ERROR` | 未分类错误；用 request ID 排查 |
| 503 | `SERVICE_DEGRADED` | 存储/索引/Runtime 暂不可用；读路径可标 partial |
| 503 | `MIGRATION_REQUIRED` | Schema 版本不匹配，停止写入并进入恢复/升级 |

错误码新增只允许向后兼容；更改既有语义必须升级 API 或事件版本。

## 4. 身份与系统端点

| Method | Path | Action | 说明 |
|---|---|---|---|
| GET | `/api/health` | public minimal | 仅返回服务、版本、时间和依赖健康摘要；无路径/对象数 |
| POST | `/api/v1/session/bootstrap` | local bootstrap | 受控启动交换短期页面会话；不接受账号密码 |
| GET | `/api/v1/session` | session.read | 当前 principal kind、允许 Space 摘要和 CSRF 到期信息 |
| DELETE | `/api/v1/session` | session.revoke | 使当前页面会话失效 |
| GET | `/api/v1/system/capabilities` | system.read | 已实现能力和状态：available/poc/candidate/disabled |

`/api/health` 不可作为创建会话的秘密入口；bootstrap secret 不进入 URL、日志或响应正文。

## 5. Space 与项目 API

### 5.1 Space

| Method | Path | Action | 幂等/版本 |
|---|---|---|---|
| GET | `/api/v1/spaces` | space.list | 无写入 |
| GET | `/api/v1/spaces/{space_id}` | space.read | 无写入 |
| PATCH | `/api/v1/spaces/{space_id}` | space.update | `If-Match` + Idempotency；L2/L4 取决于字段 |

首版不提供创建第二个真实 restricted Space 的普通端点；classification 升级为 restricted 或权限变化属于 L4 并触发安全升级门。

### 5.2 Project

| Method | Path | Action | 关键规则 |
|---|---|---|---|
| GET | `/api/v1/projects` | project.list | `space_id,status,template_type,cursor,limit` |
| POST | `/api/v1/projects` | project.create | Idempotency；模板仅设置默认对象，不复制底座 |
| GET | `/api/v1/projects/{project_id}` | project.read | 权限过滤后返回聚合摘要 |
| PATCH | `/api/v1/projects/{project_id}` | project.update | `If-Match`；拒绝未知字段 |
| POST | `/api/v1/projects/{project_id}/transitions` | project.transition | `activate/pause/complete/archive/reopen` |
| DELETE | `/api/v1/projects/{project_id}` | project.delete | 软删除 L2；返回影响摘要 |
| POST | `/api/v1/projects/{project_id}/restore` | project.restore | 30 天内恢复；Idempotency |

创建请求最小示例：

```json
{
  "space_id": "0198e6a7-89ab-7def-8123-000000000002",
  "name": "合成科研项目示例",
  "summary": "仅用于验证项目垂直切片。",
  "template_type": "research",
  "start_date": "2026-08-24",
  "target_date": null,
  "context_policy": "project_only"
}
```

服务端生成 `id/status/version/created_*`；客户端不能伪造 owner、审计或完成时间。

## 6. 项目工作对象 API

### 6.1 Milestone 与 Task

| Method | Path | 说明 |
|---|---|---|
| GET/POST | `/api/v1/projects/{project_id}/milestones` | 列表/创建；创建要求 Idempotency |
| PATCH/DELETE | `/api/v1/milestones/{id}` | 版本更新/软删除 |
| GET/POST | `/api/v1/projects/{project_id}/tasks` | 项目任务列表/创建 |
| GET/PATCH/DELETE | `/api/v1/tasks/{id}` | 读取/版本修改/软删除 |
| POST | `/api/v1/tasks/{id}/transitions` | `plan/start/block/complete/cancel/reopen` |

任务父子关系由服务端检查同空间、同项目策略和无环；完成/重开写入审计。

### 6.2 Discussion 与 Decision

| Method | Path | 说明 |
|---|---|---|
| GET/POST | `/api/v1/projects/{project_id}/discussions` | 创建聚焦讨论 |
| GET/PATCH | `/api/v1/discussions/{id}` | 读取/更新标题状态 |
| GET/POST | `/api/v1/discussions/{id}/entries` | 追加条目；AI 条目必须带 `run_id` provenance |
| POST | `/api/v1/discussions/{id}/decision-candidates` | 生成 Decision Candidate，不直接写 Decision |
| POST | `/api/v1/discussions/{id}/decisions` | 人工创建或应用已批准 Candidate |
| GET/PATCH | `/api/v1/decisions/{id}` | 读取/版本修改 |
| POST | `/api/v1/decisions/{id}/transitions` | `accept/supersede/withdraw` |
| POST | `/api/v1/decisions/{id}/task-candidates` | 生成后续任务候选 |

“讨论转决策/任务”若一次事务内创建多个对象，使用一个命令端点、一个 Idempotency-Key，并在同一事务写 Audit/Outbox；部分失败不得显示成功。

## 7. Source、Knowledge 与 Context API

### 7.1 Source 与导入

| Method | Path | 说明 |
|---|---|---|
| GET | `/api/v1/sources` | 按 space/project/kind/status 查询，不泄露越权计数 |
| POST | `/api/v1/sources` | 创建来源元数据/导入任务；MVP 不接受任意本地绝对路径 |
| GET | `/api/v1/sources/{id}` | 来源摘要及允许版本 |
| GET | `/api/v1/sources/{id}/versions` | 版本列表 |
| GET | `/api/v1/source-versions/{id}/content` | 受控正文/片段；支持范围和大小预算 |
| POST | `/api/v1/sources/{id}/retry-parse` | 显式重试失败解析，幂等 |
| DELETE | `/api/v1/sources/{id}` | 软删除；被 Citation 引用时返回影响/Approval |

导入返回 `202 Accepted` 与 Job/Run 标识；`ready` 只在文件原子发布、数据库提交和解析状态满足后出现。

#### 7.1.1 当前同步 Markdown 切片

OpenAPI 1.5.0 已实现 `POST /api/v1/sources/imports/markdown`：浏览器只提交明确选择的 `.md/.markdown` 文件名与正文，不提交本地路径；服务端在 1 MiB 上限内规范化并同步完成内容哈希存储、Source/SourceVersion/Document 与 FTS 索引，因此成功返回 `201`。相同内容在同空间/项目范围内去重；数据库失败会回滚记录并补偿删除本次新建且未引用的 blob。其他格式、异步 Job、重试解析和 Source 生命周期端点仍是后续设计，不得由该同步切片外推。

### 7.2 Knowledge 与 Citation

| Method | Path | 说明 |
|---|---|---|
| GET/POST | `/api/v1/knowledge-items` | 查询/人工创建知识条目 |
| GET/PATCH/DELETE | `/api/v1/knowledge-items/{id}` | 读取/版本更新/软删除 |
| GET/POST | `/api/v1/knowledge-items/{id}/citations` | 引用固定 SourceVersion + locator |
| DELETE | `/api/v1/citations/{id}` | 版本写；不得静默删除最后证据后保持 verified |
| GET/POST | `/api/v1/object-relations` | 类型白名单、同空间、无非法环 |

### 7.3 Search 与 Answer

| Method | Path | 说明 |
|---|---|---|
| POST | `/api/v1/context/search` | 权限先于正文；返回命中、引用定位和 scope explanation |
| POST | `/api/v1/context/packages` | 创建有过期时间的最小上下文 manifest |
| GET | `/api/v1/context/packages/{id}` | 仅返回当前仍可访问的 manifest 摘要 |
| POST | `/api/v1/context/answers` | 创建 Native RAG Run；返回 `202` + `run_id` |

搜索请求：

```json
{
  "space_id": "0198e6a7-89ab-7def-8123-000000000002",
  "query": "这个合成项目采用了哪些已确认决定？",
  "scope": {
    "project_ids": ["0198e6a7-89ab-7def-8123-000000000003"],
    "object_types": ["decision", "knowledge_item", "source"]
  },
  "limit": 20
}
```

返回 `scope.applied/omitted/reason`，但 omitted 不包含越权对象标题。无可引用证据时 Answer 必须明确无答案/建议性质。

## 8. 计划与复盘 API

| Method | Path | 说明 |
|---|---|---|
| GET/PUT | `/api/v1/daily-plans/{date}` | 获取/按版本保存当日计划；任务只引用不复制真源 |
| POST | `/api/v1/daily-plans/{date}/items` | 添加任务/意图快照 |
| PATCH/DELETE | `/api/v1/daily-plan-items/{id}` | 更新结果/移除 |
| GET/PUT | `/api/v1/daily-reviews/{date}` | 获取/保存用户确认复盘 |
| POST | `/api/v1/daily-reviews/{date}/draft-runs` | 生成 AI 草稿 Run，不自动保存复盘 |

日期按用户时区解释，持久化的事件时间仍为 UTC。

## 9. Run、Candidate、Approval 与治理 API

### 9.1 Run

| Method | Path | 说明 |
|---|---|---|
| GET | `/api/v1/runtimes` | 已注册 Runtime 能力和 `available/poc/candidate/disabled` |
| POST | `/api/v1/runs` | 创建 Run；Profile 明确绑定一个主 Runtime |
| GET | `/api/v1/runs/{id}` | 状态、范围、用量、安全摘要 |
| GET | `/api/v1/runs/{id}/events` | SSE，可用 Last-Event-ID 恢复 |
| POST | `/api/v1/runs/{id}/steer` | 追加用户方向；不直接批准 Tool |
| POST | `/api/v1/runs/{id}/cancel` | 幂等取消 |
| POST | `/api/v1/runs/{id}/resume` | 从 Workbench checkpoint 创建/恢复；Runtime 支持时可用 |

### 9.2 Candidate 与 Approval

| Method | Path | 说明 |
|---|---|---|
| GET | `/api/v1/candidates` | 按状态/type/run/project 查询 |
| GET | `/api/v1/candidates/{id}` | Proposal、diff、来源、过期与风险 |
| POST | `/api/v1/candidates/{id}/approve` | 创建/解决 Approval；不等于已应用 |
| POST | `/api/v1/candidates/{id}/reject` | 记录原因；不执行业务写 |
| POST | `/api/v1/candidates/{id}/apply` | 校验批准 scope、版本和幂等后应用 |
| GET | `/api/v1/approvals` | 待确认中心列表 |
| GET | `/api/v1/approvals/{id}` | 精确动作、等级、目标、diff、过期 |
| POST | `/api/v1/approvals/{id}/resolve` | `approve/reject`；L3/L4 强制显式确认字段 |

批准后请求参数/目标/version 改变时，`scope_digest` 不匹配，返回 `SOURCE_VERSION_CHANGED` 或 `APPROVAL_REQUIRED` 并创建新 Approval。

### 9.3 Audit、Backup 与 System

| Method | Path | 说明 |
|---|---|---|
| GET | `/api/v1/audit-events` | 时间/动作/对象/结果过滤；正文不进入默认响应 |
| POST | `/api/v1/audit-exports` | 创建脱敏导出 Job；本地 L2、外发 L3 |
| GET | `/api/v1/backups` | manifest 摘要和验证状态 |
| POST | `/api/v1/backups` | 一致备份 Job；Idempotency |
| POST | `/api/v1/backups/{id}/verify` | 在不切换当前数据的情况下验证 |
| POST | `/api/v1/restores` | L4；恢复到新目录并等待受控切换 |

首期不提供通过 API 修改监听地址、读取密钥或返回物理备份路径的能力。

## 10. SSE 事件契约

### 10.1 帧格式

```text
id: 42
event: run.step.completed
data: {"event_version":1,"run_id":"...","seq":42,"occurred_at":"2026-08-24T10:00:00.000Z","payload":{"step_id":"..."}}

```

- `id` 与 `seq` 同 Run 单调递增；客户端只有完成处理后才保存 Cursor。
- 每 15–30 秒发送注释 keepalive，不写 AuditEvent。
- 重连时从 `Last-Event-ID` 之后发送；游标过期返回 409 `EVENT_CURSOR_EXPIRED`，客户端刷新 Run 快照。
- 同一事件可被重复投递；客户端按 `run_id + seq` 去重。
- SSE 断开不取消 Run；取消必须调用命令端点。
- 事件只包含授权后的最小 payload，不发送完整 Prompt、密钥、绝对路径或未批准正文。

### 10.2 统一事件类型

| 事件 | 最小 payload |
|---|---|
| `run.queued` | profile/runtime/scope digest |
| `run.started` | started_at/runtime_version |
| `run.waiting_approval` | approval_id/action_level |
| `run.succeeded` | result artifact/candidate IDs |
| `run.failed` | safe error_code/retryable |
| `run.cancelled` | cancelled_by/reason_code |
| `message.delta` | channel/text delta（短期，不进长期审计正文） |
| `message.completed` | message_id/content digest |
| `plan.created` | step IDs/labels |
| `step.started/completed/failed` | step_id/status/error_code |
| `tool.requested` | tool_call_id/tool_key/action_level |
| `tool.started/completed/failed` | tool_call_id/result digest/error_code |
| `approval.requested/resolved` | approval_id/status/resolved_by kind |
| `artifact.created` | artifact_id/type/classification |
| `candidate.created` | candidate_id/type/target summary |
| `usage.updated` | bounded token/tool/time/cost counters |
| `checkpoint.created` | checkpoint_id/context digest |

Domain Outbox 事件使用 `project.created.v1`、`task.updated.v1` 等稳定命名；Run SSE 可消费其投影，但不能成为业务真源。

## 11. 幂等、事务与重试

### 11.1 命令处理

```text
认证/CSRF → Schema → Policy → Idempotency lookup → Version/State
→ Transaction(业务写 + Audit + Outbox) → Commit → Safe response cache
```

- 相同主体、命令和 Idempotency-Key + 相同请求摘要：返回首次完成响应。
- 相同键 + 不同摘要：409，不执行。
- 首次正在执行：返回 409/202 与原 request/job 标识，不并发执行。
- 事务提交但响应丢失：重试返回缓存响应，不重复写。
- 外部动作还需连接器级 dedupe key；未知执行结果进入 `reconciliation_required`，不得自动重发。

### 11.2 乐观锁

- `If-Match: "v3"` 对应当前对象 `version=3`。
- 成功写后返回 ETag `"v4"` 和最新对象。
- 冲突只返回可访问的当前 version/updated_at 和安全 diff 提示；客户端不得自动覆盖 Decision、Approval、L3/L4。

## 12. 安全与隐私不变量

1. 服务仅监听 `127.0.0.1`；任何远程访问必须新安全评审。
2. 非安全方法必须同源会话、Origin、Content-Type、CSRF；禁止任意 CORS。
3. 每个 Repository Query/Command 都接收已验证 `space_id` 和 PolicyDecision。
4. Search 在返回正文/标题/计数前授权；日志在正文进入前脱敏。
5. Runtime/Connector 不能使用 owner 会话 Cookie；使用独立短期主体能力。
6. 文件端点只接受对象 ID/相对引用并做 realpath/symlink/junction containment。
7. Schema、错误和 SSE 不返回 secrets、Cookie、Prompt 全文、绝对路径或越权元数据。
8. Harness/Hermes 状态分别为 POC/candidate，未通过代码与验收前不得返回 `available`。

## 13. 契约版本与兼容

- REST 主版本在路径中；MVP 只支持 v1。
- Schema 新增非必填字段为向后兼容；移除/改义/收紧枚举需新版本或迁移期。
- 事件含 `event_version`；消费者必须忽略未知非关键字段，拒绝未知关键事件版本。
- 对象 `version` 是并发版本，不等于 API/Schema 版本。
- OpenAPI 文件与 Zod Schema 在 CI 校验；示例数据必须明确合成。

## 14. 机器可读产物

实现阶段维护：

```text
Workbench/shared/contracts/
├── openapi.yaml
├── envelopes.mjs
├── errors.mjs
├── ids.mjs
├── events.mjs
├── projects.mjs
├── governance.mjs
└── runtime.mjs
```

禁止页面、Fastify Route 和 Runtime Adapter 各自复制状态枚举。OpenAPI 描述外部 HTTP；领域不变量仍由 Domain/Repository 测试证明。

## 15. 验收矩阵

| 编号 | 场景 | 通过条件 |
|---|---|---|
| API-01 | 合法创建项目 | 201、UUIDv7、version=1、Audit/Outbox 同事务 |
| API-02 | 重复创建请求 | 相同 key 返回同对象；不同摘要 409 |
| API-03 | 旧版本更新 | 409，不覆盖新版本，返回安全刷新提示 |
| API-04 | 跨空间对象 ID | 404/403 归一，不泄露标题、计数、片段 |
| API-05 | 无 Origin/CSRF 写入 | 在进入领域层前拒绝并审计安全摘要 |
| API-06 | 无效状态迁移 | 409，数据/版本不变 |
| API-07 | 讨论转决策/任务中途失败 | 整体回滚，无假成功/孤儿事件 |
| API-08 | SSE 断线重连 | 从最后 seq 恢复，重复事件可去重，不取消 Run |
| API-09 | Candidate 批准后参数改变 | 旧批准失效，不执行，要求新审批 |
| API-10 | 外部动作响应丢失 | 不盲目重发，进入 reconciliation 状态 |
| API-11 | Source 导入失败 | 无 ready 假状态，暂存可清理/重试 |
| API-12 | 删除与恢复 | 30 天内恢复；被引用来源普通清理被拒 |
| API-13 | 错误与日志 | 无密钥、正文、绝对路径、堆栈和越权存在性 |
| API-14 | OpenAPI/Schema 漂移 | CI 失败并指出 route/schema 差异 |

### 15.1 2026-08-24 实现证据

已实现并验证：

- `/api/health`、本地会话 bootstrap/read/revoke 与能力矩阵；
- `/api/v1/spaces` 只读与 `/api/v1/projects` 列表、创建、读取、更新、状态转换、软删除和 30 天内恢复；
- UUIDv7、严格字段校验、`If-Match`、24 小时幂等窗口、签名游标；
- Project 写入、Audit 哈希链和 Outbox 同一 SQLite 事务；
- 真实存在的外部空间与未知对象统一 404，不返回标题、空间名或计数；
- 迁移 001 checksum 与启动 quick check；重启后项目仍存在；
- migration 002 已建立 Milestone/Task、项目内复合外键、同项目关联和一层父任务约束；
- Milestone/Task 列表、创建、更新、状态转换与软删除路由已进入 OpenAPI；
- migration 003 已建立 Discussion、DiscussionEntry、Decision 和 Decision—Task 关系；
- 人工确认的讨论转换会在一个事务内结束讨论、接受决策、创建任务并写入三组 Audit/Outbox；跨项目关联失败整体回滚；
- 已实现讨论/记录/决策查询和转换路由；
- migration 004 与 `/api/v1/captures` 实现明确文本/HTTP(S) 链接捕获、状态转换和项目可选关联；服务不抓取链接、不接受文件、不自动写入长期知识；
- migration 005 与 `/api/v1/daily/{date}`、`/daily-plans/{date}`、`/daily-reviews/{date}` 实现最多三项任务引用和用户明确填写的复盘；任务仍以项目工作台为真源；
- migration 006 已建立 Source/SourceVersion/Document 与可重建 `context_search` FTS5 trigram 索引；项目、任务、Capture 和 Document 通过数据库触发器保持统一检索投影；
- `/api/v1/sources`、`/sources/imports/markdown` 与 `POST /api/v1/context/search` 已实现，项目/类型/日期/空间过滤在标题、片段与定位返回前执行；短于 3 字符的查询使用有界 LIKE 回退；
- Document 命中返回固定 `source_version_id` 与字符范围/短摘录；该定位是引用基础，不等于已实现 Citation 或引用问答；
- OpenAPI 已同步至 1.5.0；完整测试 178/178、正式构建、隐私扫描和真实浏览器 PC/390px 闭环 1/1 通过。

尚未实现：Markdown 新版本/归档、其他文件/图片/语音导入、链接抓取、KnowledgeItem/Citation/ContextPackage/Answer、混合检索/重排、AI Decision Candidate、Run/Approval、SSE 业务事件、备份恢复 API 和完整审计 UI。当前 Source 与全文检索切片不等于完整知识库或引用问答。
