# Cross Instance Query

## 何时使用
当需要查询其他实例的产出、扩展记忆或 Cron 归档时调用。

## 命令

### 全局搜索
```
cross-query search --keywords "具身智能" --sources "outputs,memory,wiki,cron"
```

### 按来源查询
```
cross-query outputs --keywords "transformer" --from "hermes-research"
cross-query memory --keywords "API限制" --scope all
cross-query cron --job-id "paper-scout-daily" --date-range "2026-05-01,2026-05-11"
```

## 权限说明
- 只能读取其他实例的公开产出和 shared/ 记忆
- 其他实例的 memory-ext/{id}/ 只返回摘要（前500字符）
- 尊重 isolation-rules.json 中的访问控制矩阵

## 环境依赖
- DDUP_PATH
- HERMES_INSTANCE_ID
