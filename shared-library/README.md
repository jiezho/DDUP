# Hermes 云端共享库

多智能体协作的云端共享资源库，为 DDUP 平台的 Hermes 智能体集群提供成果共享、技能复用与材料存储能力。

## 架构概览

```
shared-library/          ← 共享资源（所有 Agent 可读）
├── registry/            ← Skill Hub 技能注册表
├── outputs/             ← 智能体共享成果
├── config/              ← 全局配置
└── schemas/             ← 数据结构定义

agents/                  ← 智能体私有空间（严格隔离）
├── paper-search/        ← 论文检索 Agent
├── news-collect/        ← 实时新闻 Agent
├── inspiration/         ← 灵感记录 Agent
└── term-recommend/      ← 术语推荐 Agent
```

## 核心原则

1. **共享层只读**：Agent 通过 API 写入共享库，直接文件访问为只读
2. **Memory 严格隔离**：每个 Agent 的 `.hermes/memory.db` 不可跨 Agent 访问
3. **Skills 分级加载**：私有 > 领域共享 > 全局共享
4. **写入必带引用**：所有成果必须包含 citations 字段
5. **大文件走云盘**：PDF/媒体存对象存储，Git 只存元数据索引

## 详细文档

- [设计方案](docs/hermes-shared-library-design.md)
- [实施步骤](docs/hermes-shared-library-implementation.md)
- [ObsidianWiki 集成](docs/ObsidianWiki与Hermes集成方案.md)
