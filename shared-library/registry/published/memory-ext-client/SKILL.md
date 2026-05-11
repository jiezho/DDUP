# Memory Extension Client

## 何时使用
当你的内置 Memory 接近饱和（利用率 > 80%），或需要查阅跨实例共享知识时调用本技能。

## 背景
Hermes 内置 Memory 容量仅约 2200 字符。hermes-research 已达 99%，hermes-main 达 89%。
Memory 扩展层（memory-ext/）作为"外溢缓存"，将低频/长尾记忆沉淀到文件系统，
通过本技能按需检索，解决容量瓶颈。

## 命令

### 存入扩展记忆
```
memory-ext save --scope {self|shared} --key "简短标识" --content "要保存的知识"
```
- scope=self → 写入 `memory-ext/{自身instance-id}/`（仅自身可读写）
- scope=shared → 写入 `memory-ext/shared/`（所有实例可读写）

### 查询扩展记忆
```
memory-ext query --scope {self|shared|all} --keywords "关键词1,关键词2"
```
- scope=all → 检索所有实例目录（其他实例返回摘要，不超过500字符）

### 迁移低频记忆
```
memory-ext migrate --from-memory "要迁出的记忆条目前缀"
```
- 返回操作指引，需人工确认后从内置 Memory 中移除对应条目以释放空间

## 文件格式规范
每个 .md 文件为一个知识单元：
- 首行 `# 标题` 为知识主题
- 正文为内容，支持 Markdown
- 追加更新时自动附加时间戳分隔线

## 三层记忆策略
| 层级 | 位置 | 内容 | 访问方式 |
|------|------|------|----------|
| 热记忆 | 内置 Memory (~2200字符) | 最高频事实、当前项目、关键配置 | Hermes 原生 |
| 温记忆 | memory-ext/{自身}/ | 领域知识、索引、踩坑记录 | memory-ext-client |
| 冷记忆 | memory-ext/shared/ | 跨实例共享的环境事实、网络可达性 | memory-ext-client |

## 示例
```
# 当内置 Memory 中有"已调研论文列表"但占用空间较大时：
memory-ext save --scope self --key "已处理论文索引" --content "arXiv:2401.001|Transformer Survey|2026-05"

# 然后在内置 Memory 中删除该条目，释放约 50-100 字符空间
# 需要时查询：
memory-ext query --scope self --keywords "论文,arXiv"
```

## 环境依赖
- DDUP_PATH：指向 DDUP 仓库根目录
- HERMES_INSTANCE_ID：当前实例标识（如 hermes-research）
