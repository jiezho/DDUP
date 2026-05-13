#!/usr/bin/env python3

import argparse
import json
from datetime import datetime, timezone


def aggregate(*, sources: list[str], limit: int) -> dict:
    now = datetime.now(tz=timezone.utc).replace(microsecond=0).isoformat()
    return {
        "status": "not_implemented",
        "message": "news-aggregator skeleton only; implement fetch/parse pipelines in instance runtime.",
        "sources": sources,
        "limit": limit,
        "created_at": now,
    }


def _cli() -> None:
    parser = argparse.ArgumentParser(prog="news-aggregator")
    parser.add_argument("--sources", default="")
    parser.add_argument("--limit", type=int, default=20)
    args = parser.parse_args()
    sources = [item.strip() for item in args.sources.split(",") if item.strip()]
    result = aggregate(sources=sources, limit=max(1, args.limit))
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    _cli()

