# Hermes Agent 架构与使用指南

> 官方主页：[https://hermes-agent.nousresearch.com/](https://hermes-agent.nousresearch.com/)
> 开源协议：MIT License

Hermes Agent 是由知名开源大模型团队 Nous Research 推出的一款“伴随你成长”的自治智能体框架。它不仅仅是一个绑定在 IDE 中的编码助手或某个单一 API 的聊天外壳，而是一个可以部署在你的服务器上、能够记住所学知识、并且运行时间越长能力越强的独立 Agent 系统。

## 1. 核心定位与技术路线

Hermes Agent 采用了**“推理优先、配置驱动”**的技术路线，旨在充分发挥 Hermes 系列模型（特别是 Hermes 3）在推理、函数调用和长上下文遵循方面的能力。

- **持续成长与记忆机制 (Grows the Longer It Runs)**：
  具备持久化记忆能力，能够自动生成和学习新技能（Auto-generated skills），深入理解你的项目上下文，且“永远不会遗忘解决过的方案”。
- **跨平台无缝连接 (Lives Where You Do)**：
  支持 Telegram、Discord、Slack、WhatsApp、Signal、Email 和 CLI 等多种终端。用户可以在一个平台发起任务，在另一个平台无缝接续。
- **配置即动力**：
  将复杂的 Agent 行为从代码逻辑解耦，转变为通过结构化的 Markdown 文档进行驱动（如定义 Agent 人格 `SOUL.md`、上下文 `AGENTS.md` 和用户画像 `USER.md`），而非单纯的硬编码 Prompt。
- **自动化与计划任务 (Scheduled Automations)**：
  支持通过自然语言配置 Cron 定时任务，用于生成报告、备份数据或整理简报，允许 Agent 在网关后无人值守运行。

## 2. 底层架构与框架体系

Hermes Agent 的架构可以概括为 **“三位一体配置 + 技能中心 + 隔离沙盒 + 状态持久化”**。

### 2.1 核心架构组件
- **代理委托与并行化 (Delegates & Parallelizes)**：
  支持隔离的子智能体（Subagents）架构，子 Agent 拥有独立的对话上下文、终端和 Python RPC 脚本，实现零上下文成本的流水线作业。
- **沙盒与安全隔离 (Real Sandboxing)**：
  提供五种执行后端沙盒：`Local`（本地）、`Docker`、`SSH`、`Singularity`、`Modal`。通过容器强化和命名空间隔离，保障 Agent 执行复杂环境操作时的安全性。
- **全方位 Web 与浏览器控制 (Full Web & Browser Control)**：
  原生集成 Web 搜索、浏览器自动化操作、视觉识别、图像生成、TTS（文本转语音）以及多模型推理能力。
- **记忆与状态管理 (Memories)**：
  底层利用 SQLite (WAL 模式) 管理会话历史、任务状态和全文搜索索引（FTS5），支持复杂的长短期记忆检索。

### 2.2 技能引擎 (Skills Engine)
基于 Python 的插件化体系，允许 Agent 在运行过程中操作外部环境（文件、网络、数据库等）。开发者只需编写带有文档注释的 Python 函数，框架即可自动生成模型可识别的工具接口，并被 Agent 自动索引加载。

## 3. 安装与使用方法

Hermes Agent 提供了极简的 CLI 工具和一键安装脚本。

### 3.1 环境要求
- 类 Unix 环境（Linux/macOS）
- Windows 系统必须启用 **WSL2**

### 3.2 安装步骤
在终端运行官方提供的一键安装脚本：
```bash
curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash
```

### 3.3 初始化配置
安装完成后，执行以下命令进行初始化设置（配置 API Key、模型提供商及集成的通讯平台）：
```bash
hermes setup
```
> 配置信息与独立数据库通常会保存在用户家目录下的 `~/.hermes/` 目录中。

### 3.4 基本使用场景
- **交互模式 (CLI)**：
  直接在终端启动对话：
  ```bash
  hermes chat
  ```
- **执行特定任务**：
  直接在命令行传递指令让 Agent 运行：
  ```bash
  hermes run "分析当前目录下的代码结构并总结其架构设计"
  ```
- **跨平台接入**：
  在 `hermes setup` 过程中，可以配置绑定 Telegram、Discord 或 Slack 的 Bot Token，从而在手机端随时与你的 Hermes Agent 交互，并使其执行系统级操作。

## 总结
Hermes Agent 不仅仅是一个简单的对话机器人，它是一套**可私有化部署的生产力引擎**。通过极低门槛的 Markdown 配置、强大的沙盒隔离和多端打通特性，它非常适合作为“个人数字员工”或高度定制化的全能 AI 助手。
