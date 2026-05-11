#!/usr/bin/env python3
"""Storage Client - MinIO 对象存储操作"""

import os
import hashlib
from pathlib import Path
from datetime import datetime, timedelta

MINIO_ENDPOINT = os.environ.get("MINIO_ENDPOINT", "192.168.102.204:9000")
MINIO_BUCKET = os.environ.get("MINIO_BUCKET", "ddup-shared-library")
MINIO_ACCESS_KEY = os.environ.get("MINIO_ACCESS_KEY", "")
MINIO_SECRET_KEY = os.environ.get("MINIO_SECRET_KEY", "")
INSTANCE_ID = os.environ.get("HERMES_INSTANCE_ID", "unknown")


def _get_client():
    from minio import Minio
    host = MINIO_ENDPOINT.replace("http://", "").replace("https://", "")
    secure = MINIO_ENDPOINT.startswith("https")
    return Minio(host, access_key=MINIO_ACCESS_KEY, secret_key=MINIO_SECRET_KEY, secure=secure)


def upload(file_path: str, category: str = "assets", tags: dict = None) -> dict:
    """上传文件到 MinIO

    Args:
        file_path: 本地文件路径
        category: 存储分类
        tags: 附加标签元数据

    Returns:
        {"status": "success|error", "key": str, "url": str, "size_bytes": int}
    """
    tags = tags or {}
    local_path = Path(file_path)

    if not local_path.exists():
        return {"status": "error", "message": f"文件不存在: {file_path}"}

    file_hash = hashlib.sha256(local_path.read_bytes()).hexdigest()[:12]
    now = datetime.now()
    storage_key = f"{INSTANCE_ID}/{category}/{now.strftime('%Y-%m')}/{file_hash}{local_path.suffix}"

    try:
        client = _get_client()
        if not client.bucket_exists(MINIO_BUCKET):
            client.make_bucket(MINIO_BUCKET)

        client.fput_object(
            MINIO_BUCKET,
            storage_key,
            str(local_path),
            metadata={
                "instance-id": INSTANCE_ID,
                "original-name": local_path.name,
                "category": category,
                "uploaded-at": now.isoformat(),
                **{k: str(v) for k, v in tags.items()}
            }
        )

        return {
            "status": "success",
            "key": storage_key,
            "url": f"http://{MINIO_ENDPOINT}/{MINIO_BUCKET}/{storage_key}",
            "size_bytes": local_path.stat().st_size
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}


def download(key: str, dest: str = "/tmp") -> dict:
    """从 MinIO 下载文件"""
    try:
        client = _get_client()
        dest_path = Path(dest) / Path(key).name
        client.fget_object(MINIO_BUCKET, key, str(dest_path))
        return {"status": "success", "local_path": str(dest_path)}
    except Exception as e:
        return {"status": "error", "message": str(e)}


def list_objects(prefix: str = "", limit: int = 20) -> dict:
    """列出对象"""
    try:
        client = _get_client()
        objects = []
        for obj in client.list_objects(MINIO_BUCKET, prefix=prefix):
            objects.append({
                "key": obj.object_name,
                "size": obj.size,
                "last_modified": obj.last_modified.isoformat() if obj.last_modified else None
            })
            if len(objects) >= limit:
                break
        return {"status": "success", "objects": objects, "total": len(objects)}
    except Exception as e:
        return {"status": "error", "message": str(e)}


def presign(key: str, expires_days: int = 7) -> dict:
    """生成预签名 URL"""
    try:
        client = _get_client()
        url = client.presigned_get_object(MINIO_BUCKET, key, expires=timedelta(days=expires_days))
        return {"status": "success", "url": url, "expires_in": f"{expires_days} days"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


def delete(key: str) -> dict:
    """删除对象（仅限本实例命名空间）"""
    if not key.startswith(f"{INSTANCE_ID}/") and not key.startswith("shared/"):
        return {"status": "error", "message": "只能删除本实例或 shared 命名空间下的对象"}
    try:
        client = _get_client()
        client.remove_object(MINIO_BUCKET, key)
        return {"status": "success", "deleted": key}
    except Exception as e:
        return {"status": "error", "message": str(e)}


def _cli():
    import argparse
    import json
    parser = argparse.ArgumentParser(description="Storage Client (MinIO)")
    sub = parser.add_subparsers(dest="cmd")

    up = sub.add_parser("upload", help="上传文件")
    up.add_argument("--file", required=True)
    up.add_argument("--category", default="assets")
    up.add_argument("--tags", default="{}")

    dl = sub.add_parser("download", help="下载文件")
    dl.add_argument("--key", required=True)
    dl.add_argument("--dest", default="/tmp")

    ls = sub.add_parser("list", help="列出对象")
    ls.add_argument("--prefix", default="")
    ls.add_argument("--limit", type=int, default=20)

    ps = sub.add_parser("presign", help="生成临时链接")
    ps.add_argument("--key", required=True)
    ps.add_argument("--expires-days", type=int, default=7)

    rm = sub.add_parser("delete", help="删除对象")
    rm.add_argument("--key", required=True)

    args = parser.parse_args()

    if args.cmd == "upload":
        result = upload(args.file, args.category, json.loads(args.tags))
    elif args.cmd == "download":
        result = download(args.key, args.dest)
    elif args.cmd == "list":
        result = list_objects(args.prefix, args.limit)
    elif args.cmd == "presign":
        result = presign(args.key, args.expires_days)
    elif args.cmd == "delete":
        result = delete(args.key)
    else:
        parser.print_help()
        return

    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    _cli()
