#!/usr/bin/env python3

import argparse
import json
from datetime import datetime, timezone


def run(*, topic: str, task: str) -> dict:
    now = datetime.now(tz=timezone.utc).replace(microsecond=0).isoformat()
    return {
        "status": "not_implemented",
        "message": "scientific-research-agent skeleton only; implement retrieval/writing pipelines in instance runtime.",
        "topic": topic,
        "task": task,
        "created_at": now,
    }


def _cli() -> None:
    parser = argparse.ArgumentParser(prog="scientific-research-agent")
    parser.add_argument("--topic", required=True)
    parser.add_argument("--task", default="survey")
    args = parser.parse_args()
    result = run(topic=args.topic, task=args.task)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    _cli()

