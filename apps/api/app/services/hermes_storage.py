from __future__ import annotations

import hashlib
import json
import re
from datetime import timedelta
from typing import Any
from pathlib import Path

from app.core import config


def _storage_settings() -> dict[str, Any]:
    secure = bool(config.settings.storage_secure)
    endpoint = (config.settings.storage_endpoint or "").strip()
    bucket = (config.settings.storage_bucket or "").strip()
    access_key = (config.settings.storage_access_key or "").strip()
    secret_key = (config.settings.storage_secret_key or "").strip()
    return {
        "endpoint": endpoint,
        "bucket": bucket,
        "access_key": access_key,
        "secret_key": secret_key,
        "secure": secure or endpoint.startswith("https://"),
    }


def _normalized_endpoint(endpoint: str) -> str:
    return endpoint.replace("http://", "").replace("https://", "")


def _get_client():
    from minio import Minio

    settings = _storage_settings()
    if not settings["endpoint"] or not settings["bucket"]:
        raise ValueError("storage endpoint/bucket not configured")
    if not settings["access_key"] or not settings["secret_key"]:
        raise ValueError("storage credentials not configured")
    return Minio(
        _normalized_endpoint(settings["endpoint"]),
        access_key=settings["access_key"],
        secret_key=settings["secret_key"],
        secure=settings["secure"],
    )


def _normalize_prefix(instance_id: str | None, prefix: str | None) -> str:
    cleaned_prefix = (prefix or "").strip().lstrip("/")
    cleaned_instance = (instance_id or "").strip()
    if cleaned_prefix:
        return cleaned_prefix
    if cleaned_instance:
        return f"{cleaned_instance}/"
    return ""


def _safe_category(value: str | None) -> str:
    raw = (value or "").strip().lower() or "assets"
    cleaned = re.sub(r"[^a-z0-9._-]+", "-", raw).strip("-")
    return cleaned or "assets"


def _suffix_from_name(filename: str | None) -> str:
    if not filename:
        return ""
    suffix = Path(filename).suffix
    return suffix[:20]


def _derived_filename(key: str) -> str:
    name = Path(key).name
    return name or "download.bin"


def _normalize_tags(tags: str | None) -> dict[str, str]:
    if not tags:
        return {}
    try:
        payload = json.loads(tags)
        if not isinstance(payload, dict):
            return {}
        return {str(key): str(value) for key, value in payload.items()}
    except Exception:
        return {}


def upload_storage_object(
    *,
    filename: str,
    content: bytes,
    instance_id: str | None = None,
    category: str | None = None,
    tags: str | None = None,
    content_type: str | None = None,
) -> dict[str, Any]:
    if not filename.strip():
        raise ValueError("filename is required")
    if not content:
        raise ValueError("file content is required")

    namespace = (instance_id or "").strip() or "shared"
    safe_category = _safe_category(category)
    content_hash = hashlib.sha256(content).hexdigest()[:12]
    suffix = _suffix_from_name(filename)
    key = f"{namespace}/{safe_category}/{content_hash}{suffix}"
    metadata = {
        "instance-id": namespace,
        "original-name": filename,
        "category": safe_category,
        **_normalize_tags(tags),
    }
    try:
        client = _get_client()
        settings = _storage_settings()
        if hasattr(client, "bucket_exists") and not client.bucket_exists(settings["bucket"]):
            client.make_bucket(settings["bucket"])
        client.put_object(
            settings["bucket"],
            key,
            data=content,
            length=len(content),
            content_type=content_type or "application/octet-stream",
            metadata=metadata,
        )
        endpoint = settings["endpoint"].rstrip("/")
        return {
            "status": "success",
            "key": key,
            "url": f"{endpoint}/{settings['bucket']}/{key}" if endpoint else None,
            "size_bytes": len(content),
            "original_name": filename,
            "message": None,
        }
    except Exception as exc:
        return {
            "status": "error",
            "key": key,
            "url": None,
            "size_bytes": 0,
            "original_name": filename,
            "message": str(exc),
        }


def upload_storage_object_with_key(
    *,
    key: str,
    content: bytes,
    filename: str | None = None,
    content_type: str | None = None,
    metadata: dict[str, str] | None = None,
) -> dict[str, Any]:
    normalized_key = (key or "").strip().lstrip("/")
    if not normalized_key:
        raise ValueError("key is required")
    if not content:
        raise ValueError("file content is required")
    try:
        client = _get_client()
        settings = _storage_settings()
        if hasattr(client, "bucket_exists") and not client.bucket_exists(settings["bucket"]):
            client.make_bucket(settings["bucket"])
        client.put_object(
            settings["bucket"],
            normalized_key,
            data=content,
            length=len(content),
            content_type=content_type or "application/octet-stream",
            metadata=metadata or {},
        )
        endpoint = settings["endpoint"].rstrip("/")
        return {
            "status": "success",
            "bucket": settings["bucket"],
            "key": normalized_key,
            "url": f"{endpoint}/{settings['bucket']}/{normalized_key}" if endpoint else None,
            "size_bytes": len(content),
            "original_name": filename,
            "message": None,
        }
    except Exception as exc:
        return {
            "status": "error",
            "bucket": None,
            "key": normalized_key,
            "url": None,
            "size_bytes": 0,
            "original_name": filename,
            "message": str(exc),
        }


def list_storage_objects(instance_id: str | None = None, prefix: str | None = None, limit: int = 20) -> dict[str, Any]:
    effective_prefix = _normalize_prefix(instance_id, prefix)
    try:
        client = _get_client()
        settings = _storage_settings()
        objects: list[dict[str, Any]] = []
        for obj in client.list_objects(settings["bucket"], prefix=effective_prefix):
            objects.append(
                {
                    "key": obj.object_name,
                    "size": obj.size,
                    "last_modified": obj.last_modified.isoformat() if obj.last_modified else None,
                }
            )
            if len(objects) >= limit:
                break
        return {
            "status": "success",
            "total": len(objects),
            "objects": objects,
            "prefix": effective_prefix,
            "message": None,
        }
    except Exception as exc:
        return {
            "status": "error",
            "total": 0,
            "objects": [],
            "prefix": effective_prefix,
            "message": str(exc),
        }


def presign_storage_object(key: str, expires_days: int = 7) -> dict[str, Any]:
    normalized_key = (key or "").strip().lstrip("/")
    if not normalized_key:
        raise ValueError("key is required")
    try:
        client = _get_client()
        settings = _storage_settings()
        url = client.presigned_get_object(
            settings["bucket"],
            normalized_key,
            expires=timedelta(days=max(1, min(expires_days, 30))),
        )
        return {
            "status": "success",
            "url": url,
            "expires_in": f"{max(1, min(expires_days, 30))} days",
            "key": normalized_key,
            "message": None,
        }
    except Exception as exc:
        return {
            "status": "error",
            "url": None,
            "expires_in": None,
            "key": normalized_key,
            "message": str(exc),
        }


def delete_storage_object(key: str, instance_id: str | None = None) -> dict[str, Any]:
    normalized_key = (key or "").strip().lstrip("/")
    if not normalized_key:
        raise ValueError("key is required")
    namespace = (instance_id or "").strip()
    if namespace and not (
        normalized_key.startswith(f"{namespace}/") or normalized_key.startswith("shared/")
    ):
        raise ValueError("key is outside the allowed namespace")
    try:
        client = _get_client()
        settings = _storage_settings()
        client.remove_object(settings["bucket"], normalized_key)
        return {
            "status": "success",
            "deleted": normalized_key,
            "message": None,
        }
    except Exception as exc:
        return {
            "status": "error",
            "deleted": None,
            "message": str(exc),
        }


def download_storage_object(key: str, instance_id: str | None = None) -> dict[str, Any]:
    normalized_key = (key or "").strip().lstrip("/")
    if not normalized_key:
        raise ValueError("key is required")
    namespace = (instance_id or "").strip()
    if namespace and not (
        normalized_key.startswith(f"{namespace}/") or normalized_key.startswith("shared/")
    ):
        raise ValueError("key is outside the allowed namespace")
    response = None
    try:
        client = _get_client()
        settings = _storage_settings()
        response = client.get_object(settings["bucket"], normalized_key)
        payload = response.read()
        headers = getattr(response, "headers", {}) or {}
        media_type = headers.get("Content-Type") or headers.get("content-type") or "application/octet-stream"
        filename = _derived_filename(normalized_key)
        return {
            "status": "success",
            "key": normalized_key,
            "filename": filename,
            "media_type": media_type,
            "content": payload,
            "size_bytes": len(payload),
            "message": None,
        }
    except Exception as exc:
        return {
            "status": "error",
            "key": normalized_key,
            "filename": _derived_filename(normalized_key),
            "media_type": "application/octet-stream",
            "content": b"",
            "size_bytes": 0,
            "message": str(exc),
        }
    finally:
        if response is not None:
            close = getattr(response, "close", None)
            if callable(close):
                close()
            release_conn = getattr(response, "release_conn", None)
            if callable(release_conn):
                release_conn()
