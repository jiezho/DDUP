# Hermes 云端共享库 — V2 分步实施指南

> 本文档为智能体可执行的实施步骤，对应设计文档 Phase 0-7。
> 执行环境：三个 Hermes 实例 + 服务器 192.168.102.204 + GitHub 仓库 jiezho/DDUP
> 前置条件：MinIO 已部署在 204 服务器 (端口 9000/9001)

---

## Phase 0：注册表更新与目录创建（已完成 ✅）

> 本阶段已在设计 V2 时完成，此处记录供参考和验证。

### Step 0.1：instances.json 已创建

路径：`shared-library/registry/instances.json`

包含三个实例：hermes-main、hermes-research、hermes-devops 完整注册信息。

**验证命令**：
```bash
python -c "import json; d=json.load(open('shared-library/registry/instances.json')); print(f'已注册 {len(d[\"instances\"])} 个实例'); [print(f'  - {i[\"id\"]} ({i[\"deployment\"][\"type\"]})') for i in d['instances']]"
```

### Step 0.2：目录结构已创建

agents/ 下三个实例目录 + SOUL.md，shared-library/ 下 outputs/memory-ext/wiki/ 按实例展开。

**验证命令**：
```bash
tree shared-library/ -L 3 --dirsfirst
tree agents/ -L 2
```

---

## Phase 1：Memory 外溢机制

> 目标：解决 Memory 2200 字符饱和问题，提供三层记忆检索。

### Step 1.1：创建 memory-ext-client 共享技能

**执行者**：hermes-main（发布后其他实例安装）

**路径**：`shared-library/registry/published/memory-ext-client/`

**SKILL.md**：
```markdown
# Memory Extension Client

## 何时使用
当你的内置 Memory 接近饱和，或需要查阅跨实例共享知识时调用。

## 命令

### 存入扩展记忆
```
memory-ext save --scope {self|shared} --key "简短标识" --content "要保存的知识"
```

### 查询扩展记忆
```
memory-ext query --scope {self|shared|all} --keywords "关键词1,关键词2"
```

### 迁移低频记忆
```
memory-ext migrate --from-memory "要迁出的记忆条目前缀"
```

## 实现机制
- self → 读写 `shared-library/memory-ext/{自身instance-id}/`
- shared → 读写 `shared-library/memory-ext/shared/`
- all → 只读检索所有目录（返回摘要）

## 文件格式
每个 .md 文件为一个知识单元，首行 # 标题，正文为内容。
按主题命名文件（如 paper-index.md, api-experience.md）。
```

**scripts/memory_ext.py**：
```python
#!/usr/bin/env python3
"""Memory Extension Client - 扩展记忆读写"""

import os
import sys
from pathlib import Path
from datetime import datetime

SHARED_LIB = Path(os.environ.get("DDUP_PATH", "/opt/ddup")) / "shared-library" / "memory-ext"
INSTANCE_ID = os.environ.get("HERMES_INSTANCE_ID", "unknown")

def save(scope: str, key: str, content: str):
    """保存知识到扩展记忆"""
    if scope == "self":
        target_dir = SHARED_LIB / INSTANCE_ID
    elif scope == "shared":
        target_dir = SHARED_LIB / "shared"
    else:
        raise ValueError(f"无效 scope: {scope}")
    
    target_dir.mkdir(parents=True, exist_ok=True)
    filename = key.replace(" ", "-").lower() + ".md"
    filepath = target_dir / filename
    
    # 追加或新建
    if filepath.exists():
        existing = filepath.read_text(encoding="utf-8")
        # 追加到末尾并标记时间
        content_with_ts = f"\n\n---\n*更新于 {datetime.now().strftime('%Y-%m-%d %H:%M')}*\n\n{content}"
        filepath.write_text(existing + content_with_ts, encoding="utf-8")
    else:
        filepath.write_text(f"# {key}\n\n{content}\n", encoding="utf-8")
    
    return {"status": "saved", "path": str(filepath)}

def query(scope: str, keywords: list):
    """查询扩展记忆"""
    search_dirs = []
    if scope in ("self", "all"):
        search_dirs.append(SHARED_LIB / INSTANCE_ID)
    if scope in ("shared", "all"):
        search_dirs.append(SHARED_LIB / "shared")
    if scope == "all":
        # 添加其他实例（只读摘要）
        for d in SHARED_LIB.iterdir():
            if d.is_dir() and d.name not in (INSTANCE_ID, "shared"):
                search_dirs.append(d)
    
    results = []
    for dir_path in search_dirs:
        if not dir_path.exists():
            continue
        for md_file in dir_path.glob("*.md"):
            text = md_file.read_text(encoding="utf-8")
            # 简单关键词匹配
            if any(kw.lower() in text.lower() for kw in keywords):
                # 返回摘要（前500字符）
                results.append({
                    "file": str(md_file.relative_to(SHARED_LIB)),
                    "scope": dir_path.name,
                    "title": text.split("\n")[0].replace("# ", ""),
                    "snippet": text[:500]
                })
    
    return {"results": results, "total": len(results)}

def migrate(memory_prefix: str):
    """将低频记忆从内置 Memory 迁移到扩展记忆（需人工复制内容）"""
    # 这是一个提醒流程，实际迁移由 Hermes 手动完成
    return {
        "instruction": f"请将 Memory 中以 '{memory_prefix}' 开头的条目复制到 memory-ext/{INSTANCE_ID}/ 对应文件中，然后从内置 Memory 中移除释放空间。",
        "target_dir": str(SHARED_LIB / INSTANCE_ID)
    }

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="cmd")
    
    save_p = sub.add_parser("save")
    save_p.add_argument("--scope", required=True)
    save_p.add_argument("--key", required=True)
    save_p.add_argument("--content", required=True)
    
    query_p = sub.add_parser("query")
    query_p.add_argument("--scope", default="all")
    query_p.add_argument("--keywords", required=True)
    
    migrate_p = sub.add_parser("migrate")
    migrate_p.add_argument("--from-memory", required=True)
    
    args = parser.parse_args()
    if args.cmd == "save":
        print(save(args.scope, args.key, args.content))
    elif args.cmd == "query":
        print(query(args.scope, args.keywords.split(",")))
    elif args.cmd == "migrate":
        print(migrate(getattr(args, "from_memory")))
```

**package.json**：
```json
{
  "name": "memory-ext-client",
  "version": "1.0.0",
  "description": "Memory 扩展层客户端，解决 2200 字符 Memory 饱和问题",
  "author": "hermes-main",
  "compatibility": "hermes >= 0.13.0",
  "dependencies": [],
  "env_vars": ["DDUP_PATH", "HERMES_INSTANCE_ID"],
  "install_instructions": "将本目录复制到 skills/ 中，配置环境变量 DDUP_PATH 指向 DDUP 仓库根目录"
}
```

### Step 1.2：各实例创建初始扩展记忆文件

**hermes-research 执行**：
```bash
# 创建科研实例扩展记忆
cat > shared-library/memory-ext/hermes-research/paper-index.md << 'EOF'
# 已处理论文索引

追踪 Paper Scout 已推送的论文，避免重复推送。

## 格式
- arXiv ID | 标题简写 | 推送日期 | 分类标签

## 索引
（由 Paper Scout Cron 自动追加）
EOF

cat > shared-library/memory-ext/hermes-research/feishu-docs-index.md << 'EOF'
# 飞书文档索引

记录所有已创建的飞书长文档引用。

| 文档名 | doc_token | 最后更新 | Block 数 |
|--------|-----------|----------|----------|
| 具身智能全景报告 | （填入实际token） | 2026-05 | ~800 |
| 多智能体通信协议研究 | （填入） | 2026-04 | ~400 |
（持续更新...）
EOF

cat > shared-library/memory-ext/hermes-research/domain-knowledge.md << 'EOF'
# 领域知识积累

## 新能源发电相关
- 关注方向：风电、光伏、储能、智能运维
- 核心期刊/会议：IEEE TPWRS, Applied Energy, Renewable Energy, CIRED

## 具身智能
- 重点跟踪：RT-2, Mobile ALOHA, 各开源框架
- 关键公司：Figure AI, 1X Technologies, Agility

## 多Agent系统
- 通信协议：A2A, MCP, LMOS
- 框架：CrewAI, AutoGen, LangGraph
EOF
```

**hermes-devops 执行**：
```bash
cat > shared-library/memory-ext/hermes-devops/bitable-connections.md << 'EOF'
# 飞书多维表格连接信息

## 灵感记录表
- app_token: VQq9bJLquamyYvsAefucWUYonDg
- table_id: tblXsQGwgUwBOW9s
- 字段：标题、分类、优先级、详情、创建时间

## 每日新闻汇总表
- app_token: Utm9bLdgyap198s1gluc4KqinKf
- table_id: tblqQbDcNjSUdsLg
- 字段：标题、摘要、来源、分类、日期

## 每日术语表
- app_token: Utm9bLdgyap198s1gluc4KqinKf
- table_id: tblHmFGcvK5nwTFV
- 累计术语：186 条，已推送：55 条
EOF

cat > shared-library/memory-ext/hermes-devops/news-sources.md << 'EOF'
# 新闻源配置

## 28源新闻聚合器来源列表
（从实际 Cron 配置中导出填入）
格式：源名称 | URL/API | 分类 | 更新频率 | 备注
EOF
```

### Step 1.3：配置实例环境变量

各实例需在启动配置中添加：

```bash
# hermes-main (Docker compose env)
DDUP_PATH=/opt/data/DDUP
HERMES_INSTANCE_ID=hermes-main

# hermes-research (服务器 env)
DDUP_PATH=/path/to/DDUP
HERMES_INSTANCE_ID=hermes-research

# hermes-devops (LXC env)
DDUP_PATH=/path/to/DDUP
HERMES_INSTANCE_ID=hermes-devops
```

**验证**：
```bash
# 在任意实例中测试
python scripts/memory_ext.py query --scope all --keywords "论文,paper"
# 应返回 hermes-research 的 paper-index.md
```

---

## Phase 2：Cron 产出双写（推送+归档）

> 目标：所有 Cron 任务在推送（飞书卡片/文档）的同时，将产出归档到共享库。

### Step 2.1：创建 cron-archive 共享技能

**路径**：`shared-library/registry/published/cron-archive/`

**SKILL.md**：
```markdown
# Cron Archive

## 何时使用
在 Cron 任务完成推送后，调用本技能将产出归档到共享库。

## 步骤
1. Cron 子智能体完成原有推送逻辑
2. 调用: `cron-archive save --job-id "paper-scout-daily" --content "..." --metadata '{"papers_count": 5}'`
3. 文件自动写入 `shared-library/outputs/{instance-id}/cron-archives/{job-id}/{date}.json`
4. .index.json 自动更新

## 参数
- job_id: 任务标识（对应 cron-registry.json 中的 id）
- content: 归档内容（JSON 或 Markdown）
- metadata: 额外元数据
- attachments: 附件列表（大文件自动上传 MinIO）
```

**scripts/cron_archive.py**：
```python
#!/usr/bin/env python3
"""Cron Archive - 定时任务产出归档"""

import os
import json
from pathlib import Path
from datetime import datetime

DDUP_PATH = Path(os.environ.get("DDUP_PATH", "/opt/ddup"))
INSTANCE_ID = os.environ.get("HERMES_INSTANCE_ID", "unknown")
OUTPUTS_DIR = DDUP_PATH / "shared-library" / "outputs"
INDEX_PATH = OUTPUTS_DIR / ".index.json"

MINIO_ENDPOINT = os.environ.get("MINIO_ENDPOINT", "http://192.168.102.204:9000")
MINIO_BUCKET = "ddup-shared-library"
MINIO_ACCESS_KEY = os.environ.get("MINIO_ACCESS_KEY", "")
MINIO_SECRET_KEY = os.environ.get("MINIO_SECRET_KEY", "")

def archive(job_id: str, content: str, metadata: dict = None, attachments: list = None):
    """归档 Cron 产出"""
    metadata = metadata or {}
    attachments = attachments or []
    now = datetime.now()
    date_str = now.strftime("%Y-%m-%d")
    
    # 1. 创建归档目录
    archive_dir = OUTPUTS_DIR / INSTANCE_ID / "cron-archives" / job_id
    archive_dir.mkdir(parents=True, exist_ok=True)
    
    # 2. 写入归档文件
    entry_id = f"{job_id}-{now.strftime('%Y%m%d-%H%M%S')}"
    archive_file = archive_dir / f"{date_str}.json"
    
    entry = {
        "id": entry_id,
        "job_id": job_id,
        "instance_id": INSTANCE_ID,
        "content": content,
        "metadata": metadata,
        "archived_at": now.isoformat(),
        "attachments": []
    }
    
    # 3. 处理附件（大文件上传 MinIO）
    for att in attachments:
        att_path = Path(att)
        if att_path.exists() and att_path.stat().st_size > 1_048_576:  # > 1MB
            # 上传到 MinIO
            storage_key = f"{INSTANCE_ID}/cron-archives/{job_id}/{date_str}/{att_path.name}"
            try:
                from minio import Minio
                client = Minio(
                    MINIO_ENDPOINT.replace("http://", "").replace("https://", ""),
                    access_key=MINIO_ACCESS_KEY,
                    secret_key=MINIO_SECRET_KEY,
                    secure=False
                )
                client.fput_object(MINIO_BUCKET, storage_key, str(att_path))
                entry["attachments"].append({
                    "filename": att_path.name,
                    "storage_ref": f"s3://{MINIO_BUCKET}/{storage_key}",
                    "size_bytes": att_path.stat().st_size
                })
            except Exception as e:
                entry["attachments"].append({
                    "filename": att_path.name,
                    "storage_ref": f"local://{att_path}",
                    "error": str(e)
                })
        elif att_path.exists():
            # 小文件直接记录路径
            entry["attachments"].append({
                "filename": att_path.name,
                "storage_ref": f"git://{att_path.relative_to(DDUP_PATH)}",
                "size_bytes": att_path.stat().st_size
            })
    
    # 4. 如果当天已有归档，追加到列表
    if archive_file.exists():
        existing = json.loads(archive_file.read_text(encoding="utf-8"))
        if isinstance(existing, list):
            existing.append(entry)
        else:
            existing = [existing, entry]
        archive_file.write_text(json.dumps(existing, ensure_ascii=False, indent=2), encoding="utf-8")
    else:
        archive_file.write_text(json.dumps([entry], ensure_ascii=False, indent=2), encoding="utf-8")
    
    # 5. 更新全局索引
    index = json.loads(INDEX_PATH.read_text(encoding="utf-8")) if INDEX_PATH.exists() else {"entries": [], "version": "2.0.0"}
    index["entries"].append({
        "id": entry_id,
        "instance_id": INSTANCE_ID,
        "type": "cron_archive",
        "job_id": job_id,
        "title": f"{job_id} 归档 ({date_str})",
        "summary": content[:200] if isinstance(content, str) else json.dumps(content)[:200],
        "archived_at": now.isoformat(),
        "file_path": str(archive_file.relative_to(DDUP_PATH))
    })
    INDEX_PATH.write_text(json.dumps(index, ensure_ascii=False, indent=2), encoding="utf-8")
    
    return {"status": "archived", "id": entry_id, "path": str(archive_file)}
```

### Step 2.2：修改各 Cron 子智能体的技能文件

在每个 Cron 子智能体的 SKILL.md 末尾追加归档步骤。

**示例 — Paper Scout (hermes-research)**：
```markdown
## 归档步骤（新增）
在完成飞书推送后，执行：
1. 将今日推送的论文摘要汇总为 JSON
2. 调用 cron-archive save：
   - job_id: "paper-scout-daily"
   - content: JSON 格式的论文列表
   - metadata: {"papers_count": N, "sources": ["arxiv", "semantic_scholar"]}
   - attachments: 如有下载的 PDF 路径列表
```

**示例 — 新闻术语推送 (hermes-devops)**：
```markdown
## 归档步骤（新增）
在完成飞书卡片推送后，执行：
1. 将今日新闻摘要 + 术语列表汇总为 JSON
2. 调用 cron-archive save：
   - job_id: "news-terminology-daily"
   - content: {"news": [...], "terms": [...]}
   - metadata: {"news_count": N, "new_terms": M}
```

### Step 2.3：初始化归档目录

```bash
# 创建各 Cron 归档子目录
mkdir -p shared-library/outputs/hermes-research/cron-archives/{paper-scout,code-hunter,dataset-scout}
mkdir -p shared-library/outputs/hermes-devops/cron-archives/news-terminology
mkdir -p shared-library/outputs/hermes-main/cron-archives/version-check

# 创建空索引
echo '{"entries": [], "version": "2.0.0", "created_at": "2026-05-11"}' > shared-library/outputs/.index.json
```

**验证**：
```bash
# 模拟归档一条测试记录
DDUP_PATH=. HERMES_INSTANCE_ID=hermes-research python shared-library/registry/published/cron-archive/scripts/cron_archive.py
# 检查文件是否生成
cat shared-library/outputs/hermes-research/cron-archives/paper-scout/$(date +%Y-%m-%d).json
```

---

## Phase 3：材料持久化（MinIO 集成）

> 目标：论文 PDF、视频、大型报告等存入 MinIO，Git 只保留元数据引用。

### Step 3.1：创建 storage-client 共享技能

**路径**：`shared-library/registry/published/storage-client/`

**SKILL.md**：
```markdown
# Storage Client (MinIO)

## 何时使用
当需要上传/下载大文件（>1MB）到云端对象存储时调用。

## 命令

### 上传文件
```
storage upload --file /path/to/paper.pdf --category papers --tags "transformer,survey"
```

### 下载文件
```
storage download --key "hermes-research/papers/2026-05/abc123.pdf" --dest /tmp/
```

### 列出文件
```
storage list --prefix "hermes-research/papers/" --limit 20
```

### 生成临时链接（7天有效）
```
storage presign --key "hermes-research/papers/2026-05/abc123.pdf"
```

## 存储路径约定
`{instance-id}/{category}/{YYYY-MM}/{hash12}{ext}`

## 支持的 category
- papers: 论文 PDF
- datasets: 数据集文件
- reports: 大型报告
- media: 视频/音频/图片
- archives: 压缩包
- shared: 跨实例共享资源
```

**scripts/storage_client.py**：
```python
#!/usr/bin/env python3
"""Storage Client - MinIO 对象存储操作"""

import os
import hashlib
from pathlib import Path
from datetime import datetime, timedelta

MINIO_ENDPOINT = os.environ.get("MINIO_ENDPOINT", "192.168.102.204:9000")
MINIO_BUCKET = os.environ.get("MINIO_BUCKET", "ddup-shared-library")
MINIO_ACCESS_KEY = os.environ.get("MINIO_ACCESS_KEY", "")
MINIO_SECRET_KEY = os.environ.get("MINIO_SECRET_KEY", "")
INSTANCE_ID = os.environ.get("HERMES_INSTANCE_ID", "unknown")

def get_client():
    from minio import Minio
    return Minio(
        MINIO_ENDPOINT,
        access_key=MINIO_ACCESS_KEY,
        secret_key=MINIO_SECRET_KEY,
        secure=False
    )

def upload(file_path: str, category: str = "assets", tags: dict = None):
    """上传文件到 MinIO"""
    tags = tags or {}
    local_path = Path(file_path)
    
    if not local_path.exists():
        return {"status": "error", "message": f"文件不存在: {file_path}"}
    
    # 计算 hash
    file_hash = hashlib.sha256(local_path.read_bytes()).hexdigest()[:12]
    now = datetime.now()
    storage_key = f"{INSTANCE_ID}/{category}/{now.strftime('%Y-%m')}/{file_hash}{local_path.suffix}"
    
    client = get_client()
    
    # 确保 bucket 存在
    if not client.bucket_exists(MINIO_BUCKET):
        client.make_bucket(MINIO_BUCKET)
    
    # 上传
    client.fput_object(
        MINIO_BUCKET,
        storage_key,
        str(local_path),
        metadata={
            "instance-id": INSTANCE_ID,
            "original-name": local_path.name,
            "uploaded-at": now.isoformat(),
            **{k: str(v) for k, v in tags.items()}
        }
    )
    
    return {
        "status": "success",
        "key": storage_key,
        "url": f"http://{MINIO_ENDPOINT}/{MINIO_BUCKET}/{storage_key}",
        "size_bytes": local_path.stat().st_size
    }

def download(key: str, dest: str = "/tmp"):
    """从 MinIO 下载文件"""
    client = get_client()
    dest_path = Path(dest) / Path(key).name
    client.fget_object(MINIO_BUCKET, key, str(dest_path))
    return {"status": "success", "local_path": str(dest_path)}

def list_objects(prefix: str = "", limit: int = 20):
    """列出对象"""
    client = get_client()
    objects = []
    for obj in client.list_objects(MINIO_BUCKET, prefix=prefix):
        objects.append({
            "key": obj.object_name,
            "size": obj.size,
            "last_modified": obj.last_modified.isoformat() if obj.last_modified else None
        })
        if len(objects) >= limit:
            break
    return {"objects": objects, "total": len(objects)}

def presign(key: str, expires_days: int = 7):
    """生成预签名 URL"""
    client = get_client()
    url = client.presigned_get_object(MINIO_BUCKET, key, expires=timedelta(days=expires_days))
    return {"url": url, "expires_in": f"{expires_days} days"}
```

### Step 3.2：配置各实例的 MinIO 连接

**环境变量**（各实例统一添加）：
```bash
MINIO_ENDPOINT=192.168.102.204:9000
MINIO_BUCKET=ddup-shared-library
MINIO_ACCESS_KEY=ddup_admin
MINIO_SECRET_KEY=REPLACE_WITH_STRONG_PASSWORD
```

### Step 3.3：创建 MinIO Bucket 命名空间

```bash
# 使用 mc 工具或 Python 脚本创建子目录结构
python -c "
import os
from minio import Minio
client = Minio(os.environ['MINIO_ENDPOINT'], access_key=os.environ['MINIO_ACCESS_KEY'], secret_key=os.environ['MINIO_SECRET_KEY'], secure=False)
bucket = os.environ['MINIO_BUCKET']
if not client.bucket_exists(bucket):
    client.make_bucket(bucket)
# MinIO 没有真正的目录，对象前缀即为命名空间
# 上传占位文件标记命名空间
import io
for ns in ['hermes-main/', 'hermes-research/', 'hermes-devops/', 'shared/']:
    client.put_object(bucket, ns + '.keep', io.BytesIO(b''), 0)
print('Bucket 命名空间已创建')
"
```

### Step 3.4：配置存储策略

**文件**：`shared-library/config/storage-policy.json`
```json
{
  "version": "2.0.0",
  "policies": {
    "size_threshold": {
      "git_max_bytes": 1048576,
      "description": "小于 1MB 的文本文件存 Git，大于 1MB 存 MinIO"
    },
    "file_type_routing": {
      "git": ["md", "json", "yaml", "txt", "csv", "py", "sh"],
      "minio": ["pdf", "docx", "xlsx", "png", "jpg", "mp4", "zip", "tar.gz"]
    },
    "minio": {
      "endpoint": "http://192.168.102.204:9000",
      "bucket": "ddup-shared-library",
      "namespace_pattern": "{instance_id}/{category}/{YYYY-MM}/",
      "retention_days": 365
    },
    "cleanup": {
      "local_cache_path": "/tmp/ddup-cache/",
      "local_cache_ttl_days": 7
    }
  }
}
```

**验证**：
```bash
# 测试上传一个文件
echo "test content" > /tmp/test-upload.txt
HERMES_INSTANCE_ID=hermes-main python shared-library/registry/published/storage-client/scripts/storage_client.py upload --file /tmp/test-upload.txt --category test
# 验证 MinIO Console 中可见: http://192.168.102.204:9001
```

---

## Phase 4：自研技能发布

> 目标：将三实例中的自研技能发布到共享 Skill Hub，供其他实例安装使用。

### Step 4.1：创建技能发布流程

**执行者**：拥有技能的实例

**发布标准格式**（每个技能包含）：
```
shared-library/registry/published/{skill-name}/
├── SKILL.md              # Hermes 标准技能描述
├── scripts/              # 可执行脚本
├── templates/            # 模板文件（如有）
├── package.json          # 元数据
└── CHANGELOG.md          # 版本记录
```

### Step 4.2：hermes-research 发布技能

优先发布的技能（从 110 个中选择跨实例有价值的）：

```bash
# 1. scientific-research-agent — 科研智能体核心框架
mkdir -p shared-library/registry/published/scientific-research-agent/scripts

# 2. arxiv-paper-scout — 论文发现技能
mkdir -p shared-library/registry/published/arxiv-paper-scout/scripts

# 3. feishu-doc-writer — 飞书长文档写作
mkdir -p shared-library/registry/published/feishu-doc-writer/scripts

# 4. open-source-scout — 开源项目发现
mkdir -p shared-library/registry/published/open-source-scout/scripts
```

**示例 package.json (arxiv-paper-scout)**：
```json
{
  "name": "arxiv-paper-scout",
  "version": "1.2.0",
  "description": "每日自动从 arXiv 检索指定领域论文，质量评估+摘要推送",
  "author": "hermes-research",
  "compatibility": "hermes >= 0.13.0",
  "dependencies": ["web_search", "feishu"],
  "required_platforms": ["feishu"],
  "install_instructions": "安装后配置 ARXIV_CATEGORIES 和 FEISHU_PUSH_CHAT_ID 环境变量",
  "env_vars": ["ARXIV_CATEGORIES", "FEISHU_PUSH_CHAT_ID", "RELEVANCE_KEYWORDS"],
  "tags": ["research", "arxiv", "paper", "cron"]
}
```

### Step 4.3：hermes-devops 发布技能

```bash
# 1. inspiration-manager — 灵感管理
mkdir -p shared-library/registry/published/inspiration-manager/scripts

# 2. news-terminology-push — 新闻术语推送
mkdir -p shared-library/registry/published/news-terminology-push/scripts

# 3. news-aggregator — 28源新闻聚合
mkdir -p shared-library/registry/published/news-aggregator/scripts

# 4. douyin-video-extract — 抖音视频提取
mkdir -p shared-library/registry/published/douyin-video-extract/scripts

# 5. wechat-article-extract — 微信文章提取
mkdir -p shared-library/registry/published/wechat-article-extract/scripts
```

### Step 4.4：更新 skills-manifest.json

```bash
# 自动扫描 published/ 目录生成清单
python -c "
import json
from pathlib import Path

published = Path('shared-library/registry/published')
skills = []
for pkg_json in published.rglob('package.json'):
    pkg = json.loads(pkg_json.read_text())
    skills.append({
        'name': pkg['name'],
        'version': pkg.get('version', '1.0.0'),
        'description': pkg.get('description', ''),
        'author': pkg.get('author', 'unknown'),
        'tags': pkg.get('tags', []),
        'path': str(pkg_json.parent.relative_to(published))
    })

manifest = {
    'version': '2.0.0',
    'updated_at': '$(date -Iseconds)',
    'skills_count': len(skills),
    'skills': skills
}
Path('shared-library/registry/skills-manifest.json').write_text(
    json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
print(f'已注册 {len(skills)} 个共享技能')
"
```

**验证**：
```bash
cat shared-library/registry/skills-manifest.json | python -m json.tool
```

---

## Phase 5：Wiki 多实例编译

> 目标：各实例的知识产出汇入 LLM Wiki，统一编译为可检索知识库。

### Step 5.1：Wiki 目录初始化

```bash
# 在 DDUP 仓库中创建 wiki 管理目录
mkdir -p shared-library/wiki/_raw/{hermes-main,hermes-research,hermes-devops}
mkdir -p shared-library/wiki/compiled
mkdir -p shared-library/wiki/logs

# 创建配置
cat > shared-library/wiki/wiki-config.json << 'EOF'
{
  "vault_path": "/opt/ddup/wiki-vault",
  "compilation_schedule": "*/30 * * * *",
  "cross_linker_schedule": "0 */2 * * *",
  "health_check_schedule": "0 2 * * *",
  "merge_strategy": {
    "similarity_threshold": 0.8,
    "tag_overlap_threshold": 2,
    "conflict_resolution": "mark_for_review"
  },
  "instance_write_rules": {
    "hermes-research": ["_raw/hermes-research/"],
    "hermes-devops": ["_raw/hermes-devops/"],
    "hermes-main": ["_raw/hermes-main/"]
  }
}
EOF
```

### Step 5.2：创建 wiki-write 共享技能

**路径**：`shared-library/registry/published/wiki-write/`

**SKILL.md**：
```markdown
# Wiki Write

## 何时使用
当需要将知识产出写入 LLM Wiki 时调用。支持论文笔记、技术总结、领域知识等。

## 使用方式
```
wiki-write --title "标题" --content "Markdown内容" --tags "tag1,tag2" --citations '[{"type":"paper","ref":"arxiv:2406.xxxx"}]'
```

## 规则
- 文件自动写入 `wiki/_raw/{自身instance-id}/` 目录
- 文件名格式：`{YYYYMMDD-HHMM}-{slug}.md`
- 每个文件包含 YAML frontmatter（title, instance_id, tags, citations, status）
- 编译器每 30 分钟扫描 _raw/ 并提升为正式页面
- 跨实例概念重叠时自动合并，冲突标记 `needs_review`
```

### Step 5.3：编写 Wiki 编译器 Cron

**文件**：`tools/wiki_compiler.py`
```python
#!/usr/bin/env python3
"""Wiki Compiler - 定时扫描 _raw/ 并编译为正式页面"""

import json
import re
from pathlib import Path
from datetime import datetime

WIKI_DIR = Path("shared-library/wiki")
RAW_DIR = WIKI_DIR / "_raw"
COMPILED_DIR = WIKI_DIR / "compiled"
LOG_FILE = WIKI_DIR / "logs" / f"compile-{datetime.now().strftime('%Y-%m-%d')}.log"

def compile_wiki():
    """扫描所有 _raw/ 文件，处理并编译"""
    LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
    logs = []
    
    # 扫描所有实例的 _raw 目录
    for instance_dir in RAW_DIR.iterdir():
        if not instance_dir.is_dir():
            continue
        instance_id = instance_dir.name
        
        for md_file in instance_dir.glob("*.md"):
            content = md_file.read_text(encoding="utf-8")
            
            # 检查是否已处理（frontmatter 中 status != raw）
            if "status: compiled" in content or "status: merged" in content:
                continue
            
            # 提取标题
            title_match = re.search(r'^#\s+(.+)$', content, re.MULTILINE)
            title = title_match.group(1) if title_match else md_file.stem
            
            # 检查重叠（简单的标题相似度检查）
            existing = find_similar(title)
            
            if existing:
                # 追加为补充来源
                merge_content(existing, content, instance_id)
                logs.append(f"[MERGE] {md_file.name} → {existing.name} (from {instance_id})")
                # 标记为已合并
                mark_processed(md_file, "merged")
            else:
                # 创建新正式页面
                compiled_path = COMPILED_DIR / f"{md_file.stem}.md"
                compiled_path.parent.mkdir(parents=True, exist_ok=True)
                compiled_path.write_text(content, encoding="utf-8")
                logs.append(f"[NEW] {md_file.name} → compiled/ (from {instance_id})")
                mark_processed(md_file, "compiled")
    
    # 写入日志
    LOG_FILE.write_text("\n".join(logs), encoding="utf-8")
    return {"processed": len(logs), "log": str(LOG_FILE)}

def find_similar(title: str):
    """在已编译页面中查找相似标题"""
    for compiled in COMPILED_DIR.glob("*.md"):
        compiled_title = compiled.read_text(encoding="utf-8").split("\n")[0].replace("# ", "")
        # 简单相似度：标题词重叠
        title_words = set(title.lower().split())
        compiled_words = set(compiled_title.lower().split())
        if len(title_words & compiled_words) / max(len(title_words | compiled_words), 1) > 0.6:
            return compiled
    return None

def merge_content(target: Path, new_content: str, source_instance: str):
    """将新内容合并到已有页面"""
    existing = target.read_text(encoding="utf-8")
    separator = f"\n\n---\n## 补充来源 ({source_instance}, {datetime.now().strftime('%Y-%m-%d')})\n\n"
    target.write_text(existing + separator + new_content, encoding="utf-8")

def mark_processed(md_file: Path, status: str):
    """标记文件为已处理"""
    content = md_file.read_text(encoding="utf-8")
    if "status:" in content:
        content = re.sub(r'status:\s*\w+', f'status: {status}', content)
    else:
        content = f"---\nstatus: {status}\nprocessed_at: {datetime.now().isoformat()}\n---\n\n" + content
    md_file.write_text(content, encoding="utf-8")

if __name__ == "__main__":
    result = compile_wiki()
    print(f"Wiki 编译完成: 处理 {result['processed']} 个文件")
```

**验证**：
```bash
# 写入一个测试文件到 _raw
echo "# Transformer 注意力机制\n\n这是一个测试条目。" > shared-library/wiki/_raw/hermes-research/20260511-1200-transformer-attention.md
# 执行编译
python tools/wiki_compiler.py
# 检查编译结果
ls shared-library/wiki/compiled/
```

---

## Phase 6：跨实例查询技能

> 目标：任意实例可查询其他实例的公开产出、知识和 Cron 归档。

### Step 6.1：创建 cross-instance-query 共享技能

**路径**：`shared-library/registry/published/cross-instance-query/`

**SKILL.md**：
```markdown
# Cross Instance Query

## 何时使用
当需要查询其他实例的产出、扩展记忆或 Cron 归档时调用。

## 命令

### 查询成果
```
cross-query outputs --keywords "transformer" --from "hermes-research" --type "paper_summary" --limit 10
```

### 查询记忆
```
cross-query memory --keywords "API限制,rate limit" --scope all
```

### 查询 Cron 归档
```
cross-query cron --job-id "paper-scout-daily" --date-range "2026-05-01,2026-05-11"
```

### 全局搜索
```
cross-query search --keywords "具身智能" --sources "outputs,memory,wiki,cron"
```

## 权限说明
- 只能读取其他实例的公开产出和 shared/ 记忆
- 其他实例的 memory-ext/{id}/ 只返回摘要
- 尊重 isolation-rules.json 中的访问控制矩阵
```

**scripts/cross_query.py**：
```python
#!/usr/bin/env python3
"""Cross Instance Query - 跨实例知识查询"""

import json
from pathlib import Path
import os

DDUP_PATH = Path(os.environ.get("DDUP_PATH", "."))
SHARED_LIB = DDUP_PATH / "shared-library"

def search(keywords: list, sources: list = None, from_instance: str = None, limit: int = 20):
    """全局搜索"""
    sources = sources or ["outputs", "memory", "wiki", "cron"]
    results = []
    
    if "outputs" in sources:
        results.extend(search_outputs(keywords, from_instance, limit))
    if "memory" in sources:
        results.extend(search_memory(keywords, from_instance, limit))
    if "wiki" in sources:
        results.extend(search_wiki(keywords, limit))
    if "cron" in sources:
        results.extend(search_cron(keywords, from_instance, limit))
    
    # 按相关度排序（关键词命中数）
    for r in results:
        r["relevance"] = sum(1 for kw in keywords if kw.lower() in r.get("snippet", "").lower())
    results.sort(key=lambda x: x["relevance"], reverse=True)
    
    return {"results": results[:limit], "total": len(results)}

def search_outputs(keywords, from_instance, limit):
    """搜索成果索引"""
    index_path = SHARED_LIB / "outputs" / ".index.json"
    if not index_path.exists():
        return []
    
    index = json.loads(index_path.read_text(encoding="utf-8"))
    results = []
    for entry in index.get("entries", []):
        if from_instance and entry.get("instance_id") != from_instance:
            continue
        text = f"{entry.get('title', '')} {entry.get('summary', '')}".lower()
        if any(kw.lower() in text for kw in keywords):
            results.append({
                "source": "outputs",
                "instance_id": entry.get("instance_id"),
                "title": entry.get("title"),
                "snippet": entry.get("summary", "")[:300],
                "date": entry.get("archived_at", ""),
                "file_path": entry.get("file_path")
            })
    return results[:limit]

def search_memory(keywords, from_instance, limit):
    """搜索扩展记忆"""
    memory_dir = SHARED_LIB / "memory-ext"
    results = []
    
    for dir_path in memory_dir.iterdir():
        if not dir_path.is_dir():
            continue
        if from_instance and dir_path.name != from_instance and dir_path.name != "shared":
            continue
        
        for md_file in dir_path.glob("*.md"):
            content = md_file.read_text(encoding="utf-8")
            if any(kw.lower() in content.lower() for kw in keywords):
                results.append({
                    "source": "memory-ext",
                    "instance_id": dir_path.name,
                    "title": content.split("\n")[0].replace("# ", ""),
                    "snippet": content[:300],
                    "file_path": str(md_file.relative_to(DDUP_PATH))
                })
    return results[:limit]

def search_wiki(keywords, limit):
    """搜索 Wiki 已编译页面"""
    compiled_dir = SHARED_LIB / "wiki" / "compiled"
    if not compiled_dir.exists():
        return []
    
    results = []
    for md_file in compiled_dir.glob("*.md"):
        content = md_file.read_text(encoding="utf-8")
        if any(kw.lower() in content.lower() for kw in keywords):
            results.append({
                "source": "wiki",
                "title": content.split("\n")[0].replace("# ", ""),
                "snippet": content[:300],
                "file_path": str(md_file.relative_to(DDUP_PATH))
            })
    return results[:limit]

def search_cron(keywords, from_instance, limit):
    """搜索 Cron 归档"""
    outputs_dir = SHARED_LIB / "outputs"
    results = []
    
    for instance_dir in outputs_dir.iterdir():
        if not instance_dir.is_dir() or instance_dir.name.startswith("."):
            continue
        if from_instance and instance_dir.name != from_instance:
            continue
        
        cron_dir = instance_dir / "cron-archives"
        if not cron_dir.exists():
            continue
        
        for json_file in cron_dir.rglob("*.json"):
            content = json_file.read_text(encoding="utf-8")
            if any(kw.lower() in content.lower() for kw in keywords):
                results.append({
                    "source": "cron-archive",
                    "instance_id": instance_dir.name,
                    "title": json_file.stem,
                    "snippet": content[:300],
                    "file_path": str(json_file.relative_to(DDUP_PATH))
                })
    return results[:limit]
```

### Step 6.2：验证跨实例查询

```bash
# 确保有一些测试数据
# 然后执行全局搜索
DDUP_PATH=. python -c "
import sys; sys.path.insert(0, 'shared-library/registry/published/cross-instance-query/scripts')
from cross_query import search
results = search(['新能源', '论文'], sources=['memory', 'outputs'])
print(f'找到 {results[\"total\"]} 条结果')
for r in results['results'][:5]:
    print(f'  [{r[\"source\"]}] {r[\"title\"]} ({r.get(\"instance_id\", \"\")})')
"
```

---

## Phase 7：新实例接入自动化

> 目标：新 Hermes 实例注册时，自动创建所需目录和配置。

### Step 7.1：创建实例注册脚本

**文件**：`tools/register_instance.py`
```python
#!/usr/bin/env python3
"""Register Instance - 新 Hermes 实例注册自动化"""

import json
import sys
from pathlib import Path
from datetime import datetime

DDUP_PATH = Path(__file__).parent.parent
REGISTRY_PATH = DDUP_PATH / "shared-library" / "registry" / "instances.json"

def register(instance_id: str, name: str, deployment_type: str, host: str, specialization: list = None):
    """注册新实例并创建所有必要目录"""
    
    # 1. 更新 instances.json
    registry = json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))
    
    # 检查是否已存在
    existing_ids = [i["id"] for i in registry["instances"]]
    if instance_id in existing_ids:
        print(f"错误：实例 {instance_id} 已存在")
        return False
    
    new_instance = {
        "id": instance_id,
        "name": name,
        "deployment": {
            "type": deployment_type,
            "host": host,
            "hermes_version": "v0.13.0"
        },
        "capabilities": {
            "model": "glm-5.1-fp8",
            "platforms": ["feishu"],
            "skills_count": 0
        },
        "specialization": specialization or [],
        "sub_agents": [],
        "cron_jobs": [],
        "published_skills": [],
        "status": "active",
        "registered_at": datetime.now().strftime("%Y-%m-%d")
    }
    
    registry["instances"].append(new_instance)
    REGISTRY_PATH.write_text(json.dumps(registry, ensure_ascii=False, indent=2), encoding="utf-8")
    
    # 2. 创建目录结构
    dirs_to_create = [
        DDUP_PATH / "agents" / instance_id,
        DDUP_PATH / "shared-library" / "outputs" / instance_id,
        DDUP_PATH / "shared-library" / "outputs" / instance_id / "cron-archives",
        DDUP_PATH / "shared-library" / "memory-ext" / instance_id,
        DDUP_PATH / "shared-library" / "wiki" / "_raw" / instance_id,
    ]
    
    for d in dirs_to_create:
        d.mkdir(parents=True, exist_ok=True)
        print(f"  ✓ 创建目录: {d.relative_to(DDUP_PATH)}")
    
    # 3. 创建 SOUL.md 模板
    soul_path = DDUP_PATH / "agents" / instance_id / "SOUL.md"
    soul_path.write_text(f"""# {name}

## 部署信息
- 类型: {deployment_type}
- 主机: {host}
- 注册时间: {datetime.now().strftime("%Y-%m-%d")}

## 能力描述
（请根据实际情况填写）

## 共享库配置
- DDUP_PATH: /path/to/DDUP
- HERMES_INSTANCE_ID: {instance_id}
- 需安装共享技能: memory-ext-client, cron-archive, storage-client, cross-instance-query
""", encoding="utf-8")
    
    # 4. 创建初始扩展记忆
    (DDUP_PATH / "shared-library" / "memory-ext" / instance_id / "README.md").write_text(
        f"# {name} 扩展记忆\n\n此目录存放 {instance_id} 的溢出记忆和领域知识。\n",
        encoding="utf-8"
    )
    
    print(f"\n✓ 实例 {instance_id} 注册完成!")
    print(f"  下一步:")
    print(f"  1. 在新实例中配置环境变量 HERMES_INSTANCE_ID={instance_id}")
    print(f"  2. 安装共享技能: memory-ext-client, cron-archive, storage-client")
    print(f"  3. 编辑 agents/{instance_id}/SOUL.md 填写完整信息")
    print(f"  4. git add && git commit && git push")
    
    return True

if __name__ == "__main__":
    if len(sys.argv) < 5:
        print("用法: python register_instance.py <id> <name> <deploy_type> <host> [specialization1,spec2,...]")
        print("示例: python register_instance.py hermes-data '数据分析智能体' docker 192.168.102.205 data_analysis,visualization")
        sys.exit(1)
    
    instance_id = sys.argv[1]
    name = sys.argv[2]
    deploy_type = sys.argv[3]
    host = sys.argv[4]
    specs = sys.argv[5].split(",") if len(sys.argv) > 5 else []
    
    register(instance_id, name, deploy_type, host, specs)
```

### Step 7.2：验证注册流程

```bash
# 模拟注册一个新实例（测试后删除）
python tools/register_instance.py hermes-test "测试智能体" docker localhost testing

# 验证
cat shared-library/registry/instances.json | python -c "import json,sys; d=json.load(sys.stdin); print(f'实例数: {len(d[\"instances\"])}')"
ls agents/hermes-test/
ls shared-library/memory-ext/hermes-test/

# 清理测试数据
# 手动从 instances.json 中移除测试条目并删除测试目录
```

---

## 附录 A：各实例安装共享技能清单

| 技能 | hermes-main | hermes-research | hermes-devops | 说明 |
|------|:-----------:|:---------------:|:-------------:|------|
| memory-ext-client | ✅ | ✅ | ✅ | 解决 Memory 饱和 |
| cron-archive | ⬜ | ✅ | ✅ | 有 Cron 任务的实例必装 |
| storage-client | ✅ | ✅ | ✅ | MinIO 文件操作 |
| cross-instance-query | ✅ | ✅ | ✅ | 跨实例检索 |
| wiki-write | ✅ | ✅ | ✅ | Wiki 知识写入 |

## 附录 B：环境变量总表

```bash
# 通用（所有实例必须配置）
DDUP_PATH=/path/to/DDUP                    # DDUP 仓库本地路径
HERMES_INSTANCE_ID=hermes-xxx              # 当前实例 ID

# MinIO（所有实例）
MINIO_ENDPOINT=192.168.102.204:9000
MINIO_BUCKET=ddup-shared-library
MINIO_ACCESS_KEY=ddup_admin
MINIO_SECRET_KEY=REPLACE_WITH_STRONG_PASSWORD

# Wiki（可选，使用 wiki-write 技能时）
OBSIDIAN_VAULT_PATH=/opt/ddup/wiki-vault

# 飞书（已有配置保留）
FEISHU_APP_ID=...
FEISHU_APP_SECRET=...
```

## 附录 C：快速验证命令

```bash
# 检查注册表完整性
python -c "import json; d=json.load(open('shared-library/registry/instances.json')); assert len(d['instances'])>=3; print('✓ 注册表正常')"

# 检查 MinIO 连通性
python -c "import os; from minio import Minio; c=Minio(os.environ['MINIO_ENDPOINT'],access_key=os.environ['MINIO_ACCESS_KEY'],secret_key=os.environ['MINIO_SECRET_KEY'],secure=False); print('✓ MinIO' if c.bucket_exists(os.environ['MINIO_BUCKET']) else '✗ Bucket不存在')"

# 检查目录结构完整
for d in agents/hermes-{main,research,devops} shared-library/memory-ext/{shared,hermes-main,hermes-research,hermes-devops} shared-library/outputs/{hermes-main,hermes-research,hermes-devops}; do [ -d "$d" ] && echo "✓ $d" || echo "✗ $d 缺失"; done

# 检查 Git 状态
git status --short shared-library/ agents/
```

## 附录 D：实施优先级总览

```
Phase 0 ✅ 已完成（注册表+目录）
Phase 1 → 立即执行（Memory 外溢是 P0 痛点）
Phase 2 → 1-2天内（Cron 双写，防止产出丢失）
Phase 3 → 同步进行（MinIO 已就绪，只需安装技能）
Phase 4 → 第3-4天（技能发布，跨实例复用）
Phase 5 → 第4-5天（Wiki 编译，知识积累）
Phase 6 → 第5-6天（跨实例查询，打通信息孤岛）
Phase 7 → 按需执行（有新实例时运行脚本即可）
```
