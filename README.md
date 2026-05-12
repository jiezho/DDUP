# DDUP

AI 个人成长平台（FastAPI + React）+ Hermes 智能体协作。

## 目录结构

- apps/
  - api/ 后端（FastAPI）
  - web/ 原始 Web 前端
  - pc/ PC 端前端
  - mobile/ 移动端前端
- packages/shared/ 跨端共享层（样式、UI、上下文、API client）
- infra/ Docker Compose 与 Nginx 网关
- docs/ 项目文档与自动生成产物
- shared-library/ Hermes 共享库（skills registry、memory-ext、存储策略等）
- tools/ 运维与脚本

## 快速开始（本地开发）

后端：
- 参考 apps/api/README.md
- 环境变量示例：apps/api/.env.example

前端：
- apps/web、apps/pc、apps/mobile 为独立 Vite 应用
- 各自环境变量以 Vite 规则为准（以 VITE_ 前缀为主）

## Hermes（本地 Docker）

- 关键点：镜像默认执行 `hermes`（TUI/chat），要飞书联动需运行 `gateway run -v`，并将数据目录挂到 `/opt/data`。
- Compose：infra/docker-compose.hermes-main.yml
- 环境变量示例：
  - infra/.env.example（宿主机路径变量）
  - infra/.env.hermes-main.example（Hermes/MINIO 等容器内环境变量示例）

## 文档入口

- docs/README.md

## Git Hooks

仓库提供 .githooks/pre-commit.ps1（生成 OpenAPI/DB schema + 预防敏感信息误提交）。
如需启用：将 Git hooksPath 指向 .githooks（或把脚本复制到 .git/hooks/）。
