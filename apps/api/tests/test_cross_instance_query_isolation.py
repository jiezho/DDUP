import importlib.util
import json
import os
from pathlib import Path


def _write_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")


def _load_cross_query(script_path: Path):
    spec = importlib.util.spec_from_file_location("cross_query_script", script_path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_cross_instance_query_memory_ext_respects_summary_policy(tmp_path: Path) -> None:
    os.environ["DDUP_PATH"] = str(tmp_path)
    os.environ["HERMES_INSTANCE_ID"] = "hermes-main"

    _write_json(
        tmp_path / "shared-library" / "config" / "isolation-rules.json",
        {"rules": {"memory_ext": {"other_namespace_read_summary": True, "other_namespace_read_full": False}}},
    )

    other_dir = tmp_path / "shared-library" / "memory-ext" / "hermes-research"
    other_dir.mkdir(parents=True, exist_ok=True)
    other_dir.joinpath("notes.md").write_text("# Notes\n\n" + ("survey " * 300), encoding="utf-8")

    script_path = (
        Path(__file__).resolve().parents[3]
        / "shared-library"
        / "registry"
        / "published"
        / "cross-instance-query"
        / "scripts"
        / "cross_query.py"
    )
    cross_query = _load_cross_query(script_path)
    result = cross_query.search(["survey"], sources=["memory"], limit=20)
    assert result["total"] >= 1
    item = result["results"][0]
    assert item["access"] == "summary"
    assert item["instance_id"] == "hermes-research"
    assert item["snippet"].endswith("...")


def test_cross_instance_query_memory_ext_can_deny_other_namespace(tmp_path: Path) -> None:
    os.environ["DDUP_PATH"] = str(tmp_path)
    os.environ["HERMES_INSTANCE_ID"] = "hermes-main"

    _write_json(
        tmp_path / "shared-library" / "config" / "isolation-rules.json",
        {"rules": {"memory_ext": {"other_namespace_read_summary": False, "other_namespace_read_full": False}}},
    )

    other_dir = tmp_path / "shared-library" / "memory-ext" / "hermes-research"
    other_dir.mkdir(parents=True, exist_ok=True)
    other_dir.joinpath("notes.md").write_text("# Notes\n\nsurvey", encoding="utf-8")

    script_path = (
        Path(__file__).resolve().parents[3]
        / "shared-library"
        / "registry"
        / "published"
        / "cross-instance-query"
        / "scripts"
        / "cross_query.py"
    )
    cross_query = _load_cross_query(script_path)
    result = cross_query.search(["survey"], sources=["memory"], limit=20)
    assert result["total"] == 0


def test_cross_instance_query_memory_ext_can_allow_full_read(tmp_path: Path) -> None:
    os.environ["DDUP_PATH"] = str(tmp_path)
    os.environ["HERMES_INSTANCE_ID"] = "hermes-main"

    _write_json(
        tmp_path / "shared-library" / "config" / "isolation-rules.json",
        {"rules": {"memory_ext": {"other_namespace_read_summary": True, "other_namespace_read_full": True}}},
    )

    other_dir = tmp_path / "shared-library" / "memory-ext" / "hermes-research"
    other_dir.mkdir(parents=True, exist_ok=True)
    other_dir.joinpath("notes.md").write_text("# Notes\n\nsurvey", encoding="utf-8")

    script_path = (
        Path(__file__).resolve().parents[3]
        / "shared-library"
        / "registry"
        / "published"
        / "cross-instance-query"
        / "scripts"
        / "cross_query.py"
    )
    cross_query = _load_cross_query(script_path)
    result = cross_query.search(["survey"], sources=["memory"], limit=20)
    assert result["total"] >= 1
    item = result["results"][0]
    assert item["access"] == "full"
    assert item["snippet"].endswith("...") is False

