# 项目上下文索引

## 当前活跃项目

### DDUP（AI 个人成长平台）
- 代码仓库：jiezho/DDUP (GitHub)
- 技术栈：Python + FastAPI + React
- 部署：Docker / WSL2 / LXC
- 关键路径：apps/api/, apps/web/, shared-library/

### LLM Wiki / Obsidian Vault
- 路径：/opt/data/memories/ 相关
- 当前用途：知识图谱构建（暂未深度使用）

## 环境配置备忘
- Docker 容器运行于 WSL2，持久化在 /opt/data/ (1TB ext4)
- D: 盘挂载至 /root/.hermes（读写配置）
- E: 盘挂载至 /host/e（只读）
- Python 环境：系统环境 /opt/hermes/.venv；用户环境 ~/research-env

## 子 Agent 可用列表
- Claude Code：编程任务委派
- Codex：代码生成
- OpenCode：开源项目分析
- 最多并行 3 个子 Agent

## 版本更新检测
- Cron：每日 09:00 检测新版本
- 更新方式：宿主机拉取新镜像 + 重建容器
