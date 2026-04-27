import importlib
import os
from pathlib import Path

from fastapi.testclient import TestClient


def _build_app():
    import app.core.config as config
    import app.db.session as session
    import app.api.wiki as wiki
    import app.main as main

    importlib.reload(config)
    importlib.reload(session)
    importlib.reload(wiki)
    importlib.reload(main)
    return main.app


def test_wiki_status_disabled(tmp_path: Path) -> None:
    os.environ["DATABASE_URL"] = "sqlite+pysqlite:///:memory:"
    os.environ["ENVIRONMENT"] = "test"
    os.environ["DDUP_WIKI_ENABLED"] = "false"
    os.environ["DDUP_WIKI_VAULT_PATH"] = str(tmp_path / "vault")

    app = _build_app()
    with TestClient(app) as client:
        r = client.get("/api/wiki/status", headers={"X-User-Id": "u1"})
        assert r.status_code == 200
        assert r.json()["enabled"] is False


def test_wiki_status_counts_raw(tmp_path: Path) -> None:
    os.environ["DATABASE_URL"] = "sqlite+pysqlite:///:memory:"
    os.environ["ENVIRONMENT"] = "test"
    os.environ["DDUP_WIKI_ENABLED"] = "true"
    os.environ["DDUP_WIKI_VAULT_PATH"] = str(tmp_path / "vault")
    os.environ["DDUP_WIKI_RAW_DIR"] = "_raw"

    raw_dir = tmp_path / "vault" / "_raw"
    raw_dir.mkdir(parents=True, exist_ok=True)
    (raw_dir / "a.md").write_text("# A", encoding="utf-8")

    app = _build_app()
    with TestClient(app) as client:
        r = client.get("/api/wiki/status", headers={"X-User-Id": "u1"})
        assert r.status_code == 200
        body = r.json()
        assert body["enabled"] is True
        assert body["raw_count"] == 1
        assert body["raw_latest_updated_at"]
