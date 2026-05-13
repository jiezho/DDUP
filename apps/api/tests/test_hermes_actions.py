import importlib
import json
import os
from pathlib import Path


def _write_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")


def _load_actions_module():
    import app.core.config as config
    import app.services.hermes_archive as archive_service
    import app.services.hermes_actions as actions
    import app.services.hermes_registry as registry_service

    importlib.reload(config)
    importlib.reload(archive_service)
    importlib.reload(registry_service)
    importlib.reload(actions)
    return actions


def test_hermes_actions_cover_register_memory_wiki_search_archive(tmp_path: Path) -> None:
    os.environ["ENVIRONMENT"] = "test"
    os.environ["DDUP_PATH"] = str(tmp_path)

    _write_json(tmp_path / "shared-library" / "registry" / "instances.json", {"instances": []})
    _write_json(tmp_path / "shared-library" / "registry" / "skills-manifest.json", {"skills": []})
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
    _write_json(tmp_path / "shared-library" / "outputs" / ".index.json", {"entries": []})

    actions = _load_actions_module()

    register_result = actions.register_instance(
        {
            "id": "hermes-research",
            "name": "Hermes Research",
            "deployment_type": "docker",
            "host": "localhost",
            "hermes_version": "v0.13.0",
            "platforms": ["feishu"],
            "toolsets": ["research", "wiki"],
            "specialization": ["paper", "survey"],
        }
    )
    assert register_result["status"] == "registered"
    assert (tmp_path / "agents" / "hermes-research" / "SOUL.md").exists()

    memory_result = actions.save_memory_entry(
        instance_id="hermes-research",
        scope="shared",
        key="Paper Notes",
        content="survey memory content",
    )
    assert memory_result["status"] == "saved"
    assert (tmp_path / "shared-library" / "memory-ext" / "shared" / "paper-notes.md").exists()

    wiki_result = actions.write_wiki_raw(
        instance_id="hermes-research",
        title="Survey Findings",
        content="latest wiki draft",
        tags=["paper", "survey"],
    )
    assert wiki_result["status"] == "written"
    assert (tmp_path / "shared-library" / "wiki" / "_raw" / "hermes-research" / "survey-findings.md").exists()

    search_result = actions.search_library("survey", sources=["memory", "wiki"], instance_id="hermes-research")
    assert search_result["status"] == "success"
    assert search_result["total"] == 2
    assert {item["source"] for item in search_result["items"]} == {"memory", "wiki"}

    archive_result = actions.archive_output(
        instance_id="hermes-research",
        job_id="paper-scout-daily",
        title="Paper Scout Daily",
        summary="daily summary",
        content="full archive content",
        metadata={"status": "success", "duration_ms": 3400},
    )
    assert archive_result["status"] == "archived"

    index_payload = json.loads((tmp_path / "shared-library" / "outputs" / ".index.json").read_text(encoding="utf-8"))
    assert index_payload["entries"][0]["job_id"] == "paper-scout-daily"
    assert index_payload["entries"][0]["execution_status"] == "success"
    assert index_payload["entries"][0]["duration_ms"] == 3400
