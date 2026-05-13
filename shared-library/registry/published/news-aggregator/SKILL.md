# News Aggregator

## 何时使用
当需要聚合多源新闻并输出结构化摘要（用于飞书推送、归档、术语抽取）时使用。

## 状态
当前仓库仅提供最小可执行骨架，用于对齐 shared-library 发布包结构。实际抓取与解析需在实例侧实现。

## 命令
```
news-aggregator --sources "hn,github,36kr" --limit 20
```
