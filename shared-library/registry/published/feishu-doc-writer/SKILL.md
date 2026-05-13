# Feishu Doc Writer

## 何时使用
当需要把长内容稳定写入飞书文档（分批写入、失败重试、800+ blocks）时使用。

## 状态
当前仓库仅提供最小可执行骨架，用于对齐 shared-library 发布包结构。具体飞书写入能力需在实例侧结合飞书凭证实现。

## 命令
```
feishu-doc-writer --title "标题" --content "Markdown 内容" --doc-id "可选：目标 doc_id"
```

## 环境依赖
- FEISHU_APP_ID
- FEISHU_APP_SECRET
