# 仓库结构说明

## Monorepo 约定

仓库使用 npm workspaces：

- `apps/*`：可运行应用（后端/多端前端）
- `packages/*`：共享包（跨端复用）

根 workspace 配置见 [package.json](file:///e:/BaiduSyncdisk/润电/2026.04/DDUP/package.json)。

## apps

- `apps/api`：FastAPI 后端
  - 入口：`apps/api/app/main.py`
  - 路由：`apps/api/app/api/*`
  - 配置：`apps/api/app/core/config.py`（默认读取 `apps/api/.env`，示例为 `apps/api/.env.example`）
- `apps/web`：原始 Web 前端（Vite + React）
- `apps/pc`：PC 端前端（Vite + React）
- `apps/mobile`：移动端前端（Vite + React）

## packages/shared

跨端共享层（样式、UI、上下文、API client）。在多端应用中以 workspace 依赖方式复用。

## infra

部署与编排（docker-compose、Nginx 网关等）：

- `infra/docker-compose.yml`：本地依赖（如 PostgreSQL）
- `infra/docker-compose.prod.yml`：生产编排
- `infra/docker-compose.hermes-main.yml`：Hermes 主实例编排（本地/服务器均可参考）
- `infra/nginx/nginx.conf`：网关路由（含 UA 分流）

## docs

文档统一入口：`docs/README.md`。其中：

- `docs/generated/`：自动生成产物（OpenAPI、DB schema、测试记录输出等）
- `docs/ui/`、`docs/design-system/`：UI 与设计系统文档
- `docs/dev/`：研发说明（Actions、仓库结构等）

## shared-library

Hermes 共享库（技能注册表、记忆外溢、同步策略、存储策略等），与各 Hermes 实例通过 `DDUP_PATH` 约定协同。
