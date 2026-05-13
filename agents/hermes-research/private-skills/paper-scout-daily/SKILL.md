# paper-scout-daily

## 目的
每日 arXiv 论文检索与摘要推送，并将产出归档写入 shared-library（推送 + 归档双写示例）。

## 执行步骤（核心）
1. 生成日报内容（可替换为真实 arXiv 检索链路）
2. 推送（预留）
3. 调用 `cron-archive save` 写入 `shared-library/outputs/{instance}/cron-archives/paper-scout-daily/` 并更新 `.index.json`

## 运行
```
python agents/hermes-research/private-skills/paper-scout-daily/scripts/paper_scout_daily.py --query "embodied intelligence"
```

## 环境变量
- DDUP_PATH：仓库根目录
- HERMES_INSTANCE_ID：应为 hermes-research
