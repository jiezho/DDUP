#!/usr/bin/env python3

import argparse
import json
from datetime import datetime, timezone


def create(*, title: str, content: str) -> dict:
    now = datetime.now(tz=timezone.utc).replace(microsecond=0).isoformat()
    return {
        "status": "not_implemented",
        "message": "inspiration-manager skeleton only; implement bitable write in instance runtime.",
        "title": title,
        "created_at": now,
        "received_bytes": len(content.encode("utf-8")),
    }


def _cli() -> None:
    parser = argparse.ArgumentParser(prog="inspiration-manager")
    parser.add_argument("--title", required=True)
    parser.add_argument("--content", required=True)
    args = parser.parse_args()
    result = create(title=args.title, content=args.content)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    _cli()

