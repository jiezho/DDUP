# 个人上下文智能工作台：API 与事件契约

> 版本：V1.11
> 日期：2026-09-07
> 状态：正式设计基线；G3 已确认  
> 范围：MVP 本机单用户、REST JSON + SSE、`/api/v1`  
> 真源关系：对象语义见《领域模型与数据字典》，授权见《权限安全与审计设计》  
> 实现状态：基础会话/安全、核心业务对象、Markdown Source 生命周期、权限优先检索、ContextPackage/AnswerAttempt、本地保守直接引文 Answer/Claim/Citation、三类 Candidate 治理、低敏审计、本地备份恢复，以及科研/AI Lab/前沿/学习专业工作台已进入 OpenAPI 1.20.0；开放式改写/推理回答、通用 NLI、外部动作和在线覆盖恢复仍未实现

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

OpenAPI（当前版本 1.16.0）已实现 `POST /api/v1/sources/imports/markdown`：浏览器只提交明确选择的 `.md/.markdown` 文件名与正文，不提交本地路径；服务端在 1 MiB 上限内规范化并同步完成内容哈希存储、Source/SourceVersion/Document 与 FTS 索引，因此成功返回 `201`。相同内容在同空间/项目范围内去重；数据库失败会回滚记录并补偿删除本次新建且未引用的 blob。其他格式、异步 Job、重试解析和 Source 生命周期端点仍是后续设计，不得由该同步切片外推。

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
| GET/POST | `/api/v1/context/answer-attempts` | 列表或创建持久化回答前安全检查；不生成答案 |
| GET | `/api/v1/context/answer-attempts/{id}` | 读取固定上下文版本、拒答原因和引用快照 |
| POST | `/api/v1/context/answer-attempts/{id}/validate-draft` | 不保存候选句的提取式逐句预检；不是语义蕴含或事实验证 |
| POST | `/api/v1/context/answers` | 创建 Native RAG Run；返回 `202` + `run_id` |

#### 7.3.1 当前显式 ContextPackage 切片

OpenAPI 1.17.0 已实现以下回环 API：

| Method | Path | 当前行为 |
|---|---|---|
| GET/POST | `/api/v1/context/packages` | 按空间/状态列表；或创建带用途和可选有效期的空 allowlist |
| GET | `/api/v1/context/packages/{packageId}` | 解析当前仍可访问的项，同时返回排除数量和原因；不泄露失效项正文 |
| POST | `/api/v1/context/packages/{packageId}/items` | 加入一个 Project/Task/Capture 引用，或固定 SourceVersion 的 Document 字符范围 |
| DELETE | `/api/v1/context/packages/{packageId}/items/{itemId}` | 只移除包引用，不删除业务对象 |
| POST | `/api/v1/context/packages/{packageId}/transitions` | 当前只支持 `archive`；归档包不再解析正文 |

创建/加入/移除/归档要求 `Idempotency-Key`；修改和归档还要求 `If-Match`。包项只持久化 ID、类型与定位，不持久化 title/quote/body。过期、归档、对象缺失或 SourceVersion 漂移会在读取时排除。读取详情时为有效 Document 范围派生 `source_id + source_version_id + document_id + char_range + text_sha256` Citation Manifest；Project/Task/Capture 只能标为相关对象。响应同时返回 `answer_readiness`：无可引用证据时为 `refused_no_citable_evidence`，有证据时为 `citation_manifest_ready`，但 `generation_enabled` 恒为 `false`。本切片不创建 Citation/Answer，不调用模型或 Runtime。

#### 7.3.2 当前 AnswerAttempt 安全检查切片

`POST /api/v1/context/answer-attempts` 要求 `space_id + context_package_id + context_package_version + question` 与 Idempotency-Key。服务端在同一事务内重新授权并解析 ContextPackage：版本变化返回 `VERSION_CONFLICT`，过期/归档返回 `INVALID_STATE_TRANSITION`，不可访问空间统一返回 `OBJECT_NOT_AVAILABLE`。

问题先经过确定性危险意图检查。危险意图持久化 `refused_unsafe_intent`，无可引用 Document 时持久化 `refused_no_citable_evidence`；两者都不保存引用快照。有证据时只保存 `evidence_ready`，其 `answer_attempt_citations` 固定 Source、SourceVersion、Document、字符范围和正文 SHA-256，不复制 quote/body。所有状态的 `generation_enabled=false`，响应不存在答案正文字段，也不调用模型、Runtime 或外部服务。`GET /api/v1/context/answer-attempts` 和 `GET /api/v1/context/answer-attempts/{id}` 只在授权空间内读取这些安全记录。

只有用户明确选入的固定原文范围会进入证据安全检查。确定性规则识别指令覆盖、角色冒充、敏感信息索取和外部外泄模式；命中时沿用拒答状态并使用 `UNSAFE_EVIDENCE_*` 原因码，`safety.scope=evidence`，不保存引用快照、不回显命中片段，也不扫描上下文篮外正文。

列表、单条读取和幂等重放会按快照中的精确 Source/SourceVersion/Document、半开字符范围和 `text_sha256` 重新复核。响应中的 `integrity.state` 为 `verified/invalid/not_applicable`，每条引用附 `verified/source_unavailable/range_invalid/hash_mismatch`；任何失效都只报告当前完整性并要求后续生成失败关闭，不改写历史状态、不新增审计事件，也不返回原文。

响应同时派生 `generation_gate`，按 `blocked_refusal → blocked_integrity → blocked_model_unavailable` 的优先级失败关闭。当前没有获准的回答 Runtime/Profile，因而即使证据通过也只返回 `ANSWER_RUNTIME_UNAVAILABLE`、`available=false` 和空运行时标识；该投影不是健康探测，不创建 Run、Answer、Citation 或审计写入。

`POST /api/v1/context/answer-attempts/{id}/validate-draft` 是独立的无持久化提取式预检。服务端先重新授权 AnswerAttempt 并复核全部固定引用；拒答记录返回 `blocked_refusal`，引用漂移返回 `blocked_integrity`。通过前置门后，每条候选句只能在其显式引用序号对应的固定字符范围内做连续原文包含检查。响应不回显候选句或来源正文，只返回序号、布尔结果、原因码和命中的引用序号，并固定声明 `semantic_entailment=false`、`persistence_enabled=false`、`generation_enabled=false`。重复请求结果一致且不新增 AnswerAttempt、Audit 或 Outbox；改写、概括、推断、跨引用组合和事实真伪均不在当前能力范围。

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

> 2026-09-12 当前落地边界：`native-v1` 已实现确定性本地生命周期、持久化事件、幂等开始、乐观锁取消、错误终态、JSON/SSE 回放、Checkpoint、异常重启安全收敛和受限重试谱系；它不调用开放式模型。Runtime Tool 已扩展为 Task/Knowledge/Decision 三类 L1 Candidate，L2 `candidate.apply.v1` 只能由本地拥有者经独立 Approval resolve 后执行，并支持受限安全撤销。正式 AI 运行中心已显示真实 Run、事件、Checkpoint、三类 Candidate、审批/应用与低敏审计；steer、Runtime 私有 resume 和外部 Tool 仍未实现。DeepSeek Harness 与 Hermes 都保持 `connected=false`。

| Method | Path | 说明 |
|---|---|---|
| GET | `/api/v1/runtimes` | 已注册 Runtime 能力和 `available/poc/candidate/disabled`；Harness 只返回已评审协议预检元数据，不代表安装或健康 |
| GET | `/api/v1/runtimes/{runtimeKey}/health` | 仅检查已连接适配器；未连接候选返回 `RUNTIME_UNAVAILABLE` |
| GET | `/api/v1/runs` | 按授权空间/状态列出安全 Run 摘要（已实现） |
| POST | `/api/v1/runs` | 创建 Run；Profile 明确绑定一个主 Runtime |
| GET | `/api/v1/runs/{id}` | 状态、范围、用量、安全摘要 |
| GET | `/api/v1/runs/{id}/events` | 有界 JSON 回放 |
| GET | `/api/v1/runs/{id}/events/stream` | SSE + Last-Event-ID/after_seq 恢复；断开不取消 Run |
| GET | `/api/v1/runs/{id}/checkpoints` | Workbench 可验证的检查点；不含 Prompt/密钥/正文 |
| POST | `/api/v1/runs/{id}/steer` | 追加用户方向；不直接批准 Tool |
| POST | `/api/v1/runs/{id}/cancel` | 幂等取消 |
| POST | `/api/v1/runs/{id}/retry` | 仅对 retryable、零 ToolCall、范围版本仍有效的失败 Run 创建新 Run |
| POST | `/api/v1/runs/{id}/resume` | 从 Workbench checkpoint 创建/恢复；Runtime 支持时可用 |

### 9.2 Candidate 与 Approval

当前实现覆盖 Task、Knowledge、Decision Candidate：创建审批、批准/拒绝与应用是三个独立命令；批准本身不写业务真源。应用前再次校验 proposal bytes/digest、Approval scope/expiry、候选版本、空间权限和项目状态；只有目标未发生后续修改且无受保护关系时才允许安全软撤销。

| Method | Path | 说明 |
|---|---|---|
| GET | `/api/v1/candidates` | 按状态/type/run/project 查询 |
| GET | `/api/v1/candidates/{id}` | Proposal、diff、来源、过期与风险 |
| POST | `/api/v1/candidates/{id}/approvals` | 为当前 proposal digest 创建一个有时效的 L2 Approval；不等于已应用 |
| POST | `/api/v1/candidates/{id}/apply` | 校验批准 scope、版本和幂等后应用 |
| GET | `/api/v1/approvals` | 待确认中心列表 |
| GET | `/api/v1/approvals/{id}` | 精确动作、等级、目标、diff、过期 |
| POST | `/api/v1/approvals/{id}/resolve` | `approve/reject`；L3/L4 强制显式确认字段 |

批准后候选正文、目标或 proposal digest 改变时，`scope_digest` 不匹配并返回 `APPROVAL_SCOPE_MISMATCH`；当前 Task Candidate 必须重新生成，不能复用原 Approval。

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

### 9.4 Professional Workspace

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/api/v1/professional/projects/{projectId}` | 读取同一 Project 下的科研或 AI Lab 专业投影 |
| `POST` | `/api/v1/professional/projects/{projectId}/research/questions` | 创建研究问题、假设与成功标准 |
| `POST` | `/api/v1/professional/research/questions/{questionId}/transitions` | 开始验证、回答、归档或重新打开研究问题 |
| `POST` | `/api/v1/professional/research/questions/{questionId}/experiments` | 创建研究实验 |
| `POST` | `/api/v1/professional/research/experiments/{experimentId}/results` | 记录结果、Continue/Stop 及可选回链任务 |
| `POST` | `/api/v1/professional/research/questions/{questionId}/claims` | 创建绑定固定 SourceVersion/Document/字符范围的研究 Claim |
| `POST` | `/api/v1/professional/projects/{projectId}/ai/opportunities` | 创建 AI 应用机会卡 |
| `POST` | `/api/v1/professional/ai/opportunities/{opportunityId}/transitions` | 探索、验证、停止、归档或重新打开机会卡 |
| `POST` | `/api/v1/professional/ai/opportunities/{opportunityId}/experiments` | 创建带基线、目标和方法的指标评测 |
| `POST` | `/api/v1/professional/ai/experiments/{experimentId}/results` | 记录实测值、证据摘要、Go/Stop 及可选回链任务 |

所有写端点继续要求本地 Session、同源 CSRF、`Idempotency-Key`；现有对象更新还要求 `If-Match`。研究 Claim 的证据定位由服务端重新读取正文并计算 SHA-256，不接受客户端自报哈希。读取专业工作台时再次检查来源状态、版本、字符范围和哈希，失败则返回 `evidence_integrity=invalid`。

### 9.5 Growth Workspace

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/api/v1/growth/projects/{projectId}` | 读取前沿跟踪或学习提升项目投影 |
| `POST` | `/api/v1/growth/projects/{projectId}/radar/topics` | 创建成熟度、限制、影响、处置和复查日期明确的前沿专题 |
| `POST` | `/api/v1/growth/radar/topics/{topicId}/signals` | 增加带事实/转述/观点/推断标记和固定来源范围的信号 |
| `POST` | `/api/v1/growth/radar/topics/{topicId}/reviews` | 复核专题并可原子创建回链 Task |
| `POST` | `/api/v1/growth/projects/{projectId}/learning/tracks` | 创建通用学习方向或学术英语 focus |
| `POST` | `/api/v1/growth/learning/tracks/{trackId}/practices` | 创建计划练习 |
| `POST` | `/api/v1/growth/learning/practices/{practiceId}/results` | 记录反思、反馈、自评、继续/调整/达成决定及可选 Task |
| `POST` | `/api/v1/growth/learning/tracks/{trackId}/routines` | 创建不替代项目任务的轻量习惯 |
| `POST` | `/api/v1/growth/learning/routines/{routineId}/checkins` | 按本地日期记录一次防重复打卡 |

Radar Signal 与 Research Claim 使用相同的固定证据原则：服务端重读已授权 SourceVersion/Document 范围并计算 SHA-256，读取时重新复核；不接收客户端自报哈希。学习自评和反馈均为用户明确输入，不声称模型评判。

## 10. SSE 事件契约

本节已由 S5-03 首版实现：持久化 `run_id + seq` 是真源，JSON 与 SSE 是两种授权投影。

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

### 15.1 2026-08-24 至 2026-08-26 实现证据

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
- ContextPackage 详情已派生 Citation Manifest，逐项区分 `source_citation/object_locator/excluded`，原文引用绑定 Source、SourceVersion、Document、字符范围和片段 SHA-256；Manifest 不落库，空篮或只有业务对象时明确返回无证据拒答就绪状态，生成式能力始终关闭；
- migration 011/013 与 `/api/v1/context/answer-attempts*` 已实现持久化回答前安全检查及最终 Answer/Claim/Citation：默认本地 `local-extractive-v1` 只允许固定原文中的直接引文声明；每条声明在写入前通过保守蕴含校验，最终引用绑定 SourceVersion/Document/字符范围/SHA-256；无证据、危险问题、来源不可信指令、越界引用和不支持推断整份失败关闭；读取时漂移或归档会隐藏回答正文；
- G5b 后，`POST /api/v1/context/search` 增加向后兼容的 `hybrid` 状态：默认 `disabled`；实验模式把权限过滤后的 Document 稳定 chunks 发送给 token 保护的回环 sidecar，并在危险意图、无合格证据、派生投影损坏、超时或模型不可用时拒绝或回退 FTS；
- dense 命中返回固定 `source_version_id + start/end + quote`；chunk ID 绑定 SourceVersion、Document、字符范围、处理版本和正文哈希，同一文档的多个 dense chunk 只保留最高名次；
- synthetic calibration/blind 把实验阈值从无有效召回的 `0.72` 修正为 `0.50`，但总开关和生成式回答仍关闭；该分值不是通用置信度；
- sidecar 只提供 `/health` 和 `/rank`，Workbench 校验固定 `model_id`、revision、CPU、响应大小和分值范围；单模型槽忙时 `/rank` 返回 `503 {"error":"runtime_busy"}`，Workbench 视为可恢复运行时故障并回退已授权 FTS；查询结果不生成 Answer，也不写知识真源；
- Source 已支持 Markdown 不可变新版本、归档/恢复和精确原文范围读取；候选已扩展至 Task/Knowledge/Decision，提供预览、类型绑定审批、应用与无后续变更时的安全撤销；低敏审计查询进入正式 UI；
- 本地备份 API 已支持 SQLite 在线快照、受控来源文件、manifest 摘要和复核；恢复通过停机 CLI 只写空目录；
- OpenAPI 已同步至 1.20.0；测试、正式构建、隐私扫描和本地回环试运行按发布门执行。

尚未实现：开放式改写/推理回答与通用 NLI 评测、Markdown/XLSX 之外的文件/图片/语音导入、链接抓取、动态 Context ScopeRule、重排、Runtime 私有 resume/steer 和跨设备在线恢复。当前保守回答只构造经原文包含验证的直接引文，不等于通用事实核验；受保护混合检索仍是默认关闭的实验路径。
