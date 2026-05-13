#!/usr/bin/env python3

import argparse
import json
from datetime import datetime, timezone


def write(*, title: str, content: str, doc_id: str | None = None) -> dict:
    now = datetime.now(tz=timezone.utc).replace(microsecond=0).isoformat()
    return {
        "status": "not_implemented",
        "message": "feishu-doc-writer skeleton only; implement Feishu Docx write in instance runtime.",
        "title": title,
        "doc_id": doc_id,
        "received_bytes": len(content.encode("utf-8")),
        "created_at": now,
    }


def _cli() -> None:
    parser = argparse.ArgumentParser(prog="feishu-doc-writer")
    parser.add_argument("--title", required=True)
    parser.add_argument("--content", required=True)
    parser.add_argument("--doc-id", default="")
    args = parser.parse_args()
    result = write(title=args.title, content=args.content, doc_id=(args.doc_id or None))
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    _cli()

