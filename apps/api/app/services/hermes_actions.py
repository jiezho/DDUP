from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.core import config
from app.services.hermes_archive import save_cron_archive
from app.services.hermes_registry import search_shared_library


def _repo_root() -> Path:
    configured = (config.settings.ddup_path or "").strip()
    if configured:
        return Path(configured).expanduser().resolve()
    return Path(__file__).resolve().parents[4]


def _shared_root() -> Path:
    return _repo_root() / "shared-library"


def _registry_dir() -> Path:
    return _shared_root() / "registry"


def _registry_path() -> Path:
    local_path = _registry_dir() / "instances.local.json"
    if local_path.exists():
        return local_path
    return _registry_dir() / "instances.json"


def _ensure_dir(path: Path) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    return path


def _safe_read_json(path: Path, default: Any) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def _write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _slugify(value: str) -> str:
    cleaned = re.sub(r'[\\/:*?"<>|]', "", value).strip()
    cleaned = re.sub(r"\s+", "-", cleaned)
    cleaned = cleaned.strip("-.").lower()
    return cleaned or "untitled"


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


def register_instance(payload: dict[str, Any]) -> dict[str, Any]:
    instance_id = str(payload.get("id", "")).strip()
    if not instance_id:
        raise ValueError("instance id is required")

    path = _registry_path()
    registry = _safe_read_json(path, {"version": "2.0.0", "instances": []})
    instances = registry.setdefault("instances", [])
    if any(str(item.get("id", "")).strip() == instance_id for item in instances):
        raise ValueError(f"instance already exists: {instance_id}")

    capabilities = {
        "model": payload.get("model"),
        "context_window": payload.get("context_window"),
        "platforms": list(payload.get("platforms") or []),
        "toolsets": list(payload.get("toolsets") or []),
        "skills_count": payload.get("skills_count"),
        "skill_hub_available": payload.get("skill_hub_available"),
        "max_subagents": payload.get("max_subagents"),
    }

    instance = {
        "id": instance_id,
        "name": payload.get("name", instance_id),
        "description": payload.get("description", ""),
        "deployment": {
            "type": payload.get("deployment_type", "docker"),
            "host": payload.get("host", "localhost"),
            "data_path": payload.get("data_path", ""),
            "hermes_version": payload.get("hermes_version", "unknown"),
        },
        "capabilities": capabilities,
        "specialization": list(payload.get("specialization") or []),
        "sub_agents": [],
        "cron_jobs": [],
        "data_assets": {},
        "published_skills": list(payload.get("published_skills") or []),
        "status": _normalize_status(str(payload.get("status", "active"))),
        "registered_at": datetime.now(tz=timezone.utc).date().isoformat(),
        "memory_ext": {
            "enabled": True,
            "status": "ready",
            "files_count": 0,
            "files": [],
            "memory_saturation": "low",
        },
    }
    instances.append(instance)
    _write_json(path, registry)

    created_paths: list[str] = []
    directories = [
        _shared_root() / "memory-ext" / instance_id,
        _shared_root() / "outputs" / instance_id / "cron-archives",
        _shared_root() / "wiki" / "_raw" / instance_id,
        _repo_root() / "agents" / instance_id,
    ]
    for directory in directories:
        _ensure_dir(directory)
        created_paths.append(str(directory.relative_to(_repo_root())).replace("\\", "/"))

    readme_path = _repo_root() / "agents" / instance_id / "README.md"
    soul_path = _repo_root() / "agents" / instance_id / "SOUL.md"
    if not readme_path.exists():
        readme_path.write_text(
            f"# {instance.get('name', instance_id)}\n\n- Instance ID: `{instance_id}`\n- Status: `{instance['status']}`\n",
            encoding="utf-8",
        )
        created_paths.append(str(readme_path.relative_to(_repo_root())).replace("\\", "/"))
    if not soul_path.exists():
        soul_path.write_text(
            f"# {instance.get('name', instance_id)}\n\n- Purpose: TODO\n- Specialization: {', '.join(instance['specialization']) or 'TBD'}\n",
            encoding="utf-8",
        )
        created_paths.append(str(soul_path.relative_to(_repo_root())).replace("\\", "/"))

    return {
        "status": "registered",
        "message": "instance registered",
        "instance_id": instance_id,
        "path": str(path.relative_to(_repo_root())).replace("\\", "/"),
        "created_paths": created_paths,
    }


def save_memory_entry(instance_id: str, scope: str, key: str, content: str) -> dict[str, Any]:
    if not instance_id.strip():
        raise ValueError("instance_id is required")
    normalized_scope = (scope or "self").strip().lower()
    if normalized_scope not in {"self", "shared"}:
        raise ValueError("scope must be self or shared")
    if not key.strip():
        raise ValueError("key is required")
    if not content.strip():
        raise ValueError("content is required")

    target_dir = _ensure_dir(_shared_root() / "memory-ext" / ("shared" if normalized_scope == "shared" else instance_id))
    file_path = target_dir / f"{_slugify(key)}.md"
    timestamp = datetime.now(tz=timezone.utc).replace(microsecond=0).isoformat()

    if file_path.exists():
        existing = file_path.read_text(encoding="utf-8")
        file_path.write_text(existing + f"\n\n---\n*更新于 {timestamp}*\n\n{content.strip()}\n", encoding="utf-8")
    else:
        file_path.write_text(f"# {key.strip()}\n\n{content.strip()}\n", encoding="utf-8")

    return {
        "status": "saved",
        "message": "memory entry saved",
        "instance_id": instance_id,
        "scope": normalized_scope,
        "path": str(file_path.relative_to(_repo_root())).replace("\\", "/"),
    }


def write_wiki_raw(instance_id: str, title: str, content: str, tags: list[str] | None = None) -> dict[str, Any]:
    if not instance_id.strip():
        raise ValueError("instance_id is required")
    if not title.strip():
        raise ValueError("title is required")
    if not content.strip():
        raise ValueError("content is required")

    target_dir = _ensure_dir(_shared_root() / "wiki" / "_raw" / instance_id)
    file_path = target_dir / f"{_slugify(title)}.md"
    timestamp = datetime.now(tz=timezone.utc).replace(microsecond=0).isoformat()
    normalized_tags = [str(item).strip() for item in (tags or []) if str(item).strip()]
    frontmatter = [
        "---",
        f'title: "{title.strip()}"',
        f"instance_id: {instance_id}",
        f"updated_at: {timestamp}",
        f"tags: [{', '.join(json.dumps(item, ensure_ascii=False) for item in normalized_tags)}]",
        "---",
        "",
    ]
    file_path.write_text("\n".join(frontmatter) + content.strip() + "\n", encoding="utf-8")
    return {
        "status": "written",
        "message": "wiki raw entry written",
        "instance_id": instance_id,
        "path": str(file_path.relative_to(_repo_root())).replace("\\", "/"),
    }


def search_library(
    query: str,
    limit: int = 20,
    sources: list[str] | None = None,
    instance_id: str | None = None,
) -> dict[str, Any]:
    items = search_shared_library(query, limit=limit, sources=sources, instance_id=instance_id)
    return {
        "status": "success",
        "query": query,
        "total": len(items),
        "items": items,
    }


def archive_output(
    instance_id: str,
    job_id: str,
    title: str,
    summary: str,
    content: str,
    metadata: dict[str, Any] | None = None,
    attachments: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    return save_cron_archive(
        instance_id=instance_id,
        job_id=job_id,
        title=title,
        summary=summary,
        content=content,
        metadata=metadata,
        attachments=attachments,
    )
