#!/usr/bin/env python3

import argparse
import json
from datetime import datetime, timezone


def push(*, date: str, source: str) -> dict:
    now = datetime.now(tz=timezone.utc).replace(microsecond=0).isoformat()
    return {
        "status": "not_implemented",
        "message": "news-terminology-push skeleton only; implement extraction and Feishu push in instance runtime.",
        "date": date,
        "source": source,
        "created_at": now,
    }


def _cli() -> None:
    parser = argparse.ArgumentParser(prog="news-terminology-push")
    parser.add_argument("--date", default="")
    parser.add_argument("--source", default="news-aggregator")
    args = parser.parse_args()
    result = push(date=args.date, source=args.source)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    _cli()

