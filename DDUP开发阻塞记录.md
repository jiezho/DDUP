# DDUP 开发阻塞记录

> 记录开发过程中遇到的“环境/依赖/权限/网络/资源”类阻塞问题。每条包含：现象、影响范围、临时绕过、根因假设、下一步处理。

## 记录

### 1. create-vite 需要更高 Node 版本

- 现象：运行 `npx create-vite@latest` 报 `required node: ^20.19.0 || >=22.12.0`，并出现 `node:util does not provide an export named styleText`。
- 影响：无法用最新脚手架初始化前端工程。
- 临时绕过：使用兼容 Node 16 的旧版脚手架（例如 `create-vite@4`）初始化，或升级 Node 到 >=20 后再用最新版本。
- 根因假设：当前环境 Node 版本为 v16.15.0，低于 create-vite@9 的要求。
- 下一步：若后续依赖需要 Vite5+/更高生态，优先升级 Node；否则先以 Vite4 完成 MVP。

### 2. npx 拉取脚手架长时间无输出

- 现象：执行 `npx --yes create-vite@4 ...` 长时间无输出，疑似卡在下载/网络阶段。
- 影响：无法通过脚手架自动生成前端工程文件。
- 临时绕过：改为手工创建 `apps/web` 的最小 Vite+React 工程文件，再运行 `npm install`（若网络仍不通则先提交代码骨架，待网络恢复后再补依赖安装与测试）。
- 根因假设：网络访问 npm registry 受限或缓存/代理配置异常。
- 下一步：必要时配置 npm registry/代理，或准备离线依赖镜像源。

### 3. Docker daemon 未运行导致无法启动 PostgreSQL

- 现象：执行 `docker compose up -d` 报 `docker daemon is not running`，无法连接 `//./pipe/docker_engine`。
- 影响：无法通过 `infra/docker-compose.yml` 启动本地 PostgreSQL（pgsql）。
- 临时绕过：后端使用 SQLite 作为开发运行数据库（仅用于本地跑通前后端联调），通过 `apps/api/.env` 设置 `DATABASE_URL=sqlite+pysqlite:///./ddup.db`。
- 根因假设：本机 Docker Desktop/daemon 未启动或被权限策略限制。
- 下一步：启动 Docker Desktop 后重试；恢复到 PostgreSQL 以贴近目标架构。

### 4. Trae 非交互式 SSH 无法使用带口令的私钥

- 现象：通过 `ssh -i ...` 执行远端命令时，提示 `Enter passphrase`；Trae 终端非交互执行无法输入口令，导致自动化失败或回退到密码登录。
- 影响：无法在 Trae 中全自动执行 192.168.102.204 的安装/部署脚本。
- 临时绕过：在本机终端手动执行 SSH（输入口令）运行 `tools/remote_setup_204.sh`；或改用无口令的专用部署密钥（权限最小化）。
- 根因假设：当前私钥为加密私钥（ed25519 + passphrase），且运行环境无可用 ssh-agent/askpass。
- 下一步：新增专用 deploy key（无口令、仅用于内网发布机、限制 authorized_keys command/来源IP），或配置 ssh-agent 并在 Trae 会话中预先解锁密钥。

### 5. Ubuntu 24.04 默认源缺少 docker-compose-plugin

- 现象：在 192.168.102.204（Ubuntu noble）执行 `apt-get install docker-compose-plugin` 报 `Unable to locate package docker-compose-plugin`。
- 影响：无法使用 `docker compose` 子命令进行生产编排部署。
- 临时绕过：切换使用 Docker 官方 apt 源安装 `docker-ce` 与 `docker-compose-plugin`（已更新 tools/remote_setup_204.sh 自动处理）。
- 根因假设：当前服务器 apt 源未包含该包（或版本仓库不同）。
- 下一步：统一发布机的 Docker 安装来源（官方源/内网镜像），避免环境差异。

### 6. 发布机访问 GitHub 可能出现 TLS 连接中断

- 现象：在 192.168.102.204 执行 `git clone https://github.com/jiezho/DDUP.git` 报 `GnuTLS recv error (-110): The TLS connection was non-properly terminated.`。
- 影响：无法从 GitHub 拉取代码，发布流程中断。
- 临时绕过：git 操作强制使用 HTTP/1.1，并增加重试（已更新 tools/remote_setup_204.sh）；如仍失败，需评估企业网络策略/代理或改用内网镜像仓库。
- 根因假设：网络质量/中间设备对 TLS 或 HTTP/2 连接有干扰。
- 下一步：确认发布机对 GitHub 的稳定访问路径（直连/代理/内网镜像），固化为标准发布方案。

### 7. 发布机访问 Docker Hub 超时导致镜像拉取失败

- 现象：在 192.168.102.204 构建/拉取基础镜像（python/node/nginx）时报 `i/o timeout`，无法连接 `registry-1.docker.io:443`。
- 影响：无法构建并启动 docker compose（API/Web）。
- 临时绕过：配置 Docker registry mirror（当前使用 DaoCloud：`https://docker.m.daocloud.io`），重启 docker 后重试。
- 根因假设：网络策略或链路质量导致 Docker Hub 访问不稳定。
- 下一步：如有企业内网镜像源，建议替换为内网 mirror 并纳入发布机基线。
