# Actions（后端动作总线）

后端提供一个统一入口，将“对话中的意图”以轻量 Action 的形式落库/落盘，并统一审计。

## 接口

- `POST /api/actions/execute`
- Body：
  - `type`: string（动作类型）
  - `payload`: object（动作参数，默认为 `{}`）

实现见 [actions.py](file:///e:/BaiduSyncdisk/润电/2026.04/DDUP/apps/api/app/api/actions.py#L81-L307)。

## 已支持的 Action 类型

- `todo.create`
  - payload: `{ "text": string }`
  - result: `{ "todo_id": string }`
- `todo.complete`
  - payload: `{ "todo_id": string }`
  - result: `{ "todo_id": string }`
- `term.create`
  - payload: `{ "term": string, "definition"?: string, "source"?: string }`
  - result: `{ "term_id": string }`
- `habit.checkin`
  - payload: `{ "habit_id": string }`
  - result: `{ "habit_id": string, "streak": number }`
- `idea.create`
  - payload: `{ "content": string, "tags"?: string }`
  - result: `{ "idea_id": string }`
- `graph.entity.create`
  - payload: `{ "name": string, "type"?: string }`
  - result: `{ "entity_id": string }`
- `feed.save`
  - payload: `{ "feed_id": string }`
  - result: `{ "feed_id": string }`
- `wiki.capture_raw`
  - payload:
    - `title`?: string
    - `content`: string
    - `tags`?: string | string[]
    - `sources`?: string | string[]
    - `visibility`?: `"public" | "internal" | "pii"`
    - `kind`?: string（用于生成系统标签 card/<kind>）
  - result: `{ "relative_path": string, "title": string }`
  - 依赖配置：
    - `DDUP_WIKI_ENABLED=true`
    - `DDUP_WIKI_VAULT_PATH=/path/to/vault`
    - `DDUP_WIKI_RAW_DIR=_raw`（可选）

## 审计约定

- 每次调用都会记录 `action.execute`（resource_type=`action`，resource_id 为生成的 action_id）。
- 部分动作会追加领域事件审计：
  - `todo.create` -> `assistant.todo.create`
  - `todo.complete` -> `assistant.todo.complete`
  - `term.create` -> `learning.term.create`
  - `habit.checkin` -> `assistant.habit.checkin`
  - `idea.create` -> `assistant.idea.create`
  - `wiki.capture_raw` -> `wiki.capture_raw`

## 扩展方式

新增动作时建议保持以下约定：

- type 命名采用 `domain.verb`（如 `todo.create`、`wiki.capture_raw`）
- 校验失败使用 400（缺字段/非法 UUID），资源不存在用 404
- 返回结构保持：`{ status: "ok", action_id, result?: object }`
- 先写 `action.execute` 审计，再写领域审计（如需要）
