import json
import sys
from pathlib import Path


def main() -> None:
    api_root = Path(__file__).resolve().parents[1]
    sys.path.insert(0, str(api_root))

    from app.main import app

    out_dir = Path(__file__).resolve().parents[3] / "docs" / "generated"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_file = out_dir / "openapi.json"

    payload = app.openapi()
    out_file.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()

