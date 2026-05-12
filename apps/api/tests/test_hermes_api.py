import importlib
import json
import os
from pathlib import Path

from fastapi.testclient import TestClient


def _build_app():
    import app.core.config as config
    import app.db.session as session
    import app.api.hermes as hermes
    import app.services.hermes_registry as registry_service
    import app.main as main

    importlib.reload(config)
    importlib.reload(session)
    importlib.reload(registry_service)
    importlib.reload(hermes)
    importlib.reload(main)
    return main.app


def _write_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")


def test_hermes_overview_reads_registry(tmp_path: Path) -> None:
    os.environ["DATABASE_URL"] = "sqlite+pysqlite:///:memory:"
    os.environ["ENVIRONMENT"] = "test"
    os.environ["DDUP_PATH"] = str(tmp_path)

    _write_json(tmp_path / "shared-library" / "registry" / "instances.json", {
        "instances": [{
            "id": "hermes-main",
            "name": "Hermes Main",
            "status": "online",
            "description": "main instance",
            "deployment": {"type": "docker", "host": "localhost", "data_path": "/opt/data", "hermes_version": "v0.13.0"},
            "capabilities": ["chat", "wiki"],
            "specialization": ["coordination"],
            "published_skills": ["memory-ext-client"],
            "sub_agents": [],
            "cron_jobs": [],
            "data_assets": {"feishu_docs": ["REDACTED"]},
        }]
    })
    _write_json(tmp_path / "shared-library" / "registry" / "skills-manifest.json", {
        "version": "1.0.0",
        "updated_at": "2026-05-12T00:00:00Z",
        "skills": [{"name": "memory-ext-client", "description": "memory"}],
    })
    _write_json(tmp_path / "shared-library" / "outputs" / ".index.json", {"entries": []})
    shared_dir = tmp_path / "shared-library" / "memory-ext" / "shared"
    shared_dir.mkdir(parents=True, exist_ok=True)
    (shared_dir / "shared.md").write_text("shared memory", encoding="utf-8")
    instance_dir = tmp_path / "shared-library" / "memory-ext" / "hermes-main"
    instance_dir.mkdir(parents=True, exist_ok=True)
    (instance_dir / "context.md").write_text("hello hermes", encoding="utf-8")

    app = _build_app()
    with TestClient(app) as client:
        response = client.get("/api/hermes/overview", headers={"X-User-Id": "u1"})
        assert response.status_code == 200
        body = response.json()
        assert body["instances_count"] == 1
        assert body["online_instances_count"] == 1
        assert body["skills_count"] == 1
        assert body["shared_memory_files_count"] == 1


def test_hermes_instances_and_search(tmp_path: Path) -> None:
    os.environ["DATABASE_URL"] = "sqlite+pysqlite:///:memory:"
    os.environ["ENVIRONMENT"] = "test"
    os.environ["DDUP_PATH"] = str(tmp_path)

    _write_json(tmp_path / "shared-library" / "registry" / "instances.json", {
        "instances": [{
            "id": "hermes-research",
            "name": "Hermes Research",
            "status": "online",
            "description": "research papers and survey",
            "deployment": {"type": "server", "host": "<HOST>", "data_path": "~/.hermes", "hermes_version": "v0.13.0"},
            "capabilities": ["research"],
            "specialization": ["paper", "survey"],
            "published_skills": ["scientific-research-agent"],
            "sub_agents": [{"name": "Paper Scout"}],
            "cron_jobs": [{"name": "daily review"}],
            "data_assets": {},
        }]
    })
    _write_json(tmp_path / "shared-library" / "registry" / "skills-manifest.json", {
        "version": "1.0.0",
        "updated_at": "2026-05-12T00:00:00Z",
        "skills": [{"name": "scientific-research-agent", "description": "survey helper", "tags": ["paper"]}],
    })
    _write_json(tmp_path / "shared-library" / "outputs" / ".index.json", {
        "entries": [{"id": "o1", "instance_id": "hermes-research", "title": "paper digest", "summary": "survey output"}]
    })
    memory_dir = tmp_path / "shared-library" / "memory-ext" / "hermes-research"
    memory_dir.mkdir(parents=True, exist_ok=True)
    (memory_dir / "notes.md").write_text("survey and paper insights", encoding="utf-8")

    app = _build_app()
    with TestClient(app) as client:
        list_resp = client.get("/api/hermes/instances", headers={"X-User-Id": "u1"})
        assert list_resp.status_code == 200
        items = list_resp.json()["items"]
        assert len(items) == 1
        assert items[0]["memory"]["files_count"] == 1

        search_resp = client.get("/api/hermes/search", params={"q": "survey"}, headers={"X-User-Id": "u1"})
        assert search_resp.status_code == 200
        results = search_resp.json()["items"]
        assert any(item["source"] == "instance" for item in results)
        assert any(item["source"] == "skill" for item in results)
