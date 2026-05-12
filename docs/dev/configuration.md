# 配置与密钥规范

## 基本原则

- 仓库只提交示例文件：`*.example`（或 `*.template`）
- 真实密钥只保存在部署机/本机的 `.env` 文件或密钥管理系统中
- 严禁提交：SSH 私钥、`.env`、带真实 token 的注册表覆盖文件

## 环境变量入口

- 后端（FastAPI）：`apps/api/.env`（示例：`apps/api/.env.example`）
- Hermes（Docker）：数据目录挂载到 `/opt/data`，对应 `/opt/data/.env`（示例：`infra/.env.hermes-main.example`）
- 基础设施（Compose 变量）：`infra/.env`（示例：`infra/.env.example`）
- 生产示例：根目录 `.env.prod.example`

## Hermes（本地 Docker）关键点

- 需要飞书/消息平台联动时，以 `gateway run -v` 启动
- 数据/配置目录以 `/opt/data` 为准（HERMES_HOME），不要把宿主目录挂到 `/root/.hermes`

## 共享库注册表

- 默认注册表：`shared-library/registry/instances.json`（建议保持脱敏）
- 本地覆盖（不进 Git）：`shared-library/registry/instances.local.json`
