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
