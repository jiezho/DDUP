import importlib
import json
import os
from pathlib import Path

from fastapi.testclient import TestClient


def _write_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")


def _build_app():
    import app.core.config as config
    import app.db.session as session
    import app.api as api_pkg
    import app.api.hermes as hermes
    import app.api.shared_library as shared_library
    import app.services.hermes_registry as registry_service
    import app.main as main

    importlib.reload(config)
    importlib.reload(session)
    importlib.reload(registry_service)
    importlib.reload(hermes)
    importlib.reload(shared_library)
    importlib.reload(api_pkg)
    importlib.reload(main)
    return main.app


def test_shared_library_routes_are_compatible_with_hermes_routes(tmp_path: Path) -> None:
    os.environ["DATABASE_URL"] = "sqlite+pysqlite:///:memory:"
    os.environ["ENVIRONMENT"] = "test"
    os.environ["DDUP_PATH"] = str(tmp_path)

    _write_json(
        tmp_path / "shared-library" / "registry" / "instances.json",
        {
            "instances": [
                {
                    "id": "hermes-main",
                    "name": "Hermes Main",
                    "status": "active",
                    "description": "main instance",
                    "deployment": {"type": "docker", "host": "localhost", "data_path": "/opt/data", "hermes_version": "v0.13.0"},
                    "capabilities": {},
                    "specialization": [],
                    "published_skills": [],
                    "sub_agents": [],
                    "cron_jobs": [],
                    "data_assets": {},
                }
            ]
        },
    )
    _write_json(tmp_path / "shared-library" / "registry" / "skills-manifest.json", {"skills": []})
    _write_json(tmp_path / "shared-library" / "outputs" / ".index.json", {"entries": []})
    _write_json(tmp_path / "shared-library" / "registry" / "cron-registry.json", {"jobs": []})

    app = _build_app()
    with TestClient(app) as client:
        hermes = client.get("/api/hermes/overview", headers={"X-User-Id": "u1"})
        shared = client.get("/api/shared-library/overview", headers={"X-User-Id": "u1"})
        assert hermes.status_code == 200
        assert shared.status_code == 200
        assert hermes.json() == shared.json()

