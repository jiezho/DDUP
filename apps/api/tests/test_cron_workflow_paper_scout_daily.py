import json
import os
import subprocess
import sys
from pathlib import Path


def test_paper_scout_daily_workflow_calls_cron_archive(tmp_path: Path) -> None:
    repo_root = Path(__file__).resolve().parents[3]
    os.environ["DDUP_PATH"] = str(tmp_path)
    os.environ["HERMES_INSTANCE_ID"] = "hermes-research"

    src = (
        repo_root
        / "shared-library"
        / "registry"
        / "published"
        / "cron-archive"
        / "scripts"
        / "cron_archive.py"
    )
    dst = (
        tmp_path
        / "shared-library"
        / "registry"
        / "published"
        / "cron-archive"
        / "scripts"
        / "cron_archive.py"
    )
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text(src.read_text(encoding="utf-8"), encoding="utf-8")

    script = (
        repo_root
        / "agents"
        / "hermes-research"
        / "private-skills"
        / "paper-scout-daily"
        / "scripts"
        / "paper_scout_daily.py"
    )
    result = subprocess.run(
        [sys.executable, str(script), "--query", "embodied intelligence", "--limit", "5"],
        check=True,
        capture_output=True,
        text=True,
        env=dict(os.environ),
        cwd=str(repo_root),
    )
    payload = json.loads(result.stdout)
    assert payload["status"] == "archived"

    index_path = tmp_path / "shared-library" / "outputs" / ".index.json"
    index = json.loads(index_path.read_text(encoding="utf-8"))
    assert index["entries"]
    entry = index["entries"][0]
    assert entry["job_id"] == "paper-scout-daily"
    assert entry["instance_id"] == "hermes-research"

    archive_file = tmp_path / entry["file_path"]
    assert archive_file.exists()

