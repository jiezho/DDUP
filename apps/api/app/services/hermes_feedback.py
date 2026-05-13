from __future__ import annotations

import json
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.audit import AuditLog
from app.core import config
from app.services.hermes_archive import get_runtime_status
from app.services.hermes_registry import get_blueprint, get_overview


def _repo_root() -> Path:
    configured = (config.settings.ddup_path or "").strip()
    if configured:
        return Path(configured).expanduser().resolve()
    return Path(__file__).resolve().parents[4]


def _shared_root() -> Path:
    return _repo_root() / "shared-library"


def _safe_read_json(path: Path, default: Any) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def _cron_registry_jobs() -> list[dict[str, Any]]:
    payload = _safe_read_json(_shared_root() / "registry" / "cron-registry.json", {"jobs": []})
    jobs = payload.get("jobs", [])
    return jobs if isinstance(jobs, list) else []


def _outputs_entries() -> list[dict[str, Any]]:
    payload = _safe_read_json(_shared_root() / "outputs" / ".index.json", {"entries": []})
    entries = payload.get("entries", [])
    return entries if isinstance(entries, list) else []


def _parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        normalized = value.replace("Z", "+00:00")
        dt = datetime.fromisoformat(normalized)
        if dt.tzinfo is None:
            return dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except Exception:
        return None


def _entry_execution_status(entry: dict[str, Any]) -> str:
    return str(entry.get("execution_status", "success") or "success").strip().lower()


def _entry_duration(entry: dict[str, Any]) -> int | None:
    value = entry.get("duration_ms")
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return int(value)
    return None


def _derive_job_status(configured_status: str, last_archived_at: str | None, last_execution_status: str | None) -> str:
    normalized = (configured_status or "").strip().lower()
    if normalized not in {"active", "ready", "running"}:
        return "paused"
    if (last_execution_status or "").strip().lower() in {"failed", "error"}:
        return "failing"
    last_dt = _parse_iso(last_archived_at)
    if not last_dt:
        return "pending_archive"
    if last_dt < datetime.now(tz=timezone.utc) - timedelta(days=7):
        return "stale"
    return "healthy"


def _operational_jobs() -> list[dict[str, Any]]:
    entries_by_job: dict[str, list[dict[str, Any]]] = {}
    for entry in _outputs_entries():
        job_id = str(entry.get("job_id", "") or "")
        if not job_id:
            continue
        entries_by_job.setdefault(job_id, []).append(entry)

    jobs: list[dict[str, Any]] = []
    for job in _cron_registry_jobs():
        job_id = str(job.get("id", "") or "")
        related_entries = entries_by_job.get(job_id, [])
        related_entries.sort(key=lambda item: str(item.get("archived_at", "")), reverse=True)
        latest = related_entries[0] if related_entries else None
        configured_status = str(job.get("status", "unknown") or "unknown")
        success_entries = [entry for entry in related_entries if _entry_execution_status(entry) == "success"]
        failure_entries = [entry for entry in related_entries if _entry_execution_status(entry) in {"failed", "error"}]
        last_success = success_entries[0] if success_entries else None
        last_failure = failure_entries[0] if failure_entries else None
        last_execution_status = _entry_execution_status(latest) if latest else None
        jobs.append(
            {
                "job_id": job_id,
                "owner": str(job.get("owner", "") or "-"),
                "schedule": str(job.get("schedule", "") or "-"),
                "configured_status": configured_status,
                "derived_status": _derive_job_status(
                    configured_status,
                    latest.get("archived_at") if latest else None,
                    last_execution_status,
                ),
                "last_execution_status": last_execution_status,
                "archive_count": len(related_entries),
                "success_count": len(success_entries),
                "failure_count": len(failure_entries),
                "last_archived_at": latest.get("archived_at") if latest else None,
                "last_success_at": last_success.get("archived_at") if last_success else None,
                "last_failure_at": last_failure.get("archived_at") if last_failure else None,
                "last_duration_ms": _entry_duration(latest) if latest else None,
                "latest_title": latest.get("title") if latest else None,
            }
        )
    jobs.sort(
        key=lambda item: (
            item["derived_status"] != "failing",
            item["derived_status"] != "stale",
            item["derived_status"] != "pending_archive",
            item["job_id"],
        )
    )
    return jobs


def _task_status(title: str) -> str:
    normalized = title.strip().lower()
    if normalized == "wrap scripts with formal apis":
        return "in_progress"
    if normalized == "ship a unified hermes console":
        return "in_progress"
    if normalized == "operationalize archive and wiki jobs":
        operational_jobs = _operational_jobs()
        if not operational_jobs:
            return "open"
        if any(item["derived_status"] in {"pending_archive", "stale"} for item in operational_jobs):
            return "in_progress"
        return "done"
    return "open"


def _build_feedback_items(overview: dict[str, Any], runtime: dict[str, Any], recent_actions: list[AuditLog]) -> list[dict[str, str]]:
    items: list[dict[str, str]] = []
    coverage = overview.get("coverage", {})
    storage = runtime.get("storage", {})

    if not coverage.get("registry_present"):
        items.append(
            {
                "key": "registry_missing",
                "level": "error",
                "title": "实例注册表缺失",
                "description": "shared-library/registry/instances.json 不可用，管理台将无法准确展示实例基线。",
            }
        )

    if not coverage.get("outputs_index_present"):
        items.append(
            {
                "key": "outputs_index_missing",
                "level": "warning",
                "title": "产出索引缺失",
                "description": "outputs/.index.json 不存在时，归档写入和跨实例查询可见性会下降。",
            }
        )

    if not storage.get("policy_present"):
        items.append(
            {
                "key": "storage_policy_missing",
                "level": "warning",
                "title": "对象存储策略未就绪",
                "description": "storage-policy.json 缺失，后续上传、生命周期与命名空间规则无法稳定扩展。",
            }
        )
    elif not storage.get("credentials_present"):
        items.append(
            {
                "key": "storage_credentials_missing",
                "level": "warning",
                "title": "对象存储凭证未配置",
                "description": "当前可浏览策略但无法稳定访问对象存储，请补齐 endpoint、bucket 与密钥。",
            }
        )

    probe_status = str(storage.get("probe", {}).get("status", "") or "").lower()
    if probe_status and probe_status not in {"ok", "success", "reachable"}:
        items.append(
            {
                "key": "storage_probe_degraded",
                "level": "warning",
                "title": "对象存储探测异常",
                "description": f"当前探测状态为 {storage.get('probe', {}).get('status')}, 建议检查网络、TLS 与桶权限。",
            }
        )

    if (overview.get("runtime", {}) or {}).get("wiki_compiled_files_count", 0) == 0:
        items.append(
            {
                "key": "wiki_compile_pending",
                "level": "info",
                "title": "Wiki 编译链仍待产品化",
                "description": "当前已有 raw 写入入口，但编译作业与可见运行状态仍需补齐。",
            }
        )

    operational_jobs = _operational_jobs()
    failing_jobs = [item for item in operational_jobs if item.get("derived_status") == "failing"]
    if failing_jobs:
        items.append(
            {
                "key": "cron_jobs_failing",
                "level": "warning",
                "title": "存在失败作业",
                "description": f"当前有 {len(failing_jobs)} 个作业最近一次执行为失败状态，建议优先排查对应归档产物或调度配置。",
            }
        )

    if not recent_actions:
        items.append(
            {
                "key": "no_recent_actions",
                "level": "info",
                "title": "近期无 Hermes 审计动作",
                "description": "建议通过管理台执行实例注册、记忆写入或归档动作，验证审计链路是否正常记录。",
            }
        )

    if not items:
        items.append(
            {
                "key": "feedback_clear",
                "level": "success",
                "title": "当前未发现新增阻塞",
                "description": "核心治理接口、运行态摘要与对象存储入口均已接入，可继续推进任务状态面板。",
            }
        )
    return items


def get_feedback_summary(
    db: Session,
    *,
    space_id: uuid.UUID,
    user_id: str,
    action_limit: int = 8,
) -> dict[str, Any]:
    blueprint = get_blueprint()
    overview = get_overview()
    runtime = get_runtime_status(limit=5)
    operational_jobs = _operational_jobs()

    stmt = (
        select(AuditLog)
        .where(
            AuditLog.space_id == space_id,
            AuditLog.user_id == user_id,
            AuditLog.action.like("hermes.%"),
        )
        .order_by(AuditLog.created_at.desc())
        .limit(max(1, min(action_limit, 20)))
    )
    recent_logs = list(db.scalars(stmt).all())

    pending = []
    for item in blueprint.get("pending_tasks", []):
        pending.append(
            {
                "priority": str(item.get("priority", "P2")),
                "title": str(item.get("title", "")),
                "description": str(item.get("description", "")),
                "status": _task_status(str(item.get("title", ""))),
            }
        )

    recent_actions = [
        {
            "action": log.action,
            "resource_type": log.resource_type,
            "resource_id": log.resource_id,
            "created_at": log.created_at.isoformat(),
        }
        for log in recent_logs
    ]

    feedback = _build_feedback_items(overview, runtime, recent_logs)
    open_tasks = sum(1 for item in pending if item["status"] == "open")
    in_progress_tasks = sum(1 for item in pending if item["status"] == "in_progress")
    stale_jobs = sum(1 for item in operational_jobs if item["derived_status"] == "stale")

    return {
        "focus": overview.get("current_focus", []),
        "pending": pending,
        "feedback": feedback,
        "recent_actions": recent_actions,
        "operational_jobs": operational_jobs,
        "metrics": {
            "open_tasks": open_tasks,
            "in_progress_tasks": in_progress_tasks,
            "recent_actions": len(recent_actions),
            "active_instances": int(overview.get("active_instances_count", 0)),
            "operational_jobs": len(operational_jobs),
            "stale_jobs": stale_jobs,
        },
    }
