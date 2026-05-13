#!/usr/bin/env python3
"""Cross Instance Query - 跨实例知识查询"""

import os
import json
from pathlib import Path

DDUP_PATH = Path(os.environ.get("DDUP_PATH", "."))
SHARED_LIB = DDUP_PATH / "shared-library"
INSTANCE_ID = os.environ.get("HERMES_INSTANCE_ID", "unknown")


def _safe_read_json(path: Path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def _isolation_rules() -> dict:
    return _safe_read_json(SHARED_LIB / "config" / "isolation-rules.json", {}).get("rules", {})


def _memory_ext_access(target_namespace: str, rules: dict) -> str:
    if target_namespace in (INSTANCE_ID, "shared"):
        return "full"
    policy = rules.get("memory_ext", {}) if isinstance(rules, dict) else {}
    if bool(policy.get("other_namespace_read_full")):
        return "full"
    if bool(policy.get("other_namespace_read_summary")):
        return "summary"
    return "deny"


def search(keywords: list, sources: list = None, from_instance: str = None, limit: int = 20):
    """全局搜索"""
    sources = sources or ["outputs", "memory", "wiki", "cron"]
    results = []

    if "outputs" in sources:
        results.extend(_search_outputs(keywords, from_instance, limit))
    if "memory" in sources:
        results.extend(_search_memory(keywords, from_instance, limit))
    if "wiki" in sources:
        results.extend(_search_wiki(keywords, limit))
    if "cron" in sources:
        results.extend(_search_cron(keywords, from_instance, limit))

    for r in results:
        r["relevance"] = sum(1 for kw in keywords if kw.lower() in r.get("snippet", "").lower())
    results.sort(key=lambda x: (-x["relevance"], x.get("title", "")))

    return {"results": results[:limit], "total": len(results)}


def _search_outputs(keywords, from_instance, limit):
    index_path = SHARED_LIB / "outputs" / ".index.json"
    if not index_path.exists():
        return []
    index = json.loads(index_path.read_text(encoding="utf-8"))
    results = []
    kw_lower = [k.lower() for k in keywords]
    for entry in index.get("entries", []):
        if from_instance and entry.get("instance_id") != from_instance:
            continue
        text = f"{entry.get('title', '')} {entry.get('summary', '')}".lower()
        if not any(kw in text for kw in kw_lower):
            continue
        results.append({
            "source": "outputs",
            "instance_id": entry.get("instance_id"),
            "title": entry.get("title"),
            "snippet": entry.get("summary", "")[:300],
            "date": entry.get("archived_at", ""),
            "file_path": entry.get("file_path")
        })
    return results[:limit]


def _search_memory(keywords, from_instance, limit):
    memory_dir = SHARED_LIB / "memory-ext"
    if not memory_dir.exists():
        return []
    results = []
    kw_lower = [k.lower() for k in keywords]
    rules = _isolation_rules()
    for dir_path in memory_dir.iterdir():
        if not dir_path.is_dir() or dir_path.name.startswith("."):
            continue
        if from_instance and dir_path.name != from_instance and dir_path.name != "shared":
            continue
        access = _memory_ext_access(dir_path.name, rules)
        if access == "deny":
            continue
        for md_file in dir_path.glob("*.md"):
            text = md_file.read_text(encoding="utf-8")
            if not any(kw in text.lower() for kw in kw_lower):
                continue
            title = text.split("\n")[0].replace("# ", "").strip() if text else md_file.stem
            snippet = text[:500] + "..." if len(text) > 500 and access == "summary" else text[:1000]
            results.append({
                "source": "memory-ext",
                "instance_id": dir_path.name,
                "title": title,
                "snippet": snippet,
                "file_path": str(md_file.relative_to(DDUP_PATH)),
                "access": access
            })
    return results[:limit]


def _search_wiki(keywords, limit):
    compiled_dir = SHARED_LIB / "wiki" / "compiled"
    if not compiled_dir.exists():
        return []
    results = []
    kw_lower = [k.lower() for k in keywords]
    for md_file in compiled_dir.glob("*.md"):
        text = md_file.read_text(encoding="utf-8")
        if any(kw in text.lower() for kw in kw_lower):
            title = text.split("\n")[0].replace("# ", "").strip() if text else md_file.stem
            results.append({
                "source": "wiki",
                "title": title,
                "snippet": text[:300],
                "file_path": str(md_file.relative_to(DDUP_PATH))
            })
    return results[:limit]


def _search_cron(keywords, from_instance, limit):
    outputs_dir = SHARED_LIB / "outputs"
    if not outputs_dir.exists():
        return []
    results = []
    kw_lower = [k.lower() for k in keywords]
    for instance_dir in outputs_dir.iterdir():
        if not instance_dir.is_dir() or instance_dir.name.startswith("."):
            continue
        if from_instance and instance_dir.name != from_instance:
            continue
        cron_dir = instance_dir / "cron-archives"
        if not cron_dir.exists():
            continue
        for json_file in cron_dir.rglob("*.json"):
            try:
                text = json_file.read_text(encoding="utf-8")
                if any(kw in text.lower() for kw in kw_lower):
                    results.append({
                        "source": "cron-archive",
                        "instance_id": instance_dir.name,
                        "title": json_file.stem,
                        "snippet": text[:300],
                        "file_path": str(json_file.relative_to(DDUP_PATH))
                    })
            except Exception:
                continue
    return results[:limit]


def _cli():
    import argparse
    parser = argparse.ArgumentParser(description="Cross Instance Query")
    sub = parser.add_subparsers(dest="cmd")

    s = sub.add_parser("search", help="全局搜索")
    s.add_argument("--keywords", required=True)
    s.add_argument("--sources", default="outputs,memory,wiki,cron")
    s.add_argument("--from-instance", default="")
    s.add_argument("--limit", type=int, default=20)

    o = sub.add_parser("outputs", help="搜索产出")
    o.add_argument("--keywords", required=True)
    o.add_argument("--from", dest="from_instance", default="")
    o.add_argument("--limit", type=int, default=20)

    m = sub.add_parser("memory", help="搜索记忆")
    m.add_argument("--keywords", required=True)
    m.add_argument("--scope", default="all")
    m.add_argument("--limit", type=int, default=20)

    c = sub.add_parser("cron", help="搜索归档")
    c.add_argument("--keywords", default="")
    c.add_argument("--job-id", default="")
    c.add_argument("--date-range", default="")
    c.add_argument("--limit", type=int, default=20)

    args = parser.parse_args()
    keywords = [k.strip() for k in args.keywords.split(",") if k.strip()] if hasattr(args, "keywords") and args.keywords else []

    if args.cmd == "search":
        sources = [s.strip() for s in args.sources.split(",")]
        result = search(keywords, sources, args.from_instance or None, args.limit)
    elif args.cmd == "outputs":
        result = search(keywords, ["outputs"], args.from_instance or None, args.limit)
    elif args.cmd == "memory":
        scope_map = {"self": [INSTANCE_ID], "shared": ["shared"], "all": None}
        result = search(keywords, ["memory"], None, args.limit)
    elif args.cmd == "cron":
        result = search(keywords, ["cron"], None, args.limit)
    else:
        parser.print_help()
        return

    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    _cli()
