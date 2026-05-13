# Hermes 升级操作手册

## 1. 目标

本手册用于指导 DDUP 中 Hermes 多实例相关能力的升级、验证与回滚，覆盖：

- 共享库结构与注册表
- API 与 Hermes 治理接口
- 三端前端管理台
- 部署配置与流水线

## 2. 升级前检查

### 2.1 代码与分支

- 确认本地工作区干净：`git status --short`
- 确认当前主分支名称与 CI 配置一致
- 确认本次升级包含哪些层：`apps/api`、`apps/web|pc|mobile`、`shared-library`、`infra`

### 2.2 运行时前置条件

- `DDUP_PATH` 已配置且可访问 `shared-library`
- `HERMES_INSTANCE_ID` 在各实例中已配置
- 如启用对象存储，MinIO 连接参数可用
- `shared-library/registry/instances.json`、`skills-manifest.json`、`outputs/.index.json` 可读

### 2.3 备份建议

升级前至少备份以下内容：

- `shared-library/registry/instances.json`
- `shared-library/outputs/.index.json`
- `shared-library/memory-ext/`
- `shared-library/wiki/_raw/`
- `infra/docker-compose.prod.yml`
- `.env` 与相关部署环境变量

## 3. 推荐升级顺序

### 3.1 第一步：升级共享库与文档基线

适用于以下改动：

- 注册表字段变化
- 技能清单变化
- `memory-ext`、`wiki`、`outputs` 目录结构变化
- 运维与审计文档更新

检查项：

- 注册表 JSON 结构合法
- 新旧实例字段兼容
- 新技能已同步到 `skills-manifest.json`

### 3.2 第二步：升级后端 API

适用于以下改动：

- `apps/api/app/api/hermes.py`
- `apps/api/app/services/hermes_registry.py`
- 未来的 `hermes_actions.py`

升级时必须确认：

- API 容器可读取 `DDUP_PATH/shared-library`
- `apps/api/Dockerfile` 与 Compose 挂载策略匹配
- `/api/hermes/overview`、`/api/hermes/instances`、`/api/hermes/skills` 可用

### 3.3 第三步：升级前端管理台

适用于以下改动：

- `packages/shared/src/lib/hermes.ts`
- `packages/shared/src/pages/HermesAdminPage.tsx`
- `packages/shared/src/pages/MeWorkspacePage.tsx`
- `apps/web|pc|mobile/src/App.tsx`

升级时必须确认：

- 三端都能进入 `/me/hermes`
- 页面展示与后端契约一致
- 不再依赖过时或重复的 API 封装

### 3.4 第四步：升级部署与流水线

适用于以下改动：

- `infra/docker-compose.prod.yml`
- `infra/nginx/nginx.conf`
- `.github/workflows/deploy.yml`

升级时必须确认：

- CI 监听分支与当前主分支一致
- API 与 shared-library 变更被纳入发布范围
- 网关仍能正确代理 `/api/*` 和前端分流

## 4. 分层验证清单

### 4.1 后端验证

- `python -m pytest tests/test_hermes_api.py -q`
- `/api/hermes/overview` 返回 200
- `/api/hermes/instances` 返回实例列表
- `/api/hermes/search?q=test` 返回结构化结果
- 如果引入写接口，要补充对应动作测试

### 4.2 前端验证

- `npm run build` in `apps/web`
- `npm run build` in `apps/pc`
- `npm run build` in `apps/mobile`
- 三端访问 `/me/hermes` 无路由错误
- 管理台展示实例状态、技能、搜索结果正常

### 4.3 部署验证

- `gateway` 健康
- `api` 健康
- `minio` 健康
- `api` 容器内可读 `shared-library/registry/instances.json`
- API 返回的数据与仓库中的注册表一致

### 4.4 多实例验证

- `hermes-main` 可读 shared-library
- `hermes-research` 可读 shared-library
- `hermes-devops` 可读 shared-library
- 跨实例搜索能覆盖目标来源
- 新注册实例可在 UI 中被发现

## 5. 高风险点

| 风险 | 触发方式 | 应对 |
| --- | --- | --- |
| API 容器读不到 `shared-library` | Dockerfile 或 Compose 没有正确挂载 | 升级前先在容器内检查 `DDUP_PATH` 和目标文件 |
| 状态字段不兼容 | `active` / `online` 混用 | 升级时统一做状态归一化 |
| 能力字段不兼容 | `capabilities` 对象与数组混用 | 升级时先改后端和共享类型，再改页面展示 |
| CI 不触发 | workflow 监听 `main`，仓库运行在 `master` | 升级前先修正 workflow 或统一分支 |
| 只读页面误当作全功能后台 | 未完成写接口就直接发布操作入口 | 先完成后端动作接口与权限控制，再开放操作按钮 |

## 6. 回滚策略

### 6.1 配置回滚

- 回滚 `infra/docker-compose.prod.yml`
- 回滚 `.env` / 部署变量
- 回滚网关配置与 workflow 文件

### 6.2 代码回滚

- 回滚 `apps/api`、`packages/shared`、`apps/web|pc|mobile` 到上一个稳定提交
- 若回滚涉及共享库结构，优先恢复注册表和 `outputs/.index.json`

### 6.3 数据回滚

- 恢复 `instances.json`
- 恢复 `memory-ext/` 目录
- 恢复 `wiki/_raw/` 与 `outputs/.index.json`
- 如对象存储命名规则变化，需恢复旧映射关系

## 7. 推荐升级窗口

建议按以下窗口升级：

1. 先在本地完成测试与三端构建
2. 再在测试环境验证 API 容器对 `shared-library` 的可见性
3. 最后在生产环境切换 Compose / 镜像 / 前端构建产物
4. 发布后立即执行第 4 节验证清单

## 8. 当前版本建议

基于当前仓库现状，下一轮升级应优先处理以下事项：

1. 统一 `status` 与 `capabilities` 契约
2. 为 API 提供正式 Hermes 动作接口
3. 修复 API 容器对 `shared-library` 的运行时依赖
4. 修复 CI 分支触发与发布范围
5. 再继续扩展 Hermes 管理台的操作能力