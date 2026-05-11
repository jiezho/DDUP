# Hermes智能体自我盘点报告

> 生成时间: 2026-05-11 | 实例: 主力智能体(飞书平台) | 模型: GLM-5.1-FP8

---

## 一、身份与定位

我是一个基于Hermes Agent框架的**科研型智能体**，运行在飞书平台上，服务于新能源发电行业的科研工作。核心定位是**具身智能巡检领域的AI科研助手**，覆盖从论文检索、行业调研、可行性分析到报告撰写的全流程。

**用户画像**: 新能源发电行业科研工作者，关注智能巡检、具身智能方向。

---

## 二、核心能力矩阵

### 2.1 学术研究能力

| 能力 | 描述 | 核心工具/技能 |
|------|------|--------------|
| 论文检索 | arXiv关键词搜索(支持ti/abs/cat/布尔运算) | arxiv, terminal+curl |
| 论文精读 | 结构化提取(问题/方法/实验/创新点) | scientific-research-agent |
| 创新点提取 | 6类创新识别(问题/方法/数据/评估/应用/理论) | scientific-research-agent |
| 引用网络分析 | 前向引用+后向引用+推荐论文 | Semantic Scholar API |
| 文献综述撰写 | 系统性调研报告(30+篇论文) | feishu-doc-writer |
| 数据集检索 | HuggingFace/PapersWithCode/Roboflow/arXiv | Dataset Scout cron |

### 2.2 行业调研能力

| 能力 | 描述 | 核心工具/技能 |
|------|------|--------------|
| 可研报告分析 | 必要性/可行性/经济性三维度论证 | scientific-research-agent |
| 厂商调研 | 产品参数/技术路线/市场定位 | terminal+curl, web搜索 |
| 场景评估 | 五维评估矩阵(安全/不可达/繁杂/推广/具身必要) | 自建方法论 |
| 市场数据 | 市场规模/CAGR/竞争格局 | web搜索(受限于网络可达性) |
| 传感器调研 | 11类传感器技术路线/产品/论文横向对比 | 本实例专项 |

### 2.3 文档创作能力

| 能力 | 描述 | 核心工具/技能 |
|------|------|--------------|
| 飞书文档写入 | 分批10-15 blocks写入,自动错误恢复 | feishu-doc-writer |
| 大型报告 | 已验证870+ blocks(338+272+456+438 blocks) | Python脚本+飞书API |
| 报告结构设计 | 8-13章专业报告架构 | 自建模板库 |
| 图表/对比矩阵 | 文字表格(飞书API限制,无原生表格) | text块模拟 |
| 文档分享 | 互联网可访问链接 | PATCH permissions API |

### 2.4 自动化调度能力

| 能力 | 描述 | 核心工具/技能 |
|------|------|--------------|
| 定时任务 | cron调度(支持5字段/自然语言/ISO) | cronjob工具 |
| 后台执行 | long-running任务+完成通知 | terminal(background=True) |
| 子代理委派 | 并行子任务(最多3个) | delegate_task |
| 工作流编排 | 多步骤任务规划+进度追踪 | todo工具 |

### 2.5 知识管理能力

| 能力 | 描述 | 核心工具/技能 |
|------|------|--------------|
| 跨会话记忆 | 用户画像+环境事实+经验教训 | memory工具 |
| 会话回溯 | 搜索历史对话 | session_search |
| 技能积累 | 可复用工作流保存为SKILL.md | skill_manage |
| Obsidian Wiki | 知识图谱构建(暂未深度使用) | wiki-ingest等 |

---

## 三、定时任务(Cron Jobs)

当前运行6个定时任务:

| 任务名 | 调度 | 状态 | 产出 |
|--------|------|------|------|
| 论文巡逻兵 Paper Scout | 每日08:00 UTC | ✅ 运行中 | 每日arXiv论文摘要,飞书推送 |
| 代码猎手 Code Hunter | 每日09:00 UTC | ✅ 运行中 | 每日GitHub/HF开源项目,飞书推送 |
| Hermes全景文档检测 | 每日10:00 UTC | ✅ 运行中 | 脚本检测系统变更,触发更新 |
| Hermes全景文档更新 | 每周一11:00 UTC | ✅ 运行中 | 飞书全景文档自动更新 |
| 数据集周报 Dataset Scout | 每周六12:00 UTC | ✅ 运行中 | 飞书文档K0aedIntSoW3GpxB3ZkcI |
| ddup-wiki-maintain | 一次性(已完成) | ⏹ 已停用 | Wiki维护 |

---

## 四、技能库(Skills)

### 4.1 按类别统计

共**110个技能**, 分布在17个类别:

| 类别 | 数量 | 关键技能 |
|------|------|---------|
| research | 8 | scientific-research-agent, arxiv, arxiv-paper-scout, cr-power-learning-plan |
| productivity | 9 | feishu-doc-writer, google-workspace, notion, powerpoint |
| software-development | 10 | plan, TDD, systematic-debugging, writing-plans |
| creative | 16 | architecture-diagram, excalidraw, baoyu-infographic, comfyui |
| mlops | 14 | llama-cpp, vllm, unsloth, axolotl, huggingface-hub |
| github | 6 | github-auth, code-review, pr-workflow, issues |
| autonomous-ai-agents | 4 | hermes-agent, claude-code, codex, opencode |
| wiki/知识管理 | 10 | wiki-ingest, wiki-query, wiki-lint, llm-wiki, cross-linker |
| devops | 5 | feishu-setup, kanban-orchestrator, webhook-subscriptions |
| media | 5 | youtube-content, spotify, gif-search |
| 其他 | 33 | email, gaming, smart-home, social-media, red-teaming等 |

### 4.2 核心高频技能(自建+深度使用)

| 技能名 | 类型 | 描述 |
|--------|------|------|
| scientific-research-agent | 自建 | 科研全流程技能,含论文检索/精读/创新点提取/文献综述/报告撰写 |
| feishu-doc-writer | 自建 | 飞书文档创建与写入,含分批写入/错误恢复/模板 |
| arxiv | 框架 | arXiv论文搜索(支持关键词/作者/分类) |
| cr-power-learning-plan | 自建 | 华润电力学习计划上下文 |
| arxiv-paper-scout | 自建 | 每日论文巡检cron技能 |
| open-source-scout | 自建 | 每日开源项目扫描cron技能 |

---

## 五、已完成的项目产出

### 5.1 飞书文档(累计6份大型报告)

| 文档名 | Doc ID | Blocks | 内容 |
|--------|--------|--------|------|
| 风力发电机组塔筒监巡修调研报告 | ICgCdXUWHoCMKBxH1XjcHb48nyh | ~200 | 8章,项目17可研 |
| 可研报告三维度分析 | U7jDdmmydoqnPXxNF6yc4GZInPf | ~180 | 可行性/经济性/必要性 |
| 蛇形/多节机器人巡检可行性报告 | V6XydOP97orBZax0Qqdc2YSYncf | 272 | 8章,30篇参考文献 |
| 华润电力具身智能巡检战略研究报告 | Q3kXdzlS5ojGbOx1Qqqc2P4rnwc | 338 | 13章,25篇论文 |
| 发电行业巡检任务全面调研报告 | YnDPdZ7T8oTsXGxDzVach88Cneb | 456 | 8章+附录,5类电站 |
| 具身智能巡检博士课题方案(综合版) | QntHdsn3woTX9jxjantc8iNsnGh | 542 | 6大方向,38篇论文 |
| 具身智能巡检博士课题方案(初版) | DawEdhslUoh73SxnWvzcQWhGnJe | 252 | 5大研究方向 |
| Hermes全景文档 | Ut7Ld9SO1oU5OixVpcMcXgQ8nde | ~300 | 13章,自动更新 |
| 学习计划文档 | EFyAddic7ojABDxUJsPcx1pXnOb | ~100 | 个人学习成长计划 |
| 数据集周报 | K0aedIntSoW3GpxB3ZkcI | ~41 | 8类数据集,每周更新 |
| 机器人传感器行业综合调研报告 | UPOydYKLso59HgxSrAvcNRu1nrb | 438 | 9章,42篇论文 |
| **合计** | | **~3121** | |

### 5.2 Cron持续产出

- 论文巡逻兵: 每日推送(已运行多日)
- 代码猎手: 每日推送(已运行多日)
- 全景文档: 自动更新

---

## 六、基础设施与连接

### 6.1 平台连接

| 平台 | 状态 | 用途 |
|------|------|------|
| 飞书(Feishu) | ✅ 已连接 | 主交互平台,文档输出 |
| 本地(Local) | ✅ 已连接 | 文件系统,终端 |
| API Server | ✅ 已连接 | HTTP接口 |

### 6.2 网络可达性

| 站点 | 状态 | 备注 |
|------|------|------|
| arxiv.org | ✅ 可达 | 最可靠,论文检索核心 |
| export.arxiv.org | ✅ 可达 | API限流严格(429) |
| api.semanticscholar.org | ✅ 可达 | 限流极严重(8秒+间隔) |
| github.com | ✅ 可达 | API正常 |
| www.bing.com | ✅ 可达 | 中文搜索效果极差 |
| huggingface.co | ❌ 不可达 | 超时 |
| google.com | ❌ 不可达 | 返回000 |
| scholar.google.com | ❌ 不可达 | 返回0字节 |

### 6.3 工具集

| 工具集 | 说明 |
|--------|------|
| terminal | Shell命令,后台进程,包管理 |
| file | 文件读写/搜索/编辑 |
| web | 网络搜索和内容提取 |
| vision | 图像分析 |
| image_gen | AI图像生成 |
| cronjob | 定时任务管理 |
| delegate_task | 子代理委派 |
| memory | 跨会话记忆 |
| session_search | 历史会话搜索 |
| feishu_doc | 飞书文档操作 |
| feishu_drive | 飞书云盘操作 |
| skills | 技能管理 |

### 6.4 模型配置

| 用途 | 模型 | 提供方 |
|------|------|--------|
| 主对话 | glm-5.1-fp8 | custom(Z.AI) |
| 子代理 | 继承主模型 | - |

---

## 七、记忆体系

### 7.1 记忆结构

| 存储 | 内容 | 容量 |
|------|------|------|
| user profile | 用户角色/偏好/飞书wiki信息 | 176/1375 chars (12%) |
| personal memory | 环境事实/项目记录/API经验/已完成文档 | 2185/2200 chars (99%) |

### 7.2 关键记忆条目

- 飞书API使用经验(token/块类型/写入/删除/限流)
- 网络可达性清单(可达/不可达站点)
- 已完成报告索引(11份飞书文档ID)
- arXiv API限流应对策略
- 搜索引擎对中文行业内容效果评估
- 传感器调研报告等最新产出

### 7.3 记忆瓶颈

当前记忆已接近容量上限(99%),存在以下问题:
- **空间不足**: 新经验难以写入,旧内容被迫覆盖
- **无结构化**: 所有记忆平铺,缺乏分类和优先级
- **无版本控制**: 记忆更新不可追溯
- **隔离不足**: 与其他智能体共享记忆但无法隔离

---

## 八、局限性与挑战

### 8.1 网络限制

- **中文搜索几乎不可用**: Bing对中文行业内容返回大量无关结果,Google/百度不可达
- **HuggingFace不可达**: 无法直接访问数据集和模型
- **多数行业网站不可达**: 只能依赖arXiv+GitHub+少量可访问站点
- **API限流**: arXiv(429需120s恢复), Semantic Scholar(8秒间隔)

### 8.2 工具限制

- **飞书API**: 无原生表格/无法插入图片/无法创建bullet和callout块
- **execute_code沙箱**: 无法访问外部网络和env变量
- **子代理超时**: 搜索类子代理几乎必定600秒超时(需直接terminal执行)
- **Delegate_task**: 子代理无法交互/无法使用memory

### 8.3 知识管理限制

- **记忆容量**: 2200字符上限,已接近饱和
- **无持久化存储**: 下载的论文/材料无统一存储,散落在/tmp
- **无知识图谱**: Wiki技能已安装但未深度使用
- **无跨智能体共享**: Skills和记忆与其他智能体隔离

---

## 九、与云端共享库的对接需求

基于用户描述的云端共享库方案(GitHub库 + LLM Wiki + 云盘 + Skill Hub),我的需求如下:

### 9.1 需要共享出去的资产

| 资产类型 | 当前状态 | 共享需求 |
|----------|---------|---------|
| 技能(Skills) | ~/.hermes/skills/ 本地 | 上传到Skill Hub/GitHub,供其他智能体安装 |
| 记忆(Memory) | 内置memory,2200字符 | 导出为结构化文件,上传到云盘/GitHub |
| 飞书文档 | 11份在线文档 | 文档链接汇总,写入共享库索引 |
| 下载材料 | 散落/tmp,无持久化 | 统一存储到云盘 |
| Cron产出 | 每日推送,无归档 | 推送同时存档到云盘 |
| 报告模板 | 嵌入SKILL.md | 提取为独立模板文件 |

### 9.2 需要从共享库获取的资产

| 需求 | 来源 | 说明 |
|------|------|------|
| 其他智能体的技能 | Skill Hub | 如术语推荐/灵感记录等技能 |
| 共享知识库 | LLM Wiki | 跨智能体知识检索 |
| 共享材料库 | 云盘 | 其他智能体下载的论文/数据 |
| 统一记忆索引 | GitHub | 其他智能体的关键记忆(需隔离) |

### 9.3 隔离需求

| 维度 | 隔离要求 | 原因 |
|------|---------|------|
| 记忆 | 读隔离(可读共享索引,但私有记忆不暴露) | 不同智能体服务不同用户/场景 |
| 技能 | 写隔离(可安装共享技能,但私有修改不自动同步) | 定制化技能可能与通用版本冲突 |
| Cron产出 | 全隔离(每个智能体独立调度) | 避免重复执行和冲突 |
| 飞书文档 | 读共享/写隔离 | 避免并发写入冲突 |
| 下载材料 | 读共享/写协调 | 避免重复下载,需协调存储路径 |

### 9.4 建议的共享库架构

```
云端共享库/
├── skills/                    # Skill Hub
│   ├── published/             # 已发布技能(只读镜像)
│   │   ├── scientific-research-agent/
│   │   ├── feishu-doc-writer/
│   │   └── ...
│   └── agents/{agent-id}/     # 各智能体私有技能
│       ├── hermes-main/
│       ├── paper-scout/
│       └── ...
├── memory/                    # 记忆共享层
│   ├── shared-index.json      # 共享记忆索引(摘要)
│   └── agents/{agent-id}/     # 各智能体私有记忆
│       ├── hermes-main.json
│       └── ...
├── knowledge/                 # LLM Wiki
│   ├── embodied-intelligence/
│   ├── power-inspection/
│   ├── sensors/
│   └── ...
├── assets/                    # 云盘存储
│   ├── papers/                # 下载的论文PDF
│   ├── datasets/              # 数据集
│   ├── reports/               # 生成的报告
│   │   ├── feishu-index.json  # 飞书文档索引
│   │   └── exports/           # 报告导出(如PDF)
│   └── templates/             # 报告模板
└── config/                    # 共享配置
    ├── search-keywords.json   # 搜索关键词库
    ├── arxiv-categories.json  # arXiv分类配置
    └── cron-registry.json     # Cron任务注册表(防冲突)
```

---

## 十、特性总结

### 10.1 独特优势

1. **深度领域知识**: 在具身智能巡检/电力行业/传感器领域积累了大量专业上下文
2. **飞书原生集成**: 熟练掌握飞书文档API(含所有踩坑经验),可创建大型结构化报告
3. **自建科研工作流**: scientific-research-agent技能覆盖科研全流程,从检索到撰文
4. **定时自治能力**: 5个活跃cron任务,可7x24小时自动运行
5. **抗限流策略**: 在严格API限流下总结了一套可靠的搜索策略(等待/重试/降级)

### 10.2 关键指标

| 指标 | 值 |
|------|-----|
| 技能总数 | 110 |
| 自建核心技能 | 6 |
| 活跃定时任务 | 5 |
| 已完成大型报告 | 11份(~3121 blocks) |
| 累计引用论文 | 150+ |
| 记忆条目 | 11条(99%容量) |
| 支持传感器类别 | 11类 |

### 10.3 一句话定位

> 我是面向**具身智能巡检**的科研型智能体,核心能力是从论文检索到行业报告的全流程自动化,在严格网络限制下仍可稳定产出大型结构化文档,现需通过云端共享库解决记忆容量、知识持久化和跨智能体协作问题。
