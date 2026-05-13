from __future__ import annotations

import json
import socket
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from app.core import config
from app.services.hermes_registry import get_isolation_summary


def _repo_root() -> Path:
    configured = (config.settings.ddup_path or "").strip()
    if configured:
        return Path(configured).expanduser().resolve()
    return Path(__file__).resolve().parents[4]


def _shared_root() -> Path:
    return _repo_root() / "shared-library"


def _outputs_root() -> Path:
    return _shared_root() / "outputs"


def _outputs_index_path() -> Path:
    return _outputs_root() / ".index.json"


def _safe_read_json(path: Path, default: Any) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def _write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _count_matching_files(directory: Path, pattern: str) -> int:
    if not directory.exists():
        return 0
    return sum(1 for path in directory.rglob(pattern) if path.is_file())


def _utc_now() -> datetime:
    return datetime.now(tz=timezone.utc).replace(microsecond=0)


def _cron_registry() -> dict[str, Any]:
    return _safe_read_json(_shared_root() / "registry" / "cron-registry.json", {"jobs": []})


def _storage_policy() -> dict[str, Any]:
    return _safe_read_json(_shared_root() / "config" / "storage-policy.json", {})


def _sync_schedule() -> dict[str, Any]:
    return _safe_read_json(_shared_root() / "config" / "sync-schedule.json", {})


def _storage_probe(endpoint: str) -> dict[str, Any]:
    if not endpoint:
        return {"reachable": False, "status": "missing"}
    try:
        parsed = urlparse(endpoint if "://" in endpoint else f"http://{endpoint}")
        host = parsed.hostname
        port = parsed.port or (443 if parsed.scheme == "https" else 80)
        if not host:
            return {"reachable": False, "status": "invalid"}
        with socket.create_connection((host, port), timeout=1.5):
            return {"reachable": True, "status": "reachable", "host": host, "port": port}
    except Exception:
        return {"reachable": False, "status": "unreachable"}


def save_cron_archive(
    instance_id: str,
    job_id: str,
    title: str,
    summary: str,
    content: str,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    if not instance_id.strip():
        raise ValueError("instance_id is required")
    if not job_id.strip():
        raise ValueError("job_id is required")
    if not title.strip():
        raise ValueError("title is required")
    if not content.strip():
        raise ValueError("content is required")

    cron_registry = _cron_registry()
    job = next((item for item in cron_registry.get("jobs", []) if item.get("id") == job_id), None)
    if job and job.get("owner") not in {None, "", instance_id}:
        raise ValueError(f"job owner mismatch: {job.get('owner')}")

    now = _utc_now()
    date_str = now.date().isoformat()
    archive_dir = _outputs_root() / instance_id / "cron-archives" / job_id
    archive_dir.mkdir(parents=True, exist_ok=True)
    archive_file = archive_dir / f"{date_str}.json"
    entry_id = f"{job_id}-{now.strftime('%Y%m%d-%H%M%S')}"
    normalized_metadata = metadata or {}
    execution_status = str(normalized_metadata.get("status", "success") or "success").strip().lower()
    duration_ms = normalized_metadata.get("duration_ms")

    entry = {
        "id": entry_id,
        "job_id": job_id,
        "instance_id": instance_id,
        "title": title.strip(),
        "summary": summary.strip(),
        "content": content.strip(),
        "metadata": normalized_metadata,
        "execution_status": execution_status,
        "duration_ms": duration_ms,
        "archived_at": now.isoformat(),
        "attachments": [],
    }

    archive_payload = _safe_read_json(archive_file, [])
    if isinstance(archive_payload, list):
        archive_payload.append(entry)
    elif archive_payload:
        archive_payload = [archive_payload, entry]
    else:
        archive_payload = [entry]
    _write_json(archive_file, archive_payload)

    index_path = _outputs_index_path()
    index_payload = _safe_read_json(index_path, {"entries": [], "version": "2.0.0", "created_at": now.date().isoformat()})
    index_payload.setdefault("entries", []).append(
        {
            "id": entry_id,
            "instance_id": instance_id,
            "type": "cron_archive",
            "job_id": job_id,
            "title": title.strip(),
            "summary": summary.strip(),
            "execution_status": execution_status,
            "duration_ms": duration_ms,
            "archived_at": now.isoformat(),
            "file_path": str(archive_file.relative_to(_repo_root())).replace("\\", "/"),
        }
    )
    _write_json(index_path, index_payload)

    return {
        "status": "archived",
        "message": "cron archive saved",
        "instance_id": instance_id,
        "path": str(archive_file.relative_to(_repo_root())).replace("\\", "/"),
    }


def get_runtime_status(limit: int = 5) -> dict[str, Any]:
    cron_registry = _cron_registry()
    outputs_index = _safe_read_json(_outputs_index_path(), {"entries": []})
    storage_policy = _storage_policy()
    sync_schedule = _sync_schedule()
    minio_policy = storage_policy.get("policies", {}).get("minio", {})
    endpoint = config.settings.storage_endpoint or minio_policy.get("endpoint", "")
    bucket = config.settings.storage_bucket or minio_policy.get("bucket", "")
    probe = _storage_probe(endpoint)
    isolation = get_isolation_summary()

    entries = [entry for entry in outputs_index.get("entries", []) if entry.get("type") == "cron_archive"]
    entries.sort(key=lambda item: str(item.get("archived_at", "")), reverse=True)

    jobs = cron_registry.get("jobs", [])
    owners = sorted({str(item.get("owner", "")) for item in jobs if item.get("owner")})
    lifecycle_tasks = [
        {
            "key": "bootstrap_registry",
            "stage": "Bootstrap",
            "title": "实例注册表与共享目录",
            "status": "healthy" if (_shared_root() / "registry" / "instances.json").exists() else "missing",
            "detail": "检查 shared-library 实例注册表是否可读。",
        },
        {
            "key": "bootstrap_storage",
            "stage": "Bootstrap",
            "title": "对象存储连接",
            "status": "healthy" if probe.get("reachable") else "degraded",
            "detail": f"当前探测状态：{probe.get('status', 'unknown')}。",
        },
        {
            "key": "operate_wiki_compile",
            "stage": "Operate",
            "title": "Wiki 编译链路",
            "status": "healthy" if _count_matching_files(_shared_root() / 'wiki' / 'compiled', '*.md') > 0 else "pending",
            "detail": "检查 compiled 目录是否已有可见产物。",
        },
        {
            "key": "archive_index",
            "stage": "Archive",
            "title": "归档索引维护",
            "status": "healthy" if _outputs_index_path().exists() and bool(entries) else "pending",
            "detail": f"当前索引中已有 {len(entries)} 条归档记录。",
        },
        {
            "key": "archive_storage_retention",
            "stage": "Archive",
            "title": "对象存储生命周期",
            "status": "healthy" if bool(minio_policy.get("retention_days")) else "pending",
            "detail": f"保留策略天数：{minio_policy.get('retention_days') or '-'}。",
        },
        {
            "key": "evolve_sync_schedule",
            "stage": "Evolve",
            "title": "实例同步与演进任务",
            "status": "healthy" if bool(sync_schedule) else "pending",
            "detail": "检查 sync-schedule.json 是否已配置实例同步节奏。",
        },
    ]

    return {
        "cron": {
            "registry_present": (_shared_root() / "registry" / "cron-registry.json").exists(),
            "jobs_total": len(jobs),
            "active_jobs": sum(1 for item in jobs if str(item.get("status", "")).lower() == "active"),
            "owners": owners,
        },
        "archives": {
            "entries_count": len(entries),
            "index_present": _outputs_index_path().exists(),
            "recent_entries": entries[: max(1, limit)],
        },
        "storage": {
            "policy_present": (_shared_root() / "config" / "storage-policy.json").exists(),
            "endpoint": endpoint,
            "bucket": bucket,
            "credentials_present": bool(config.settings.storage_access_key and config.settings.storage_secret_key),
            "namespace_pattern": minio_policy.get("namespace_pattern"),
            "retention_days": minio_policy.get("retention_days"),
            "git_max_bytes": storage_policy.get("policies", {}).get("size_threshold", {}).get("git_max_bytes"),
            "probe": probe,
        },
        "isolation": isolation,
        "lifecycle_tasks": lifecycle_tasks,
    }
