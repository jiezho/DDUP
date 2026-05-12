# Power-Agent 平台技术方案

> 版本：v3.0 | 日期：2026-04-15 | 基于 hermes-agent + A2UI 协议

---

## 目录

1. [系统总览](#1-系统总览)
2. [用户与鉴权](#2-用户与鉴权)
3. [Hermes 实例与 Agent 生命周期](#3-hermes-实例与-agent-生命周期)
4. [知识管理（LLM Wiki）](#4-知识管理llm-wiki)
5. [技能管理（Skills）](#5-技能管理skills)
6. [前端交互层（A2UI）](#6-前端交互层a2ui)
7. [Session 与记忆管理](#7-session-与记忆管理)
8. [模型网关与调度](#8-模型网关与调度)
9. [Template 市场与分发](#9-template-市场与分发)
10. [定时任务（Cron）](#10-定时任务cron)
11. [网关与消息平台](#11-网关与消息平台)
12. [安全与审计](#12-安全与审计)
13. [可观测性与运维](#13-可观测性与运维)
14. [接口规范](#14-接口规范)
15. [成本估算](#15-成本估算)
16. [非功能性需求](#16-非功能性需求)
17. [里程碑与优先级](#17-里程碑与优先级)

---

## 1. 系统总览

### 1.1 系统定位

Power-Agent 是一套企业级跨平台智能对话系统，以 hermes-agent 为核心引擎，通过"SOUL.md + Skills + Wiki"配置驱动方式，将 LLM 能力改造为面向特定业务岗位的数字员工。面向约 10,000 企业用户，支持 Web / PC / 移动端多端部署。

### 1.2 核心架构：三层 + 侧车

```
┌─────────────────────────────────────────────────────────────────────┐
│                        统一前端展现层 (Client)                        │
│   Web (React/A2UI Renderer) │ PC (Tauri) │ Mobile (Flutter)        │
│   A2UI 协议解析 → 原生组件渲染 │ 对话流输入 │ 路径A(iframe)/路径B(A2UI) │
├─────────────────────────────────────────────────────────────────────┤
│                        调度网关层 (Gateway Cluster)                   │
│   ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌──────────────┐ │
│   │ 鉴权网关    │  │ Session路由│  │ 负载均衡    │  │ A2UI 代理    │ │
│   │ (SSO/JWT)  │  │ (用户→实例) │  │ (Nginx/LB) │  │ (SSE/WS)    │ │
│   └────────────┘  └────────────┘  └────────────┘  └──────────────┘ │
├─────────────────────────────────────────────────────────────────────┤
│                     Hermes 实例池 (K8s Pod per User)                 │
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐       ┌──────────────┐         │
│  │ Pod: user-001│  │ Pod: user-002│  ...  │ Pod: user-N  │         │
│  │ ~/.hermes/   │  │ ~/.hermes/   │       │ ~/.hermes/   │         │
│  │  SOUL.md     │  │  SOUL.md     │       │  SOUL.md     │         │
│  │  memories/   │  │  memories/   │       │  memories/   │         │
│  │  skills/     │  │  skills/     │       │  skills/     │         │
│  │  wiki/       │  │  wiki/       │       │  wiki/       │         │
│  │  state.db    │  │  state.db    │       │  state.db    │         │
│  │  config.yaml │  │  config.yaml │       │  config.yaml │         │
│  └──────────────┘  └──────────────┘       └──────────────┘         │
│       每用户独立容器，独立 SQLite，独立文件系统                         │
├─────────────────────────────────────────────────────────────────────┤
│                     平台服务层 (Platform Services)                    │
│   ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────────┐ │
│   │ 用户服务  │ │ 模板市场  │ │ 模型网关  │ │ 密钥管理(Vault)       │ │
│   │ (PG)     │ │ (PG+S3)  │ │ (路由+配额)│ │ (API Key/OAuth)     │ │
│   └──────────┘ └──────────┘ └──────────┘ └──────────────────────┘ │
│   ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────────┐ │
│   │ 审计服务  │ │ CI/CD    │ │ 监控采集  │ │ Wiki全局同步          │ │
│   │ (PG)     │ │ (Gitea)  │ │ (OTel)   │ │ (PG + MinIO)        │ │
│   └──────────┘ └──────────┘ └──────────┘ └──────────────────────┘ │
├─────────────────────────────────────────────────────────────────────┤
│                     数据与存储层                                      │
│   PostgreSQL │ Redis Cluster │ MinIO (对象存储) │ 内部 Gitea         │
├─────────────────────────────────────────────────────────────────────┤
│                     基础设施层                                        │
│   Kubernetes │ GPU集群 │ 内部HuggingFace │ 弹性伸缩(HPA/VPA)        │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.3 核心设计原则

| 原则 | 说明 |
|------|------|
| **容器/用户隔离** | 每用户一个 Hermes Pod，独立文件系统、独立 SQLite、零数据交叉 |
| **配置驱动** | 不修改 hermes-agent 代码，通过 SOUL.md + Skills + Wiki 配置驱动 |
| **路径A优先 + 路径B降级** | 已有系统界面优先调用（iframe/Webview），无匹配时 A2UI 动态生成 |
| **A2UI 声明式安全** | 纯数据无代码执行，组件白名单（catalog），跨端原生渲染 |
| **冻结快照 + 热记忆** | Session 开始时加载记忆快照保持前缀缓存，运行中新记忆通过工具返回值即时可见 |
| **渐进式弹性** | 闲置 Pod 自动缩容，按需冷启动，GPU 按队列调度 |
| **能买不造** | 复用 Hermes Skills Hub、A2UI 生态、HuggingFace 模式 |

### 1.4 万级用户架构关键决策

| 问题 | 决策 | 理由 |
|------|------|------|
| 并发实例如何管理？ | K8s Pod/用户，HPA弹性伸缩 | Hermes 单实例不支持并发写，容器隔离最自然 |
| 10K Pod 同时运行？ | 按需启停，活跃用户约 20%，常驻 ~2K Pod | 闲置 Pod 5min 无活动自动缩容 |
| Session 数据在哪？ | 每用户 SQLite（Pod内）+ 审计日志集中PG | 无并发写冲突，审计/分析走集中存储 |
| 模板如何分发到万级实例？ | Template 市场 API → Pod 启动时/热加载拉取 | 不走 CI/CD 流水线，走 Hub 协议 |
| 全局知识如何同步？ | 全局 Wiki 存 MinIO，Pod 启动时挂载 + 增量同步 | 只读全局 Wiki，本地 Wiki 可写 |

---

## 2. 用户与鉴权

### 2.1 用户分类与权限

| 功能域 | 一类用户（平台管理员，~20人） | 二类用户（场景建设者，~200人） | 三类用户（终端用户，~10,000人） |
|--------|---------------------------|---------------------------|----------------------------|
| 平台管理 | 完全控制 | 只读仪表盘 | 无 |
| 用户管理 | 增删改查 | 无 | 无 |
| Hermes实例 | 全局管理 | 自身+下属模板 | 仅自身实例 |
| Agent模板 | 审批发布 | 创建/编辑/提交 | 使用（订阅模板） |
| Wiki知识 | 全局Wiki管理 | 领域/本地Wiki维护 | 本地Wiki贡献 |
| Skills | 全局Skills管理 | 场景Skills开发/提交 | 使用 |
| 模型管理 | 部署/切换/配额 | 查看可用模型 | 无感使用 |
| Template市场 | 审批/下架 | 提交/上架 | 浏览/下载 |
| 审计日志 | 完全访问 | 自身操作记录 | 无 |
| Cron任务 | 全局管理 | 自身+模板定义 | 自身实例 |

### 2.2 登录与认证

| 方式 | 优先级 | 说明 |
|------|--------|------|
| **SSO（企业统一认证）** | P0 | SAML 2.0 / OAuth 2.0，对接控股 SSO |
| 润工作扫码登录 | P1 | 润工作（飞书企业版）开放平台 OAuth |
| 账号密码 | P2 | 兜底方案，仅测试环境 |
| API Key | P1 | 供系统集成和 Hermes Gateway 使用 |

**认证流程：**

```
用户请求 → 平台网关拦截 → JWT校验
  ├─ 有效 → 解析用户ID → 查询 Pod 状态
  │         ├─ Pod 运行中 → 路由到用户 Hermes 实例
  │         └─ Pod 已缩容 → 冷启动 → 路由
  ├─ 过期 → Refresh Token 自动续签
  └─ 无效 → 重定向 SSO 登录页
```

**Token 策略：**

| 参数 | 值 | 说明 |
|------|-----|------|
| Access Token 有效期 | 2小时 | JWT，含用户ID、角色、厂区、订阅模板列表 |
| Refresh Token 有效期 | 7天 | HttpOnly Cookie |
| API Key 有效期 | 1年（可配置） | 存储于 Vault，开发环境可用 .env |
| Token 存储 | Redis Cluster | 支持即时吊销，万级并发读写 |

### 2.3 鉴权模型：RBAC + ABAC

```
RBAC（角色）：
  platform_admin / scene_builder / scene_builder_advanced / end_user

ABAC（属性，动态判定）：
  属性：用户厂区、订阅模板、数据敏感等级、操作时段
  规则：深汕公司用户只能访问深汕厂站数据
```

### 2.4 数据隔离

| 隔离层级 | 机制 | 说明 |
|---------|------|------|
| **实例级** | K8s Pod 隔离 + NetworkPolicy | 每用户独立容器，Pod 间默认拒绝互访 |
| **厂站级** | ABAC 规则 | 用户只能访问所属厂区数据 |
| **领域级** | 模板权限 | 场景建设者只能编辑所属领域的 Wiki 和模板 |
| **Session级** | Hermes Profile | 用户只能访问自己的 Session 历史 |

---

## 3. Hermes 实例与 Agent 生命周期

### 3.1 实例模型：容器/用户

```
┌─────────────────────────────────────────────────┐
│            K8s Pod: hermes-user-{uid}            │
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │  Hermes Agent 进程                          │  │
│  │  - AIAgent (run_agent.py)                  │  │
│  │  - Gateway Runner (API Server mode)        │  │
│  │  - Cron Scheduler                          │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │  ~/.hermes/ (Persistent Volume)             │  │
│  │  ├── config.yaml    # 系统全局配置           │  │
│  │  ├── .env           # API密钥(Vault注入)     │  │
│  │  ├── auth.json      # OAuth凭证(Vault注入)   │  │
│  │  ├── SOUL.md        # 代理身份定义           │  │
│  │  ├── AGENTS.md      # 项目级上下文(SOP)      │  │
│  │  ├── memories/      # 持久化记忆             │  │
│  │  │   ├── MEMORY.md  # Agent个人笔记          │  │
│  │  │   └── USER.md    # 用户画像              │  │
│  │  ├── skills/       # 技能目录               │  │
│  │  │   ├── (模板预装skills)                    │  │
│  │  │   ├── (用户自生成skills)                  │  │
│  │  │   └── .hub/     # Skills Hub状态          │  │
│  │  ├── wiki/         # 业务知识目录            │  │
│  │  │   ├── raw/      # 原始文献(只读)          │  │
│  │  │   ├── index.md  # 内容索引               │  │
│  │  │   ├── log.md    # 变更日志               │  │
│  │  │   ├── entities/ # 实体页面               │  │
│  │  │   ├── concepts/ # 概念页面               │  │
│  │  │   ├── procedures/# 流程页面              │  │
│  │  │   ├── sources/  # 来源摘要               │  │
│  │  │   ├── analyses/ # 查询回写               │  │
│  │  │   ├── global/   # 全局Wiki(只读挂载)      │  │
│  │  │   └── domain/   # 领域Wiki(只读挂载)      │  │
│  │  ├── cron/         # 定时任务                │  │
│  │  │   └── jobs.json                          │  │
│  │  ├── sessions/     # 会话数据                │  │
│  │  ├── logs/         # 日志(自动脱敏)          │  │
│  │  ├── hooks/        # Gateway钩子             │  │
│  │  ├── plugins/      # 用户插件                │  │
│  │  ├── scripts/      # Cron辅助脚本            │  │
│  │  └── state.db      # SQLite(WAL+FTS5)       │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│  Volume: hermes-pv-{uid} (持久化)                │
│  CPU: 0.5-2 core | Memory: 1-4GB | Disk: 5GB    │
└─────────────────────────────────────────────────┘
```

### 3.2 灵魂三件套

| 文件 | 职责 | Hermes 机制 | 说明 |
|------|------|------------|------|
| **SOUL.md** | 定风格 | 系统提示词 slot #1，身份锚点 | "我是谁"——人格、调性、行为准则 |
| **USER.md** | 定对象 | memories/ 下，冻结快照注入系统提示词 | "服务谁"——用户画像、岗位角色 |
| **AGENTS.md** | 定流程 | 项目级上下文文件，自动发现（CWD→Git Root） | "怎么做"——SOP、约束规则、工作方法论 |

- `MEMORY.md`（Agent 个人笔记）独立于三件套，由 Agent 自主维护，记录环境事实/工具经验
- `AGENTS.md` 定位为"流程上下文"——可随项目/场景切换，SOUL.md 和 USER.md 更稳定
- 冻结快照模式：Session 开始时加载三件套快照，中期修改仅写磁盘不改 Prompt（保持前缀缓存）

### 3.3 Pod 生命周期

```
用户登录 → 网关查询 Pod 状态
  │
  ├─ Pod 不存在 → 从 Template 镜像创建
  │    1. K8s Job 创建 Pod
  │    2. 挂载 PV（已有则复用）
  │    3. 从 Vault 注入 .env / auth.json
  │    4. 从 Template 市场拉取订阅的 SOUL.md + skills + wiki
  │    5. 启动 Hermes API Server（端口 8642）
  │    6. 健康检查通过 → 注册到网关路由表
  │
  ├─ Pod 已缩容 → 冷启动恢复
  │    1. 从 PV 恢复数据（已持久化）
  │    2. 重新注入凭证
  │    3. 启动 Hermes → 健康检查 → 注册路由
  │
  └─ Pod 运行中 → 直接路由

  闲置检测：5min 无活动 → 优雅停机流程 → Pod 缩容（PV 保留）
```

**优雅停机流程：**

```
缩容信号 (SIGTERM) → Hermes 收到信号
  │
  ├─ 1. 停止接受新消息（网关摘除路由）
  ├─ 2. 等待当前 Skill 执行完成（最多 30s）
  ├─ 3. 等待当前推理请求完成（最多 60s）
  ├─ 4. SQLite WAL checkpoint (PRAGMA wal_checkpoint(TRUNCATE))
  ├─ 5. Cron 任务状态持久化到 jobs.json
  └─ 6. 进程退出 → K8s 删除 Pod（PV 保留）
```

### 3.4 Template 组装

**公式：** `hermes-template = 1 × SOUL.md + N × Skills + Wiki文件夹`

| 组装动作 | 运维平台操作 |
|---------|------------|
| 选择/编写 SOUL.md | 在线编辑器，预设行业模板 |
| 选择 Skills | 从 Skills 库勾选，支持按领域筛选 |
| 配置 Wiki | 从全局 Wiki 库选择领域包 + 可自定义补充 |
| 配置 AGENTS.md | 定义项目级 SOP 和检索规则 |
| 配置 config.yaml | 模型选择、终端后端、压缩策略等 |
| 预览测试 | 沙箱环境端到端验证 |
| 发布 | 提交审批 → 安全扫描 → 上架市场 |

---

## 4. 知识管理（LLM Wiki）

### 4.1 核心理念：Wiki 是持久复利资产

基于 [Karpathy LLM Wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) 思想：

| 传统 RAG | LLM Wiki |
|---------|----------|
| 每次查询从原始文档重新推导 | 知识编译一次，持续维护 |
| 无积累，无交叉引用 | 交叉引用已在 wiki 中，矛盾已标记 |
| LLM 是检索器 | LLM 是 wiki 的程序员 |
| 人类维护知识库 | Agent 维护知识库，人类策展来源 |

**关键洞察：** 维护知识库的繁琐工作不是阅读和思考，而是交叉引用更新、摘要修订、矛盾标记、一致性维护。Agent 不厌倦，可以在一次 ingest 中触及 15 个页面。

### 4.2 三层架构

```
┌─────────────────────────────────────────────────────────┐
│  Schema 层（操作规范）                                    │
│  AGENTS.md 中定义：wiki 目录结构、页面约定、              │
│  ingest 工作流、query 行为、lint 规则                     │
│  人类与 Agent 共同演化，随领域理解加深而迭代               │
├─────────────────────────────────────────────────────────┤
│  Wiki 层（结构化知识）                                    │
│  Agent 拥有此层，完全维护：                               │
│  - 创建/更新实体页面、概念页面、流程页面                  │
│  - 维护 [[双链]] 交叉引用                                │
│  - 标记矛盾，修订摘要                                    │
│  - 将 Query 的好答案回写为新页面                          │
│  人类阅读，Agent 写入                                    │
├─────────────────────────────────────────────────────────┤
│  Raw 层（不可变原始源）                                   │
│  人类策展的原始文档集合：                                 │
│  - 文章、论文、说明书、规范、会议纪要                      │
│  - 不可变——Agent 只读，永不修改                           │
│  - 这是真相来源                                          │
└─────────────────────────────────────────────────────────┘
```

### 4.3 多级 Wiki 隔离

| 层级 | 存储 | 挂载方式 | 写权限 |
|------|------|---------|--------|
| 全局 Wiki（控股级） | MinIO + Git | Pod 启动时只读挂载到 `wiki/global/` | 一类用户通过运维平台 ingest |
| 领域 Wiki（专业级） | MinIO + Git | Pod 启动时只读挂载到 `wiki/domain/` | 二类用户通过运维平台 ingest |
| 本地 Wiki（厂站级） | 用户 PV | 本地可读写 `wiki/` 主体目录 | 三类用户通过对话交互 ingest |

**知识上行：** 本地 Wiki 的优质内容可经二类用户审核后，提升到领域 Wiki 或全局 Wiki。

**运行时同步：** 全局/领域 Wiki 更新后，通过 ConfigMap/MinIO 事件通知已运行的 Pod，Pod 内 Watcher 触发增量同步（无需重启），30s 内生效。

### 4.4 Wiki 目录结构

```
~/.hermes/wiki/
├── raw/                # 原始文献层（不可变，Agent只读）
│   ├── assets/         # 图片等本地化附件
│   │   └── *.png       # 从URL下载到本地，防止链接失效
│   ├── *.md            # Markdown原始文档
│   └── *.pdf           # PDF原始文档
├── index.md            # 内容索引（每个页面：链接+一行摘要+元数据）
├── log.md              # 变更日志（append-only，结构化前缀）
├── overview.md         # 领域总览/综合论述/演进论点
├── entities/           # 实体页面
│   ├── shenshan-plant.md     # 深汕电厂
│   ├── boiler-unit-3.md      # 3号锅炉
│   └── zhang-wei.md          # 人员
├── concepts/           # 概念页面
│   ├── ks-encoding.md        # KS编码体系
│   ├── water-wall-leak.md    # 水冷壁管泄漏
│   └── predictive-maintenance.md  # 预测性维护
├── procedures/         # 流程页面
│   ├── inspection-sop.md     # 巡检标准流程
│   ├── approval-flow.md      # 审批流程
│   └── emergency-response.md # 应急响应
├── sources/            # 来源页面（每个原始文档的摘要）
│   ├── src-boiler-manual-v2.md  # 锅炉说明书v2摘要
│   └── src-ks-standard-2024.md # KS编码标准2024摘要
├── analyses/           # 分析页面（Query回写的高价值内容）
│   ├── pressure-trend-comparison.md
│   └── fault-diagnosis-decision-tree.md
├── global/             # 全局Wiki（只读挂载，结构同上）
└── domain/             # 领域Wiki（只读挂载，结构同上）
```

### 4.5 两大导航文件：index.md 与 log.md

#### index.md（内容索引）

- **定位：** 内容导向的目录，每个 wiki 页面一行记录
- **格式：** `[[页面链接]] | 一行摘要 | 标签 | 来源数 | 最后更新`
- **更新时机：** 每次 ingest 后 Agent 自动更新
- **用途：** Agent 回答问题时先读 index.md 定位相关页面，再深入阅读
- **规模：** 中等规模（~100源，~数百页面）下无需向量 RAG，index.md 足够

```markdown
# Wiki 索引

## 实体
- [[shenshan-plant]] | 深汕电厂，2×1000MW超超临界 | #实体 #厂站 | 5源 | 2026-04-10
- [[boiler-unit-3]] | 3号锅炉，DG3000/26.15-II8型 | #实体 #锅炉 | 8源 | 2026-04-12

## 概念
- [[water-wall-leak]] | 水冷壁管泄漏机理、诊断与处置 | #概念 #故障 | 3源 | 2026-04-08
- [[ks-encoding]] | KS物资编码体系，分类规则与审批流程 | #概念 #编码 | 6源 | 2026-03-28

## 流程
- [[inspection-sop]] | 锅炉巡检标准流程，含参数阈值表 | #流程 #巡检 | 4源 | 2026-04-14
```

#### log.md（变更日志）

- **定位：** 时间导向的 append-only 记录
- **格式：** `## [YYYY-MM-DD] 操作类型 | 描述`，结构化前缀支持 `grep` 解析
- **更新时机：** 每次 ingest / query回写 / lint 后追加

```markdown
# Wiki 变更日志

## [2026-04-15] ingest | 锅炉说明书v3
- 新增来源页面: src-boiler-manual-v3
- 更新实体页面: boiler-unit-3（蒸汽参数修正）
- 更新概念页面: water-wall-leak（新增泄漏判据表）
- 标记矛盾: 蒸汽温度上限旧值541℃ vs 新值543℃（待确认）
- 影响页面数: 12

## [2026-04-14] query-back | 压力趋势对比分析
- 新增分析页面: pressure-trend-comparison
- 更新索引: index.md 新增条目
```

**grep 技巧：** `grep "^## \[" log.md | tail -5` 即可获取最近5条变更。

### 4.6 三大核心操作

#### Ingest（灌入）—— 重量级知识编译

一次 ingest 可能触及 10-15 个 wiki 页面：

| 步骤 | 说明 |
|------|------|
| 1. 投递 | 用户将文档放入 `raw/` 目录，或在对话中说"我有一份新文档" |
| 2. 读取 | Agent 读取原始文档全文 |
| 3. 讨论 | Agent 与用户讨论关键要点（可选，推荐逐源 ingest 保持参与） |
| 4. 来源页面 | 生成该文档的摘要页面到 `sources/` |
| 5. 实体更新 | 更新相关实体页面 |
| 6. 概念更新 | 更新相关概念页面 |
| 7. 流程更新 | 更新相关流程页面 |
| 8. 矛盾标记 | 新信息与已有页面矛盾时，在页面中标记 `⚠️ [待确认]` |
| 9. 双链建立 | 在相关页面间建立 `[[页面名]]` 双向链接 |
| 10. 索引更新 | 更新 `index.md` |
| 11. 日志追加 | 在 `log.md` 中记录本次 ingest 影响的所有页面 |
| 12. 总览修订 | 如有重大发现，更新 `overview.md` |

**Ingest 模式：**

| 模式 | 说明 | 适用场景 |
|------|------|----------|
| 逐源交互式 | 每次一个源，Agent 与用户讨论后再写入 | 高价值文档、初期构建 |
| 批量灌入 | 多个源一次性处理，较少监督 | 大量存量文档迁移 |

**矛盾闭环：** `⚠️ [待确认]` 标记的矛盾会在 log.md 中记录，后续 Session 启动时 Agent 主动提示用户确认。确认后自动更新页面并移除标记。

#### Query（查询）—— 问答即知识沉淀

**关键原则：好的答案应回写 wiki，而非消失在聊天历史中。**

| 步骤 | 说明 |
|------|------|
| 1. 读索引 | Agent 读取 `index.md` 定位相关页面 |
| 2. 深入阅读 | 读取相关 wiki 页面（非原始文档） |
| 3. 综合回答 | 交叉引用多个页面，生成带引用的回答 |
| 4. 回写判定 | 判断答案是否有持久价值 |
| 5. 回写 | 如有价值，生成新页面到 `analyses/` 或更新现有页面 |
| 6. 日志追加 | 在 `log.md` 中记录 query-back |

**回写判定标准：**

| 回写为新页面 | 不回写 |
|--------------|--------|
| 跨多个页面的综合分析 | 简单事实查询 |
| 比较分析、决策树 | 一次性操作指导 |
| 发现新关联/新结论 | 已有页面完全覆盖 |
| 用户明确要求保存 | 试探性讨论 |

#### Lint（健康检查）—— 持续维护

| 检查项 | 规则 | 严重级别 |
|--------|------|---------|
| 矛盾检测 | 同一概念在不同页面矛盾描述 | Error |
| 过时声明 | 页面超 N 天未更新且标记需定期验证 | Warning |
| 孤立页面 | 无入站链接的页面 | Warning |
| 缺失页面 | 被引用但无独立页面的概念 | Info |
| 断链 | `[[链接]]` 指向不存在的页面 | Error |

### 4.7 Wiki 检索升级路径

以 index.md 导航为起点，按规模渐进升级：

| 阶段 | 触发条件 | 检索方式 | 说明 |
|------|----------|---------|------|
| 阶段1 | Wiki 页面 < 500 | index.md 导航 + 双链遍历 | Hermes 原生能力，零额外依赖 |
| 阶段2 | Wiki 页面 500-2000 | 引入 [qmd](https://github.com/tobi/qmd) 本地搜索引擎 | BM25 + 向量混合 + LLM 重排序，Pod 内运行 |
| 阶段3 | Wiki 页面 > 2000 | qmd MCP Server + 外部向量库 | Agent 通过 MCP 工具调用，支持更大规模 |

**迁移路径：** 阶段1→2 只需安装 qmd 并在 AGENTS.md 中更新检索规则；阶段2→3 需部署向量库但 wiki 文件结构不变。

### 4.8 Wiki_Reader_Skill（预置核心技能）

每个 Template 必含的预置 Skill：

```markdown
---
name: wiki-reader
description: 读取wiki目录下的结构化知识，按需检索相关页面注入对话上下文
version: 1.0.0
metadata:
  hermes:
    tags: [knowledge, wiki, retrieval]
    category: core
    requires_toolsets: [file]
---

# Wiki Reader

## When to Use
当用户需求涉及业务背景知识、规则说明、操作规程时，自动调用。

## Procedure
1. 读取 wiki/index.md 获取知识索引
2. 根据用户问题定位相关页面（关键词+链接图遍历）
3. 读取相关页面内容
4. 按相关性排序，取 Top-K 页面作为上下文注入
5. 如需跨源综合，沿 [[双链]] 追踪相关页面

## Pitfalls
- 全局和领域 Wiki 为只读，不可修改
- 本地 Wiki 修改需经用户确认
- 大文件只读取相关章节，不要全文注入
- 中等规模下 index.md 足够检索，无需向量 RAG

## Verification
- 确认返回内容与用户问题相关
- 引用来源页面路径（如 [[water-wall-leak]]）
```

---

## 5. 技能管理（Skills）

### 5.1 Skill 定义规范（SKILL.md 格式）

遵循 agentskills.io 兼容格式：

```markdown
---
name: csars-data-query
description: 查询CSARS系统实时与历史数据
version: 1.0.0
platforms: [linux]
metadata:
  hermes:
    tags: [CSARS, 数据查询]
    category: thermal
    requires_toolsets: [terminal]
    requires_tools: [terminal]
    config:
      - key: csars.endpoint
        description: "CSARS API端点"
        default: "https://csars.internal/api"
        prompt: "请输入CSARS API地址"
required_environment_variables:
  - name: CSARS_API_KEY
    prompt: "请输入CSARS API密钥"
    help: "从CSARS管理后台获取"
    required_for: "API访问"
---

# CSARS 数据查询

## When to Use
用户需要查询设备运行数据、历史趋势或统计信息时调用。

## Procedure
1. 解析用户查询类型（实时/历史/统计）
2. 构造 API 请求参数
3. 调用 CSARS API
4. 格式化返回结果
5. 如需图表展示，生成 A2UI 组件

## Pitfalls
- 单次查询时间范围不超过30天
- 敏感数据需脱敏后返回
- API 超时设为30秒

## Verification
- 确认返回数据条数 > 0
- 时间范围与用户要求一致
```

### 5.2 Skill 目录结构

```
~/.hermes/skills/
├── wiki-reader/           # 预置核心Skill
│   └── SKILL.md
├── csars-data-query/      # 场景Skill
│   ├── SKILL.md
│   ├── references/        # 参考文档
│   ├── templates/         # 输出模板
│   ├── scripts/           # 可执行脚本
│   └── assets/            # 资源文件
├── boiler-inspection/     # 场景Skill
│   └── SKILL.md
└── .hub/                  # Skills Hub状态
    ├── lock.json          # 安装来源追踪
    ├── quarantine/        # 被隔离的Skill
    └── audit.log          # 安全扫描记录
```

### 5.3 skill_manage 工具（Agent 自主管理）

| 动作 | 说明 | 触发条件 |
|------|------|---------|
| `create` | 创建新 Skill | 完成复杂任务(5+工具调用)后发现可复用模式 |
| `patch` | 精准替换（推荐） | 修正 Skill 中的错误 |
| `edit` | 全量重写 | 大幅重构 Skill |
| `delete` | 删除 Skill | Skill 不再适用 |
| `write_file` | 添加/更新辅助文件 | 添加脚本、模板等 |
| `remove_file` | 删除辅助文件 | 清理无用文件 |

### 5.4 Skill 渐进式加载

```
Level 0: skills_list()     → [{name, description, category}]  (~3k tokens)
Level 1: skill_view(name)  → 完整 SKILL.md 内容               (按需)
Level 2: skill_view(name, path) → 具体参考文件                  (按需)
```

系统提示词仅含紧凑索引（~3k tokens），完整内容按需加载——万级 Skill 场景下节省 Token。

### 5.5 Skill 条件激活

```yaml
metadata:
  hermes:
    requires_toolsets: [terminal]      # 仅当终端工具可用时显示
    fallback_for_toolsets: [web]       # 仅当 Web 工具不可用时显示
    requires_tools: [terminal]         # 仅当特定工具可用时显示
    fallback_for_tools: [web_search]   # 仅当 Web 搜索不可用时显示
```

### 5.6 Skills 分类

| 类型 | 可见范围 | 维护者 | 示例 |
|------|---------|--------|------|
| 预置核心Skill | 所有Agent | 一类用户 | wiki-reader |
| 全局Skills | 所有Agent | 一类用户 | web-search、db-query |
| 领域Skills | 同领域Agent | 二类用户 | csars-data-query、boiler-inspection |
| 自生成Skills | 仅当前用户 | Agent自主 | 基于工作流提炼的个性化技能 |

---

## 6. 前端交互层（A2UI）

### 6.1 混合 UI 路由策略

```
用户意图 → Agent 解析 → 路由判定
                         │
            ┌────────────┴────────────┐
            │                         │
     路径A：优先调用已有系统      路径B：A2UI 动态生成
            │                         │
   已有成熟系统可满足？          无匹配系统
            │                         │
   ├─ 是 → 调用对应系统          A2UI 声明式生成
   │      API获取URL+Token        纯JSON组件树
   │      前端 iframe/Webview      无代码执行
   │      嵌入展示                 跨端原生渲染
   │                             安全白名单校验
   └─ 否 → 降级到路径B
```

### 6.2 路由判定机制

路径选择由 **Asset Registry + 意图匹配** 驱动：

**Asset Registry** 存储已有业务系统的注册信息：

```yaml
# asset_registry.yaml
- intent_patterns: ["报销", "费用报销", "expense"]
  system_id: "erp_finance"
  base_url: "https://erp.internal/finance"
  path: "/expense/report"
  display_name: "费用报销报表"
  required_scope: ["finance:read", "finance:expense"]
  health_check:
    endpoint: "https://erp.internal/health"
    interval: 60s
    timeout: 5s
  token_config:
    type: "oauth2_proxy"         # 通过平台 SSO 代理获取 Token
    refresh_before_expire: 5min  # Token 过期前5分钟自动续签
    max_lifetime: 4h             # 单次 Token 最长有效期
```

**判定流程：**

```
用户消息 → Agent 识别意图
  │
  ├─ 意图匹配 Asset Registry 中某条目
  │    └─ 健康检查通过 → 路径A（iframe 嵌入）
  │    └─ 健康检查失败 → 降级到路径B
  │
  ├─ 意图未匹配任何条目 → 路径B（A2UI 生成）
  │
  └─ 路径B 生成失败 → 纯文本回复 + 操作指引
```

意图匹配方式：Agent 在对话中自然识别，无需额外分类器。SOUL.md 中可定义路由偏好（如"涉及报表优先使用已有系统"）。

### 6.3 A2UI 协议核心

| 维度 | 说明 |
|------|------|
| **格式** | 声明式 JSON/JSONL 流式消息 |
| **安全** | 纯数据无代码执行，组件白名单（catalog），无 XSS/注入风险 |
| **跨端** | React/Lit（Web）、Flutter（移动+桌面） |
| **流式** | JSONL 逐行解析，渐进式渲染，无需等待完整响应 |
| **状态分离** | `updateComponents`（UI结构）和 `updateDataModel`（数据）独立消息 |
| **双向交互** | 用户操作通过事件回传给 Agent（见 §6.5） |

### 6.4 A2UI 消息格式（v0.9）

```json
// 1. 创建Surface
{ "version": "v0.9", "createSurface": { "surfaceId": "inspection-form", "catalogId": "https://a2ui.org/specification/v0_9/basic_catalog.json" }}

// 2. 定义组件（扁平邻接表，非嵌套树）
{ "version": "v0.9", "updateComponents": { "surfaceId": "inspection-form", "components": [
  { "id": "root", "component": "Column", "children": ["header", "form", "actions"] },
  { "id": "header", "component": "Text", "text": "锅炉巡检记录", "variant": "h1" },
  { "id": "form", "component": "Column", "children": ["pressure-field", "level-field"] },
  { "id": "pressure-field", "component": "TextField", "label": "主蒸汽压力(MPa)", "value": {"path": "/pressure"}, "variant": "number" },
  { "id": "level-field", "component": "TextField", "label": "汽包水位(mm)", "value": {"path": "/water_level"}, "variant": "number" },
  { "id": "actions", "component": "Row", "children": ["submit-btn", "cancel-btn"] },
  { "id": "submit-btn", "component": "Button", "child": "submit-text", "variant": "primary", "action": { "event": { "name": "submit" } } },
  { "id": "submit-text", "component": "Text", "text": "提交" },
  { "id": "cancel-btn", "component": "Button", "child": "cancel-text", "action": { "event": { "name": "cancel" } } },
  { "id": "cancel-text", "component": "Text", "text": "取消" }
]}}

// 3. 更新数据模型
{ "version": "v0.9", "updateDataModel": { "surfaceId": "inspection-form", "path": "/pressure", "value": 16.5 }}
```

### 6.5 A2UI 事件回传协议

用户在 A2UI Surface 上的操作通过 WebSocket/SSE 回传给 Agent：

```typescript
// 客户端 → Agent：事件回传
interface A2UIEventMessage {
  type: "a2ui_event";
  surfaceId: string;           // 目标 Surface
  eventId: string;             // 消息唯一 ID
  event: {
    name: string;              // 事件名（对应组件 action.event.name）
    componentId: string;       // 触发事件的组件 ID
    data?: Record<string, any>; // 伴随数据（如表单字段值）
  };
  timestamp: number;
}

// Agent → 客户端：事件处理结果
interface A2UIEventResponse {
  type: "a2ui_event_result";
  eventId: string;             // 对应的事件 ID
  result: "accepted" | "rejected" | "error";
  message?: string;            // 错误说明或确认提示
  // Agent 可同时发送 updateComponents / updateDataModel 来更新 UI
}
```

**Surface 生命周期：**

| 阶段 | 消息 | 说明 |
|------|------|------|
| 创建 | `createSurface` | Agent 创建 Surface，客户端初始化渲染器 |
| 更新 | `updateComponents` + `updateDataModel` | Agent 更新 UI 结构和数据 |
| 交互 | `a2ui_event` ↔ `a2ui_event_result` | 用户操作 → Agent 处理 → UI 更新 |
| 销毁 | `destroySurface` | 用户关闭或 Agent 主动销毁 |

### 6.6 A2UI 组件白名单（Basic Catalog）

| 类别 | 组件 | 用途 |
|------|------|------|
| 布局 | Row, Column, List | 排列容器 |
| 展示 | Text, Image, Icon, Divider | 静态内容 |
| 交互 | Button, TextField, CheckBox, Slider, DateTimeInput, ChoicePicker | 用户输入 |
| 容器 | Card, Modal, Tabs | 分组/弹窗/标签页 |
| 函数 | required, email, regex, formatDate, openUrl | 客户端校验/操作 |

**自定义 Catalog：** 可扩展行业组件（ECharts图表、签名板等），需经安全扫描后注册。

**Catalog 本地化：** A2UI catalog JSON 在 Pod 启动时从 MinIO 下载到本地缓存，客户端启动时加载。内网环境不依赖外网 URL。

### 6.7 跨端渲染映射

| A2UI 组件 | Web (React/Lit) | iOS (SwiftUI) | Android (Compose) | Flutter |
|-----------|-----------------|---------------|-------------------|---------|
| Text | `<p>` / `<h1>` | `Text` | `Text` | `Text` |
| Button | `<button>` | `Button` | `Button` | `ElevatedButton` |
| TextField | `<input>` | `TextField` | `TextField` | `TextField` |
| Row | `flex-direction: row` | `HStack` | `Row` | `Row` |
| Column | `flex-direction: column` | `VStack` | `Column` | `Column` |

### 6.8 路径A：已有系统嵌入规范

| 参数 | 说明 |
|------|------|
| URL来源 | Agent 通过 Asset Registry 获取目标系统 URL + 临时 Token |
| 嵌入方式 | Web端 iframe / 移动端 Webview |
| 安全约束 | `sandbox="allow-scripts allow-forms"` 限制、同源策略、Token 通过 postMessage 传递（不暴露在 URL 中） |
| Token 续签 | 平台 SSO 代理自动续签，Token 过期前 5 分钟刷新 |
| 通信 | postMessage 双向通信，A2UI surfaceId 关联 |

---

## 7. Session 与记忆管理

### 7.1 Session 存储

| 数据 | 存储 | 说明 |
|------|------|------|
| Session消息 | Pod内 SQLite (state.db) | WAL模式 + FTS5全文搜索，无并发写冲突 |
| Session元数据 | 平台PG | 用户ID、模板ID、创建时间、Token用量（集中分析） |
| 审计日志 | 平台PG | 所有Skill调用、数据访问、安全事件 |

### 7.2 冻结快照 + 热记忆模式

```
Session 开始
  │
  ├─ 从磁盘加载 MEMORY.md + USER.md 快照
  ├─ 注入系统提示词（此时快照固定，保持前缀缓存）
  │
  ▼ Session 运行中
  │
  ├─ Agent 使用 memory 工具写入 → 立即持久化到磁盘
  ├─ 系统提示词中的快照不变（保持前缀缓存效率）
  │
  ├─ 【热记忆机制】
  │   Agent 写入 MEMORY.md 后，memory 工具的返回值中
  │   包含刚写入的内容摘要。Agent 在后续推理中可通过
  │   工具返回值（而非系统提示词）"看到"新记忆。
  │
  ▼ Session 结束 / 下次 Session
  │
  └─ 新 Session 加载最新磁盘内容 → 记忆更新生效
```

**热记忆实现：** Hermes 的 `memory_write` 工具返回值包含写入内容摘要，Agent 在同一 Session 的后续推理中可引用此返回值。这样既保持了前缀缓存效率，又避免了"Agent 不知道自己刚记住的事"。

### 7.3 记忆安全

所有记忆条目写入前扫描：
- Prompt 注入模式
- 凭证外泄模式
- 不可见 Unicode 字符
- SSH 后门模式

### 7.4 Session 搜索（FTS5）

`session_search` 工具可跨所有历史 Session 全文搜索，配合辅助模型摘要，实现"回忆"能力。

### 7.5 多端并发

同一用户的多个终端共享同一个 Hermes Pod（Pod/用户），消息通过 Gateway 排队串行处理：

```
Web端消息 ─┐
            ├─→ Gateway 消息队列 → Hermes Pod（串行处理）
手机端消息 ─┘
                                │
                    ├─→ Web端 SSE 推送
                    └─→ 手机端 WS 推送
```

- 同一时刻只处理一条用户消息，避免 SQLite 并发写冲突
- Agent 响应同时推送到所有在线终端
- 排队中的消息按时间戳排序

---

## 8. 模型网关与调度

### 8.1 模型网关架构

```
Hermes 实例 → 模型网关 → 路由决策
                           │
              ┌────────────┼────────────┐
              │            │            │
         推理模型       轻量模型     Embedding
      (复杂任务)    (简单/自动化)   (向量检索)
              │            │            │
         主力API       边缘API      Embedding API
      (Claude/GPT)  (Gemini IT)  (BGE/text-embedding)
```

### 8.2 Smart Model Routing（Hermes 原生）

| 场景 | 路由到 | 说明 |
|------|--------|------|
| 复杂推理/编程 | 大参数推理模型 | Claude Sonnet, GPT-4 级 |
| 简单问答/自动化 | 轻量模型 | Gemini IT (2B~22B)，节省 90% 成本 |
| 压缩/摘要 | 专用压缩模型 | Gemini Flash |
| 视觉理解 | 视觉模型 | 自动路由 |

### 8.3 调用配额

| 角色 | 日Token配额 | 并发请求 | 优先级 |
|------|-----------|---------|--------|
| 一类用户 | 无限制 | 20 | 最高 |
| 二类用户 | 500K | 10 | 高 |
| 三类用户 | 100K | 3 | 标准 |

### 8.4 降级策略

```
主模型不可用 → 备选模型自动切换
  ├─ Claude 不可用 → GPT-4
  ├─ 云端不可用 → 本地模型（如有部署）
  └─ 所有模型不可用 → 返回友好错误 + 排队通知
```

---

## 9. Template 市场与分发

### 9.1 Template 包结构

```
hermes-template-{name}/
├── template.yaml         # 模板元数据
├── SOUL.md               # 角色身份定义
├── AGENTS.md             # 项目级 SOP
├── skills/               # 预装Skills
│   ├── wiki-reader/SKILL.md
│   └── {domain-skills}/
├── wiki/                 # 预装领域Wiki
│   ├── index.md
│   └── {domain}/
├── config.override.yaml  # 推荐配置覆盖
└── README.md             # 模板说明
```

### 9.2 template.yaml 规范

```yaml
apiVersion: power-agent/v1
kind: HermesTemplate
metadata:
  name: boiler-inspection
  version: 1.2.0
  description: 锅炉巡检数字员工
  domain: thermal
  author: zhangsan
  tags: [锅炉, 巡检, 热工]
spec:
  modelRequirements:
    reasoning: high
    compliance: medium
  requiredSkills:
    - name: wiki-reader
      version: ">=1.0.0"
    - name: csars-data-query
      version: ">=1.0.0"
  wikiScope: [global, thermal, boiler]
  configDefaults:
    model: anthropic/claude-sonnet-4
    terminal.backend: docker
    compression.enabled: true
  security:
    dataClassification: internal
    auditLevel: standard
```

### 9.3 分发流程

```
二类用户创建Template → 提交审批
  │
  ├─ 安全扫描（Skills Guard）
  │   - 数据外泄检测
  │   - Prompt注入检测
  │   - 破坏性命令检测
  │   - Shell注入检测
  │
  ├─ 一类用户审批
  │
  ├─ 上架Template市场
  │
  └─ 三类用户订阅
      ├─ Pod启动时自动拉取
      ├─ 或运行时热加载（无需重启）
      └─ Skills Hub协议同步更新
```

### 9.4 热加载机制

```
用户订阅新Template → 网关通知Pod → Hermes Watcher检测变更
  │
  ├─ 变更写入临时目录 ~/.hermes/.staging/{version}/
  ├─ 全部文件就绪后原子切换：
  │   mv .staging/{version}/SOUL.md SOUL.md
  │   mv .staging/{version}/skills/ skills/
  │   ...
  ├─ 重新加载 SOUL.md + Skills索引 + Wiki索引
  └─ 无需重启进程，下一个Session自动生效
```

**原子性保证：** 热加载通过"暂存目录 + 原子 mv"实现，Agent 不会读到半更新状态。

### 9.5 信任分级

| 级别 | 来源 | 安全策略 |
|------|------|---------|
| builtin | 平台内置 | 始终信任 |
| official | 官方审核 | 自动信任 |
| trusted | 认证开发者 | 通过安全扫描后信任 |
| community | 社区提交 | `--force` 可覆盖非危险项，危险项始终阻断 |

---

## 10. 定时任务（Cron）

### 10.1 Cron 系统

| 组件 | 说明 |
|------|------|
| 存储 | `~/.hermes/cron/jobs.json`（原子写入） |
| 调度 | Gateway 后台线程每 60s tick |
| 锁 | 文件锁 `~/.hermes/cron/.tick.lock` 防并发 |
| 输出 | `~/.hermes/cron/output/{job_id}/{timestamp}.md` |

### 10.2 调度格式

| 格式 | 示例 | 说明 |
|------|------|------|
| 相对延迟 | `30m` | 30分钟后执行一次 |
| 间隔 | `every 2h` | 每2小时重复 |
| Cron表达式 | `0 9 * * *` | 每天早上9点 |
| ISO时间戳 | `2026-05-01T09:00` | 指定时间执行 |

### 10.3 执行规则

- 每个 Cron 任务在**独立 Session** 中运行（无对话历史）
- Cron 工具集在 Cron Session 内**禁用**（递归防护）
- 支持 Pre-run Script（`~/.hermes/scripts/`），执行前注入上下文
- `[SILENT]` 前缀抑制消息投递（"无需报告"场景）

### 10.4 投递目标

| 目标 | 格式 | 说明 |
|------|------|------|
| 创建来源 | `origin` | 回到创建任务的对话 |
| 本地文件 | `local` | 仅保存到 cron/output/ |
| 指定平台 | `telegram:12345` | 投递到特定聊天 |

---

## 11. 网关与消息平台

### 11.1 平台适配器（Hermes Gateway 原生支持 18+）

| 类别 | 平台 |
|------|------|
| 即时通讯 | Telegram, Discord, Slack, WhatsApp, Signal, Matrix |
| 企业通讯 | 润工作（飞书企业版）, 企业微信, 微信, QQ Bot |
| 其他 | Email, SMS, Home Assistant, Webhook |
| HTTP API | API Server (OpenAI兼容, 端口8642) |

### 11.2 网关集群架构（万级用户）

```
用户 → 负载均衡(Nginx/LB)
        │
        ├─ Web用户 → A2UI SSE 网关集群
        │             ├─ gw-node-01 (2,000 连接)
        │             ├─ gw-node-02 (2,000 连接)
        │             └─ gw-node-NN (弹性伸缩)
        │
        ├─ 润工作/企微 → Platform Adapter 网关
        │
        └─ API调用 → API Server 网关

每个网关节点：
  - 通过 Redis 查询用户 Pod 路由
  - WebSocket/SSE 维持长连接
  - 中断/排队消息管理
```

### 11.3 消息流

```
平台适配器 → MessageEvent → 会话路由 → 用户Pod → AIAgent → 响应 → 适配器 → 平台
```

### 11.4 WebSocket/SSE 通信协议

**心跳机制：**
- 客户端每 30s 发送 `ping`，服务端回复 `pong`
- 60s 无心跳则服务端主动断开，客户端自动重连
- 重连后通过 `last_event_id` 获取断线期间的消息

**消息帧格式：**

```typescript
// 客户端 → 服务端
interface ClientMessage {
  type: "chat" | "a2ui_event" | "ping";
  id: string;                    // 消息唯一 ID (UUID)
  timestamp: number;

  // type=chat
  content?: string;
  attachments?: Attachment[];

  // type=a2ui_event
  surfaceId?: string;
  event?: {
    name: string;
    componentId: string;
    data?: Record<string, any>;
  };
}

// 服务端 → 客户端
interface ServerMessage {
  type: "stream_text" | "a2ui" | "a2ui_event_result" | "iframe" | "error" | "pong";
  id: string;
  timestamp: number;

  // type=stream_text
  text?: string;
  done?: boolean;

  // type=a2ui — 原样传递 A2UI JSONL 消息
  a2ui?: object;

  // type=iframe
  url?: string;
  title?: string;

  // type=error
  error_code?: string;
  error_message?: string;
}
```

---

## 12. 安全与审计

### 12.1 安全分层模型

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 5: 内容安全                                           │
│  - LLM 输出 PII 过滤 (姓名/手机/身份证号脱敏)               │
│  - A2UI 渲染前 Schema 校验 (杜绝注入)                       │
│  - Wiki raw/ 内容扫描（Ingest 前检测恶意指令）               │
├─────────────────────────────────────────────────────────────┤
│  Layer 4: 行为安全                                           │
│  - SOUL.md 行为边界约束 (MUST / MUST NOT)                   │
│  - 敏感操作二次确认 (审批/转账/删除)                         │
│  - Tool 调用权限白名单 (RBAC)                               │
│  - 记忆写入安全扫描（防行为操纵/投毒）                       │
├─────────────────────────────────────────────────────────────┤
│  Layer 3: 数据安全                                           │
│  - .env / auth.json 与 LLM 推理严格隔离                     │
│  - 会话数据加密存储 (AES-256-GCM)                           │
│  - 记忆数据访问审计                                         │
├─────────────────────────────────────────────────────────────┤
│  Layer 2: 传输安全                                           │
│  - 全链路 TLS 1.3                                          │
│  - WebSocket WSS                                           │
│  - iframe 嵌入：sandbox 属性 + postMessage 校验             │
├─────────────────────────────────────────────────────────────┤
│  Layer 1: 基础设施安全                                       │
│  - K8s NetworkPolicy (Pod 间默认拒绝互访)                   │
│  - 容器运行时 Seccomp/AppArmor                              │
│  - Secret 管理: Vault                                       │
│  - Skill 脚本网络访问白名单                                 │
└─────────────────────────────────────────────────────────────┘
```

### 12.2 Skills Guard（安全扫描流水线）

所有 Agent 创建和 Hub 安装的 Skill 均需扫描：

| 检测项 | 说明 |
|--------|------|
| 数据外泄 | 检测向外部发送用户数据的模式 |
| Prompt注入 | 检测试图操纵系统提示词的模式 |
| 破坏性命令 | 检测 rm -rf、drop table 等 |
| Shell注入 | 检测命令拼接漏洞 |
| 供应链信号 | 检测已知恶意包/来源 |

### 12.3 LLM 提示注入防护

| 攻击向量 | 防御措施 |
|----------|----------|
| 系统提示覆盖 | SOUL.md 作为 System Prompt 的不可变锚点，用户输入与系统指令分离标记 |
| Wiki 内容投毒 | Ingest 时扫描 raw/ 文档中的指令注入模式 |
| 上下文注入 | 用户输入经过 PII 过滤器 + 指令检测器后再注入 |
| Tool 参数篡改 | Tool 调用参数经 JSON Schema 严格校验 |
| 记忆投毒 | MEMORY.md 写入前扫描行为操纵模式，支持人工复核标记 |
| 跨 Session 攻击 | 每个 Session 启动时重新验证记忆完整性 |

### 12.4 凭证隔离

| 环境 | .env / auth.json | 说明 |
|------|------------------|------|
| 开发环境 | 文件存储 | `~/.hermes/.env`，`~/.hermes/auth.json` |
| 生产环境 | **Vault注入** | K8s Init Container 从 Vault 拉取，写入 Pod 临时文件 |

**严格约束：** `.env` 和 `auth.json` 中的内容**永远不参与大模型推理**，仅供 API 调用使用。

### 12.5 审计日志

| 日志类型 | 存储 | 保留期 |
|---------|------|--------|
| 登录日志 | PG | 1年 |
| 操作日志 | PG | 1年 |
| 数据访问日志 | PG | 2年 |
| Skill调用日志 | PG | 1年 |
| 模型调用日志 | PG | 6个月 |
| 安全事件 | PG | 3年 |

---

## 13. 可观测性与运维

### 13.1 指标体系

| 类别 | 指标 | 告警阈值 |
|------|------|---------|
| **Pod** | 活跃Pod数 / 缩容Pod数 | 缩容率 > 80%/h |
| **Pod** | 冷启动延迟P99 | > 30s |
| **平台服务** | API响应时间P99 | > 3s |
| **平台服务** | API错误率 | > 1% |
| **模型推理** | 推理延迟P99 | > 10s |
| **模型推理** | Token消耗/日 | 日配额80% |
| **Agent** | Skill调用失败率 | > 5% |
| **Agent** | Memory使用率 | > 90%限制 |

### 13.2 告警策略

| 级别 | 通知方式 | 响应时间 |
|------|---------|---------|
| P0（不可用） | 电话 + 润工作 + 短信 | 15min |
| P1（降级） | 润工作 + 邮件 | 30min |
| P2（性能） | 润工作 | 2h |
| P3（预警） | 邮件 | 次日 |

### 13.3 可观测性架构

```
Pod (OpenTelemetry SDK)
  │ → Metrics (Prometheus exporter)
  │ → Logs (Fluentd → Elasticsearch)
  │ → Traces (OTel Collector → Jaeger)

平台服务 (OpenTelemetry SDK)
  │ → Metrics → Prometheus → Grafana
  │ → Logs → ELK → Kibana
  │ → Traces → Jaeger
```

### 13.4 万级用户资源估算

| 资源 | 估算 | 说明 |
|------|------|------|
| 活跃Pod | ~2,000 | 20%并发活跃率 |
| 总Pod (含缩容PV) | ~10,000 | 每用户一个PV |
| CPU | 2,000核 (活跃) | 1核/Pod |
| 内存 | 4,000GB (活跃) | 2GB/Pod |
| GPU | 按需 | 推理服务共享，非每Pod独占 |
| 存储(PV) | 50TB | 5GB/Pod |
| PostgreSQL | 2TB | 审计+元数据 |
| Redis Cluster | 64GB | Token+路由+配额 |
| MinIO | 5TB | Wiki+模板+产物 |

### 13.5 弹性伸缩策略

| 资源 | HPA策略 | 说明 |
|------|---------|------|
| Hermes Pod | 按需创建/销毁 | 用户登录创建，5min闲置缩容 |
| 网关节点 | CPU > 60% 扩容 | 最小3节点，最大20节点 |
| GPU推理 | 请求队列 > 10 扩容 | 按队列长度弹性 |

### 13.6 备份与恢复

| 数据 | 备份策略 | RPO | RTO |
|------|---------|-----|-----|
| PostgreSQL | 每日全量 + WAL实时归档 | < 1min | < 30min |
| Redis | RDB每小时 + AOF实时 | < 1s | < 5min |
| MinIO | 每日增量 + 每周全量 | < 24h | < 2h |
| 用户PV | K8s VolumeSnapshot | < 1h | < 15min |
| Git仓库 | 实时镜像 | 0 | < 10min |

---

## 14. 接口规范

### 14.1 API 设计原则

| 原则 | 说明 |
|------|------|
| RESTful | 资源导向 URL |
| 版本化 | `/api/v1/` |
| 统一响应 | `{"code": 0, "data": {}, "message": ""}` |
| 认证 | `Authorization: Bearer {token}` 或 `X-API-Key: {key}` |

### 14.2 核心 API 汇总

| 服务 | 前缀 | 核心接口 | 说明 |
|------|------|---------|------|
| 认证服务 | `/api/v1/auth` | 5 | SSO/OAuth/Token |
| 用户服务 | `/api/v1/users` | 8 | CRUD + Pod管理 |
| Template市场 | `/api/v1/templates` | 10 | 浏览/订阅/发布/审批 |
| Skills服务 | `/api/v1/skills` | 6 | CRUD + 安全扫描 |
| Wiki服务 | `/api/v1/wiki` | 6 | 管理端Wiki CRUD |
| Session服务 | `/api/v1/sessions` | 6 | 列表/恢复/导出 |
| 模型网关 | `/api/v1/models` | 4 | 状态/配额/调用 |
| 审计服务 | `/api/v1/audit` | 4 | 查询/导出 |
| Cron编排 | `/api/v1/cron` | 5 | 集群级Cron管理 |
| Asset Registry | `/api/v1/assets` | 6 | 路径A业务系统注册/健康检查 |
| Hermes API | `:8642/v1/` | - | OpenAI兼容（Pod内） |

---

## 15. 成本估算

### 15.1 模型调用成本（月度）

| 场景 | 日调用量 | 单次Token估算 | 月成本估算 |
|------|---------|-------------|-----------|
| 常规对话（主力模型） | 40,000次 | ~2K input + ~1K output | ¥80-120万 |
| 常规对话（轻量模型） | 20,000次 | ~2K input + ~0.5K output | ¥2-5万 |
| Ingest 操作 | ~100次 | ~50K input + ~20K output | ¥3-5万 |
| 压缩/摘要 | ~5,000次 | ~4K input + ~1K output | ¥5-8万 |
| Cron 任务 | ~30,000次 | ~1K input + ~0.5K output | ¥3-5万 |
| Embedding | ~10,000次 | ~0.5K input | ¥0.5-1万 |
| **月度合计** | | | **¥95-145万** |

> 按 Claude Sonnet / GPT-4o 级主力模型 + Gemini Flash 轻量模型估算。实际成本取决于 Smart Model Routing 的分流效果。

### 15.2 基础设施成本（月度）

| 资源 | 月成本估算 | 说明 |
|------|-----------|------|
| K8s 集群（2,000 活跃 Pod） | ¥15-25万 | 含计算+存储 |
| GPU 推理集群 | ¥10-20万 | 按需弹性 |
| 数据库（PG + Redis） | ¥3-5万 | |
| 对象存储（MinIO） | ¥1-2万 | |
| **月度合计** | **¥30-55万** | |

### 15.3 成本控制策略

| 策略 | 预期节省 | 说明 |
|------|---------|------|
| Smart Model Routing | 40-60% | 简单问答走轻量模型 |
| 前缀缓存 | 20-30% | 冻结快照保持前缀缓存命中 |
| 对话压缩 | 10-15% | 长对话自动压缩减少上下文 |
| 闲置 Pod 缩容 | 30-50% | 非活跃时段释放计算资源 |
| 配额管控 | 按需 | 按角色限流，防滥用 |

---

## 16. 非功能性需求

### 16.1 性能

| 指标 | 目标 |
|------|------|
| API响应时间P95 | < 500ms（不含模型） |
| 模型首Token时间 | < 2s |
| A2UI首屏渲染 | < 2s（渐进式） |
| Pod冷启动 | < 45s |
| Session恢复 | < 3s |
| Wiki检索 | < 200ms |

### 16.2 可用性

| 指标 | 目标 |
|------|------|
| 平台整体 | 99.9% |
| 模型推理 | 99.5% |
| 数据持久性 | 99.9999% |
| RPO | < 1min |
| RTO | < 30min |

### 16.3 可扩展性

| 维度 | 目标 |
|------|------|
| 并发活跃用户 | 2,000+ |
| 注册用户 | 10,000+ |
| Agent模板 | 无上限 |
| Wiki页面 | 单实例 10万+（qmd 阶段2/3） |
| Skills | 无上限（按需加载） |

---

## 17. 里程碑与优先级

### 17.1 阶段规划

| 阶段 | 时间 | 目标 | 关键交付 |
|------|------|------|---------|
| **M1：核心底座** | 5周 | 单用户可运行 | Hermes Docker化 + SSO登录 + Pod编排 + API Server + 优雅停机 |
| **M2：知识+技能** | 3周 | Wiki和Skills可用 | Wiki_Reader_Skill + Skills Guard + LLM Wiki Ingest + 1个端到端场景 |
| **M3：A2UI前端** | 5周 | 混合UI可交互 | A2UI Renderer(Web) + 事件回传 + 路径A(iframe) + 路径B(A2UI生成) + Asset Registry |
| **M4：Template市场** | 3周 | 模板可分发 | Template市场API + 热加载(原子切换) + 安全扫描 |
| **M5：企业级** | 5周 | 万级用户可用 | 网关集群 + 审计 + 监控 + 弹性伸缩 + Cron + 多端并发 |
| **M6：验证上线** | 4周 | 生产就绪 | 3个真实场景 + 性能调优 + 安全加固 + 成本验证 + 用户培训 |

### 17.2 P0 功能（M1-M2）

- [ ] Hermes Agent Docker 镜像 + K8s Pod 编排
- [ ] SSO 登录 + JWT 鉴权
- [ ] Pod 按需创建/缩容/恢复 + 优雅停机
- [ ] SOUL.md + USER.md + AGENTS.md 加载
- [ ] 模型网关（至少1个推理模型 + 1个轻量模型）
- [ ] Wiki_Reader_Skill + LLM Wiki Ingest/Query/Lint
- [ ] Skills Guard 安全扫描
- [ ] 1个端到端场景

### 17.3 P1 功能（M3-M4）

- [ ] A2UI Renderer（Web端，React/Lit）
- [ ] A2UI 事件回传协议
- [ ] 路径A：已有系统 iframe 嵌入 + Asset Registry
- [ ] 路径B：A2UI 动态生成
- [ ] 对话交互界面
- [ ] Template 市场浏览/订阅/热加载（原子切换）
- [ ] CI 流水线

### 17.4 P2 功能（M5-M6）

- [ ] 网关集群 + 负载均衡
- [ ] 审计日志集中采集
- [ ] 监控告警（Prometheus + Grafana）
- [ ] 弹性伸缩（HPA）
- [ ] Cron 系统
- [ ] 润工作/企微集成
- [ ] Flutter 移动端 Renderer
- [ ] 成本验证与控制策略调优
- [ ] 性能调优 + 安全加固
- [ ] 用户文档 + 培训

---

## 附录 A：Pod 与用户对应关系

Hermes 是单用户设计——USER.md / MEMORY.md 语义唯一、SQLite 单写者，不支持多用户共享一个 Pod。

推荐采用 **Pod/用户 + 集中状态**模型：保持 1 User = 1 Pod（Hermes 零改造），但通过 Sidecar 将关键数据同步到集中存储，解决万级 PV/SQLite 的运维问题。

```
┌─────────────────────────────────────────────────┐
│  Pod: hermes-user-{uid}                         │
│                                                  │
│  Hermes Agent 进程（不改，读写 ~/.hermes/ 照旧） │
│                                                  │
│  ~/.hermes/ (本地缓存层)                         │
│    SOUL.md      ← Init Container 从 PG 拉取      │
│    memories/    ← Init Container 从 PG 拉取      │
│    wiki/skills/ ← 从 MinIO 挂载                  │
│    config.yaml  ← Init Container 从 PG 拉取      │
│    state.db     ← 本地 SQLite (热缓存)           │
│                                                  │
│  Sync Agent (Sidecar)                            │
│    memories 变更 → 异步写 PG                      │
│    Session 消息  → 异步写 PG                      │
│    wiki 本地变更 → 异步写 MinIO                   │
└─────────────────────────────────────────────────┘
         │
         ▼
  集中存储：PG (memories/sessions/audit) + MinIO (wiki/skills)
```

Hermes 完全无感知，读写 `~/.hermes/` 跟以前一样。改动仅在 Pod 外围（Init Container + Sidecar）。

**演进路径：** 上线先用 Pod/用户（方案正文所述），业务跑通后加 Sidecar 迁移到集中状态，冷启动从 45s 优化到 20s，10K SQLite 运维问题消除。
