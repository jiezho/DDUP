# DDUP 前端拆分与部署方案

## 1. 架构调整
本工程已通过 npm workspaces 重构为 Monorepo，目录结构如下：
- `apps/pc`：PC 端独立工程
- `apps/mobile`：移动端独立工程
- `packages/shared`：包含网络请求 `api` 层、全局 `contexts` (如 displayMode) 以及基础 `ui` 组件，供 PC 和 Mobile 共同引用。

## 2. 本地开发
在根目录执行依赖安装：
```bash
npm install
```
启动 PC 端：
```bash
npm run dev --workspace=apps/pc
```
启动 Mobile 端：
```bash
npm run dev --workspace=apps/mobile
```

## 3. Nginx 路由与自动跳转
使用 `infra/nginx/nginx.conf` 部署 Nginx 代理网关。
- 监听 `80` 端口。
- 自动根据 `User-Agent` 区分移动端和 PC 端设备。
- 访问 `www.example.com` 时：
  - 如果是移动设备，将返回 `302` 重定向到 `m.example.com`。
  - 如果是 PC 设备，请求反向代理到 `apps/pc` 容器。
- 访问 `m.example.com` 时：
  - 如果是 PC 设备，将返回 `302` 重定向到 `www.example.com`。
  - 如果是移动设备，请求反向代理到 `apps/mobile` 容器。
- `/api/` 和 `/healthz` 统一反向代理到 FastAPI 后端 (`api:8000`)。

## 4. 灰度发布与回滚机制
### 4.1 灰度发布方案
网关层（如 Nginx 或 API Gateway）可通过配置权重或基于 Cookie/Header 的路由策略实现灰度。
- **Header 路由**：测试阶段通过在请求中加入特定的 Header（如 `X-DDUP-Version: beta`），Nginx 根据该 Header 代理到 `pc-beta` 容器。
- **权重分流**：使用 Nginx 的 `split_clients` 模块，将 5% 的流量代理到新版本容器，剩余 95% 代理到旧版本容器。

### 4.2 版本回滚
由于 Docker 化部署，所有的前端镜像或构建产物都带有版本 Tag。
如果出现线上问题，回滚流程为：
1. 找到上一个稳定版本的 Docker 镜像。
2. 更改 `docker-compose.prod.yml` 中的镜像版本 Tag。
3. 执行 `docker-compose up -d pc mobile` 进行重启。
秒级完成回滚操作。

## 5. CI/CD 流水线
参考 `.github/workflows/deploy.yml` 提供了基于 GitHub Actions 的构建流程：
- 监听 `main` 分支的推送事件。
- 初始化 Node 环境并执行 `npm install`。
- 并行执行 `apps/pc` 和 `apps/mobile` 的 `npm run build`。
- 将打包结果 `dist` 与 Dockerfile、Nginx 配置文件通过 SSH 推送到目标服务器（如 `192.168.102.204`）。
- 在目标服务器执行 `docker-compose build && docker-compose up -d` 重新构建与拉起容器。

## 6. 运维与监控
- **日志监控**：Nginx `access.log` 会收集请求时长、HTTP 状态码。若发现 5xx 错误剧增或 `api_server` 无响应，触发预警。
- **容器监控**：部署 `Prometheus + cAdvisor` 监控 Docker 容器的内存/CPU 占用情况。
- **前端监控**：可在 PC 和 Mobile 的 `index.html` 中引入前端埋点 SDK（如 Sentry 或自研上报系统），捕获页面 JS 报错并上报到后端。
