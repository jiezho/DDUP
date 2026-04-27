# Obsidian Wiki 与 Hermes 集成方案（用于 DDUP）

## 1. 目标

- 将 DDUP 的“对话/复盘/论文笔记/技术决策/操作手册”等非结构化知识，沉淀为可浏览、可链接、可追溯的 Obsidian Vault（Markdown Wiki）。
- 通过 Hermes Agent 的“长期运行 + 定时任务 + 工具调用”，按增量持续维护 Wiki，而不是每次问模型都从零检索。
- 通过可选的 `visibility/*` 标签，实现“对内/对外”可见性控制，降低外发风险。

## 2. 核心思路（LLM Wiki Pattern）

将知识从“即时检索/即时回答”转为“持续编译/持续更新”。

- **Vault 是事实层**：Obsidian Vault 保存结构化的 Markdown 页面与双链关系。
- **Hermes 是维护者**：定期运行一组技能（ingest/update/lint/export），把新来源编译进 Vault。
- **DDUP 是业务承载**：结构化业务数据继续落 PostgreSQL；Wiki 承担“解释性、可读性、可追溯”的长期知识层。

## 3. 组件与边界

### 3.1 组件清单

- **DDUP Web/API**：现有业务系统。
- **Hermes Agent（生产部署）**：已在 `192.168.102.204` 以 `hermes-gateway.service` 运行。
- **obsidian-wiki 技能集**：一组 Markdown 技能（`wiki-setup / wiki-ingest / wiki-update / wiki-query / wiki-lint / wiki-export / hermes-history-ingest ...`）。
- **Obsidian Vault（Wiki 存储）**：服务器上的一个目录，作为长期知识库。

### 3.2 数据归属

- **结构化事实**（待办/术语学习状态/习惯打卡/图谱实体关系等）：仍以 DDUP PostgreSQL 为准。
- **解释性知识**（总结、决策原因、方法论、论文笔记、操作手册、项目沉淀）：以 Vault 为准。
- **对外输出**：优先由 Wiki 页面（或 Wiki Query 的 filtered 模式）生成，保证可追溯与可控。

## 4. Vault 目录规范（建议）

建议按 obsidian-wiki 推荐结构初始化（由 `wiki-setup` 自动生成）：

- `index.md`：全量索引
- `log.md`：编译/更新日志
- `.manifest.json`：来源与增量追踪
- `_meta/taxonomy.md`：受控标签
- `_insights.md`：结构分析输出
- `_raw/`：原始素材暂存
- `projects/`：项目沉淀（每项目一页）
- `concepts/ entities/ skills/ references/ synthesis/ journal/`：通用知识分类

DDUP 侧建议统一将“待编译素材”先写入 Vault 的 `_raw/`，由 Hermes 定时将其提升为正式页面。

## 5. DDUP 与 Wiki 的集成点（具体到产品需求）

### 5.1 首页对话（Hermess Agent）

- 新增动作：`action.type = wiki.capture_raw`
  - 输入：`space_id`、`title`、`content`、`tags[]`、`sources[]`
  - 行为：写入 Vault `_raw/YYYYMMDD-HHMM-<slug>.md`
  - 要求：写入内容必须包含 `sources`（对话引用、网页链接、文件/论文 id）

### 5.2 学习/术语

- 术语解释页建议沉淀到 Vault：
  - `concepts/<Term>.md`：解释、例子、常见误区、与 DDUP 术语库条目互链
- DDUP 中仅保存：学习状态/复习间隔/掌握度等。

### 5.3 论文/文件/资讯

- DDUP 中保存：元数据、索引、权限。
- Wiki 中保存：可读的论文笔记、方法综述、与相关概念/项目的交叉链接。

### 5.4 知识图谱

- `wiki-export` 可输出 `graph.json/graphml/cypher`。
- 可作为 DDUP 图谱的导入/同步来源：
  - 最小实现：导入 `graph.json` 生成/更新 `graph_entities/relations`。

### 5.5 统计/复盘

- DDUP 生成结构化指标与复盘卡。
- Wiki 生成“可长期阅读、可被链接引用”的复盘页：
  - `journal/<YYYY-MM-DD>-weekly-review.md`
  - 支持 `visibility/public` 输出到飞书/微信。

## 6. 可见性与安全

### 6.1 `visibility/*` 标签

- `visibility/public`：可对外分享
- `visibility/internal`：内部使用
- `visibility/pii`：敏感信息

默认不启用过滤；只有当用户明确提出“public only / user-facing / no internal content”等语义时，才启用过滤。

### 6.2 权限与隔离

- Vault 建议放在服务器本地目录（非 git 公开仓库）。
- Hermes 以独立用户运行，Vault 目录权限收敛为仅 `hermes` 可写。
- 如 DDUP 需要读取 Wiki，可通过“只读导出目录”或后续提供 API 读取（默认不建议 DDUP 直接写 Vault，避免并发冲突）。

## 7. 生产部署落地（推荐做法）

### 7.1 Vault 路径建议

- 目录：`/opt/ddup/wiki-vault`
- 所有权：`hermes:hermes`
- 权限：目录 `700`（或 `750` 配合只读组）

### 7.2 安装 obsidian-wiki 技能到 Hermes

在 `hermes` 用户下将 obsidian-wiki 的 `.skills/*` 链接到 Hermes 的 `~/.hermes/skills/`，并创建 `~/.obsidian-wiki/config`：

- `OBSIDIAN_VAULT_PATH=/opt/ddup/wiki-vault`
- `OBSIDIAN_WIKI_REPO=/opt/hermes/obsidian-wiki`

### 7.3 定时任务（Hermes cron）

建议每 1 小时运行一次：

- `wiki-update`：同步“当前项目沉淀”（依赖 git delta）
- `wiki-ingest`：处理 `_raw/` 暂存
- `cross-linker`：自动补链
- `wiki-lint`：健康检查

输出文件（index/log/manifest）天然可审计。

## 8. 迭代路线（从 MVP 到增强）

- **MVP（1-2 天）**：
  - Vault 初始化 + Hermes 接入 obsidian-wiki skills + 定时 ingest/update + DDUP 增加 `wiki.capture_raw` 动作。
- **增强（1-2 周）**：
  - `wiki-export` 与 DDUP 图谱导入联动；Wiki 页面在 DDUP 内嵌只读浏览。
- **高级（后续）**：
  - 引入 QMD 或向量索引（语义检索）；多空间隔离策略（按 space 目录或多 vault）。
