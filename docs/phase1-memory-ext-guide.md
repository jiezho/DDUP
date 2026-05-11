# Phase 1：Memory 外溢机制 — 使用指南

> 目标：解决 Hermes 内置 Memory ~2200 字符饱和问题
> 适用实例：hermes-main (89%)、hermes-research (99%)、hermes-devops (高)

---

## 快速开始

### 1. 安装 memory-ext-client 技能

在各 Hermes 实例中执行：

```bash
# 复制技能到本地 skills 目录
cp -r shared-library/registry/published/memory-ext-client ~/.hermes/skills/

# 配置环境变量（添加到 ~/.bashrc 或 Docker compose env）
export DDUP_PATH=/path/to/DDUP          # DDUP 仓库本地绝对路径
export HERMES_INSTANCE_ID=hermes-xxx    # 当前实例 ID
```

### 2. 验证安装

```bash
cd $DDUP_PATH
python shared-library/registry/published/memory-ext-client/scripts/memory_ext.py status
```

预期输出：
```json
{
  "instance_id": "hermes-research",
  "self_files": 4,
  "self_size_bytes": 3850,
  "shared_files": 3,
  "shared_size_bytes": 3405,
  "total_size_kb": 7.08
}
```

---

## 三层记忆策略

| 层级 | 位置 | 内容建议 | 容量 |
|------|------|----------|------|
| **热记忆** | 内置 Memory | 当前项目名、关键 API token、用户偏好、最近 3 个上下文 | ~2200 字符 |
| **温记忆** | memory-ext/{自身}/ | 领域知识、已处理索引、踩坑记录、Cron 配置、文档索引 | 无上限 |
| **冷记忆** | memory-ext/shared/ | 跨实例共享：用户画像、网络可达性、API 经验 | 无上限 |

---

## 典型使用场景

### 场景 A：Memory 饱和时的迁移

当内置 Memory 接近 100%：

```bash
# 1. 查看当前扩展记忆状态
python memory_ext.py status

# 2. 将低频记忆迁出（以"论文索引"为例）
python memory_ext.py migrate --from-memory "已处理论文"
# 返回操作指引，按指引将内容保存到扩展记忆

# 3. 实际保存
python memory_ext.py save --scope self --key "已处理论文索引" --content "arXiv:2401.001|Transformer Survey|2026-05"

# 4. 从内置 Memory 中删除对应条目，释放空间
```

### 场景 B：跨实例查询知识

```bash
# 查询所有实例关于"API 限流"的知识
python memory_ext.py query --scope all --keywords "API,限流,rate limit"

# 仅查询共享区
python memory_ext.py query --scope shared --keywords "飞书,写入"

# 仅查询自身
python memory_ext.py query --scope self --keywords "论文,arXiv"
```

### 场景 C：Cron 任务归档时的知识沉淀

Cron 子智能体在执行完推送后：

```bash
# 将本次产出的关键发现保存到扩展记忆
python memory_ext.py save --scope self \
  --key "paper-scout-$(date +%Y%m%d)" \
  --content "今日发现 3 篇具身智能相关论文：1. xxx 2. xxx 3. xxx"
```

### 场景 D：新增共享知识

当某个实例发现跨实例有价值的经验：

```bash
# 保存到 shared/ 目录，所有实例可见
python memory_ext.py save --scope shared \
  --key "Semantic Scholar 限流策略" \
  --content "请求间隔最少 8 秒，建议先 arXiv 获取 paper_id 再查引用网络"
```

---

## 各实例已创建的扩展记忆文件

### hermes-research（科研实例）
- `paper-index.md` — 已处理论文索引
- `feishu-docs-index.md` — 11 份飞书长文档清单（~3121 blocks）
- `domain-knowledge.md` — 新能源 + 具身智能领域知识
- `cron-jobs-config.md` — 6 个定时任务配置备忘

### hermes-devops（DevOps 实例）
- `bitable-connections.md` — 3 个飞书多维表格连接信息
- `news-sources.md` — 28 源新闻聚合器配置
- `terminology-corpus.md` — 186 条术语库管理

### hermes-main（主实例）
- `project-contexts.md` — DDUP 项目上下文 + 环境配置

### shared（跨实例共享）
- `user-profile.md` — 用户画像
- `api-experience.md` — API 踩坑经验汇总
- `network-reachability.md` — 网络可达性矩阵

---

## 注意事项

1. **文件命名**：使用 `memory_ext.py save --key` 时，key 会被规范化（小写、空格转连字符），建议用简短英文或中文标识
2. **并发安全**：当前实现为文件级操作，多实例同时写入同一文件可能产生冲突。建议不同实例写入不同文件，或写入 `shared/` 时避免同时操作同一 key
3. **隐私边界**：`memory-ext/{其他实例}/` 通过 query --scope all 只返回摘要（前 500 字符），完整内容需该实例主动共享到 `shared/`
4. **Git 同步**：扩展记忆文件随 DDUP 仓库提交到 Git，变更自动同步到所有实例（需各实例定期 git pull）

---

## 下一步

- Phase 2：Cron 产出双写（推送 + 归档）
- Phase 3：材料持久化（PDF/视频 → MinIO）
