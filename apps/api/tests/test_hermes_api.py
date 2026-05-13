import importlib
import json
import os
from pathlib import Path
from unittest.mock import patch

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
            "status": "active",
            "description": "main instance",
            "deployment": {"type": "docker", "host": "localhost", "data_path": "/opt/data", "hermes_version": "v0.13.0"},
            "capabilities": {
                "model": "glm-5.1-fp8",
                "context_window": 131000,
                "platforms": ["feishu"],
                "toolsets": ["chat", "wiki"],
                "skills_count": 4,
                "max_subagents": 2,
            },
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
        assert body["active_instances_count"] == 1
        assert body["online_instances_count"] == 1
        assert body["skills_count"] == 1
        assert body["shared_memory_files_count"] == 1
        assert body["runtime"]["memory_namespaces_count"] == 2


def test_hermes_instances_and_search(tmp_path: Path) -> None:
    os.environ["DATABASE_URL"] = "sqlite+pysqlite:///:memory:"
    os.environ["ENVIRONMENT"] = "test"
    os.environ["DDUP_PATH"] = str(tmp_path)

    _write_json(tmp_path / "shared-library" / "registry" / "instances.json", {
        "instances": [{
            "id": "hermes-research",
            "name": "Hermes Research",
            "status": "active",
            "description": "research papers and survey",
            "deployment": {"type": "server", "host": "<HOST>", "data_path": "~/.hermes", "hermes_version": "v0.13.0"},
            "capabilities": {
                "model": "glm-5.1-fp8",
                "platforms": ["feishu"],
                "toolsets": ["research"],
                "skills_count": 8,
                "max_subagents": 3,
            },
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
    wiki_dir = tmp_path / "shared-library" / "wiki" / "compiled"
    wiki_dir.mkdir(parents=True, exist_ok=True)
    (wiki_dir / "survey.md").write_text("# Survey Wiki\n\nsurvey knowledge base", encoding="utf-8")
    cron_dir = tmp_path / "shared-library" / "outputs" / "hermes-research" / "cron-archives" / "daily-review"
    cron_dir.mkdir(parents=True, exist_ok=True)
    (cron_dir / "2026-05-12.json").write_text('{"summary":"survey cron archive"}', encoding="utf-8")

    app = _build_app()
    with TestClient(app) as client:
        list_resp = client.get("/api/hermes/instances", headers={"X-User-Id": "u1"})
        assert list_resp.status_code == 200
        items = list_resp.json()["items"]
        assert len(items) == 1
        assert items[0]["memory"]["files_count"] == 1
        assert items[0]["status"] == "active"
        assert items[0]["capabilities"]["toolsets"] == ["research"]

        search_resp = client.get("/api/hermes/search", params={"q": "survey"}, headers={"X-User-Id": "u1"})
        assert search_resp.status_code == 200
        results = search_resp.json()["items"]
        assert any(item["source"] == "instance" for item in results)
        assert any(item["source"] == "skill" for item in results)
        assert any(item["source"] == "wiki" for item in results)
        assert any(item["source"] == "cron" for item in results)

        filtered_resp = client.get(
            "/api/hermes/search",
            params=[("q", "survey"), ("sources", "wiki"), ("instance_id", "hermes-research")],
            headers={"X-User-Id": "u1"},
        )
        assert filtered_resp.status_code == 200
        filtered = filtered_resp.json()["items"]
        assert filtered
        assert all(item["source"] == "wiki" for item in filtered)


def test_hermes_register_and_write_actions(tmp_path: Path) -> None:
    os.environ["DATABASE_URL"] = "sqlite+pysqlite:///:memory:"
    os.environ["ENVIRONMENT"] = "test"
    os.environ["DDUP_PATH"] = str(tmp_path)

    _write_json(tmp_path / "shared-library" / "registry" / "instances.json", {"instances": []})
    _write_json(tmp_path / "shared-library" / "registry" / "skills-manifest.json", {"skills": []})
    _write_json(
        tmp_path / "shared-library" / "outputs" / ".index.json",
        {
            "entries": [
                {
                    "id": "feature-doc-update-20260512",
                    "instance_id": "hermes-main",
                    "type": "cron_archive",
                    "job_id": "feature-doc-update",
                    "title": "Feature Doc Update",
                    "summary": "failed run",
                    "execution_status": "failed",
                    "duration_ms": 8200,
                    "archived_at": "2026-05-12T08:00:00+00:00",
                    "file_path": "shared-library/outputs/hermes-main/cron-archives/feature-doc-update/2026-05-12.json",
                }
            ]
        },
    )
    _write_json(
        tmp_path / "shared-library" / "registry" / "cron-registry.json",
        {
            "jobs": [
                {
                    "id": "paper-scout-daily",
                    "owner": "hermes-devops",
                    "schedule": "0 8 * * *",
                    "status": "active",
                },
                {
                    "id": "feature-doc-update",
                    "owner": "hermes-main",
                    "schedule": "0 10 * * *",
                    "status": "active",
                },
            ]
        },
    )

    app = _build_app()
    with TestClient(app) as client:
        register_resp = client.post(
            "/api/hermes/instances/register",
            headers={"X-User-Id": "u1"},
            json={
                "id": "hermes-devops",
                "name": "Hermes DevOps",
                "deployment_type": "docker",
                "host": "localhost",
                "hermes_version": "v0.13.0",
                "platforms": ["feishu"],
                "toolsets": ["terminal", "file"],
                "specialization": ["ops"],
            },
        )
        assert register_resp.status_code == 200
        register_body = register_resp.json()
        assert register_body["status"] == "registered"
        assert register_body["instance_id"] == "hermes-devops"

        memory_resp = client.post(
            "/api/hermes/memory/save",
            headers={"X-User-Id": "u1"},
            json={
                "instance_id": "hermes-devops",
                "scope": "self",
                "key": "Ops Notes",
                "content": "remember deployment checklist",
            },
        )
        assert memory_resp.status_code == 200
        assert memory_resp.json()["status"] == "saved"

        wiki_resp = client.post(
            "/api/hermes/wiki/raw",
            headers={"X-User-Id": "u1"},
            json={
                "instance_id": "hermes-devops",
                "title": "Deploy Runbook",
                "content": "runbook draft",
                "tags": ["ops", "deploy"],
            },
        )
        assert wiki_resp.status_code == 200
        assert wiki_resp.json()["status"] == "written"

        feedback_resp = client.get("/api/hermes/feedback/summary", headers={"X-User-Id": "u1"})
        assert feedback_resp.status_code == 200
        feedback_body = feedback_resp.json()
        assert feedback_body["metrics"]["recent_actions"] >= 3
        assert feedback_body["metrics"]["operational_jobs"] == 2
        assert any(item["action"] == "hermes.instance.register" for item in feedback_body["recent_actions"])
        assert any(item["status"] == "in_progress" for item in feedback_body["pending"])
        assert any(item["job_id"] == "paper-scout-daily" for item in feedback_body["operational_jobs"])
        assert any(item["derived_status"] == "pending_archive" for item in feedback_body["operational_jobs"])
        failing_job = next(item for item in feedback_body["operational_jobs"] if item["job_id"] == "feature-doc-update")
        assert failing_job["derived_status"] == "failing"
        assert failing_job["failure_count"] == 1
        assert failing_job["last_execution_status"] == "failed"
        assert failing_job["last_duration_ms"] == 8200

    registry = json.loads((tmp_path / "shared-library" / "registry" / "instances.json").read_text(encoding="utf-8"))
    assert registry["instances"][0]["status"] == "active"
    assert (tmp_path / "shared-library" / "memory-ext" / "hermes-devops" / "ops-notes.md").exists()
    assert (tmp_path / "shared-library" / "wiki" / "_raw" / "hermes-devops" / "deploy-runbook.md").exists()


def test_hermes_archive_and_runtime_status(tmp_path: Path) -> None:
    os.environ["DATABASE_URL"] = "sqlite+pysqlite:///:memory:"
    os.environ["ENVIRONMENT"] = "test"
    os.environ["DDUP_PATH"] = str(tmp_path)
    os.environ["STORAGE_ENDPOINT"] = "http://127.0.0.1:9000"
    os.environ["STORAGE_BUCKET"] = "ddup-shared-library"
    os.environ["STORAGE_ACCESS_KEY"] = "minio"
    os.environ["STORAGE_SECRET_KEY"] = "miniopass"

    _write_json(
        tmp_path / "shared-library" / "registry" / "instances.json",
        {
            "instances": [
                {
                    "id": "hermes-research",
                    "name": "Hermes Research",
                    "status": "active",
                    "description": "research",
                    "deployment": {"type": "server", "host": "<HOST>", "data_path": "~/.hermes", "hermes_version": "v0.13.0"},
                    "capabilities": {"platforms": ["feishu"], "toolsets": ["research"]},
                    "specialization": ["paper"],
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
    _write_json(
        tmp_path / "shared-library" / "registry" / "cron-registry.json",
        {
            "jobs": [
                {
                    "id": "paper-scout-daily",
                    "owner": "hermes-research",
                    "schedule": "0 8 * * *",
                    "status": "active",
                }
            ]
        },
    )
    _write_json(
        tmp_path / "shared-library" / "config" / "storage-policy.json",
        {
            "policies": {
                "size_threshold": {"git_max_bytes": 1048576},
                "minio": {
                    "endpoint": "http://127.0.0.1:9000",
                    "bucket": "ddup-shared-library",
                    "namespace_pattern": "{instance_id}/{category}/{YYYY-MM}/",
                    "retention_days": 365,
                },
            }
        },
    )

    app = _build_app()
    with TestClient(app) as client:
        archive_resp = client.post(
            "/api/hermes/archive/save",
            headers={"X-User-Id": "u1"},
            json={
                "instance_id": "hermes-research",
                "job_id": "paper-scout-daily",
                "title": "Paper Scout Daily",
                "summary": "daily summary",
                "content": "full archive content",
                "metadata": {"papers_count": 5, "duration_ms": 4200, "status": "success"},
            },
        )
        assert archive_resp.status_code == 200
        assert archive_resp.json()["status"] == "archived"

        runtime_resp = client.get("/api/hermes/runtime", headers={"X-User-Id": "u1"})
        assert runtime_resp.status_code == 200
        runtime_body = runtime_resp.json()
        assert runtime_body["cron"]["jobs_total"] == 1
        assert runtime_body["archives"]["entries_count"] == 1
        assert runtime_body["storage"]["bucket"] == "ddup-shared-library"

        feedback_resp = client.get("/api/hermes/feedback/summary", headers={"X-User-Id": "u1"})
        assert feedback_resp.status_code == 200
        feedback_body = feedback_resp.json()
        paper_job = next(item for item in feedback_body["operational_jobs"] if item["job_id"] == "paper-scout-daily")
        assert paper_job["last_execution_status"] == "success"
        assert paper_job["success_count"] == 1
        assert paper_job["last_duration_ms"] == 4200

    index_payload = json.loads((tmp_path / "shared-library" / "outputs" / ".index.json").read_text(encoding="utf-8"))
    assert index_payload["entries"][0]["job_id"] == "paper-scout-daily"
    assert index_payload["entries"][0]["execution_status"] == "success"
    assert index_payload["entries"][0]["duration_ms"] == 4200


def test_hermes_storage_objects_and_presign(tmp_path: Path) -> None:
    os.environ["DATABASE_URL"] = "sqlite+pysqlite:///:memory:"
    os.environ["ENVIRONMENT"] = "test"
    os.environ["DDUP_PATH"] = str(tmp_path)
    os.environ["STORAGE_ENDPOINT"] = "http://127.0.0.1:9000"
    os.environ["STORAGE_BUCKET"] = "ddup-shared-library"
    os.environ["STORAGE_ACCESS_KEY"] = "minio"
    os.environ["STORAGE_SECRET_KEY"] = "miniopass"

    _write_json(tmp_path / "shared-library" / "registry" / "instances.json", {"instances": []})
    _write_json(tmp_path / "shared-library" / "registry" / "skills-manifest.json", {"skills": []})
    _write_json(tmp_path / "shared-library" / "outputs" / ".index.json", {"entries": []})

    class _FakeObject:
        def __init__(self, object_name: str, size: int, last_modified: str) -> None:
            self.object_name = object_name
            self.size = size
            from datetime import datetime

            self.last_modified = datetime.fromisoformat(last_modified)

    class _FakeMinioClient:
        def __init__(self) -> None:
            self.deleted: list[str] = []
            self.uploaded: list[dict[str, object]] = []
            self.downloaded: list[str] = []

        def list_objects(self, bucket: str, prefix: str = ""):
            assert bucket == "ddup-shared-library"
            assert prefix == "hermes-research/"
            return [
                _FakeObject("hermes-research/papers/2026-05/a.pdf", 12345, "2026-05-12T00:00:00"),
                _FakeObject("hermes-research/papers/2026-05/b.pdf", 54321, "2026-05-13T00:00:00"),
            ]

        def bucket_exists(self, bucket: str) -> bool:
            assert bucket == "ddup-shared-library"
            return True

        def make_bucket(self, bucket: str) -> None:
            assert bucket == "ddup-shared-library"

        def put_object(self, bucket: str, key: str, data, length: int, content_type: str, metadata: dict[str, str]):
            assert bucket == "ddup-shared-library"
            self.uploaded.append(
                {
                    "key": key,
                    "data": data,
                    "length": length,
                    "content_type": content_type,
                    "metadata": metadata,
                }
            )
            return None

        def presigned_get_object(self, bucket: str, key: str, expires):
            assert bucket == "ddup-shared-library"
            assert key == "hermes-research/papers/2026-05/a.pdf"
            return f"http://127.0.0.1:9000/{bucket}/{key}?signature=test"

        def get_object(self, bucket: str, key: str):
            assert bucket == "ddup-shared-library"
            self.downloaded.append(key)

            class _FakeDownloadResponse:
                headers = {"Content-Type": "application/pdf"}

                def read(self):
                    return b"download-pdf"

                def close(self):
                    return None

                def release_conn(self):
                    return None

            return _FakeDownloadResponse()

        def remove_object(self, bucket: str, key: str):
            assert bucket == "ddup-shared-library"
            self.deleted.append(key)

    app = _build_app()
    fake_client = _FakeMinioClient()
    with patch("app.services.hermes_storage._get_client", return_value=fake_client):
        with TestClient(app) as client:
            upload_resp = client.post(
                "/api/hermes/storage/upload",
                headers={"X-User-Id": "u1"},
                data={"instance_id": "hermes-research", "category": "papers"},
                files={"file": ("sample.pdf", b"pdf-bytes", "application/pdf")},
            )
            assert upload_resp.status_code == 200
            upload_body = upload_resp.json()
            assert upload_body["status"] == "success"
            assert upload_body["key"].startswith("hermes-research/papers/")
            assert upload_body["size_bytes"] == 9

            list_resp = client.get(
                "/api/hermes/storage/objects",
                params={"instance_id": "hermes-research", "limit": 10},
                headers={"X-User-Id": "u1"},
            )
            assert list_resp.status_code == 200
            list_body = list_resp.json()
            assert list_body["status"] == "success"
            assert list_body["total"] == 2
            assert list_body["objects"][0]["key"].startswith("hermes-research/")

            presign_resp = client.post(
                "/api/hermes/storage/presign",
                headers={"X-User-Id": "u1"},
                json={"key": "hermes-research/papers/2026-05/a.pdf", "expires_days": 7},
            )
            assert presign_resp.status_code == 200
            presign_body = presign_resp.json()
            assert presign_body["status"] == "success"
            assert "signature=test" in presign_body["url"]

            download_resp = client.get(
                "/api/hermes/storage/download",
                params={"key": "hermes-research/papers/2026-05/a.pdf", "instance_id": "hermes-research"},
                headers={"X-User-Id": "u1"},
            )
            assert download_resp.status_code == 200
            assert download_resp.content == b"download-pdf"
            assert "attachment;" in download_resp.headers["content-disposition"].lower()

            delete_resp = client.post(
                "/api/hermes/storage/delete",
                headers={"X-User-Id": "u1"},
                json={"key": "hermes-research/papers/2026-05/a.pdf", "instance_id": "hermes-research"},
            )
            assert delete_resp.status_code == 200
            delete_body = delete_resp.json()
            assert delete_body["status"] == "success"
            assert delete_body["deleted"] == "hermes-research/papers/2026-05/a.pdf"

    assert fake_client.uploaded
    assert fake_client.downloaded == ["hermes-research/papers/2026-05/a.pdf"]
    assert fake_client.deleted == ["hermes-research/papers/2026-05/a.pdf"]
