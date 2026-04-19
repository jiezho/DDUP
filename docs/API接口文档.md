# DDUP API 接口文档

## 1. Swagger / OpenAPI

后端启动后，可直接访问：
- Swagger UI：`http://localhost:8000/docs`
- OpenAPI JSON：`http://localhost:8000/openapi.json`

说明：
- 当前 API 以 `/api` 为前缀（例如 `/api/spaces`、`/api/chat/...`）
- `/healthz` 为健康检查（不在 `/api` 下）

## 2. 如何导出 OpenAPI（用于版本化与持续更新）

本项目将 OpenAPI 产物保存到仓库，便于：
- 前端/其它系统基于 openapi.json 生成 client
- 代码变更时对比接口差异（git diff）

导出方式：
- 运行脚本：`apps/api/tools/export_openapi.py`
- 产物路径：`docs/generated/openapi.json`

## 3. 已实现接口（V0.1）

### 3.1 健康检查

- `GET /healthz`

### 3.2 空间

- `GET /api/spaces`
- `POST /api/spaces`
- `POST /api/spaces/{space_id}/members`

### 3.3 审计

- `GET /api/audit`

### 3.4 对话（SSE）

- `POST /api/chat/sessions`
- `GET /api/chat/sessions/{session_id}/messages`
- `POST /api/chat/sessions/{session_id}/stream`

SSE 事件：
- `message.delta`
- `card.add`
- `done`
- `error`

### 3.5 动作

- `POST /api/actions/execute`

