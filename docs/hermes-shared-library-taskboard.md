# Hermes Shared Library 任务看板（对照 design/implementation 缺口）

本文档基于以下两份方案文档，对当前仓库实现做差距分析，并整理为可执行任务看板（含验收标准与测试验证方案）：

- [hermes-shared-library-design.md](./hermes-shared-library-design.md)
- [hermes-shared-library-implementation.md](./hermes-shared-library-implementation.md)

范围说明：

- 以“共享库目录结构 + published skills + API 网关 + Cron 归档 + Wiki 编译 + 隔离策略”为主。
- 任务以 Epic（目标域）组织，每个任务给出验收标准与验证方式（自动化优先，其次为可重复的手动验证步骤）。

---

## 测试与验证基线

### 后端（FastAPI）

- 测试框架：pytest（见 [apps/api/pytest.ini](file:///e:/BaiduSyncdisk/%E6%B6%A6%E7%94%B5/2026.04/DDUP/apps/api/pytest.ini) 与 [apps/api/requirements.txt](file:///e:/BaiduSyncdisk/%E6%B6%A6%E7%94%B5/2026.04/DDUP/apps/api/requirements.txt)）
- 测试位置：`apps/api/tests/`（见 [conftest.py](file:///e:/BaiduSyncdisk/%E6%B6%A6%E7%94%B5/2026.04/DDUP/apps/api/tests/conftest.py)）
- 验证原则：
  - 有 API 的功能优先补充 TestClient 覆盖。
  - 依赖外部服务（如 MinIO）优先提供“可选集成测试”与“跳过条件（环境变量）”。

### 前端（React）

- 测试框架：Vitest（`apps/web|pc|mobile` 均为 `vitest run`）
- 验证原则：
  - 对“管理台状态推导/列表渲染”等纯逻辑优先加单测。
  - 对端到端流程暂以手动回归为主（仓库当前未接入 Playwright）。
  - 若测试报 `Failed to resolve import @ddup/shared/*`，需确保 Vitest 配置与 Vite 一致的 alias（本仓库已在 `apps/*/vitest.config.ts` 补齐 `@ddup/shared` alias）。

### MinIO / 对象存储

- 当前后端存储实现直接连接 MinIO（见 [hermes_storage.py](file:///e:/BaiduSyncdisk/%E6%B6%A6%E7%94%B5/2026.04/DDUP/apps/api/app/services/hermes_storage.py)）
- 仓库提供 MinIO 编排（见 [infra/docker-compose.prod.yml](file:///e:/BaiduSyncdisk/%E6%B6%A6%E7%94%B5/2026.04/DDUP/infra/docker-compose.prod.yml#L58-L75)）
- 仓库提供手工验证脚本（见 [tools/test_minio.py](file:///e:/BaiduSyncdisk/%E6%B6%A6%E7%94%B5/2026.04/DDUP/tools/test_minio.py)）

---

## Epic A：共享库目录结构与索引数据落盘

### A1. 初始化缺失目录与默认文件（wiki / outputs / agents）

背景：

- 方案要求 `shared-library/outputs/{instance}/...`、`shared-library/wiki/{_raw,compiled,logs}/`、`agents/{instance}/private-skills/` 等目录。
- 当前仓库存在目录缺口，导致写入/编译脚本依赖路径但无法产出（见 [wiki_write.py](file:///e:/BaiduSyncdisk/%E6%B6%A6%E7%94%B5/2026.04/DDUP/shared-library/registry/published/wiki-write/scripts/wiki_write.py) 与 [wiki_compiler.py](file:///e:/BaiduSyncdisk/%E6%B6%A6%E7%94%B5/2026.04/DDUP/tools/wiki_compiler.py)）。

交付物：

- `shared-library/wiki/_raw/`、`shared-library/wiki/compiled/`、`shared-library/wiki/logs/`
- `shared-library/wiki/wiki-config.json`（最小可用配置）
- `shared-library/outputs/.index.json` 默认结构校验并可被增量更新
- 为 `instances.json` 中声明的实例初始化 `shared-library/outputs/{instance-id}/` 目录
- `agents/{instance-id}/private-skills/` 目录结构（至少占位）

验收标准：

- 所有目录与文件存在，路径与方案一致。
- Wiki 写入脚本与编译脚本在“空数据”情况下可运行并输出可读日志。

测试/验证：

- 自动化（推荐）：新增 pytest 覆盖“路径存在性 + wiki-config 解析 + 输出目录创建”。
- 手动：运行 Wiki 写入/编译脚本一次，确认 `logs/` 有新增条目，且不会因路径缺失报错。

### A2. 完善 schemas 与 config（与 design 对齐）

背景：

- 设计文档要求至少包含 instance/output/skill 等 schema，以及 platform-connections 等配置。
- 当前仅存在 [output-entry.schema.json](file:///e:/BaiduSyncdisk/%E6%B6%A6%E7%94%B5/2026.04/DDUP/shared-library/schemas/output-entry.schema.json)，config 也不齐全。

交付物：

- `shared-library/schemas/instance.schema.json`
- `shared-library/schemas/skill.schema.json`
- `shared-library/config/platform-connections.json`（最小结构，允许空配置）

验收标准：

- `instances.json` 可通过 schema 校验（至少字段存在性/类型基本正确）。
- published skills 的 `package.json`/`SKILL.md` 元信息能被校验（至少必填字段校验）。

测试/验证：

- 自动化：新增 pytest 对 schema 校验（可选：引入 jsonschema；若不引入则做最小手写校验）。

---

## Epic B：Cron 归档“双写落盘 + 索引更新”闭环

### B1. outputs 按 instance 落盘并更新全局索引

背景：

- `cron-registry.json` 已声明归档目录，但仓库无对应 outputs 产物目录。
- `.index.json` 当前为空，管理台无法从 outputs 推导真实作业状态。

交付物：

- `shared-library/outputs/{instance-id}/cron-archives/{task}/YYYY-MM-DD/` 目录真实产物
- 归档写入后自动更新 `shared-library/outputs/.index.json`

验收标准：

- 创建至少 1 条归档后，全局索引包含该 entry，且 entry 字段完整（id/time/type/instance/task 等）。

测试/验证：

- 自动化：补充 pytest 覆盖“调用归档服务后索引 entry 增量更新”。
- 手动：调用后端归档 API 后，检查对应目录与 `.index.json` 的变更。

### B2. Cron 子智能体接入归档步骤（与 implementation Phase 2 对齐）

背景：

- 方案要求对 Cron 子智能体追加归档步骤。
- 当前仓库缺少 `agents/{instance}/private-skills` 承载位置，无法证明接入完成。

交付物：

- 将至少 1 个实际 Cron 工作流接入 `cron-archive`（从技能定义/脚本调用可追溯）

验收标准：

- Cron 执行后：outputs 产生归档文件 + `.index.json` 更新 + 管理台可看到状态变化（如成功次数/最近成功时间）。

测试/验证：

- 自动化（可选集成测试）：在测试环境跑一次 Cron，断言 outputs 与索引更新（需可控时间/固定输出）。
- 手动：在本地或测试环境触发 Cron，观察 outputs 与管理台状态。

---

## Epic C：归档附件 >1MB 自动转存 MinIO

### C1. cron archive attachments 上传与回填

背景：

- 方案要求附件大于阈值（例如 1MB）转存 MinIO，并回填 `attachments` 为对象 key。
- 当前实现 `attachments` 固定空数组（见 [hermes_archive.py](file:///e:/BaiduSyncdisk/%E6%B6%A6%E7%94%B5/2026.04/DDUP/apps/api/app/services/hermes_archive.py#L82-L160)）。

交付物：

- 归档服务支持接收附件（文件/二进制/引用路径，按方案选型落地）
- 大文件上传 MinIO：bucket/key 规则与实现一致
- archive JSON 的 `attachments[]` 包含对象引用（可下载/可预签名）

验收标准：

- 构造包含大附件的归档请求后：
  - outputs 仍保存主 JSON
  - attachments 被上传至 MinIO
  - archive 返回结构中 attachments 非空且可用于下载/预签名

测试/验证：

- 自动化（分层）：
  - 单测：对附件分流逻辑（阈值/元信息）做纯函数测试
  - 集成测试（可选）：在有 MinIO 环境变量时跑上传/下载闭环；无环境时跳过
- 手动：使用 `infra/docker-compose.prod.yml` 启 MinIO 后调用 API 验证，并可用 [tools/test_minio.py](file:///e:/BaiduSyncdisk/%E6%B6%A6%E7%94%B5/2026.04/DDUP/tools/test_minio.py) 辅助确认对象存在

---

## Epic D：published skills 发布包完整性与实例注册表一致性

### D1. 补齐缺失发布包结构（SKILL.md / scripts / CHANGELOG）

背景：

- implementation 约定每个发布技能需要 SKILL.md/scripts/package.json/CHANGELOG。
- 当前 `shared-library/registry/published/` 中部分技能目录仅有 package.json，缺关键文件。

交付物：

- 对缺失项逐个补齐最小可执行结构（至少保证“能安装/能被 Hermes 识别/能运行主脚本”）

验收标准：

- `instances.json` 声明的 skills 中，被标记为 published 的条目都能在 `published/` 下找到目录与 SKILL.md。

测试/验证：

- 自动化：新增校验脚本（或 pytest）扫描 `instances.json`，确保每个 published skill 都存在且包含必要文件。

### D2. 清理或补齐 instances.json 与 published/ 的映射关系

背景：

- `instances.json` 中存在引用但仓库中没有对应 published 目录（例如 `arxiv-paper-scout` 等）。

交付物：

- 方案 A：补齐缺失的 published skills（推荐当这些技能是规划内必须落地的）
- 方案 B：调整 `instances.json`，移除或降级为 planned（若短期不做）

验收标准：

- 通过静态校验：`instances.json` 中无“指向不存在的 published skill”的 active 条目。

测试/验证：

- 自动化：同 D1 的一致性扫描覆盖。

---

## Epic E：Wiki 多实例编译链路闭环

### E1. 落地 wiki-config.json 并完成一次编译产物生成

背景：

- implementation Phase 5 要求 `wiki-config.json`，并生成 compiled 产物。
- 当前缺少目录与配置，导致后端运行态检查判定 pending（见 [hermes_archive.py](file:///e:/BaiduSyncdisk/%E6%B6%A6%E7%94%B5/2026.04/DDUP/apps/api/app/services/hermes_archive.py#L195-L200)）。

交付物：

- `shared-library/wiki/wiki-config.json`（包含多实例 raw 目录与输出配置）
- `shared-library/wiki/compiled/` 中生成至少一个实例的索引或可检索产物

验收标准：

- 运行编译工具后：compiled 目录有产物，logs 有本次编译记录。
- 后端运行态检查从 pending 变为 ok/active（按现有契约实现）。

测试/验证：

- 自动化：pytest 调用编译入口（如为 CLI 工具则用 subprocess）并断言产物存在。
- 手动：运行一次编译，检查 `compiled/` 与 `logs/`。

---

## Epic F：跨实例查询隔离规则真正执行

### F1. cross-instance-query 读取并执行 isolation-rules.json

背景：

- 设计中有明确的访问控制矩阵。
- 当前脚本未读取规则文件，仅做了“非本实例降级 summary”的硬编码（见 [cross_query.py](file:///e:/BaiduSyncdisk/%E6%B6%A6%E7%94%B5/2026.04/DDUP/shared-library/registry/published/cross-instance-query/scripts/cross_query.py#L74-L83)）。

交付物：

- 实现 isolation rules 的解析与决策（allow/deny/summary-only/field-mask 等按方案裁剪）
- 对跨实例查询结果应用策略

验收标准：

- 构造两种实例身份：对同一目标实例查询时返回结果不同（full vs summary/deny），且行为与规则一致。

测试/验证：

- 自动化：为 `cross_query.py` 抽离“规则决策函数”，用单测覆盖多组规则组合。
- 手动：准备两套 instance id，在同一份 outputs 数据上对比查询结果。

---

## Epic G：API 契约路径对齐（/api/shared-library vs /api/hermes）

### G1. 决定并落地对外路由前缀策略

背景：

- design 文档写 `/api/shared-library/*`，实际实现为 `/api/hermes/*`（见 [hermes.py](file:///e:/BaiduSyncdisk/%E6%B6%A6%E7%94%B5/2026.04/DDUP/apps/api/app/api/hermes.py#L47-L48)）。

交付物（两种选一）：

- 方案 A：新增 `/api/shared-library/*` 兼容路由映射到现有 Hermes 路由（推荐：对外契约更贴合共享库命名）
- 方案 B：更新 design/implementation 文档，将对外契约统一为 `/api/hermes/*`

验收标准：

- 文档与代码一致；OpenAPI（如有生成流程）与实际路由一致。

测试/验证：

- 自动化：pytest 覆盖两个前缀下关键接口的行为一致（若采用方案 A）。

---

## 建议执行顺序（从“堵点”到“闭环”）

1. A1（目录/配置最小可用）→ E1（Wiki 编译闭环）→ B1（归档落盘+索引）  
2. D1/D2（发布包与注册表一致）  
3. F1（隔离规则执行）  
4. C1（附件转存 MinIO）  
5. G1（API 契约对齐）
