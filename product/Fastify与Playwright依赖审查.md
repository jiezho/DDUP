# Fastify 与 Playwright 依赖审查

> 版本：V1.6  
> 日期：2026-08-24  
> 状态：已按 G2/G3 授权安装；Chromium headless shell 与真实浏览器验收已完成  
> 范围：Fastify 作为本地 HTTP 适配层的生产依赖；Playwright Test 作为浏览器 E2E 开发依赖  
> 约束：安装不授权浏览器公网服务、真实数据接入或对外分发；正式业务 Schema 仍按已确认 G3 契约和垂直切片建立

## 1. 结论

G3 通过后已采用以下精确版本：

| 包 | 建议版本 | 类型 | 结论 |
|---|---:|---|---|
| `fastify` | `5.12.1` | production | 已安装并精确锁定；HTTP Adapter 保持可替换 |
| `@playwright/test` | `1.62.1` | development | 已安装并精确锁定；对应 Chromium headless shell 已下载 |

安装未使用 `latest` 或宽泛范围，lock 已更新。Fastify 本地安全基础路由与注入测试已经建立；Playwright 仅使用虚构数据、回环地址并阻断外部请求。

## 2. 审查方法和时间快照

截至 2026-08-24：

- npm 官方注册表将 Fastify `5.12.1` 标为 latest；主包 15 个直接依赖。
- npm 官方注册表将 `@playwright/test` `1.62.1` 标为 latest；依赖精确匹配的 `playwright` `1.62.1`，再依赖 `playwright-core` `1.62.1`。
- 所有版本、许可证、engines 和 unpacked size 均通过 npm 元数据及本地安装复核；相关包没有 install script。
- Fastify v5 仍在官方 LTS 范围；官方政策说明受支持主版本会跟随 Node LTS，并提醒安全修复有时可能以 minor 版本带来兼容变化，因此本项目使用精确版本和显式升级评审。
- Playwright 每个版本绑定具体浏览器修订，升级包版本后通常需要重新安装浏览器，故包与浏览器缓存必须使用相同版本键。

## 3. Fastify 审查

### 3.1 用途与边界

只用于：

- 本机 `127.0.0.1` HTTP 服务器与路由注册；
- REST、SSE、请求生命周期和测试注入；
- 把请求交给独立 Application/Domain 层；
- 输出统一错误、request ID 和响应 Schema。

明确不用于：

- 承载领域规则或权限真源；
- 根据用户输入动态注册插件/Schema；
- 直接开放局域网/公网；
- 取代 Zod 业务契约、Repository 或 Tool Gateway。

### 3.2 维护状态与兼容性

| 项目 | 结论 |
|---|---|
| 当前主版本 | v5，官方 main 分支与 LTS 文档对应 |
| Node 兼容 | 官方 LTS 政策支持受支持 Node LTS；项目固定 Node 24.15+，需在安装后跑契约测试 |
| 社区治理 | OpenJS Foundation At-Large 项目，公开发布与安全通告 |
| 更新策略 | package 与 lock 精确为 `5.12.1`；月度/安全通告触发升级，不静默跟随 minor |
| 已知安全背景 | v5.8.5 曾修复 Content-Type 前导空格导致的 Body Schema 验证绕过；当前建议版本高于该修复版本，但安装后仍执行 audit/route 回归 |

### 3.3 许可证

- Fastify 主包：MIT。
- 官方 npm 页面列出的生产依赖许可证集合为 MIT、ISC、BSD-3-Clause、BSD-2-Clause。
- 与本地内部 MVP 兼容；若未来对外分发，仍需把精确 lock 的第三方 notices 纳入全仓许可证统一评审。

### 3.4 体积与依赖面

| 指标 | 官方 npm 元数据 |
|---|---:|
| Fastify 主包 unpacked size | 2,984,609 bytes（约 2.85 MiB） |
| 直接依赖 | 15 |

直接依赖包含 Pino、Avvio、Find My Way、Ajv/fast-json-stringify 编译器等。累计安装体积应在实际 lock 后用脚本测量，不能用主包大小冒充完整闭包大小。

### 3.5 安全配置基线

| 风险 | 强制控制 |
|---|---|
| 代理头伪造 | `trustProxy: false`；本地模式不信任 `X-Forwarded-*` |
| Host/DNS rebinding | Host/端口 allowlist，中间件早于路由 |
| 大请求/慢请求 | 显式 `bodyLimit`、`requestTimeout`、`handlerTimeout` 和 SSE 例外策略 |
| Schema 代码生成 | Schema 只能来自版本控制内的静态应用代码；禁止用户/Runtime 提供 Schema |
| 验证泄露 | 自定义错误格式；不返回完整 Ajv 路径、内部字段和请求正文 |
| 额外字段 | Zod/JSON Schema 拒绝或移除未知字段，并在契约测试中固定语义 |
| 文件路径 | URL 参数永不直接作为文件路径；必须转为对象 ID 并走受控存储 |
| 业务授权 | 每请求/对象/动作调用 Policy；Fastify Schema 不等于业务权限 |
| 插件供应链 | MVP 仅安装核心 Fastify，不同时引入 CLI、自动加载或社区插件 |

Fastify 官方明确指出：验证/序列化会编译 Schema，用户提供的 Schema 不安全；默认验证错误可能暴露细节；请求数据和代理/Host 元数据都应视为不可信输入。因此上述控制进入应用工厂验收，而不是停留在文档。

### 3.6 替代方案与退出

| 方案 | 优点 | 代价/决定 |
|---|---|---|
| 原生 `node:http` | 零新增框架依赖、控制完全 | 自建路由、生命周期、错误、SSE 和测试注入；保留为退出方案 |
| 继续 Vite 插件 | 无新服务入口 | 开发工具与业务服务继续耦合；不采用 |
| Express/Hono 等 | 生态或体积各有优势 | 当前没有相对 Fastify 的决定性收益；不增加对照依赖 |

退出条件：支持状态下降、无法在 Node 24/目标系统稳定运行、安全通告响应不足、或 Adapter 契约证明原生实现显著更简单。领域层不得导入 Fastify，确保退出可行。

## 4. Playwright Test 审查

### 4.1 用途与边界

只用于开发/CI：

- PC、移动视口、键盘焦点和对话框可访问性流程；
- 项目垂直切片、权限拒绝、幂等重放、备份恢复 UI 的真实浏览器验收；
- 失败时生成受控 trace/screenshot，使用合成数据并遵守短期保留。

不进入生产运行依赖，不把 Playwright 浏览器打包进本地应用，不把测试浏览器开放为远程自动化服务。

### 4.2 维护状态与兼容性

| 项目 | 结论 |
|---|---|
| 建议版本 | `1.62.1` stable，精确锁定 |
| Node engines | `>=20`；与 Node 24 基线兼容，安装后实测 |
| 操作系统 | 官方支持 Windows、Linux、macOS；满足 Windows/Linux CI 规划 |
| 浏览器 | Chromium、Firefox、WebKit；MVP 先 Chromium，发布阶段再评估 WebKit/Firefox smoke |
| 版本耦合 | 每个 Playwright 版本需要指定浏览器二进制；包升级和浏览器缓存必须同步 |

### 4.3 许可证

- `@playwright/test`、`playwright`、`playwright-core` npm 元数据：Apache-2.0。
- 浏览器二进制拥有各自许可证和 notices；当前只作为开发/CI 下载缓存，不提交仓库、不随产品分发。
- 全仓许可证未统一前，继续遵守 G2 A15：仅本地内部开发/合成演示，不公开发布新制品。

### 4.4 体积

| 包/资产 | 官方数据 |
|---|---:|
| `@playwright/test` unpacked | 28,544 bytes |
| `playwright` unpacked | 5,074,152 bytes |
| `playwright-core` unpacked | 13,442,086 bytes |
| npm 代码合计（不含 optional/transitive） | 约 17.69 MiB |
| 官方文档示例：Chromium 缓存 | 约 281 MiB |
| 官方文档示例：Firefox 缓存 | 约 187 MiB |
| 官方文档示例：WebKit 缓存 | 约 180 MiB |

MVP 只安装 Chromium headless shell：

```text
npx playwright install --only-shell chromium
```

Linux CI 需要系统依赖时使用经过固定版本 lock 的：

```text
npx playwright install --with-deps --only-shell chromium
```

浏览器缓存按 Playwright 精确版本分键；不把数百 MB 浏览器写入 npm package 或 Git。

### 4.5 安全和隐私基线

| 风险 | 强制控制 |
|---|---|
| 可执行浏览器下载 | 仅官方 CLI/CDN或批准的内部镜像；版本与 lock 一致；CI 不运行未知测试分支的持久凭据 |
| Trace/截图泄露 | 仅合成数据；失败产物默认本地/CI 7 天，上传前隐私扫描 |
| 测试访问真实环境 | 默认 `baseURL` 为回环；禁止生产账号、真实 Cookie 和私人 Vault fixture |
| 并行不稳定 | CI 初期 workers=1；需要并行时先消除共享状态 |
| 网络不确定 | E2E 默认阻断非本地请求；需要外部资源时使用 mock/fixture |
| 浏览器缓存漂移 | package 版本、cache key 和 browser revision 同步更新 |
| UI 假通过 | 使用 role/label/focus/可见性断言，不只检查 DOM 字符串 |

### 4.6 替代方案与退出

| 方案 | 评价 |
|---|---|
| Node Test + DOM 字符串 | 保留单元/契约测试，但不能证明真实浏览器焦点、布局和 PWA 行为 |
| Selenium/WebDriver | 跨语言成熟，但驱动管理和本项目 Node 集成成本更高 |
| 仅人工截图 | 适合探索，不可重复证明回归和权限流程 |

退出条件：目标环境无法稳定安装浏览器、CI 成本显著超过收益、版本/浏览器供应链无法锁定，或出现更小方案能覆盖相同真实浏览器验收。即使退出，浏览器端到端验收要求不能被删除。

## 5. 安装与验收结果

截至 2026-08-24：

1. `fastify@5.12.1` 和 `@playwright/test@1.62.1` 已精确安装并写入 lock；
2. Fastify、Playwright、Playwright Core 的许可证分别为 MIT、Apache-2.0、Apache-2.0，均未发现 install script；
3. 本地实际目录大小约为 Fastify 2.94 MiB、Playwright Test 0.03 MiB、Playwright 4.84 MiB、Playwright Core 12.82 MiB，不含浏览器缓存；
4. 新增 `/api/health`、本地一次性启动凭证、会话、CSRF、Host/Origin 防护、能力矩阵和 OpenAPI 基础契约；
5. Fastify 基础契约测试 6/6 通过，实际回环监听 smoke 通过且测试后端口已关闭；
6. 完整测试 178/178 通过，无跳过；生产构建、隐私扫描、SQLite quick spike 均通过；
7. React Router 已从 7.9.4 更新至 7.18.2，Vite 已从 6.4.2 更新至 6.4.3，并更新了受影响的传递依赖；
8. 初始审计的 7 项告警已消除 6 项，剩余原项目既有 `xlsx@0.18.5` 的 high 告警；该问题不是 Fastify/Playwright 引入，处置见 `旧版XLSX导入依赖处置_待确认.md`；
9. 已下载与 Playwright 1.62.1 匹配的 Chromium headless shell 151.0.7922.34（约 114.5 MiB，仅本地测试缓存，不进产品包）；
10. 项目工作台真实浏览器闭环 1/1 通过，覆盖跨来源 bootstrap 拒绝、项目创建、刷新持久化、编辑、状态转换、里程碑、任务状态流、人工讨论确认转决策/任务、文本/链接 Capture、今日聚焦、任务同步、日终复盘、受控 Markdown Source、统一全文检索和全局搜索跳转，以及 PC/390px 移动视口；截图只含合成数据；
11. Linux CI 已增加锁定依赖下的 Chromium 安装和 E2E 步骤，远端执行证据仍待实际 CI 运行。

当前可以继续不依赖 XLSX 的本地服务和项目垂直切片工作，但发布门保持阻塞，直至 XLSX 告警按用户确认的方案消除或相应旧功能被禁用。

## 6. 参考依据

- [Fastify npm 包与版本](https://www.npmjs.com/package/fastify)
- [Fastify LTS 政策](https://fastify.dev/docs/latest/Reference/LTS/)
- [Fastify MIT License](https://github.com/fastify/fastify/blob/main/LICENSE)
- [Fastify Validation and Serialization 安全说明](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/)
- [Fastify Request 不可信输入说明](https://fastify.dev/docs/latest/Reference/Request/)
- [Fastify Security Advisories](https://github.com/fastify/fastify/security/advisories)
- [Playwright Test npm 包与版本](https://www.npmjs.com/package/%40playwright/test)
- [Playwright 官方仓库与 Apache-2.0 标识](https://github.com/microsoft/playwright)
- [Playwright 浏览器安装、版本绑定和体积](https://playwright.dev/docs/browsers)
- [Playwright CI 建议](https://playwright.dev/docs/ci)
