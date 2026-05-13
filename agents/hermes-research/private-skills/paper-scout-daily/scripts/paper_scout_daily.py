#!/usr/bin/env python3

import argparse
import importlib.util
import json
import os
from datetime import datetime, timezone
from pathlib import Path


def _load_cron_archive(dd_path: Path):
    script_path = dd_path / "shared-library" / "registry" / "published" / "cron-archive" / "scripts" / "cron_archive.py"
    spec = importlib.util.spec_from_file_location("cron_archive_script", script_path)
    if spec is None or spec.loader is None:
        raise RuntimeError("failed to load cron_archive module")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def run(*, query: str, limit: int, attachments: list[str]):
    dd_path = Path(os.environ.get("DDUP_PATH", ".")).resolve()
    instance_id = os.environ.get("HERMES_INSTANCE_ID", "unknown")
    now = datetime.now(tz=timezone.utc).replace(microsecond=0)

    report = {
        "query": query,
        "limit": limit,
        "generated_at": now.isoformat(),
        "items": [],
        "push_status": "not_implemented",
    }
    content = json.dumps(report, ensure_ascii=False, indent=2)

    cron_archive = _load_cron_archive(dd_path)
    metadata = {
        "status": "success",
        "duration_ms": 0,
        "summary": f"paper-scout-daily ({query})",
        "instance_id": instance_id,
    }
    return cron_archive.save("paper-scout-daily", content, metadata, attachments)


def _cli() -> None:
    parser = argparse.ArgumentParser(prog="paper-scout-daily")
    parser.add_argument("--query", default="embodied intelligence")
    parser.add_argument("--limit", type=int, default=10)
    parser.add_argument("--attachments", default="")
    args = parser.parse_args()
    atts = [a.strip() for a in args.attachments.split(",") if a.strip()]
    result = run(query=args.query, limit=max(1, args.limit), attachments=atts)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    _cli()

