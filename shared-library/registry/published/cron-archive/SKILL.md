# Cron Archive

## 何时使用
在 Cron 任务完成推送（飞书卡片/文档/消息）后，调用本技能将产出归档到共享库，实现推送+归档双写。

## 背景
当前所有 Cron 产出仅推送到飞书，没有持久化归档。一旦飞书消息过期或需要历史回溯，无法检索。
本技能在每个 Cron 任务完成后，将产出同时写入共享库的 `outputs/{instance-id}/cron-archives/{job-id}/` 目录。

## 命令

### 归档产出
```
cron-archive save --job-id "paper-scout-daily" --content "..." --metadata '{"papers_count": 5}'
```

### 参数
- `job_id`: 任务标识（对应 cron-registry.json 中的 id）
- `content`: 归档内容（JSON 或 Markdown 字符串）
- `metadata`: 额外元数据（JSON 对象）
- `attachments`: 附件列表（文件路径列表，大文件自动上传 MinIO）

## 归档路径
`shared-library/outputs/{instance-id}/cron-archives/{job-id}/{YYYY-MM-DD}.json`

## 使用示例

```bash
# Paper Scout 归档
python scripts/cron_archive.py save \
  --job-id "paper-scout-daily" \
  --content '{"papers": [{"title": "...", "arxiv_id": "..."}]}' \
  --metadata '{"title": "Paper Scout Daily", "summary": "今日新增 5 篇候选论文", "papers_count": 5, "sources": ["arxiv"], "status": "success", "duration_ms": 3400}'

# 新闻术语推送归档
python scripts/cron_archive.py save \
  --job-id "news-terminology-daily" \
  --content '{"news": [...], "terms": [...]}' \
  --metadata '{"title": "News Terminology Daily", "summary": "完成新闻与术语推送", "news_count": 10, "new_terms": 2, "status": "success", "duration_ms": 1800}'
```

## 集成到 Cron 技能

在每个 Cron 子智能体的 SKILL.md 末尾追加：

```markdown
## 归档步骤
在完成飞书推送后，执行：
1. 将本次产出的核心内容汇总
2. 调用 cron-archive save 写入共享库
3. 大文件（PDF/数据集）通过 --attachments 参数自动上传 MinIO
```

## 环境依赖
- DDUP_PATH
- HERMES_INSTANCE_ID
- MINIO_ENDPOINT / MINIO_BUCKET / MINIO_ACCESS_KEY / MINIO_SECRET_KEY（用于附件上传）
