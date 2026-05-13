from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.core import config


BLUEPRINT = {
    "principles": [
        {
            "title": "Instance identity first",
            "description": "Each Hermes instance should declare HERMES_INSTANCE_ID before enabling shared storage and shared-library features.",
        },
        {
            "title": "Shared library as the source of truth",
            "description": "Git stores registry, skills, small files and memory-ext data, while object storage stores heavy artifacts and archives.",
        },
        {
            "title": "Three-layer memory model",
            "description": "Hermes built-in memory, per-instance memory-ext and shared public memory should be orchestrated together.",
        },
        {
            "title": "Scripts should become product APIs",
            "description": "memory-ext, cross-query, wiki compilation and instance registration should be accessible through audited backend APIs and UI.",
        },
    ],
    "interfaces": [
        {
            "name": "memory-ext",
            "scope": "memory",
            "contract": "save/query/migrate/status against shared-library/memory-ext/{instance|shared}",
            "status": "partial",
        },
        {
            "name": "cron-archive",
            "scope": "archive",
            "contract": "persist cron outputs and update shared-library/outputs/.index.json",
            "status": "planned",
        },
        {
            "name": "storage-client",
            "scope": "object-storage",
            "contract": "upload/download/list/presign with per-instance namespace rules",
            "status": "planned",
        },
        {
            "name": "cross-instance-query",
            "scope": "query",
            "contract": "search outputs, memory-ext, wiki and cron archives via one contract",
            "status": "partial",
        },
        {
            "name": "wiki-write + compiler",
            "scope": "knowledge",
            "contract": "write raw wiki material first, then promote through compiler jobs",
            "status": "partial",
        },
    ],
    "lifecycle": [
        {
            "stage": "Bootstrap",
            "description": "Validate DDUP_PATH, HERMES_INSTANCE_ID and storage connectivity.",
            "checkpoints": ["registry loaded", "env ready", "memory-ext installed"],
        },
        {
            "stage": "Operate",
            "description": "Sync code before running, query the shared library and write outputs with auditability.",
            "checkpoints": ["git sync", "query shared library", "write raw/wiki/memory"],
        },
        {
            "stage": "Archive",
            "description": "Route structured outputs into outputs and object storage with retention policies.",
            "checkpoints": ["outputs indexed", "storage routed", "retention applied"],
        },
        {
            "stage": "Evolve",
            "description": "Register new instances automatically and provision README, SOUL and memory-ext folders.",
            "checkpoints": ["instance registered", "directories created", "skills discoverable"],
        },
    ],
    "pending_tasks": [
        {
            "priority": "P0",
            "title": "Wrap scripts with formal APIs",
            "description": "Expose memory-ext, cross-query and instance registration through backend APIs instead of file-level scripts only.",
        },
        {
            "priority": "P0",
            "title": "Ship a unified Hermes console",
            "description": "Provide one management page for instances, skills, shared memory and archive visibility.",
        },
        {
            "priority": "P1",
            "title": "Operationalize archive and wiki jobs",
            "description": "Move cron archive, wiki compilation and storage lifecycle rules into visible scheduled jobs.",
        },
        {
            "priority": "P1",
            "title": "Strengthen permission and redaction controls",
            "description": "Filter deployment details and protect asset identifiers before exposing data to the UI.",
        },
    ],
}


def _repo_root() -> Path:
    configured = (config.settings.ddup_path or "").strip()
    if configured:
        return Path(configured).expanduser().resolve()
    return Path(__file__).resolve().parents[4]


def _shared_root() -> Path:
    return _repo_root() / "shared-library"


def _json_path(*parts: str) -> Path:
    return _shared_root().joinpath(*parts)


def _safe_read_json(path: Path, default: Any) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def _safe_read_text(path: Path) -> str:
    for encoding in ("utf-8", "utf-8-sig"):
        try:
            return path.read_text(encoding=encoding)
        except Exception:
            continue
    return ""


def _iso_from_timestamp(ts: float) -> str:
    return datetime.fromtimestamp(ts, tz=timezone.utc).replace(microsecond=0).isoformat()


def _file_meta(path: Path) -> dict[str, Any]:
    stat = path.stat()
    return {
        "name": path.name,
        "relative_path": str(path.relative_to(_repo_root())).replace("\\", "/"),
        "updated_at": _iso_from_timestamp(stat.st_mtime),
        "size": stat.st_size,
    }


def _memory_dir(instance_id: str) -> Path:
    return _shared_root() / "memory-ext" / instance_id


def _load_instances_registry() -> dict[str, Any]:
    registry_dir = _shared_root() / "registry"
    local_path = registry_dir / "instances.local.json"
    if local_path.exists():
        return _safe_read_json(local_path, {"instances": []})
    return _safe_read_json(registry_dir / "instances.json", {"instances": []})


def _load_skills_manifest() -> dict[str, Any]:
    return _safe_read_json(_json_path("registry", "skills-manifest.json"), {"skills": []})


def _load_outputs_index() -> dict[str, Any]:
    return _safe_read_json(_json_path("outputs", ".index.json"), {"entries": []})


def _count_matching_files(directory: Path, pattern: str) -> int:
    if not directory.exists():
        return 0
    return sum(1 for path in directory.rglob(pattern) if path.is_file())


def _sanitize_deployment(deployment: dict[str, Any]) -> dict[str, Any]:
    host = str(deployment.get("host", "") or "")
    host_label = "internal"
    if host in {"localhost", "localhost (WSL2)", "<HOST>"}:
        host_label = host.replace(" (WSL2)", "")
    return {
        "type": deployment.get("type", "unknown"),
        "host_label": host_label,
        "hermes_version": deployment.get("hermes_version", "unknown"),
        "data_path_present": bool(deployment.get("data_path")),
    }


def _normalize_status(value: str) -> str:
    normalized = (value or "").strip().lower()
    if normalized in {"active", "online", "ready", "running"}:
        return "active"
    if normalized in {"partial", "degraded"}:
        return "partial"
    if normalized in {"planned", "provisioning"}:
        return "planned"
    if normalized in {"inactive", "offline", "stopped"}:
        return "inactive"
    return "unknown"


def _normalize_capabilities(raw: Any) -> dict[str, Any]:
    if isinstance(raw, list):
        toolsets = [str(item).strip() for item in raw if str(item).strip()]
        summary_tags = toolsets[:6]
        return {
            "model": None,
            "context_window": None,
            "platforms": [],
            "toolsets": toolsets,
            "skills_count": None,
            "skill_hub_available": None,
            "max_subagents": None,
            "declared_count": len(toolsets),
            "summary_tags": summary_tags,
        }

    capabilities = raw if isinstance(raw, dict) else {}
    platforms = [str(item).strip() for item in capabilities.get("platforms", []) if str(item).strip()]
    toolsets = [str(item).strip() for item in capabilities.get("toolsets", []) if str(item).strip()]
    summary_tags: list[str] = []
    model = capabilities.get("model")
    if model:
        summary_tags.append(str(model))
    summary_tags.extend(platforms[:2])
    summary_tags.extend(toolsets[:3])

    declared_count = len(platforms) + len(toolsets)
    if model:
        declared_count += 1
    if capabilities.get("context_window"):
        declared_count += 1
    if capabilities.get("skills_count") is not None:
        declared_count += 1
    if capabilities.get("max_subagents") is not None:
        declared_count += 1

    return {
        "model": str(model) if model else None,
        "context_window": capabilities.get("context_window"),
        "platforms": platforms,
        "toolsets": toolsets,
        "skills_count": capabilities.get("skills_count"),
        "skill_hub_available": capabilities.get("skill_hub_available"),
        "max_subagents": capabilities.get("max_subagents"),
        "declared_count": declared_count,
        "summary_tags": summary_tags[:6],
    }


def _summarize_assets(data_assets: dict[str, Any]) -> dict[str, int]:
    summary: dict[str, int] = {}
    for key, value in (data_assets or {}).items():
        if isinstance(value, (list, dict)):
            summary[key] = len(value)
        elif isinstance(value, int):
            summary[key] = value
    return summary


def _memory_summary(instance_id: str) -> dict[str, Any]:
    directory = _memory_dir(instance_id)
    if not directory.exists():
        return {"files_count": 0, "latest_updated_at": None, "recent_files": []}

    files = sorted(
        [path for path in directory.glob("*.md") if path.is_file()],
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    )
    return {
        "files_count": len(files),
        "latest_updated_at": _iso_from_timestamp(files[0].stat().st_mtime) if files else None,
        "recent_files": [_file_meta(path) for path in files[:5]],
    }


def _outputs_summary(instance_id: str, entries: list[dict[str, Any]]) -> dict[str, Any]:
    instance_entries = [entry for entry in entries if entry.get("instance_id") == instance_id]
    latest = None
    if instance_entries:
        latest = sorted(
            instance_entries,
            key=lambda item: str(item.get("archived_at", "")),
            reverse=True,
        )[0]
    return {"entries_count": len(instance_entries), "latest_entry": latest}


def list_instances() -> list[dict[str, Any]]:
    registry = _load_instances_registry()
    outputs_entries = _load_outputs_index().get("entries", [])
    items: list[dict[str, Any]] = []

    for item in registry.get("instances", []):
        instance_id = str(item.get("id", ""))
        items.append(
            {
                "id": instance_id,
                "name": item.get("name", instance_id),
                "status": _normalize_status(str(item.get("status", "unknown"))),
                "description": item.get("description", ""),
                "deployment": _sanitize_deployment(item.get("deployment", {})),
                "capabilities": _normalize_capabilities(item.get("capabilities", {})),
                "specialization": item.get("specialization", []),
                "published_skills": item.get("published_skills", []),
                "sub_agents_count": len(item.get("sub_agents", [])),
                "cron_jobs_count": len(item.get("cron_jobs", [])),
                "memory": _memory_summary(instance_id),
                "outputs": _outputs_summary(instance_id, outputs_entries),
                "data_assets_summary": _summarize_assets(item.get("data_assets", {})),
            }
        )

    return sorted(items, key=lambda item: item["id"])


def get_instance_detail(instance_id: str) -> dict[str, Any] | None:
    registry = _load_instances_registry()
    outputs_entries = _load_outputs_index().get("entries", [])

    for item in registry.get("instances", []):
        if item.get("id") != instance_id:
            continue
        return {
            "id": instance_id,
            "name": item.get("name", instance_id),
            "status": _normalize_status(str(item.get("status", "unknown"))),
            "description": item.get("description", ""),
            "deployment": _sanitize_deployment(item.get("deployment", {})),
            "capabilities": _normalize_capabilities(item.get("capabilities", {})),
            "specialization": item.get("specialization", []),
            "published_skills": item.get("published_skills", []),
            "sub_agents": item.get("sub_agents", []),
            "cron_jobs": item.get("cron_jobs", []),
            "data_assets_summary": _summarize_assets(item.get("data_assets", {})),
            "memory": _memory_summary(instance_id),
            "outputs": _outputs_summary(instance_id, outputs_entries),
        }

    return None


def get_overview() -> dict[str, Any]:
    instances = list_instances()
    skills_manifest = _load_skills_manifest()
    outputs_index = _load_outputs_index()
    shared_memory_dir = _shared_root() / "memory-ext" / "shared"
    wiki_root = _shared_root() / "wiki"
    outputs_root = _shared_root() / "outputs"
    shared_memory_files = (
        [path for path in shared_memory_dir.glob("*.md") if path.is_file()]
        if shared_memory_dir.exists()
        else []
    )
    wiki_raw_files_count = _count_matching_files(wiki_root / "_raw", "*.md")
    wiki_compiled_files_count = _count_matching_files(wiki_root / "compiled", "*.md")
    cron_archive_files_count = _count_matching_files(outputs_root, "*.json")

    return {
        "repo_root": str(_repo_root()),
        "instances_count": len(instances),
        "active_instances_count": sum(1 for item in instances if item.get("status") == "active"),
        "online_instances_count": sum(1 for item in instances if item.get("status") == "active"),
        "skills_count": len(skills_manifest.get("skills", [])),
        "shared_memory_files_count": len(shared_memory_files),
        "outputs_entries_count": len(outputs_index.get("entries", [])),
        "runtime": {
            "wiki_raw_files_count": wiki_raw_files_count,
            "wiki_compiled_files_count": wiki_compiled_files_count,
            "cron_archive_files_count": cron_archive_files_count,
            "published_skills_count": len(skills_manifest.get("skills", [])),
            "memory_namespaces_count": sum(
                1 for path in (_shared_root() / "memory-ext").glob("*") if path.is_dir()
            ),
        },
        "coverage": {
            "registry_present": _json_path("registry", "instances.json").exists(),
            "skills_manifest_present": _json_path("registry", "skills-manifest.json").exists(),
            "outputs_index_present": _json_path("outputs", ".index.json").exists(),
            "shared_memory_present": shared_memory_dir.exists(),
            "wiki_raw_present": (_shared_root() / "wiki" / "_raw").exists(),
        },
        "current_focus": [
            "The Hermes console now supports registration, memory writes and wiki raw writes.",
            "Cross-instance search covers instances, skills, memory, outputs, wiki and cron archives.",
            "Archive jobs, storage lifecycle and wiki compilation still need full productization.",
        ],
    }


def _memory_access_level(scope_name: str) -> str:
    if scope_name == "shared":
        return "full"
    return "summary"


def _search_memory(query: str) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    q = query.lower()
    memory_root = _shared_root() / "memory-ext"
    if not memory_root.exists():
        return results

    for scope_dir in memory_root.glob("*"):
        if not scope_dir.is_dir():
            continue
        for path in scope_dir.glob("*.md"):
            text = _safe_read_text(path)
            target = f"{path.name}\n{text[:4000]}".lower()
            if q not in target:
                continue
            access = _memory_access_level(scope_dir.name)
            snippet_limit = 1000 if access == "full" else 500
            snippet = text.strip().replace("\n", " ")[:snippet_limit]
            results.append(
                {
                    "source": "memory",
                    "id": path.stem,
                    "title": path.name,
                    "snippet": snippet,
                    "instance_id": scope_dir.name,
                    "access": access,
                    "file_path": str(path.relative_to(_repo_root())).replace("\\", "/"),
                    "score": target.count(q) + 1,
                }
            )
    return results


def _search_wiki(query: str) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    q = query.lower()
    wiki_root = _shared_root() / "wiki"
    search_dirs = [wiki_root / "compiled", wiki_root / "_raw"]
    for base_dir in search_dirs:
        if not base_dir.exists():
            continue
        for path in base_dir.rglob("*.md"):
            text = _safe_read_text(path)
            target = f"{path.name}\n{text[:4000]}".lower()
            if q not in target:
                continue
            instance_id = None
            if "_raw" in path.parts:
                try:
                    instance_id = path.relative_to(wiki_root / "_raw").parts[0]
                except Exception:
                    instance_id = None
            results.append(
                {
                    "source": "wiki",
                    "id": str(path.relative_to(_repo_root())).replace("\\", "/"),
                    "title": path.stem,
                    "snippet": text.strip().replace("\n", " ")[:300],
                    "instance_id": instance_id,
                    "file_path": str(path.relative_to(_repo_root())).replace("\\", "/"),
                    "score": target.count(q) + 1,
                }
            )
    return results


def _search_cron_archives(query: str) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    q = query.lower()
    outputs_root = _shared_root() / "outputs"
    if not outputs_root.exists():
        return results

    for instance_dir in outputs_root.iterdir():
        if not instance_dir.is_dir() or instance_dir.name.startswith("."):
            continue
        cron_dir = instance_dir / "cron-archives"
        if not cron_dir.exists():
            continue
        for path in cron_dir.rglob("*.json"):
            text = _safe_read_text(path)
            target = f"{path.name}\n{text[:4000]}".lower()
            if q not in target:
                continue
            results.append(
                {
                    "source": "cron",
                    "id": str(path.relative_to(_repo_root())).replace("\\", "/"),
                    "title": path.stem,
                    "snippet": text.strip().replace("\n", " ")[:300],
                    "instance_id": instance_dir.name,
                    "file_path": str(path.relative_to(_repo_root())).replace("\\", "/"),
                    "score": target.count(q) + 1,
                }
            )
    return results


def get_blueprint() -> dict[str, Any]:
    return BLUEPRINT


def list_skills() -> dict[str, Any]:
    manifest = _load_skills_manifest()
    return {
        "version": manifest.get("version", "unknown"),
        "updated_at": manifest.get("updated_at"),
        "skills_count": len(manifest.get("skills", [])),
        "skills": manifest.get("skills", []),
    }


def search_shared_library(
    query: str,
    limit: int = 20,
    sources: list[str] | None = None,
    instance_id: str | None = None,
) -> list[dict[str, Any]]:
    q = (query or "").strip().lower()
    if not q:
        return []

    results: list[dict[str, Any]] = []
    normalized_sources = {item.strip().lower() for item in (sources or []) if item and item.strip()}
    if not normalized_sources:
        normalized_sources = {"instance", "skill", "memory", "output", "wiki", "cron"}
    instance_filter = (instance_id or "").strip()

    def score_text(*parts: str) -> int:
        score = 0
        for part in parts:
            text = (part or "").lower()
            if q in text:
                score += max(1, text.count(q))
        return score

    if "instance" in normalized_sources:
        for instance in list_instances():
            if instance_filter and instance["id"] != instance_filter:
                continue
            score = score_text(
                instance["id"],
                instance["name"],
                instance.get("description", ""),
                " ".join(instance.get("specialization", [])),
                instance.get("capabilities", {}).get("model") or "",
                " ".join(instance.get("capabilities", {}).get("platforms", [])),
                " ".join(instance.get("capabilities", {}).get("toolsets", [])),
            )
            if score:
                results.append(
                    {
                        "source": "instance",
                        "id": instance["id"],
                        "title": instance["name"],
                        "snippet": instance.get("description", ""),
                        "instance_id": instance["id"],
                        "score": score + 3,
                    }
                )

    if "skill" in normalized_sources:
        for skill in list_skills().get("skills", []):
            score = score_text(
                skill.get("name", ""),
                skill.get("description", ""),
                " ".join(skill.get("tags", [])),
            )
            if score:
                results.append(
                    {
                        "source": "skill",
                        "id": skill.get("name", ""),
                        "title": skill.get("name", ""),
                        "snippet": skill.get("description", ""),
                        "instance_id": None,
                        "score": score + 2,
                    }
                )

    if "memory" in normalized_sources:
        for item in _search_memory(query):
            if instance_filter and item.get("instance_id") not in {instance_filter, "shared"}:
                continue
            item["score"] = item.get("score", 0) + 1
            results.append(item)

    if "output" in normalized_sources:
        for entry in _load_outputs_index().get("entries", []):
            if instance_filter and entry.get("instance_id") != instance_filter:
                continue
            score = score_text(
                str(entry.get("title", "")),
                str(entry.get("summary", "")),
                str(entry.get("job_id", "")),
            )
            if score:
                results.append(
                    {
                        "source": "output",
                        "id": str(entry.get("id", "")),
                        "title": str(entry.get("title", "")),
                        "snippet": str(entry.get("summary", "")),
                        "instance_id": entry.get("instance_id"),
                        "file_path": entry.get("file_path"),
                        "score": score,
                    }
                )

    if "wiki" in normalized_sources:
        for item in _search_wiki(query):
            if instance_filter and item.get("instance_id") not in {None, instance_filter}:
                continue
            item["score"] = item.get("score", 0) + 1
            results.append(item)

    if "cron" in normalized_sources:
        for item in _search_cron_archives(query):
            if instance_filter and item.get("instance_id") != instance_filter:
                continue
            item["score"] = item.get("score", 0)
            results.append(item)

    results.sort(key=lambda item: (-item["score"], str(item["title"])))
    trimmed = results[: max(1, min(limit, 50))]
    for item in trimmed:
        item.pop("score", None)
    return trimmed
