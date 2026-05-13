import subprocess
import sys
from pathlib import Path


def test_wiki_compiler_generates_compiled_pages(tmp_path: Path) -> None:
    repo_root = Path(__file__).resolve().parents[3]
    wiki_root = tmp_path / "shared-library" / "wiki"
    raw_dir = wiki_root / "_raw" / "hermes-main"
    raw_dir.mkdir(parents=True, exist_ok=True)

    raw_file = raw_dir / "sample.md"
    raw_file.write_text("# Sample\n\nhello", encoding="utf-8")

    compiler = repo_root / "tools" / "wiki_compiler.py"
    subprocess.run([sys.executable, str(compiler)], cwd=str(tmp_path), check=True)

    compiled_file = wiki_root / "compiled" / "sample.md"
    assert compiled_file.exists()

    updated_raw = raw_file.read_text(encoding="utf-8")
    assert "status: compiled" in updated_raw or "status: merged" in updated_raw

    logs_dir = wiki_root / "logs"
    assert logs_dir.exists()
    assert any(item.name.startswith("compile-") and item.suffix == ".log" for item in logs_dir.iterdir())

