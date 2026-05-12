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
                "status": item.get("status", "unknown"),
                "description": item.get("description", ""),
                "deployment": _sanitize_deployment(item.get("deployment", {})),
                "capabilities": item.get("capabilities", []),
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
            "status": item.get("status", "unknown"),
            "description": item.get("description", ""),
            "deployment": _sanitize_deployment(item.get("deployment", {})),
            "capabilities": item.get("capabilities", []),
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
    shared_memory_files = (
        [path for path in shared_memory_dir.glob("*.md") if path.is_file()]
        if shared_memory_dir.exists()
        else []
    )

    return {
        "repo_root": str(_repo_root()),
        "instances_count": len(instances),
        "online_instances_count": sum(1 for item in instances if item.get("status") == "online"),
        "skills_count": len(skills_manifest.get("skills", [])),
        "shared_memory_files_count": len(shared_memory_files),
        "outputs_entries_count": len(outputs_index.get("entries", [])),
        "coverage": {
            "registry_present": _json_path("registry", "instances.json").exists(),
            "skills_manifest_present": _json_path("registry", "skills-manifest.json").exists(),
            "outputs_index_present": _json_path("outputs", ".index.json").exists(),
            "shared_memory_present": shared_memory_dir.exists(),
            "wiki_raw_present": (_shared_root() / "wiki" / "_raw").exists(),
        },
        "current_focus": [
            "Read-only governance APIs are now available.",
            "A shared Hermes console is mounted in web, pc and mobile apps.",
            "Write operations still rely on script-based shared-library flows.",
        ],
    }


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


def search_shared_library(query: str, limit: int = 20) -> list[dict[str, Any]]:
    q = (query or "").strip().lower()
    if not q:
        return []

    results: list[dict[str, Any]] = []

    def score_text(*parts: str) -> int:
        score = 0
        for part in parts:
            text = (part or "").lower()
            if q in text:
                score += max(1, text.count(q))
        return score

    for instance in list_instances():
        score = score_text(
            instance["id"],
            instance["name"],
            instance.get("description", ""),
            " ".join(instance.get("specialization", [])),
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

    for scope_dir in (_shared_root() / "memory-ext").glob("*"):
        if not scope_dir.is_dir():
            continue
        for path in scope_dir.glob("*.md"):
            text = _safe_read_text(path)
            score = score_text(path.name, text[:4000])
            if score:
                snippet = text.strip().replace("\n", " ")[:160]
                results.append(
                    {
                        "source": "memory",
                        "id": path.stem,
                        "title": path.name,
                        "snippet": snippet,
                        "instance_id": scope_dir.name,
                        "score": score + 1,
                    }
                )

    for entry in _load_outputs_index().get("entries", []):
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
                    "score": score,
                }
            )

    results.sort(key=lambda item: (-item["score"], str(item["title"])))
    trimmed = results[: max(1, min(limit, 50))]
    for item in trimmed:
        item.pop("score", None)
    return trimmed
