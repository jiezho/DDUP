#!/usr/bin/env python3
"""Memory Extension Client - 扩展记忆读写与检索

解决 Hermes 内置 Memory (~2200字符) 饱和问题。
将低频记忆沉淀到文件系统，按需检索。
"""

import os
import sys
import re
import json
from pathlib import Path
from datetime import datetime

# 配置路径
DDUP_PATH = Path(os.environ.get("DDUP_PATH", "/opt/ddup"))
SHARED_LIB = DDUP_PATH / "shared-library" / "memory-ext"
INSTANCE_ID = os.environ.get("HERMES_INSTANCE_ID", "unknown")


def _ensure_dir(path: Path) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    return path


def save(scope: str, key: str, content: str) -> dict:
    """保存知识到扩展记忆

    Args:
        scope: "self" 或 "shared"
        key: 知识单元标识（用于生成文件名）
        content: 知识内容

    Returns:
        {"status": "saved", "path": str, "size": int}
    """
    if scope == "self":
        target_dir = _ensure_dir(SHARED_LIB / INSTANCE_ID)
    elif scope == "shared":
        target_dir = _ensure_dir(SHARED_LIB / "shared")
    else:
        raise ValueError(f"无效 scope: {scope}，必须是 self 或 shared")

    # 文件名规范化：小写，空格转连字符，保留中文
    filename = re.sub(r'[\\/:*?"<>|]', '', key).strip()
    filename = re.sub(r'\s+', '-', filename).lower() + ".md"
    filepath = target_dir / filename

    now = datetime.now()
    timestamp = now.strftime("%Y-%m-%d %H:%M")

    if filepath.exists():
        existing = filepath.read_text(encoding="utf-8")
        # 追加更新，带时间戳分隔线
        update_block = f"\n\n---\n*更新于 {timestamp}*\n\n{content}\n"
        filepath.write_text(existing + update_block, encoding="utf-8")
        action = "appended"
    else:
        # 新建文件
        header = f"# {key}\n\n{content}\n"
        filepath.write_text(header, encoding="utf-8")
        action = "created"

    return {
        "status": "saved",
        "action": action,
        "path": str(filepath.relative_to(DDUP_PATH)),
        "scope": scope,
        "size": filepath.stat().st_size
    }


def query(scope: str, keywords: list, limit: int = 20) -> dict:
    """查询扩展记忆

    Args:
        scope: "self", "shared", 或 "all"
        keywords: 关键词列表（任意一个命中即返回）
        limit: 返回结果上限

    Returns:
        {"results": [...], "total": int, "scope": str}
    """
    search_dirs = []

    if scope in ("self", "all"):
        self_dir = SHARED_LIB / INSTANCE_ID
        if self_dir.exists():
            search_dirs.append((self_dir, "self"))

    if scope in ("shared", "all"):
        shared_dir = SHARED_LIB / "shared"
        if shared_dir.exists():
            search_dirs.append((shared_dir, "shared"))

    if scope == "all":
        # 读取注册表获取其他实例
        try:
            registry_path = DDUP_PATH / "shared-library" / "registry" / "instances.json"
            registry = json.loads(registry_path.read_text(encoding="utf-8"))
            for inst in registry.get("instances", []):
                inst_id = inst["id"]
                if inst_id == INSTANCE_ID:
                    continue
                inst_dir = SHARED_LIB / inst_id
                if inst_dir.exists():
                    search_dirs.append((inst_dir, inst_id))
        except Exception:
            pass

    results = []
    keywords_lower = [kw.lower() for kw in keywords]

    for dir_path, dir_scope in search_dirs:
        for md_file in sorted(dir_path.glob("*.md")):
            if md_file.name.startswith("."):
                continue
            try:
                text = md_file.read_text(encoding="utf-8")
            except Exception:
                continue

            # 关键词匹配（标题或正文）
            text_lower = text.lower()
            if not any(kw in text_lower for kw in keywords_lower):
                continue

            lines = text.split("\n")
            title = lines[0].replace("# ", "").strip() if lines else md_file.stem

            # 其他实例只返回摘要（前500字符），保护隐私
            if dir_scope not in ("self", "shared"):
                snippet = text[:500] + "..." if len(text) > 500 else text
                access_level = "summary"
            else:
                snippet = text[:1000] + "..." if len(text) > 1000 else text
                access_level = "full"

            results.append({
                "file": str(md_file.relative_to(SHARED_LIB)),
                "scope": dir_scope,
                "title": title,
                "snippet": snippet,
                "size": md_file.stat().st_size,
                "access": access_level
            })

    # 按相关度排序（命中关键词数）
    for r in results:
        r["relevance"] = sum(1 for kw in keywords_lower if kw in r["snippet"].lower())
    results.sort(key=lambda x: (-x["relevance"], x["file"]))

    return {
        "results": results[:limit],
        "total": len(results),
        "queried_keywords": keywords,
        "scope": scope
    }


def migrate(memory_prefix: str) -> dict:
    """生成迁移指引，将内置 Memory 中低频条目迁移到扩展记忆

    Args:
        memory_prefix: 要迁移的记忆条目前缀或关键词

    Returns:
        {"instruction": str, "target_dir": str, "estimated_savings": str}
    """
    target_dir = _ensure_dir(SHARED_LIB / INSTANCE_ID)

    instruction = (
        f"【Memory 迁移指引】\n\n"
        f"1. 在内置 Memory 中搜索以 '{memory_prefix}' 开头的条目\n"
        f"2. 将内容复制到扩展记忆：\n"
        f"   memory-ext save --scope self --key \"{memory_prefix}-索引\" --content \"<复制的内容>\"\n"
        f"3. 确认保存成功后，从内置 Memory 中删除原条目\n"
        f"4. 如需检索：memory-ext query --scope self --keywords \"{memory_prefix}\"\n\n"
        f"目标目录: {target_dir}\n"
        f"预计释放空间: 每条迁移约释放 30-100 字符"
    )

    return {
        "instruction": instruction,
        "target_dir": str(target_dir),
        "target_path_relative": str(target_dir.relative_to(DDUP_PATH)),
        "estimated_savings": "30-100 chars per entry"
    }


def status() -> dict:
    """返回当前实例 Memory 扩展层状态"""
    self_dir = SHARED_LIB / INSTANCE_ID
    shared_dir = SHARED_LIB / "shared"

    self_count = len(list(self_dir.glob("*.md"))) if self_dir.exists() else 0
    shared_count = len(list(shared_dir.glob("*.md"))) if shared_dir.exists() else 0

    self_size = sum(f.stat().st_size for f in self_dir.glob("*.md")) if self_dir.exists() else 0
    shared_size = sum(f.stat().st_size for f in shared_dir.glob("*.md")) if shared_dir.exists() else 0

    return {
        "instance_id": INSTANCE_ID,
        "self_files": self_count,
        "self_size_bytes": self_size,
        "shared_files": shared_count,
        "shared_size_bytes": shared_size,
        "total_size_kb": round((self_size + shared_size) / 1024, 2),
        "memory_ext_path": str(SHARED_LIB.relative_to(DDUP_PATH))
    }


def _cli():
    import argparse
    parser = argparse.ArgumentParser(description="Memory Extension Client")
    sub = parser.add_subparsers(dest="cmd", help="子命令")

    save_p = sub.add_parser("save", help="保存知识到扩展记忆")
    save_p.add_argument("--scope", required=True, choices=["self", "shared"], help="存储范围")
    save_p.add_argument("--key", required=True, help="知识单元标识")
    save_p.add_argument("--content", required=True, help="知识内容")

    query_p = sub.add_parser("query", help="查询扩展记忆")
    query_p.add_argument("--scope", default="all", choices=["self", "shared", "all"], help="查询范围")
    query_p.add_argument("--keywords", required=True, help="关键词，逗号分隔")
    query_p.add_argument("--limit", type=int, default=20, help="返回数量上限")

    migrate_p = sub.add_parser("migrate", help="生成迁移指引")
    migrate_p.add_argument("--from-memory", required=True, dest="memory_prefix", help="要迁移的记忆前缀")

    status_p = sub.add_parser("status", help="查看状态")

    args = parser.parse_args()

    if args.cmd == "save":
        result = save(args.scope, args.key, args.content)
    elif args.cmd == "query":
        result = query(args.scope, args.keywords.split(","), args.limit)
    elif args.cmd == "migrate":
        result = migrate(args.memory_prefix)
    elif args.cmd == "status":
        result = status()
    else:
        parser.print_help()
        sys.exit(1)

    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    _cli()
