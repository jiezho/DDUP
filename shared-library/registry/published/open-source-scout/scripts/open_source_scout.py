#!/usr/bin/env python3

import argparse
import json
from datetime import datetime, timezone


def scout(*, query: str, limit: int) -> dict:
    now = datetime.now(tz=timezone.utc).replace(microsecond=0).isoformat()
    return {
        "status": "not_implemented",
        "message": "open-source-scout skeleton only; implement source scanning in instance runtime.",
        "query": query,
        "limit": limit,
        "created_at": now,
    }


def _cli() -> None:
    parser = argparse.ArgumentParser(prog="open-source-scout")
    parser.add_argument("--query", required=True)
    parser.add_argument("--limit", type=int, default=10)
    args = parser.parse_args()
    result = scout(query=args.query, limit=max(1, args.limit))
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    _cli()

