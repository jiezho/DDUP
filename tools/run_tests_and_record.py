import datetime as dt
import re
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]

_ANSI_RE = re.compile(r"\x1b\[[0-9;]*[A-Za-z]")


def _strip_ansi(s: str) -> str:
    return _ANSI_RE.sub("", s)


def _run(cmd: list[str], cwd: Path) -> tuple[int, str]:
    try:
        p = subprocess.run(cmd, cwd=str(cwd), capture_output=True, text=True, encoding="utf-8", errors="replace")
    except FileNotFoundError:
        p = subprocess.run(
            ["cmd", "/c", *cmd],
            cwd=str(cwd),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
    out = (p.stdout or "") + "\n" + (p.stderr or "")
    return p.returncode, out.strip()


def _parse_pytest_summary(output: str) -> str:
    output = _strip_ansi(output)
    m = re.search(r"(\d+)\s+passed.*", output)
    if m:
        return f"PASS ({m.group(1)} passed)"
    if "failed" in output:
        m2 = re.search(r"(\d+)\s+failed.*", output)
        if m2:
            return f"FAIL ({m2.group(1)} failed)"
        return "FAIL"
    return "UNKNOWN"


def _parse_vitest_summary(output: str) -> str:
    output = _strip_ansi(output)
    m = re.search(r"Tests\s+(\d+)\s+passed", output)
    if m:
        return f"PASS ({m.group(1)} passed)"
    m2 = re.search(r"Test Files\s+(\d+)\s+passed", output)
    if m2:
        return f"PASS ({m2.group(1)} files)"
    if "failed" in output.lower():
        return "FAIL"
    return "UNKNOWN"


def _git_commit() -> str:
    code, out = _run(["git", "rev-parse", "--short", "HEAD"], ROOT)
    if code != 0:
        return "-"
    return out.splitlines()[-1].strip()


def _append_row(file_path: Path, row: str) -> None:
    file_path.parent.mkdir(parents=True, exist_ok=True)
    if not file_path.exists():
        file_path.write_text(
            "# DDUP Test Runs\n\n| Date | Commit | Backend (pytest) | Frontend (vitest) | Notes |\n|---|---|---|---|---|\n",
            encoding="utf-8",
        )
    existing = file_path.read_text(encoding="utf-8")
    if row in existing:
        return
    file_path.write_text(existing + row + "\n", encoding="utf-8")


def main() -> None:
    commit = _git_commit()
    today = dt.date.today().isoformat()

    be_code, be_out = _run(["python", "-m", "pytest", "-q"], ROOT / "apps" / "api")
    fe_code, fe_out = _run(["npm", "test"], ROOT / "apps" / "web")

    be_summary = _parse_pytest_summary(be_out) if be_code == 0 else f"FAIL (exit {be_code})"
    fe_summary = _parse_vitest_summary(fe_out) if fe_code == 0 else f"FAIL (exit {fe_code})"

    notes_list: list[str] = []
    if "DeprecationWarning" in be_out:
        notes_list.append("backend-warnings")
    if "Warning:" in fe_out:
        notes_list.append("frontend-warnings")
    notes = ",".join(notes_list) if notes_list else "ok"

    _append_row(ROOT / "docs" / "test-runs.md", f"| {today} | {commit} | {be_summary} | {fe_summary} | {notes} |")
    _append_row(
        ROOT / "docs" / "generated" / "test-run-output.md",
        f"\n## {today} {commit}\n\n### Backend (pytest)\n\n```\n{be_out}\n```\n\n### Frontend (vitest)\n\n```\n{fe_out}\n```\n",
    )


if __name__ == "__main__":
    main()

