# Hermes 云端共享库 — 分步实施指南

> 本文档为智能体可执行的实施步骤，每一步明确输入、操作、验证标准。
> 执行环境：服务器 192.168.102.204 + GitHub 仓库 jiezho/DDUP

---

## Phase 1：基础设施搭建

### Step 1.1：创建共享库目录结构

**执行者**：任意 Hermes Agent（推荐在本地或通过 SSH）

```bash
# 在 DDUP 仓库根目录执行
cd /path/to/DDUP

# 创建 shared-library 主目录
mkdir -p shared-library/{registry/shared,outputs/{papers,news,inspirations,terms,reports},config,schemas}

# 创建共享技能子目录
mkdir -p shared-library/registry/{paper-search,news-collect,inspiration-capture,term-recommend}
mkdir -p shared-library/registry/shared/{wiki-write,storage-upload,citation-attach,cross-agent-query}

# 创建成果按时间归档目录
mkdir -p shared-library/outputs/papers/$(date +%Y-%m)
mkdir -p shared-library/outputs/news/$(date +%Y-%m-%d)
```

**验证**：`tree shared-library/ -L 3` 输出匹配预期结构。

### Step 1.2：创建智能体私有目录

```bash
# 创建各 Agent 隔离空间
for agent in paper-search news-collect inspiration term-recommend; do
  mkdir -p agents/$agent/{.hermes/sessions,skills}
  touch agents/$agent/SOUL.md
  touch agents/$agent/config.yaml
done
```

**各 SOUL.md 模板**（以 paper-search 为例）：
```markdown
# Paper Search Agent

## 身份
你是 DDUP 平台的论文检索智能体，专注于学术论文的发现、筛选和摘要生成。

## 核心能力
- ArXiv、Semantic Scholar、Google Scholar 多源检索
- 论文质量评估与相关性排序
- 结构化摘要生成（含方法/结论/局限性）
- 关键术语提取与关联

## 行为约束
- 所有输出必须附带来源引用（DOI/URL/论文ID）
- 产出写入共享库时使用 output_type: paper_summary
- 不直接访问其他 Agent 的 Memory
- 下载的 PDF 必须上传到云盘存储
```

### Step 1.3：编写全局配置

**agents.json**：
```json
{
  "agents": [
    {
      "id": "paper-search",
      "name": "论文检索 Agent",
      "description": "负责学术论文的检索、筛选、摘要与推荐",
      "status": "active",
      "memory_path": "agents/paper-search/.hermes/memory.db",
      "skills_path": "agents/paper-search/skills/",
      "output_types": ["paper_summary", "paper_list", "literature_review"],
      "allowed_shared_skills": ["wiki-write", "storage-upload", "citation-attach", "cross-agent-query"]
    },
    {
      "id": "news-collect",
      "name": "实时新闻 Agent",
      "description": "负责新闻聚合、实时热点追踪、摘要推荐",
      "status": "active",
      "memory_path": "agents/news-collect/.hermes/memory.db",
      "skills_path": "agents/news-collect/skills/",
      "output_types": ["news_digest", "trending_topic", "news_analysis"],
      "allowed_shared_skills": ["wiki-write", "storage-upload", "citation-attach", "cross-agent-query"]
    },
    {
      "id": "inspiration",
      "name": "灵感记录 Agent",
      "description": "负责灵感捕捉、整理分类、关联发现",
      "status": "active",
      "memory_path": "agents/inspiration/.hermes/memory.db",
      "skills_path": "agents/inspiration/skills/",
      "output_types": ["inspiration_note", "idea_cluster", "creative_brief"],
      "allowed_shared_skills": ["wiki-write", "storage-upload", "citation-attach", "cross-agent-query"]
    },
    {
      "id": "term-recommend",
      "name": "术语推荐 Agent",
      "description": "负责专业术语的发现、解释、关联推荐与学习卡生成",
      "status": "active",
      "memory_path": "agents/term-recommend/.hermes/memory.db",
      "skills_path": "agents/term-recommend/skills/",
      "output_types": ["term_card", "term_relation", "glossary_update"],
      "allowed_shared_skills": ["wiki-write", "storage-upload", "citation-attach", "cross-agent-query"]
    }
  ],
  "version": "1.0.0",
  "updated_at": "2026-05-11"
}
```

**isolation-rules.json**：
```json
{
  "rules": {
    "memory_access": {
      "policy": "strict_isolation",
      "description": "每个 Agent 只能读写自身的 memory.db",
      "cross_agent_read": false,
      "cross_agent_write": false
    },
    "skills_loading": {
      "priority_order": ["private", "domain", "shared"],
      "conflict_resolution": "higher_priority_wins",
      "activation_check": true
    },
    "output_writing": {
      "policy": "own_namespace",
      "description": "Agent 只能写入以自身 agent_id 为 namespace 的成果",
      "require_citations": true,
      "require_agent_id": true
    },
    "wiki_writing": {
      "policy": "own_raw_subdir",
      "description": "Agent 只能写入 _raw/{own_agent_id}/ 目录",
      "formal_pages_readonly": true
    },
    "storage_access": {
      "read": "all_agents",
      "write": "own_agent_only",
      "require_source_declaration": true
    }
  }
}
```

**storage-policy.json**：
```json
{
  "policies": {
    "git_storage": {
      "max_file_size_bytes": 1048576,
      "allowed_types": ["md", "json", "yaml", "txt", "csv"],
      "description": "小于 1MB 的文本文件直接存 Git"
    },
    "cloud_storage": {
      "min_file_size_bytes": 1048576,
      "preferred_types": ["pdf", "png", "jpg", "mp4", "docx", "xlsx"],
      "backend": "minio",
      "bucket": "ddup-shared-library",
      "endpoint": "http://192.168.102.204:9000",
      "description": "大文件和二进制文件存云端对象存储"
    },
    "local_cache": {
      "path": "/tmp/ddup-cache/",
      "ttl_days": 7,
      "description": "本地缓存 7 天后自动清理"
    }
  },
  "git_lfs_tracking": [
    "*.pdf",
    "*.docx",
    "*.xlsx"
  ]
}
```

### Step 1.4：创建 JSON Schema 定义

**output-entry.schema.json**：
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "OutputEntry",
  "type": "object",
  "required": ["id", "title", "agent_id", "output_type", "content", "created_at"],
  "properties": {
    "id": { "type": "string", "pattern": "^[a-z0-9-]+$" },
    "title": { "type": "string", "minLength": 1 },
    "agent_id": { "type": "string", "enum": ["paper-search", "news-collect", "inspiration", "term-recommend"] },
    "output_type": { "type": "string" },
    "content": { "type": "string" },
    "tags": { "type": "array", "items": { "type": "string" } },
    "citations": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["source_type", "source_ref"],
        "properties": {
          "source_type": { "type": "string", "enum": ["url", "paper_doi", "file_id", "conversation"] },
          "source_ref": { "type": "string" },
          "excerpt": { "type": "string" }
        }
      }
    },
    "attachments": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "filename": { "type": "string" },
          "content_type": { "type": "string" },
          "storage_ref": { "type": "string" },
          "size_bytes": { "type": "integer" }
        }
      }
    },
    "visibility": { "type": "string", "enum": ["public", "internal", "private"], "default": "internal" },
    "created_at": { "type": "string", "format": "date-time" },
    "metadata": { "type": "object" }
  }
}
```

**验证**：所有 JSON 文件通过 `python -m json.tool` 校验无语法错误。

---

## Phase 2：Skill Hub 实现

### Step 2.1：初始化 manifest.json

```bash
# 创建 registry/manifest.json
cat > shared-library/registry/manifest.json << 'EOF'
{
  "version": "1.0.0",
  "updated_at": "2026-05-11T00:00:00Z",
  "skills": []
}
EOF
```

### Step 2.2：编写共享技能 — wiki-write

**目录**：`shared-library/registry/shared/wiki-write/`

**skill.md**：
```markdown
# Wiki Write 共享技能

## 何时使用
当任何 Agent 需要将产出写入 LLM Wiki（Obsidian Vault）时调用。

## 步骤
1. 接收内容（title, content, tags, citations, agent_id）
2. 生成 frontmatter（含 agent_id, source_type, created_at, visibility）
3. 写入文件到 `_raw/{agent_id}/YYYYMMDD-HHMM-{slug}.md`
4. 更新 .manifest.json 增量记录
5. 返回写入路径和状态

## 输入
- agent_id: str — 调用方 Agent 标识
- title: str — 页面标题
- content: str — Markdown 正文
- tags: list[str] — 标签
- citations: list[dict] — 来源引用

## 输出
- file_path: str — 写入的文件路径
- status: "success" | "error"
- message: str

## 风险
- 并发写入同一文件 → 使用时间戳+slug 保证文件名唯一
- 内容过大 → 限制单文件 500KB

## 验证
- 文件存在且 frontmatter 格式正确
- .manifest.json 已更新
```

**tool.py**：
```python
"""Wiki Write — 将 Agent 产出写入 Obsidian Vault _raw/ 目录"""

import os
import json
from datetime import datetime
from pathlib import Path
import re

VAULT_PATH = os.environ.get("OBSIDIAN_VAULT_PATH", "/opt/ddup/wiki-vault")

def wiki_write(agent_id: str, title: str, content: str, tags: list = None, citations: list = None, visibility: str = "internal") -> dict:
    """将内容写入 Wiki Vault 的 _raw/{agent_id}/ 目录。
    
    Args:
        agent_id: 调用方 Agent 标识
        title: 页面标题
        content: Markdown 正文内容
        tags: 标签列表
        citations: 来源引用列表 [{"source_type": "url", "source_ref": "...", "excerpt": "..."}]
        visibility: 可见性级别 (public/internal/private)
    
    Returns:
        dict: {"file_path": str, "status": str, "message": str}
    """
    tags = tags or []
    citations = citations or []
    
    # 生成文件名
    now = datetime.now()
    slug = re.sub(r'[^a-z0-9]+', '-', title.lower().strip())[:50]
    filename = f"{now.strftime('%Y%m%d-%H%M')}-{slug}.md"
    
    # 确保目录存在
    raw_dir = Path(VAULT_PATH) / "_raw" / agent_id
    raw_dir.mkdir(parents=True, exist_ok=True)
    file_path = raw_dir / filename
    
    # 构建 frontmatter
    frontmatter = {
        "title": title,
        "agent_id": agent_id,
        "created_at": now.isoformat(),
        "tags": tags,
        "visibility": visibility,
        "citations": citations,
        "status": "raw"
    }
    
    # 写入文件
    fm_yaml = "---\n"
    for k, v in frontmatter.items():
        if isinstance(v, list):
            fm_yaml += f"{k}:\n"
            for item in v:
                if isinstance(item, dict):
                    fm_yaml += f"  - {json.dumps(item, ensure_ascii=False)}\n"
                else:
                    fm_yaml += f"  - {item}\n"
        else:
            fm_yaml += f"{k}: {json.dumps(v, ensure_ascii=False) if isinstance(v, (dict, list)) else v}\n"
    fm_yaml += "---\n\n"
    
    full_content = fm_yaml + content
    file_path.write_text(full_content, encoding="utf-8")
    
    # 更新 manifest
    manifest_path = Path(VAULT_PATH) / ".manifest.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {"entries": []}
    manifest["entries"].append({
        "file": str(file_path.relative_to(VAULT_PATH)),
        "agent_id": agent_id,
        "title": title,
        "created_at": now.isoformat(),
        "status": "pending_ingest"
    })
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    
    return {
        "file_path": str(file_path),
        "status": "success",
        "message": f"已写入 {filename} 到 _raw/{agent_id}/"
    }
```

**config.json**：
```json
{
  "skill_id": "shared.wiki-write",
  "visibility": "shared",
  "dependencies": [],
  "activation_conditions": {
    "requires_env": ["OBSIDIAN_VAULT_PATH"]
  },
  "permissions": {
    "filesystem_write": ["${OBSIDIAN_VAULT_PATH}/_raw/"],
    "filesystem_read": ["${OBSIDIAN_VAULT_PATH}/.manifest.json"]
  }
}
```

### Step 2.3：编写共享技能 — cross-agent-query

**目录**：`shared-library/registry/shared/cross-agent-query/`

**tool.py**：
```python
"""Cross Agent Query — 跨智能体查询共享成果"""

import json
from pathlib import Path
from datetime import datetime

SHARED_LIB_PATH = os.environ.get("SHARED_LIBRARY_PATH", "/path/to/DDUP/shared-library")

def cross_agent_query(
    keywords: list = None,
    tags: list = None,
    agent_ids: list = None,
    output_types: list = None,
    time_range: tuple = None,
    limit: int = 20
) -> dict:
    """查询共享库中其他智能体的成果。
    
    Args:
        keywords: 关键词列表（标题和内容中搜索）
        tags: 标签过滤
        agent_ids: 指定 Agent 过滤（空则查全部）
        output_types: 成果类型过滤
        time_range: 时间范围 (start_iso, end_iso)
        limit: 返回数量上限
    
    Returns:
        dict: {"results": [...], "total": int}
    """
    keywords = keywords or []
    tags = tags or []
    agent_ids = agent_ids or []
    output_types = output_types or []
    
    # 读取索引
    index_path = Path(SHARED_LIB_PATH) / "outputs" / ".index.json"
    if not index_path.exists():
        return {"results": [], "total": 0}
    
    index = json.loads(index_path.read_text(encoding="utf-8"))
    entries = index.get("entries", [])
    
    # 过滤
    results = []
    for entry in entries:
        # Agent 过滤
        if agent_ids and entry.get("agent_id") not in agent_ids:
            continue
        # 类型过滤
        if output_types and entry.get("output_type") not in output_types:
            continue
        # 标签过滤
        if tags and not set(tags).intersection(set(entry.get("tags", []))):
            continue
        # 关键词过滤
        if keywords:
            text = (entry.get("title", "") + " " + entry.get("summary", "")).lower()
            if not any(kw.lower() in text for kw in keywords):
                continue
        # 时间过滤
        if time_range:
            created = entry.get("created_at", "")
            if created < time_range[0] or created > time_range[1]:
                continue
        results.append(entry)
    
    # 按时间倒序
    results.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    
    return {
        "results": results[:limit],
        "total": len(results)
    }
```

### Step 2.4：编写共享技能 — storage-upload

**tool.py**：
```python
"""Storage Upload — 上传大文件到云端对象存储"""

import os
import json
import hashlib
from pathlib import Path
from datetime import datetime

STORAGE_ENDPOINT = os.environ.get("STORAGE_ENDPOINT", "http://192.168.102.204:9000")
STORAGE_BUCKET = os.environ.get("STORAGE_BUCKET", "ddup-shared-library")
STORAGE_ACCESS_KEY = os.environ.get("STORAGE_ACCESS_KEY", "")
STORAGE_SECRET_KEY = os.environ.get("STORAGE_SECRET_KEY", "")

def storage_upload(
    agent_id: str,
    file_path: str,
    category: str = "assets",
    metadata: dict = None
) -> dict:
    """上传文件到云端对象存储。
    
    Args:
        agent_id: 上传方 Agent 标识
        file_path: 本地文件路径
        category: 存储分类 (papers/news-snapshots/reports/assets)
        metadata: 附加元数据
    
    Returns:
        dict: {"storage_ref": str, "url": str, "status": str}
    """
    metadata = metadata or {}
    local_path = Path(file_path)
    
    if not local_path.exists():
        return {"status": "error", "message": f"文件不存在: {file_path}"}
    
    # 计算文件哈希
    file_hash = hashlib.sha256(local_path.read_bytes()).hexdigest()[:12]
    
    # 构建存储路径
    now = datetime.now()
    ext = local_path.suffix
    storage_key = f"{category}/{now.strftime('%Y-%m')}/{agent_id}/{file_hash}{ext}"
    
    # 使用 MinIO Python SDK 上传（需安装 minio 包）
    try:
        from minio import Minio
        client = Minio(
            STORAGE_ENDPOINT.replace("http://", "").replace("https://", ""),
            access_key=STORAGE_ACCESS_KEY,
            secret_key=STORAGE_SECRET_KEY,
            secure=STORAGE_ENDPOINT.startswith("https")
        )
        
        # 确保 bucket 存在
        if not client.bucket_exists(STORAGE_BUCKET):
            client.make_bucket(STORAGE_BUCKET)
        
        # 上传
        client.fput_object(
            STORAGE_BUCKET,
            storage_key,
            str(local_path),
            metadata={
                "agent_id": agent_id,
                "original_filename": local_path.name,
                "uploaded_at": now.isoformat(),
                **{k: str(v) for k, v in metadata.items()}
            }
        )
        
        storage_ref = f"s3://{STORAGE_BUCKET}/{storage_key}"
        url = f"{STORAGE_ENDPOINT}/{STORAGE_BUCKET}/{storage_key}"
        
        return {
            "storage_ref": storage_ref,
            "url": url,
            "status": "success",
            "message": f"已上传到 {storage_key}"
        }
    except ImportError:
        # 降级：复制到本地共享存储目录
        fallback_dir = Path("/opt/ddup/storage") / category / now.strftime("%Y-%m") / agent_id
        fallback_dir.mkdir(parents=True, exist_ok=True)
        dest = fallback_dir / f"{file_hash}{ext}"
        import shutil
        shutil.copy2(local_path, dest)
        return {
            "storage_ref": f"local://{dest}",
            "url": str(dest),
            "status": "success",
            "message": f"已保存到本地存储（MinIO SDK 未安装）"
        }
```

### Step 2.5：注册所有技能到 manifest

执行脚本自动扫描 `registry/` 目录并更新 `manifest.json`：

```python
#!/usr/bin/env python3
"""scan_and_register_skills.py — 扫描 registry/ 并更新 manifest.json"""

import json
from pathlib import Path
from datetime import datetime

REGISTRY_PATH = Path("shared-library/registry")
MANIFEST_PATH = REGISTRY_PATH / "manifest.json"

def scan_skills():
    skills = []
    for config_path in REGISTRY_PATH.rglob("config.json"):
        skill_dir = config_path.parent
        config = json.loads(config_path.read_text())
        
        # 读取 skill.md 第一行作为 name
        skill_md = skill_dir / "skill.md"
        name = config.get("skill_id", skill_dir.name)
        if skill_md.exists():
            first_line = skill_md.read_text().split("\n")[0]
            name = first_line.replace("#", "").strip()
        
        # 确定 owner_agent
        parts = skill_dir.relative_to(REGISTRY_PATH).parts
        if parts[0] == "shared":
            owner = "shared"
            visibility = "shared"
        else:
            owner = parts[0]
            visibility = config.get("visibility", "domain")
        
        skills.append({
            "id": config.get("skill_id", f"{owner}.{skill_dir.name}"),
            "name": name,
            "description": config.get("description", ""),
            "owner_agent": owner,
            "visibility": visibility,
            "tags": config.get("tags", []),
            "dependencies": config.get("dependencies", []),
            "activation_conditions": config.get("activation_conditions", {}),
            "version": config.get("version", "1.0.0"),
            "path": str(skill_dir.relative_to(REGISTRY_PATH))
        })
    
    manifest = {
        "version": "1.0.0",
        "updated_at": datetime.now().isoformat(),
        "skills": skills
    }
    
    MANIFEST_PATH.write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
    print(f"已注册 {len(skills)} 个技能到 manifest.json")

if __name__ == "__main__":
    scan_skills()
```

---

## Phase 3：成果共享管道

### Step 3.1：DDUP API 新增 shared-library 路由

**文件**：`apps/api/app/api/shared_library.py`

```python
"""共享库 API 路由"""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import json
from pathlib import Path

router = APIRouter(prefix="/api/shared-library", tags=["shared-library"])

# --- Models ---

class Citation(BaseModel):
    source_type: str   # url | paper_doi | file_id | conversation
    source_ref: str
    excerpt: str = ""

class Attachment(BaseModel):
    filename: str
    content_type: str
    storage_ref: str = ""
    size_bytes: int = 0

class OutputEntry(BaseModel):
    title: str
    agent_id: str
    output_type: str
    content: str
    tags: list[str] = []
    citations: list[Citation] = []
    attachments: list[Attachment] = []
    visibility: str = "internal"
    metadata: dict = {}

class QueryRequest(BaseModel):
    keywords: list[str] = []
    tags: list[str] = []
    agent_ids: list[str] = []
    output_types: list[str] = []
    time_start: Optional[str] = None
    time_end: Optional[str] = None
    limit: int = 20

# --- Endpoints ---

@router.post("/outputs")
async def create_output(entry: OutputEntry):
    """写入一条共享成果"""
    # 1. 生成 ID
    import uuid
    entry_id = f"{entry.agent_id}-{datetime.now().strftime('%Y%m%d%H%M%S')}-{uuid.uuid4().hex[:6]}"
    
    # 2. 写入成果文件
    output_dir = Path("shared-library/outputs") / entry.output_type.replace("_", "-") + "s"
    output_dir.mkdir(parents=True, exist_ok=True)
    
    entry_data = {
        "id": entry_id,
        **entry.dict(),
        "created_at": datetime.now().isoformat()
    }
    
    file_path = output_dir / f"{entry_id}.json"
    file_path.write_text(json.dumps(entry_data, ensure_ascii=False, indent=2))
    
    # 3. 更新索引
    index_path = Path("shared-library/outputs/.index.json")
    index = json.loads(index_path.read_text()) if index_path.exists() else {"entries": []}
    index["entries"].append({
        "id": entry_id,
        "title": entry.title,
        "agent_id": entry.agent_id,
        "output_type": entry.output_type,
        "tags": entry.tags,
        "summary": entry.content[:200],
        "created_at": entry_data["created_at"],
        "file_path": str(file_path)
    })
    index_path.write_text(json.dumps(index, ensure_ascii=False, indent=2))
    
    # 4. 触发 Git commit（异步）
    # TODO: 调用 git add + commit 或通过后台任务
    
    return {"id": entry_id, "status": "created", "file_path": str(file_path)}

@router.post("/query")
async def query_outputs(req: QueryRequest):
    """查询共享成果"""
    index_path = Path("shared-library/outputs/.index.json")
    if not index_path.exists():
        return {"results": [], "total": 0}
    
    index = json.loads(index_path.read_text())
    entries = index.get("entries", [])
    
    results = []
    for entry in entries:
        if req.agent_ids and entry.get("agent_id") not in req.agent_ids:
            continue
        if req.output_types and entry.get("output_type") not in req.output_types:
            continue
        if req.tags and not set(req.tags).intersection(set(entry.get("tags", []))):
            continue
        if req.keywords:
            text = (entry.get("title", "") + " " + entry.get("summary", "")).lower()
            if not any(kw.lower() in text for kw in req.keywords):
                continue
        results.append(entry)
    
    results.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return {"results": results[:req.limit], "total": len(results)}

@router.get("/skills")
async def list_skills(agent_id: str = "", tags: str = ""):
    """列出可用技能"""
    manifest_path = Path("shared-library/registry/manifest.json")
    if not manifest_path.exists():
        return {"skills": []}
    
    manifest = json.loads(manifest_path.read_text())
    skills = manifest.get("skills", [])
    
    # 过滤
    if agent_id:
        skills = [s for s in skills if s["visibility"] == "shared" or s["owner_agent"] == agent_id]
    if tags:
        tag_list = tags.split(",")
        skills = [s for s in skills if set(tag_list).intersection(set(s.get("tags", [])))]
    
    return {"skills": skills}
```

### Step 3.2：注册路由到主应用

在 `apps/api/app/main.py` 中添加：

```python
from app.api.shared_library import router as shared_library_router
app.include_router(shared_library_router)
```

### Step 3.3：创建成果索引初始文件

```bash
echo '{"entries": [], "version": "1.0.0", "created_at": "2026-05-11"}' > shared-library/outputs/.index.json
```

### Step 3.4：编写 Git 自动提交脚本

**文件**：`tools/auto_commit_shared_library.sh`

```bash
#!/bin/bash
# 自动提交共享库变更到 Git

cd "$(dirname "$0")/.."
BRANCH="shared-library/auto"

# 切换到自动提交分支
git checkout -B "$BRANCH" 2>/dev/null || git checkout "$BRANCH"

# 检查是否有变更
if git diff --quiet shared-library/ agents/ && git diff --cached --quiet shared-library/ agents/; then
    echo "无变更需要提交"
    exit 0
fi

# 提交
git add shared-library/ agents/
TIMESTAMP=$(date +"%Y-%m-%d %H:%M:%S")
git commit -m "auto: shared-library update at $TIMESTAMP"

# 推送（如果远端可达）
git push origin "$BRANCH" 2>/dev/null || echo "推送失败，稍后重试"

# 切回主分支
git checkout master
```

---

## Phase 4：Wiki 多 Agent 扩展

### Step 4.1：扩展 Wiki Vault 目录

```bash
# 在 Wiki Vault 中创建各 Agent 的 _raw/ 子目录
VAULT="/opt/ddup/wiki-vault"
for agent in paper-search news-collect inspiration term-recommend; do
    mkdir -p "$VAULT/_raw/$agent"
done

# 确保权限正确
chown -R hermes:hermes "$VAULT/_raw/"
```

### Step 4.2：扩展 wiki-ingest 支持多来源

修改 `tools/hermes_wiki_maintenance_prompt.py`，增加多 Agent 来源识别：

```python
MULTI_AGENT_INGEST_PROMPT = """
你是 Wiki 维护 Agent。执行以下步骤：

1. 扫描 _raw/ 下所有子目录（每个子目录对应一个 Agent）
2. 对每个新文件：
   a. 读取 frontmatter 中的 agent_id, tags, citations
   b. 检查是否与现有页面存在概念重叠（标题相似度 > 0.8 或标签交集 > 2）
   c. 如果重叠：将内容追加到现有页面的"补充来源"部分，标注 agent_id
   d. 如果不重叠：创建新正式页面到对应分类目录
3. 更新 index.md 和 .manifest.json
4. 对所有新页面执行 cross-linker（自动补链）
5. 记录本次处理日志到 log.md

注意：
- 合并时保留所有来源的 citations
- 正式页面的 frontmatter 中使用 contributors 字段记录所有贡献 Agent
- 如果发现冲突信息（同一概念不同 Agent 给出矛盾解释），标记为 status: needs_review
"""
```

### Step 4.3：配置定时调度

在服务器上配置 cron（或 Hermes 定时任务）：

```bash
# /etc/cron.d/ddup-wiki-maintenance
# 每30分钟执行 wiki-ingest
*/30 * * * * hermes cd /opt/ddup && hermes run "$(cat tools/hermes_wiki_maintenance_prompt.py | grep -A100 MULTI_AGENT_INGEST)" 2>&1 >> /var/log/ddup-wiki.log

# 每2小时执行 cross-linker
0 */2 * * * hermes hermes run "扫描 wiki-vault 中所有页面，为相关概念补充 [[wikilinks]]" 2>&1 >> /var/log/ddup-wiki.log

# 每天凌晨2点执行 lint
0 2 * * * hermes hermes run "对 wiki-vault 执行健康检查：找出孤立页面、断裂链接、缺失 frontmatter 的文件，输出报告到 _insights.md" 2>&1 >> /var/log/ddup-wiki.log

# 每天凌晨6点导出图谱
0 6 * * * hermes hermes run "从 wiki-vault 导出 graph.json（实体与关系），写入 shared-library/outputs/reports/" 2>&1 >> /var/log/ddup-wiki.log
```

---

## Phase 5：集成验证

### Step 5.1：端到端测试脚本

```python
#!/usr/bin/env python3
"""test_shared_library_e2e.py — 端到端验证"""

import requests
import json
import time

API_BASE = "http://localhost:8000"

def test_output_write_and_query():
    """测试：Agent 写入成果 → 其他 Agent 查询到"""
    
    # 1. 论文 Agent 写入一条成果
    output = {
        "title": "Transformer 架构综述 2026",
        "agent_id": "paper-search",
        "output_type": "paper_summary",
        "content": "本文综述了 2026 年 Transformer 架构的最新进展...",
        "tags": ["transformer", "deep-learning", "survey"],
        "citations": [
            {"source_type": "paper_doi", "source_ref": "10.1234/example.2026", "excerpt": "We propose..."}
        ],
        "visibility": "internal"
    }
    
    resp = requests.post(f"{API_BASE}/api/shared-library/outputs", json=output)
    assert resp.status_code == 200
    result = resp.json()
    assert result["status"] == "created"
    print(f"✓ 写入成功: {result['id']}")
    
    # 2. 术语 Agent 查询论文成果
    query = {
        "keywords": ["transformer"],
        "agent_ids": ["paper-search"],
        "limit": 5
    }
    
    resp = requests.post(f"{API_BASE}/api/shared-library/query", json=query)
    assert resp.status_code == 200
    results = resp.json()
    assert results["total"] >= 1
    assert any("transformer" in r["title"].lower() for r in results["results"])
    print(f"✓ 查询成功: 找到 {results['total']} 条结果")

def test_isolation():
    """测试：Agent 不能越权访问"""
    
    # 验证 Memory 隔离（文件系统层面）
    import os
    # Agent A 不应该能读取 Agent B 的 memory
    agent_a_memory = "agents/paper-search/.hermes/memory.db"
    agent_b_memory = "agents/news-collect/.hermes/memory.db"
    # 在实际部署中，这通过 Linux 用户权限或 Docker 卷隔离实现
    print("✓ Memory 隔离验证需在部署环境中测试")

def test_skill_loading():
    """测试：技能加载遵循隔离规则"""
    
    resp = requests.get(f"{API_BASE}/api/shared-library/skills?agent_id=paper-search")
    assert resp.status_code == 200
    skills = resp.json()["skills"]
    
    # 应该能看到共享技能和自身技能
    shared_skills = [s for s in skills if s["visibility"] == "shared"]
    own_skills = [s for s in skills if s["owner_agent"] == "paper-search"]
    
    # 不应该看到其他 Agent 的私有技能
    other_private = [s for s in skills if s["visibility"] == "private" and s["owner_agent"] != "paper-search"]
    assert len(other_private) == 0
    print(f"✓ 技能隔离正确: 共享 {len(shared_skills)} 个, 私有 {len(own_skills)} 个")

if __name__ == "__main__":
    test_output_write_and_query()
    test_isolation()
    test_skill_loading()
    print("\n全部测试通过 ✓")
```

### Step 5.2：验证清单

| # | 验证项 | 方法 | 预期结果 |
|---|--------|------|----------|
| 1 | 成果写入 | 调用 POST /outputs | 返回 created + 文件存在 |
| 2 | 跨 Agent 查询 | 调用 POST /query | 能查到其他 Agent 的成果 |
| 3 | Memory 隔离 | 检查文件权限 | Agent 进程无法读取其他 Agent 的 .hermes/ |
| 4 | Skills 隔离 | 调用 GET /skills | 只返回有权限的技能 |
| 5 | Wiki 写入隔离 | 各 Agent 调用 wiki-write | 只写入 _raw/{自身id}/ |
| 6 | 大文件上传 | 上传 PDF | 存入云盘，Git 只存元数据 |
| 7 | 定时编译 | 等待 30 分钟 | _raw/ 文件被提升为正式页面 |
| 8 | 索引一致性 | 对比 .index.json 与实际文件 | 完全一致 |

---

## 附录：执行命令快速参考

```bash
# Phase 1: 基础设施
mkdir -p shared-library/{registry/shared,outputs,config,schemas}
mkdir -p agents/{paper-search,news-collect,inspiration,term-recommend}/{.hermes/sessions,skills}

# Phase 2: 技能注册
python tools/scan_and_register_skills.py

# Phase 3: 启动 API
cd apps/api && pip install -r requirements.txt && uvicorn app.main:app --reload

# Phase 4: Wiki 扩展
ssh hermes@192.168.102.204 "mkdir -p /opt/ddup/wiki-vault/_raw/{paper-search,news-collect,inspiration,term-recommend}"

# Phase 5: 测试
python tools/test_shared_library_e2e.py

# Git 提交
bash tools/auto_commit_shared_library.sh
```
