#!/usr/bin/env python3

import argparse
import json
from datetime import datetime, timezone


def extract(*, url: str) -> dict:
    now = datetime.now(tz=timezone.utc).replace(microsecond=0).isoformat()
    return {
        "status": "not_implemented",
        "message": "wechat-article-extract skeleton only; implement extraction in instance runtime.",
        "url": url,
        "created_at": now,
    }


def _cli() -> None:
    parser = argparse.ArgumentParser(prog="wechat-article-extract")
    parser.add_argument("--url", required=True)
    args = parser.parse_args()
    result = extract(url=args.url)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    _cli()

