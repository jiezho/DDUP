# Hermes Agent 自我总结报告

> 生成时间：2026-05-11  
> 版本：v2.1  
> 实例：zhoujie-devops (LXC/Container)

---

## 一、核心身份

**Hermes Agent** 是由 Nous Research 开发的开源 AI 智能体框架，定位于**自主任务执行 + 多平台通信 + 自我进化**的通用智能体。当前实例运行在 `zhoujie-devops` 服务器上，以飞书为主要交互入口，同时连接微信平台。

### 1.1 技术栈

| 维度 | 实现 |
|------|------|
| 核心语言 | Python |
| LLM 接入 | 20+ Provider（当前使用 GLM-5.1-FP8 via GPUStack） |
| 消息网关 | Feishu (WebSocket) + Weixin |
| 数据存储 | 飞书多维表格 (Bitable) + 飞书文档 (DocX) + 本地文件系统 |
| 调度系统 | Cron Job（systemd 托管） |
| 运行环境 | LXC 容器 / systemd 服务 |

### 1.2 当前模型配置

- **主模型**：`glm-5.1-fp8`（自定义 Provider，本地 GPUStack）
- **备用模型**：OpenRouter / Anthropic / DeepSeek 等（按需切换）
- **视觉模型**：当前主模型不支持视觉，需配置 auxiliary vision provider

---

## 二、已具备的功能模块

### 2.1 多智能体架构（已实现 ✅）

```
用户消息 → Feishu Gateway → 消息拦截器（关键词检测）
                                    ↓
                            ┌───────┴───────┐
                            │  Core Router  │
                            └───────┬───────┘
                    ┌───────────────┼───────────────┐
                    ↓               ↓               ↓
            🌸灵感子智能体    🤖主智能体       📰新闻/术语子智能体(Cron)
         (inspiration-      (通用对话+        (news-terminology-push
          manager skill)     工具调用)         skill, Cron Job)
```

**路由规则**：
- 灵感消息（"灵感 xxx"）→ 拦截器阻断 → 专用灵感子智能体（不走主智能体）
- Cron 定时任务 → Core Router → 新闻/术语子智能体
- 通用消息 → 主智能体处理

### 2.2 灵感记录管理智能体 ✅

| 组件 | 详情 |
|------|------|
| Skill | `inspiration-manager` |
| 触发 | 用户发送"灵感 xxx" |
| 存储 | 飞书多维表格 `💡 灵感记录` |
| 字段 | 灵感内容、分类、来源、创建时间、状态、关键词、关联研究 |
| 深度整理 | Cron 定时：搜索关联研究、提取关键词、去重更新 |
| 飞书卡片 | 确认回复 + 交互式展开 |

**多维表格信息**：
- app_token: `VQq9bJLquamyYvsAefucWUYonDg`
- table_id: `tblXsQGwgUwBOW9s`
- URL: https://my.feishu.cn/base/VQq9bJLquamyYvsAefucWUYonDg

### 2.3 新闻与术语推送智能体 ✅

| 组件 | 详情 |
|------|------|
| Skill | `news-terminology-push` |
| 触发 | Cron 定时（每天 7:00） |
| Cron Job ID | `252f25a22da9` |

**新闻汇总表**：
- app_token: `Utm9bLdgyap198s1gluc4KqinKf`, table_id: `tblqQbDcNjSUdsLg`
- 字段：标题、分类(AI/能源)、日期、链接、HN热度、核心摘要

**术语表**：
- app_token: `Utm9bLdgyap198s1gluc4KqinKf`, table_id: `tblHmFGcvK5nwTFV`
- 字段：日期、术语、音标、分类(AI/电力)、英文释义、中文解释

### 2.4 多源新闻聚合器 ✅

| 组件 | 详情 |
|------|------|
| Skill | `news-aggregator` |
| 能力 | 28+ 新闻源（HN、GitHub Trending、36Kr、微博、华尔街见闻等） |
| 输出 | 飞书卡片推送 + 多维表格记录 |

### 2.5 抖音视频提取 ✅

| 组件 | 详情 |
|------|------|
| Skill | `douyin-video-extract` |
| 方式 | 微信UA + iesdouyin SSR（无需Cookie） |
| 脚本 | `/root/.hermes/scripts/douyin_extractor.py` |

### 2.6 微信文章提取 ✅

| 组件 | 详情 |
|------|------|
| Skill | `wechat-article-extract` |
| 方式 | Python urllib + Mobile UA 绕过验证码 |

### 2.7 灵感信号检测 ✅

| 组件 | 详情 |
|------|------|
| Skill | `inspiration-signal` |
| 能力 | 跨源信号检测、评分、速度追踪、去重与灵感产出 |

---

## 三、数据资产清单

### 3.1 飞书多维表格

| 名称 | app_token | table_id | 用途 |
|------|-----------|----------|------|
| 💡 灵感记录 | VQq9bJLquamyYvsAefucWUYonDg | tblXsQGwgUwBOW9s | 灵感记录+AI分类+深挖 |
| 每日新闻汇总 | Utm9bLdgyap198s1gluc4KqinKf | tblqQbDcNjSUdsLg | 新闻抓取+评分+推送 |
| 每日术语 | Utm9bLdgyap198s1gluc4KqinKf | tblHmFGcvK5nwTFV | 术语提取+推送 |

### 3.2 飞书文档

| 名称 | doc_id | 用途 |
|------|--------|------|
| 术语大纲 | MZPwdxUlgokaMZxpFpmceLvdnFb | 186术语，已推55 |
| 术语汇总 | V91OdM5ogoeh4mx2PIvcXnRMnhb | 术语推送汇总 |
| 卡片开发文档 | LkNedtkRao8AcOxKXoYcOeOsnoh | 飞书卡片交互方案 |
| 任务总结日志 | DZAFdX0qGoQHv6xFKveclqfSnte | 每次任务追加总结 |
| AI小黄人方案 | RTf5dde98oSud2x8SBIcPVKhn8e | 抖音提取方案文档 |

### 3.3 本地文件

| 路径 | 用途 |
|------|------|
| `~/.hermes/config.yaml` | 主配置 |
| `~/.hermes/.env` | API 密钥 |
| `~/.hermes/skills/` | 已安装技能（30+） |
| `~/.hermes/sessions/` | 会话记录 |
| `~/.hermes/logs/` | 网关日志 |
| `~/.hermes/scripts/douyin_extractor.py` | 抖音提取脚本 |

---

## 四、技能体系（Skills）

### 4.1 已安装技能分类

| 类别 | 技能 | 数量 |
|------|------|------|
| **自主智能体** | claude-code, codex, hermes-agent, opencode | 4 |
| **创意** | architecture-diagram, excalidraw, sketch, baoyu-comic, baoyu-infographic 等 | 20+ |
| **数据科学** | jupyter-live-kernel | 1 |
| **DevOps** | docker-management, kanban-orchestrator, news-cron-with-reading, webhook-subscriptions | 4 |
| **飞书集成** | feishu-bitable, feishu-document, feishu-messaging, feishu-cron-delivery | 4 |
| **消息/内容** | douyin-video-extract, wechat-article-extract, horizon-news, inspiration-manager, inspiration-signal, news-aggregator, news-terminology-push | 7 |
| **研究** | arxiv, duckduckgo-search, searxng-search, web-research-summarize-deliver 等 | 10+ |
| **软件开发** | debugging, plan, python-debugpy, TDD, writing-plans 等 | 10+ |
| **MLOps** | vllm, gguf-quantization, axolotl, unsloth 等 | 15+ |
| **其他** | spotify, homeassistant, image-gen, vision, tts 等 | 20+ |

**总计：约 100+ 技能**

### 4.2 自研/定制技能

| 技能名 | 类型 | 说明 |
|--------|------|------|
| `inspiration-manager` | 自研 | 灵感记录管理：自动分类、关键词提取、关联研究搜索、飞书写入 |
| `news-terminology-push` | 自研 | 新闻+术语定时推送：搜索→评分→卡片→多维表格 |
| `news-aggregator` | 自研 | 28+源新闻聚合 |
| `inspiration-signal` | 自研 | 跨源信号检测与灵感生成 |
| `douyin-video-extract` | 自研 | 抖音视频提取（无Cookie方案） |
| `wechat-article-extract` | 自研 | 微信文章提取（Mobile UA绕过） |
| `feishu-cron-delivery` | 定制 | Cron 任务的飞书消息投递修复 |

---

## 五、记忆系统

### 5.1 记忆架构

| 存储 | 内容 | 隔离性 |
|------|------|--------|
| `memory`（个人笔记） | 环境事实、工具踩坑、项目约定 | 全局共享 |
| `user`（用户画像） | 语言偏好、沟通风格 | 全局共享 |
| `sessions/`（会话记录） | 历史对话全文 | 按 session 隔离 |
| `skills/`（技能文档） | SKILL.md + 脚本 + 模板 | 按 skill 隔离 |

### 5.2 当前记忆内容（关键条目）

- 飞书网关配置：App ID, bot name, WebSocket 模式
- 多维表格连接信息：3张表的 app_token/table_id
- 飞书卡片交互方案：button + save_card_state 替代 collapsible_panel
- 术语体系：大纲186术语，已推55
- 多智能体架构：拦截→路由→子智能体 分发逻辑
- 踩坑记录：WebSocket心跳超时修复、DDG搜索限流对策、execute_code沙箱无法访问环境变量等

### 5.3 记忆隔离需求

| 隔离维度 | 当前状态 | 云端共享后需求 |
|----------|----------|----------------|
| 智能体内存 | 同一实例共享 | 按智能体实例隔离 |
| 技能知识 | 同一 skills/ 目录 | 按智能体实例隔离 + 可选共享 |
| 会话历史 | 按 session 文件隔离 | 保持隔离 |
| 用户偏好 | 全局共享 | 全局共享（跨实例一致） |
| 数据资产 | 飞书表格（共享） | 按项目隔离 + 可选共享 |

---

## 六、通信与交互

### 6.1 已连接平台

| 平台 | 状态 | 入口 |
|------|------|------|
| 飞书 | ✅ 已连接 | DM (a58d2226) + 群组 (周杰) |
| 微信 | ✅ 已连接 | DM |
| 本地终端 | ✅ 可用 | CLI |

### 6.2 飞书交互能力

- 消息收发（文本 + Markdown）
- 卡片消息（可交互 button + state 持久化）
- 文档读写（DocX API）
- 多维表格读写（Bitable API）
- 图片/文件上传（MEDIA: 协议）
- 语音消息（TTS 合成）

---

## 七、定时任务（Cron Jobs）

| Job ID | 调度 | 功能 | 投递目标 |
|--------|------|------|----------|
| 252f25a22da9 | 0 7 * * * | 术语推送（每日7:00） | 飞书 |
| （灵感深挖） | 凌晨2:00 | 灵感深度整理 | 飞书卡片 |

---

## 八、已知的限制与问题

| 问题 | 说明 | 状态 |
|------|------|------|
| 视觉模型不可用 | 当前 GLM-5.1-FP8 不支持视觉 | 需配置 auxiliary vision |
| 图片生成不可用 | FAL_KEY 未配置 | 需配置 |
| 浏览器截图 | 需 Playwright/Chromium | 未安装 |
| execute_code 沙箱 | 无法访问 FEISHU_ 环境变量 | 已有 workaround |
| DDG 搜索限流 | 10-11次后触发 CAPTCHA | 已有重试方案 |
| 微信文章提取 | Mobile UA 可用但有极小概率触发验证码 | 可接受 |

---

## 九、云端共享库设计输入

### 9.1 需要共享的资源

| 类型 | 示例 | 共享方式候选 |
|------|------|-------------|
| **技能（Skills）** | inspiration-manager, news-terminology-push | Skill Hub / GitHub Repo |
| **知识（Memory）** | 踩坑记录、项目约定、API配置 | LLM Wiki / GitHub Repo |
| **数据产物** | 新闻汇总、术语库、灵感记录 | 飞书多维表格 / 云盘 |
| **脚本** | douyin_extractor.py, 搜索脚本 | GitHub Repo |
| **文档** | 任务总结日志、方案文档 | 飞书文档 / GitHub |
| **下载材料** | 视频文件、PDF、图片 | 云盘存储 |
| **研究报告** | 论文摘要、技术分析 | 飞书文档 / GitHub |

### 9.2 隔离需求

```
共享库
├── skills/                    # 技能共享（可选发布/订阅）
│   ├── shared/                # 全局共享技能
│   ├── agent-news/            # 新闻智能体专属技能
│   ├── agent-inspiration/     # 灵感智能体专属技能
│   └── agent-terminology/     # 术语智能体专属技能
├── memory/                    # 记忆隔离
│   ├── global/                # 全局共享记忆（用户偏好、环境事实）
│   ├── agent-news/            # 新闻智能体专属记忆
│   ├── agent-inspiration/     # 灵感智能体专属记忆
│   └── agent-terminology/     # 术语智能体专属记忆
├── data/                      # 数据产物
│   ├── feishu-bitables/       # 飞书多维表格配置
│   ├── reports/               # 生成的报告
│   └── downloads/             # 下载的材料
└── config/                    # 配置
    ├── providers.yaml         # Provider 共享配置
    └── platform-connections/  # 平台连接配置
```

### 9.3 候选存储方案

| 方案 | 适合存储 | 优势 | 劣势 |
|------|----------|------|------|
| **GitHub Repo** | Skills、脚本、文档 | 版本控制、PR审查、CI/CD | 大文件受限 |
| **LLM Wiki** | 知识、踩坑、教程 | 语义搜索、链接结构 | 需额外部署 |
| **云盘（S3/OSS）** | 下载材料、视频、PDF | 大文件、低成本 | 无版本控制 |
| **Skill Hub** | 技能发布/订阅 | 原生集成 Hermes | 尚在早期 |
| **飞书多维表格** | 结构化数据 | 已有基础设施 | 非标准共享 |

### 9.4 同步机制建议

```
本地实例 ←→ GitHub Repo (Skills + 脚本 + 文档)
    ↓
本地实例 ←→ 云盘 (大文件 + 下载材料)
    ↓
本地实例 ←→ LLM Wiki (知识库 + 语义搜索)
    ↓
本地实例 ←→ 飞书 (结构化数据 + 交互)
```

---

## 十、特性总览

### ✅ 已具备

- [x] 多 LLM Provider 支持（20+）
- [x] 多平台消息网关（飞书 + 微信）
- [x] 多智能体路由（灵感/新闻/术语/通用）
- [x] 飞书全链路集成（消息/卡片/文档/多维表格）
- [x] 持久记忆（跨会话）
- [x] 技能系统（100+ 技能，支持自研）
- [x] Cron 定时任务
- [x] 子智能体委派（delegate_task）
- [x] 上下文自动压缩
- [x] 凭证池自动轮换
- [x] 安全审批（命令确认）

### 🔧 需要完善

- [ ] 视觉模型接入（auxiliary vision provider）
- [ ] 图片生成接入（FAL_KEY）
- [ ] 浏览器自动化（Playwright）
- [ ] 云端技能共享（Skill Hub / GitHub）
- [ ] 跨实例记忆同步
- [ ] 大文件云存储（S3/OSS）
- [ ] 论文检索智能体（arXiv + 语义搜索）
- [ ] LLM Wiki 知识库集成

### 📋 规划中

- [ ] 云端共享库整体架构设计
- [ ] 多实例编排与任务分发
- [ ] 共享技能发布/订阅机制
- [ ] 跨实例记忆隔离与共享策略
- [ ] 统一数据产物存储与检索

---

*本文件由 Hermes Agent 自动生成，作为云端共享库设计方案的输入。*
