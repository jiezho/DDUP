import importlib
import os
from pathlib import Path

from fastapi.testclient import TestClient


def _build_app():
    import app.core.config as config
    import app.db.session as session
    import app.api.actions as actions
    import app.main as main

    importlib.reload(config)
    importlib.reload(session)
    importlib.reload(actions)
    importlib.reload(main)
    return main.app


def test_wiki_capture_raw_writes_markdown(tmp_path: Path) -> None:
    os.environ["DATABASE_URL"] = "sqlite+pysqlite:///:memory:"
    os.environ["ENVIRONMENT"] = "test"
    os.environ["DDUP_WIKI_ENABLED"] = "true"
    os.environ["DDUP_WIKI_VAULT_PATH"] = str(tmp_path / "vault")
    os.environ["DDUP_WIKI_RAW_DIR"] = "_raw"

    app = _build_app()
    with TestClient(app) as client:
        r = client.post(
            "/api/actions/execute",
            headers={"X-User-Id": "u1"},
            json={
                "type": "wiki.capture_raw",
                "payload": {
                    "title": "测试卡片",
                    "kind": "analysis",
                    "content": "# 测试\n\nhello",
                    "tags": ["t1"],
                    "sources": ["ddup:test"],
                    "visibility": "internal",
                },
            },
        )
        assert r.status_code == 200

    raw_dir = tmp_path / "vault" / "_raw"
    assert raw_dir.exists()
    files = list(raw_dir.glob("*.md"))
    assert len(files) == 1
    text = files[0].read_text(encoding="utf-8")
    assert 'title: "测试卡片"' in text
    assert 'category: "raw"' in text
    assert '  - "visibility/internal"' in text
    assert "# 测试" in text


def test_wiki_capture_raw_disabled(tmp_path: Path) -> None:
    os.environ["DATABASE_URL"] = "sqlite+pysqlite:///:memory:"
    os.environ["ENVIRONMENT"] = "test"
    os.environ["DDUP_WIKI_ENABLED"] = "false"
    os.environ["DDUP_WIKI_VAULT_PATH"] = str(tmp_path / "vault")

    app = _build_app()
    with TestClient(app) as client:
        r = client.post(
            "/api/actions/execute",
            headers={"X-User-Id": "u1"},
            json={"type": "wiki.capture_raw", "payload": {"content": "x"}},
        )
        assert r.status_code == 400
