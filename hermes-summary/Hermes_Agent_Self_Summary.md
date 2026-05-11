# Hermes Agent 自我总结报告

> 生成时间：2026-05-11  
> 版本：Hermes Agent v0.13.0 (2026.5.7)  
> 运行模型：glm-5.1-fp8 (custom provider, 131K context)  
> 运行环境：Docker 容器 (WSL2), 持久化存储于 Windows D: 盘

---

## 一、系统架构概览

### 1.1 部署架构

| 项目 | 详情 |
|------|------|
| **运行方式** | Docker 容器化部署，运行于 Windows WSL2 环境 |
| **持久化存储** | `/opt/data/` — 1TB ext4 独立分区（已用 18G），挂载自宿主机 |
| **配置挂载** | `D:\` 盘通过 9p 协议挂载至 `/root/.hermes`（读写） |
| **只读挂载** | `E:\` 盘通过 9p 挂载至 `/host/e`（只读） |
| **Python 环境** | 系统环境 `/opt/hermes/.venv` (root-owned)；用户环境 `~/research-env` (含科研包) |
| **更新方式** | 需在 Windows 宿主机拉取新 Docker 镜像并重建容器 |

### 1.2 数据存储结构

```
/opt/data/
├── memories/              # 持久化记忆 (MEMORY.md + 锁文件)
├── sessions/              # 会话历史 (10个 JSONL 文件, ~6.7MB)
├── skills/                # 技能库 (12MB)
│   ├── .hub/              # Skill Hub 索引缓存 (2065 个可安装技能)
│   ├── autonomous-ai-agents/
│   ├── creative/
│   ├── data-science/
│   ├── devops/
│   ├── github/
│   ├── mcp/
│   ├── media/
│   ├── mlops/
│   ├── note-taking/
│   ├── productivity/
│   ├── research/
│   ├── software-development/
│   └── ... (共 25 个分类目录)
├── home/
│   ├── config.yaml        # 主配置文件
│   ├── cron/              # 定时任务
│   ├── cache/             # 缓存目录
│   └── .env               # 环境变量
└── config.yaml            # 全局配置
```

---

## 二、核心能力清单

### 2.1 工具集 (Toolsets)

| 工具集 | 说明 |
|--------|------|
| **Browser** | 无头浏览器：导航、点击、填写、截图、视觉分析 |
| **Terminal** | Shell 命令执行：前台/后台进程、PTY 交互模式 |
| **File** | 文件读写、搜索 (ripgrep)、补丁编辑 |
| **Web** | 网页搜索、内容提取 |
| **Code Execution** | Python 脚本批量执行 (5分钟超时, 50次工具调用上限) |
| **Delegate Task** | 子 Agent 派遣：并行任务、编排协调 |
| **Cronjob** | 定时任务管理：创建/调度/监控 |
| **Memory** | 跨会话持久记忆：用户画像 + 系统笔记 |
| **Skills** | 技能加载/管理/创建/补丁更新 |
| **Session Search** | 历史会话全文检索 |
| **Vision** | 图像/截图视觉分析 |
| **Image Gen** | AI 图像生成 |
| **TTS** | 文本转语音 |
| **Feishu** | 飞书文档读写、评论、消息发送 |
| **Todo** | 会话级任务清单管理 |
| **Patch** | 模糊匹配文件编辑 |

### 2.2 已安装技能 (93 个，25 个分类)

#### 🔬 研究与学术 (Research)
| 技能 | 功能 |
|------|------|
| `scholar-research` | 学术全流程：论文检索(arXiv/Semantic Scholar/Google Scholar)、文献综述、引用分析 |
| `arxiv` | arXiv 论文搜索（关键词/作者/分类/ID） |
| `llm-wiki` | LLM 知识库：构建与查询 Markdown 互连知识图谱 |
| `patent-writing` | 专利文档撰写：权利要求书、说明书、摘要 |
| `research-paper-writing` | ML 论文写作：NeurIPS/ICML/ICLR 规范 |
| `blogwatcher` | 博客/RSS 监控 |
| `web-content-extraction` | 网页内容提取（微信文章、SPA、静态站） |
| `polymarket` | 预测市场数据查询 |

#### 💻 编程与开发 (Software Development)
| 技能 | 功能 |
|------|------|
| `coding-workspace` | 编程工作台：Claude Code/Codex/OpenCode 子 Agent |
| `remote-coding-orchestrator` | 远程编程编排：飞书监控编程任务 |
| `claude-code` / `codex` / `opencode` | 编程 Agent 委派 |
| `subagent-driven-development` | 子 Agent 驱动开发（2阶段审查） |
| `writing-plans` / `plan` | 实施计划编写 |
| `test-driven-development` | TDD：RED-GREEN-REFACTOR |
| `systematic-debugging` | 4阶段根因调试 |
| `python-debugpy` | Python 调试 (pdb + debugpy DAP) |
| `requesting-code-review` | 预提交代码审查 |
| `hermes-agent-skill-authoring` | 技能文档编写 |

#### 🎨 创意与可视化 (Creative)
| 技能 | 功能 |
|------|------|
| `architecture-diagram` | 暗色 SVG 架构图 (HTML) |
| `excalidraw` | 手绘风格图表 (架构/流程/时序) |
| `baoyu-infographic` | 信息图：21布局 × 21风格 |
| `baoyu-comic` | 知识漫画生成 |
| `claude-design` | HTML 原型设计 |
| `p5js` | p5.js 生成艺术 |
| `manim-video` | Manim 数学动画 |
| `comfyui` | ComfyUI 图像/视频/音频生成 |
| `popular-web-designs` | 54种设计系统复刻 (Stripe/Linear/Vercel等) |
| `pixel-art` | 像素画 (NES/Game Boy/PICO-8 调色板) |

#### 📊 数据科学 (Data Science)
| 技能 | 功能 |
|------|------|
| `jupyter-live-kernel` | 实时 Jupyter 内核交互 |
| `scientific-plotting` | 科研作图：matplotlib/SciencePlots/seaborn/plotly |

#### 🏢 生产力工具 (Productivity)
| 技能 | 功能 |
|------|------|
| `feishu-docs` | 飞书文档：创建/写入/权限管理（通过 API） |
| `report-and-proposal-writing` | 方案与汇报文档写作（中文商务/科研） |
| `google-workspace` | Gmail/Calendar/Drive/Docs/Sheets |
| `notion` | Notion API 操作 |
| `powerpoint` | PPT 创建/编辑 |
| `ocr-and-documents` | PDF/扫描件文字提取 |
| `nano-pdf` | PDF 文字编辑 |
| `airtable` / `linear` | 项目管理工具 API |
| `maps` | 地理编码/POI/路线 |

#### 🤖 AI/ML运维 (MLOps)
| 技能 | 功能 |
|------|------|
| `huggingface-hub` | HF 模型/数据集管理 |
| `llama-cpp` | 本地 GGUF 推理 |
| `serving-llms-vllm` | vLLM 高吞吐推理服务 |
| `axolotl` / `fine-tuning-with-trl` / `unsloth` | LLM 微调 |
| `evaluating-llms-harness` | LLM 基准评测 (MMLU/GSM8K等) |
| `dspy` | 声明式 LM 程序与 RAG 优化 |
| `weights-and-biases` | 实验追踪 |

#### 🔗 平台集成
| 技能 | 功能 |
|------|------|
| `github-*` (6个) | GitHub 全流程：认证/仓库/PR/Issue/Code Review |
| `native-mcp` | MCP 客户端：连接外部工具服务器 |
| `xurl` | X/Twitter 发帖/搜索 |
| `spotify` | Spotify 播放控制 |
| `youtube-content` | YouTube 转录/摘要 |
| `himalaya` | 终端邮件 (IMAP/SMTP) |
| `obsidian` | Obsidian 笔记读写 |
| `yuanbao` | 元宝群组交互 |

### 2.3 Skill Hub 可用技能池

| 指标 | 数据 |
|------|------|
| **可安装技能总数** | 2,065 个 |
| **来源** | Official (官方内置) + Lobehub (社区) |
| **分类覆盖** | 安全、金融、区块链、生物信息、健康、法律、设计、DevOps 等 50+ 领域 |
| **安装方式** | `hermes skills install <name>` 即装即用 |

---

## 三、当前运行的任务与业务

### 3.1 活跃定时任务 (Cron Jobs)

| 任务名 | 调度 | 功能 |
|--------|------|------|
| **Hermes版本更新检测** | 每日 09:00 | 脚本检测新版本，自动通知 |
| **飞书文档-功能清单自动更新** | 每日 10:00 | 自动采集 Hermes 状态并更新飞书文档 |

### 3.2 已开展的业务项目

| 项目 | 状态 | 说明 |
|------|------|------|
| **AI原生具身智能巡检平台** | 🟢 活跃 | 产品原型设计文档 + 开发技术方案已完成，存于飞书 |
| **Hermes功能清单飞书文档** | 🟢 自动化 | Cron 每日自动更新 |
| **学术论文检索** | ✅ 可用 | scholar-research + arXiv 技能链 |
| **实时新闻搜集推荐** | ✅ 可用 | blogwatcher + web-content-extraction |
| **灵感记录整理** | ✅ 可用 | Obsidian + 飞书文档 + memory |
| **术语推荐** | ✅ 可用 | llm-wiki + 学术检索 |

### 3.3 飞书文档资产

| 文档 | DOC_ID | 用途 |
|------|--------|------|
| Hermes功能清单与数据持久化状态 | `RGQxdZnv7oPlJgxBv3icDma9nvd` | 自动更新状态看板 |
| 产品原型设计文档 | `S789dzIZvolmWaxUanycqRpCnBk` | 巡检平台产品设计 |
| 开发技术方案设计文档 | `QaKGdj0dfoJ6KDxtZgWcAapCngx` | 巡检平台技术方案 |

---

## 四、数据资产与持久化机制

### 4.1 记忆系统 (Memory)

| 维度 | 详情 |
|------|------|
| **存储位置** | `/opt/data/memories/MEMORY.md` |
| **容量上限** | ~2,200 字符（当前已用 89%, ~1,960 字符） |
| **两类存储** | `user` (用户画像/偏好) + `memory` (系统笔记/环境事实) |
| **注入机制** | 每轮对话自动注入，保持跨会话连续性 |
| **写入原则** | 声明式事实（非指令），偏好/纠正 > 环境事实 > 过程知识 |

### 4.2 会话历史 (Sessions)

| 维度 | 详情 |
|------|------|
| **存储格式** | JSONL 文件，按时间戳命名 |
| **当前会话数** | 10 个 |
| **占用空间** | ~6.7 MB |
| **检索方式** | `session_search` 工具：关键词/短语/布尔表达式全文检索 |

### 4.3 技能库 (Skills)

| 维度 | 详情 |
|------|------|
| **已安装** | 93 个（25 个分类） |
| **可安装** | 2,065 个（Skill Hub 索引） |
| **占用空间** | ~12 MB |
| **结构** | 每个技能含 SKILL.md + 可选 references/templates/scripts/ 子目录 |
| **生命周期** | create → patch → edit → delete；支持 pin 保护 |

### 4.4 其他持久化数据

| 类型 | 位置 | 说明 |
|------|------|------|
| 定时任务 | `/opt/data/home/cron/` | 2 个活跃任务 |
| 配置文件 | `/opt/data/config.yaml` | 模型/工具集/平台/代理配置 |
| 环境变量 | `/opt/data/home/.env` | API密钥/平台凭证 |
| 缓存 | `/opt/data/home/cache/` | 临时文件 |
| 检查点 | 自动管理 | 最多50个快照，7天保留 |

---

## 五、平台连接与通信

### 5.1 已连接平台

| 平台 | 状态 | 功能 |
|------|------|------|
| **飞书 (Feishu/Lark)** | ✅ 已连接 | DM 消息收发、文档 CRUD、评论回复、定时推送 |
| **本地文件系统** | ✅ 已连接 | 读写 WSL 及 Windows 挂载盘 |
| **CLI** | ✅ 可用 | hermes-cli 工具集 |
| **Telegram** | 🔧 已配置 | 环境变量已设置 |
| **Discord** | 🔧 已配置 | 环境变量已设置 |

### 5.2 消息投递能力

| 目标 | 格式 | 说明 |
|------|------|------|
| 当前对话 | `origin` | 回复到触发源 |
| 飞书 DM | `feishu:<chat_id>[:thread_id]` | 支持话题定位 |
| Telegram | `telegram:<chat_id>[:thread_id]` | 支持话题 |
| Discord | `discord:<channel_id>[:thread_id]` | 支持线程 |
| 本地文件 | `local` | 仅保存不推送 |

---

## 六、核心特性分析

### 6.1 多智能体协作能力

| 特性 | 说明 |
|------|------|
| **子 Agent 派遣** | `delegate_task` 支持并行 spawn，默认最多 3 个并发子 Agent |
| **编排深度** | `max_spawn_depth=1`（可配置至 2+，启用 orchestrator 模式） |
| **角色类型** | `leaf`（纯执行者）/ `orchestrator`（可再派遣） |
| **工具集隔离** | 每个 subagent 可独立配置可用工具集 |
| **外部编程 Agent** | 支持 Claude Code / Codex / OpenCode / Trae 的 ACP 集成 |

### 6.2 自动化与调度能力

| 特性 | 说明 |
|------|------|
| **Cron 调度** | 支持 cron 表达式、ISO 时间戳、简写（30m/every 2h 等） |
| **无 Agent 模式** | `no_agent=true`：纯脚本执行，stdout 直接投递（watchdog 模式） |
| **有 Agent 模式** | 定时触发 Agent 推理，支持 skill 加载和上下文注入 |
| **任务链** | `context_from`：上游 Cron 输出注入下游任务上下文 |
| **工作目录** | `workdir`：指定项目目录，注入 CLAUDE.md/AGENTS.md |

### 6.3 知识管理与推理

| 特性 | 说明 |
|------|------|
| **持久记忆** | 跨会话事实记忆，自动注入每轮对话 |
| **会话搜索** | 历史对话全文 FTS5 检索 |
| **技能系统** | 过程性知识以 SKILL.md 存储，按需加载 |
| **MCP 扩展** | 原生 MCP 客户端，动态发现外部工具 |
| **检查点** | 自动快照，支持回滚 |

### 6.4 安全与治理

| 特性 | 说明 |
|------|------|
| **审批模式** | `approvals.mode: manual`（需手动确认危险操作） |
| **工具循环防护** | 精确失败/同类失败/幂等无进展 的警告与硬停止 |
| **沙箱隔离** | 终端/浏览器/文件系统各自隔离 |
| **凭证管理** | 环境变量注入，`credential_pool_strategies` 支持多凭证池 |

---

## 七、云端共享库适配分析

> 基于上述能力，针对「多智能体云端共享库」设计方案的适配性分析。

### 7.1 当前可对接的共享方案

| 方案 | 适配能力 | 当前状态 | 备注 |
|------|----------|----------|------|
| **GitHub 仓库** | ⭐⭐⭐⭐⭐ | 已有 `github-*` 全套技能 | 代码/Skills/文档版本管理，天然适合 |
| **LLM Wiki** | ⭐⭐⭐⭐ | 已有 `llm-wiki` 技能 | Markdown 互连知识图谱，适合知识共享 |
| **云盘存储** | ⭐⭐⭐ | Google Drive (gws) 可用 | 材料/报告存储，但中文生态支持弱 |
| **飞书云文档** | ⭐⭐⭐⭐⭐ | 已深度集成 | 文档协作/权限管理/自动更新，当前主力 |
| **Skill Hub** | ⭐⭐⭐⭐⭐ | 已内置 `.hub` 索引(2065技能) | 技能发现/安装/版本管理，天然共享层 |
| **Obsidian** | ⭐⭐⭐ | 已有技能 | 本地知识库，可同步至 Git |

### 7.2 隔离需求分析

| 隔离维度 | 当前机制 | 共享库设计建议 |
|----------|----------|----------------|
| **Skills 隔离** | 按 category 分目录，每个 Skill 独立 SKILL.md | 按智能体 ID 命名空间隔离，共享层按 category 组织 |
| **Memory 隔离** | 单一 MEMORY.md (~2.2KB上限)，user/memory 双存储 | 需要按智能体 ID 分区存储，共享记忆需独立命名空间 |
| **Session 隔离** | 按 chat_id 隔离的 JSONL 文件 | 已天然隔离，共享时需统一索引 |
| **产出物存储** | 无统一存储，散落在各处 | 需建立标准化产出目录结构 |

### 7.3 产出物分类与存储建议

```
shared-library/
├── knowledge/                    # 知识库
│   ├── papers/                   # 论文检索成果
│   ├── news/                     # 新闻搜集推荐
│   ├── terminology/              # 术语库
│   └── inspiration/              # 灵感记录
├── reports/                      # 整理报告
│   ├── weekly/                   # 周报
│   ├── research/                 # 研究报告
│   └── technical/                # 技术报告
├── skills/                       # 技能共享
│   ├── shared/                   # 全局共享技能
│   ├── agent-A/                  # Agent A 专属技能
│   └── agent-B/                  # Agent B 专属技能
├── memories/                     # 记忆共享
│   ├── shared/                   # 共享记忆（跨Agent可读）
│   ├── agent-A/                  # Agent A 私有记忆
│   └── agent-B/                  # Agent B 私有记忆
├── materials/                    # 原始材料
│   ├── downloads/                # 下载文件
│   ├── datasets/                 # 数据集
│   └── media/                    # 媒体资源
└── wiki/                         # LLM Wiki 互连知识图谱
    ├── index.md
    └── ...
```

### 7.4 技术实现路径建议

| 优先级 | 方案 | 实现方式 | 适配度 |
|--------|------|----------|--------|
| P0 | **GitHub 仓库** | 私有 Repo + Git Submodule/ subtree 按智能体隔离 | 技能/文档/配置版本控制 |
| P0 | **Skill Hub** | 基于 `.hub` 机制扩展，自定义技能注册中心 | 技能发现与共享 |
| P1 | **飞书云文档** | 继续深化，作为在线协作与展示层 | 报告/文档协作 |
| P1 | **LLM Wiki** | 统一知识图谱，各 Agent 贡献节点 | 知识互连与检索 |
| P2 | **云盘存储** | 对接对象存储（S3/MinIO/阿里云OSS） | 大文件/材料存储 |
| P2 | **Obsidian Vault** | Git 同步的共享 Vault | 个人知识管理 |

---

## 八、限制与改进方向

### 8.1 当前限制

| 限制 | 影响 | 潜在解决方向 |
|------|------|-------------|
| Memory 容量仅 ~2.2KB | 无法存储大量跨会话知识 | 外部知识库 + RAG 检索 |
| 单实例部署 | 无法多 Agent 物理隔离并行 | 多容器部署 + 消息总线 |
| 容器内无 sudo | 无法安装系统包 | 预构建镜像 / 挂载用户 venv |
| 无原生向量数据库 | 语义搜索依赖外部 | 集成 Chroma/FAISS (Skill Hub 可装) |
| 飞书 API 在 execute_code 不可用 | 批量操作受限 | 用 terminal+curl 替代 |
| 9p 挂载性能有限 | Windows 盘 IO 较慢 | 热数据放 /opt/data (ext4) |

### 8.2 共享库设计需重点解决的问题

1. **命名空间隔离**：Skills 和 Memory 需按 Agent ID 隔离，同时支持共享区
2. **版本管理**：技能和知识的版本化、变更追溯
3. **权限模型**：读/写/管理权限的精细化控制
4. **同步机制**：多 Agent 间的数据同步与冲突解决
5. **发现机制**：Agent 如何发现和引用其他 Agent 的产出
6. **索引与检索**：跨 Agent 的统一搜索能力

---

## 九、总结

Hermes Agent 作为一个功能完备的 AI 智能体平台，具备以下核心优势适配云端共享库建设：

1. **技能体系成熟**：93 个已安装技能 + 2065 个可安装技能，覆盖研究、编程、创意、MLOps 全链条
2. **多平台已打通**：飞书深度集成 + GitHub + Google Workspace + Notion 等
3. **自动化就绪**：Cron 调度 + 子 Agent 编排 + Webhook 触发
4. **知识管理有基础**：LLM Wiki + Memory + Session Search + Skill Hub
5. **容器化可扩展**：Docker 部署模式天然支持多实例扩展

主要差距在于：**缺乏多实例协调机制**、**Memory 容量过小**、**缺少统一产出物存储规范**。这些正是云端共享库设计需要重点补齐的能力。
