# Wiki Write

## 何时使用
当需要将知识产出写入 LLM Wiki（Obsidian Vault）时调用。支持论文笔记、技术总结、领域知识等。

## 命令

### 写入 Wiki
```
wiki-write --title "标题" --content "Markdown内容" --tags "tag1,tag2" --citations '[{"type":"paper","ref":"arxiv:2406.xxxx"}]'
```

## 规则
- 文件自动写入 `shared-library/wiki/_raw/{自身instance-id}/` 目录
- 文件名格式：`{YYYYMMDD-HHMM}-{slug}.md`
- 每个文件包含 YAML frontmatter（title, instance_id, tags, citations, status）
- 编译器每 30 分钟扫描 `_raw/` 并提升为正式页面
- 跨实例概念重叠时自动合并，冲突标记 `needs_review`

## 环境依赖
- DDUP_PATH
- HERMES_INSTANCE_ID
