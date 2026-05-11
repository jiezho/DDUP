import json
import os
import urllib.request


def main() -> None:
    url = os.environ.get("DDUP_API_URL", "http://127.0.0.1/api/actions/execute")
    user_id = os.environ.get("DDUP_USER_ID", "u1")
    payload = {
        "type": "wiki.capture_raw",
        "payload": {
            "title": "ProdPing",
            "kind": "analysis",
            "content": "ProdPing Hello",
            "tags": ["t1"],
            "sources": ["ddup:test"],
            "visibility": "internal",
        },
    }
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", "X-User-Id": user_id},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        print(resp.status)
        print(resp.read().decode("utf-8"))


if __name__ == "__main__":
    main()
