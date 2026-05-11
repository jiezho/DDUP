#!/usr/bin/env python3
"""
Memory Extension Client for DDUP Shared Library
Supports: status, save, query, migrate, sync
"""

import argparse
import json
import os
import sys
from datetime import datetime

# Environment
DDUP_PATH = os.path.expanduser(os.getenv("DDUP_PATH", "~/DDUP"))
INSTANCE_ID = os.getenv("HERMES_INSTANCE_ID", "hermes-unknown")
MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "")
MINIO_BUCKET = os.getenv("MINIO_BUCKET", "ddup-shared-library")
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", "")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY", "")

# Local paths
MEMORY_EXT_DIR = os.path.join(DDUP_PATH, "shared-library", "memory-ext", INSTANCE_ID)
SHARED_INDEX_PATH = os.path.join(DDUP_PATH, "shared-library", "memory-ext", "shared-index.json")


def ensure_dirs():
    os.makedirs(MEMORY_EXT_DIR, exist_ok=True)


def get_minio_client():
    try:
        from minio import Minio
        client = Minio(
            MINIO_ENDPOINT,
            access_key=MINIO_ACCESS_KEY,
            secret_key=MINIO_SECRET_KEY,
            secure=False
        )
        return client
    except ImportError:
        print("ERROR: minio package not installed. Run: pip install minio")
        sys.exit(1)
    except Exception as e:
        print(f"ERROR: MinIO connection failed: {e}")
        sys.exit(1)


def cmd_status(args):
    print(f"=== Memory Extension Client Status ===")
    print(f"  Instance ID: {INSTANCE_ID}")
    print(f"  DDUP Path:   {DDUP_PATH}")
    print(f"  MinIO:       {MINIO_ENDPOINT}/{MINIO_BUCKET}")
    print()

    # Check DDUP repo
    if os.path.isdir(DDUP_PATH):
        print(f"  [OK] DDUP repo exists at {DDUP_PATH}")
    else:
        print(f"  [FAIL] DDUP repo not found at {DDUP_PATH}")

    # Check local memory files
    ensure_dirs()
    mem_files = [f for f in os.listdir(MEMORY_EXT_DIR) if f.endswith(".json")]
    print(f"  [OK] Local memory files: {len(mem_files)}")

    # Check MinIO
    try:
        client = get_minio_client()
        if client.bucket_exists(MINIO_BUCKET):
            objects = list(client.list_objects(MINIO_BUCKET, prefix=INSTANCE_ID + "/"))
            print(f"  [OK] MinIO bucket exists, {len(objects)} objects for {INSTANCE_ID}")
        else:
            print(f"  [WARN] MinIO bucket '{MINIO_BUCKET}' does not exist, will create on first write")
    except Exception as e:
        print(f"  [FAIL] MinIO connection error: {e}")

    # Check shared index
    if os.path.exists(SHARED_INDEX_PATH):
        with open(SHARED_INDEX_PATH) as f:
            idx = json.load(f)
        print(f"  [OK] Shared index: {len(idx)} entries")
    else:
        print(f"  [INFO] No shared index yet")

    print()
    print("Status: READY")


def cmd_save(args):
    ensure_dirs()
    timestamp = datetime.now().isoformat()
    entry = {
        "instance_id": INSTANCE_ID,
        "scope": args.scope,
        "key": args.key,
        "content": args.content,
        "timestamp": timestamp
    }

    if args.scope == "self":
        # Save to instance-specific directory
        filename = args.key.replace("/", "_").replace(" ", "_") + ".json"
        filepath = os.path.join(MEMORY_EXT_DIR, filename)
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(entry, f, ensure_ascii=False, indent=2)
        print(f"[self] Saved to {filepath}")

        # Also upload to MinIO
        try:
            client = get_minio_client()
            if not client.bucket_exists(MINIO_BUCKET):
                client.make_bucket(MINIO_BUCKET)
            minio_key = f"{INSTANCE_ID}/{filename}"
            client.fput_object(MINIO_BUCKET, minio_key, filepath)
            print(f"[self] Uploaded to MinIO: {minio_key}")
        except Exception as e:
            print(f"[self] MinIO upload skipped: {e}")

    elif args.scope == "shared":
        # Save to shared index
        if os.path.exists(SHARED_INDEX_PATH):
            with open(SHARED_INDEX_PATH) as f:
                idx = json.load(f)
        else:
            idx = []
        idx.append(entry)
        os.makedirs(os.path.dirname(SHARED_INDEX_PATH), exist_ok=True)
        with open(SHARED_INDEX_PATH, "w", encoding="utf-8") as f:
            json.dump(idx, f, ensure_ascii=False, indent=2)
        print(f"[shared] Saved to {SHARED_INDEX_PATH}")

        # Also upload to MinIO
        try:
            client = get_minio_client()
            if not client.bucket_exists(MINIO_BUCKET):
                client.make_bucket(MINIO_BUCKET)
            client.fput_object(MINIO_BUCKET, "shared-index.json", SHARED_INDEX_PATH)
            print(f"[shared] Uploaded to MinIO: shared-index.json")
        except Exception as e:
            print(f"[shared] MinIO upload skipped: {e}")


def cmd_query(args):
    results = []

    if args.scope in ("self", "all"):
        ensure_dirs()
        for fname in os.listdir(MEMORY_EXT_DIR):
            if fname.endswith(".json"):
                fpath = os.path.join(MEMORY_EXT_DIR, fname)
                with open(fpath, encoding="utf-8") as f:
                    entry = json.load(f)
                if args.keyword.lower() in entry.get("key", "").lower() or \
                   args.keyword.lower() in entry.get("content", "").lower():
                    results.append(entry)

    if args.scope in ("shared", "all"):
        if os.path.exists(SHARED_INDEX_PATH):
            with open(SHARED_INDEX_PATH, encoding="utf-8") as f:
                idx = json.load(f)
            for entry in idx:
                if args.keyword.lower() in entry.get("key", "").lower() or \
                   args.keyword.lower() in entry.get("content", "").lower():
                    results.append(entry)

    if results:
        for r in results:
            scope_tag = f"[{r.get('scope','?')}]"
            print(f"  {scope_tag} {r.get('key','?')}: {r.get('content','')[:100]}")
            print(f"    timestamp: {r.get('timestamp','?')}")
    else:
        print(f"No results for keyword '{args.keyword}'")


def cmd_migrate(args):
    """Migrate low-frequency memories from built-in memory to extended storage."""
    print("=== Memory Migration ===")
    print("Migrating low-frequency memories from built-in memory (99% saturated) to extended storage...")
    print()

    # Define low-frequency items to migrate (based on current memory analysis)
    migrate_items = [
        {
            "key": "发电行业巡检任务全面调研报告",
            "content": "发电行业巡检任务全面调研报告已完成: 飞书文档 YnDPdZ7T8oTsXGxDzVach88Cneb, 456 blocks, 8章+附录, 覆盖火电/风电/光伏/储能/水电5类电站巡检任务。"
        },
        {
            "key": "飞书API补充经验",
            "content": "飞书API补充: (1) batch_delete_block可用; (2) bullet/ordered_list/callout块API创建返回400，用text+前缀替代; (3) 写入端点POST /docx/v1/documents/{doc_id}/blocks/{root_id}/children; (4) 每批10个block写入稳定，已验证542块; (5) arXiv API需https+curl -sL -k跟随重定向; (6) 旧博士课题文档DawEdhslUoh73SxnWvzcQWhGnJe，新综合版QntHdsn3woTX9jxjantc8iNsnGh"
        },
        {
            "key": "可研报告分析完成",
            "content": "飞书/file/类型文件通过drive/v1/files/{token} API下载获取内容(需用户先授权文件权限)。已完成可研报告分析: 飞书文档 U7jDdmmydoqnPXxNF6yc4GZInPf。"
        },
        {
            "key": "蛇形机器人可行性报告",
            "content": "蛇形/多节机器人巡检可行性报告已完成: 飞书文档 V6XydOP97orBZax0Qqdc2YSYncf, 8章272 blocks, 含研究现状/厂商调研/巡检场景/三维度分析/推荐方案/实施路线图/30篇参考文献。"
        },
        {
            "key": "华润电力战略研究报告",
            "content": "华润电力具身智能巡检战略研究报告已完成: 飞书文档 Q3kXdzlS5ojGbOx1Qqqc2P4rnwc, 13章338 blocks。核心定位: 场景定义者+数据拥有者+标准制定者(非机器人本体制造商)。三大方向: 数据集与知识库、标准与评测体系、3D环境模型与自进化智能体。参考25篇论文(arXiv 2026最新+蛇形机器人前序调研)。"
        },
        {
            "key": "学习计划文档",
            "content": "学习计划文档: EFyAddic7ojABDxUJsPcx1pXnOb"
        },
        {
            "key": "项目17调研",
            "content": "项目17调研已完成: 飞书文档 ICgCdXUWHoCMKBxH1XjcHb48nyh 包含8章内容。飞书文档root block_id=document_id。Python脚本中避免中文引号和Unicode箭头等特殊字符。"
        },
        {
            "key": "传感器调研报告",
            "content": "机器人传感器行业综合调研报告: 飞书文档 UPOydYKLso59HgxSrAvcNRu1nrb, 9章438 blocks, 42篇arXiv论文。覆盖11类传感器(视觉/事件相机/深度/触觉/红外/测距/IMU/力/温度/气体/材质), 含轻量化TOP10/穿戴方案/电力巡检配置/投资方向评估。"
        }
    ]

    ensure_dirs()
    migrated = 0
    for item in migrate_items:
        entry = {
            "instance_id": INSTANCE_ID,
            "scope": "self",
            "key": item["key"],
            "content": item["content"],
            "timestamp": datetime.now().isoformat(),
            "migrated_from": "built-in-memory"
        }
        filename = item["key"].replace("/", "_").replace(" ", "_") + ".json"
        filepath = os.path.join(MEMORY_EXT_DIR, filename)
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(entry, f, ensure_ascii=False, indent=2)
        print(f"  Migrated: {item['key'][:40]}... -> {filename}")
        migrated += 1

    # Also upload batch to MinIO
    try:
        client = get_minio_client()
        if not client.bucket_exists(MINIO_BUCKET):
            client.make_bucket(MINIO_BUCKET)
        for item in migrate_items:
            filename = item["key"].replace("/", "_").replace(" ", "_") + ".json"
            filepath = os.path.join(MEMORY_EXT_DIR, filename)
            minio_key = f"{INSTANCE_ID}/{filename}"
            client.fput_object(MINIO_BUCKET, minio_key, filepath)
        print(f"\n  Uploaded {migrated} items to MinIO")
    except Exception as e:
        print(f"\n  MinIO upload: {e}")

    print(f"\nTotal migrated: {migrated} memory items")
    print("These items can now be removed from built-in memory to free up space.")


def cmd_sync(args):
    """Sync memory-ext data to Git."""
    import subprocess
    os.chdir(DDUP_PATH)
    try:
        subprocess.run(["git", "add", "shared-library/memory-ext/"], check=True)
        subprocess.run(["git", "add", "shared-library/registry/"], check=True)
        result = subprocess.run(
            ["git", "commit", "-m", f"chore({INSTANCE_ID}): sync memory-ext data"],
            capture_output=True, text=True
        )
        if "nothing to commit" in result.stdout:
            print("Nothing to commit, working tree clean")
        else:
            print(result.stdout)
        subprocess.run(["git", "push", "origin", "master"], check=True)
        print("Sync complete: pushed to origin/master")
    except subprocess.CalledProcessError as e:
        print(f"Git sync error: {e}")
        if e.stderr:
            print(e.stderr)


def main():
    parser = argparse.ArgumentParser(description="Memory Extension Client for DDUP")
    subparsers = parser.add_subparsers(dest="command")

    # status
    subparsers.add_parser("status", help="Check connection status")

    # save
    save_parser = subparsers.add_parser("save", help="Save a memory entry")
    save_parser.add_argument("--scope", choices=["self", "shared"], default="self")
    save_parser.add_argument("--key", required=True)
    save_parser.add_argument("--content", required=True)

    # query
    query_parser = subparsers.add_parser("query", help="Query memories")
    query_parser.add_argument("--scope", choices=["self", "shared", "all"], default="all")
    query_parser.add_argument("--keyword", required=True)

    # migrate
    subparsers.add_parser("migrate", help="Migrate low-frequency memories to extended storage")

    # sync
    subparsers.add_parser("sync", help="Sync to Git")

    args = parser.parse_args()

    if args.command == "status":
        cmd_status(args)
    elif args.command == "save":
        cmd_save(args)
    elif args.command == "query":
        cmd_query(args)
    elif args.command == "migrate":
        cmd_migrate(args)
    elif args.command == "sync":
        cmd_sync(args)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
