#!/usr/bin/env python3

import argparse
import json
from datetime import datetime, timezone


def detect(*, text: str) -> dict:
    now = datetime.now(tz=timezone.utc).replace(microsecond=0).isoformat()
    return {
        "status": "not_implemented",
        "message": "inspiration-signal skeleton only; implement signal detection in instance runtime.",
        "created_at": now,
        "text_preview": text[:200],
    }


def _cli() -> None:
    parser = argparse.ArgumentParser(prog="inspiration-signal")
    parser.add_argument("--text", required=True)
    args = parser.parse_args()
    result = detect(text=args.text)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    _cli()

