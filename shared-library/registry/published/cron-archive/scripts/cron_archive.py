#!/usr/bin/env python3
"""Cron Archive - 定时任务产出归档到共享库"""

import os
import json
import hashlib
from pathlib import Path
from datetime import datetime

DDUP_PATH = Path(os.environ.get("DDUP_PATH", "/opt/ddup"))
INSTANCE_ID = os.environ.get("HERMES_INSTANCE_ID", "unknown")
OUTPUTS_DIR = DDUP_PATH / "shared-library" / "outputs"
INDEX_PATH = OUTPUTS_DIR / ".index.json"

MINIO_ENDPOINT = os.environ.get("MINIO_ENDPOINT", "192.168.102.204:9000")
MINIO_BUCKET = os.environ.get("MINIO_BUCKET", "ddup-shared-library")
MINIO_ACCESS_KEY = os.environ.get("MINIO_ACCESS_KEY", "")
MINIO_SECRET_KEY = os.environ.get("MINIO_SECRET_KEY", "")

GIT_MAX_SIZE = 1_048_576  # 1MB


def _ensure_dir(path: Path) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    return path


def _upload_to_minio(local_path: Path, storage_key: str) -> dict:
    """上传文件到 MinIO"""
    try:
        from minio import Minio
        client = Minio(
            MINIO_ENDPOINT.replace("http://", "").replace("https://", ""),
            access_key=MINIO_ACCESS_KEY,
            secret_key=MINIO_SECRET_KEY,
            secure=False
        )
        if not client.bucket_exists(MINIO_BUCKET):
            client.make_bucket(MINIO_BUCKET)
        client.fput_object(
            MINIO_BUCKET, storage_key, str(local_path),
            metadata={
                "instance-id": INSTANCE_ID,
                "original-name": local_path.name,
                "uploaded-at": datetime.now().isoformat()
            }
        )
        return {
            "filename": local_path.name,
            "storage_ref": f"s3://{MINIO_BUCKET}/{storage_key}",
            "size_bytes": local_path.stat().st_size,
            "status": "success"
        }
    except Exception as e:
        return {
            "filename": local_path.name,
            "storage_ref": f"local://{local_path}",
            "size_bytes": local_path.stat().st_size,
            "status": "error",
            "error": str(e)
        }


def save(job_id: str, content: str, metadata: dict = None, attachments: list = None) -> dict:
    """归档 Cron 产出

    Args:
        job_id: 任务标识
        content: 归档内容（字符串，可以是 JSON 或 Markdown）
        metadata: 额外元数据字典
        attachments: 附件路径列表

    Returns:
        {"status": "archived", "id": str, "path": str}
    """
    metadata = metadata or {}
    attachments = attachments or []
    now = datetime.now()
    date_str = now.strftime("%Y-%m-%d")

    # 1. 创建归档目录
    archive_dir = _ensure_dir(OUTPUTS_DIR / INSTANCE_ID / "cron-archives" / job_id)

    # 2. 构建条目
    entry_id = f"{job_id}-{now.strftime('%Y%m%d-%H%M%S')}"
    entry = {
        "id": entry_id,
        "job_id": job_id,
        "instance_id": INSTANCE_ID,
        "content": content,
        "metadata": metadata,
        "archived_at": now.isoformat(),
        "attachments": []
    }

    # 3. 处理附件
    for att in attachments:
        att_path = Path(att)
        if not att_path.exists():
            entry["attachments"].append({
                "filename": att_path.name,
                "status": "error",
                "error": "文件不存在"
            })
            continue

        file_size = att_path.stat().st_size
        file_hash = hashlib.sha256(att_path.read_bytes()).hexdigest()[:12]
        ext = att_path.suffix

        if file_size > GIT_MAX_SIZE:
            # 大文件上传 MinIO
            storage_key = f"{INSTANCE_ID}/cron-archives/{job_id}/{date_str}/{file_hash}{ext}"
            result = _upload_to_minio(att_path, storage_key)
            entry["attachments"].append(result)
        else:
            # 小文件记录相对路径
            entry["attachments"].append({
                "filename": att_path.name,
                "storage_ref": f"git://{att_path.relative_to(DDUP_PATH) if att_path.is_relative_to(DDUP_PATH) else str(att_path)}",
                "size_bytes": file_size,
                "status": "local"
            })

    # 4. 写入归档文件（按天分文件，同一天追加）
    archive_file = archive_dir / f"{date_str}.json"
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
    summary = content[:200] if isinstance(content, str) else json.dumps(content, ensure_ascii=False)[:200]
    index["entries"].append({
        "id": entry_id,
        "instance_id": INSTANCE_ID,
        "type": "cron_archive",
        "job_id": job_id,
        "title": f"{job_id} ({date_str})",
        "summary": summary,
        "archived_at": now.isoformat(),
        "file_path": str(archive_file.relative_to(DDUP_PATH))
    })
    INDEX_PATH.write_text(json.dumps(index, ensure_ascii=False, indent=2), encoding="utf-8")

    return {
        "status": "archived",
        "id": entry_id,
        "path": str(archive_file.relative_to(DDUP_PATH)),
        "attachments_count": len(entry["attachments"])
    }


def query(job_id: str = None, instance_id: str = None, date_from: str = None, date_to: str = None, limit: int = 20) -> dict:
    """查询 Cron 归档"""
    if not INDEX_PATH.exists():
        return {"results": [], "total": 0}

    index = json.loads(INDEX_PATH.read_text(encoding="utf-8"))
    results = []

    for entry in index.get("entries", []):
        if entry.get("type") != "cron_archive":
            continue
        if job_id and entry.get("job_id") != job_id:
            continue
        if instance_id and entry.get("instance_id") != instance_id:
            continue
        if date_from and entry.get("archived_at", "") < date_from:
            continue
        if date_to and entry.get("archived_at", "") > date_to:
            continue
        results.append(entry)

    results.sort(key=lambda x: x.get("archived_at", ""), reverse=True)
    return {"results": results[:limit], "total": len(results)}


def _cli():
    import argparse
    parser = argparse.ArgumentParser(description="Cron Archive")
    sub = parser.add_subparsers(dest="cmd")

    save_p = sub.add_parser("save", help="归档产出")
    save_p.add_argument("--job-id", required=True)
    save_p.add_argument("--content", required=True)
    save_p.add_argument("--metadata", default="{}")
    save_p.add_argument("--attachments", default="")

    query_p = sub.add_parser("query", help="查询归档")
    query_p.add_argument("--job-id", default="")
    query_p.add_argument("--instance-id", default="")
    query_p.add_argument("--date-from", default="")
    query_p.add_argument("--date-to", default="")
    query_p.add_argument("--limit", type=int, default=20)

    args = parser.parse_args()

    if args.cmd == "save":
        meta = json.loads(args.metadata)
        atts = [a.strip() for a in args.attachments.split(",") if a.strip()]
        result = save(args.job_id, args.content, meta, atts)
    elif args.cmd == "query":
        result = query(args.job_id, args.instance_id, args.date_from, args.date_to, args.limit)
    else:
        parser.print_help()
        return

    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    _cli()
