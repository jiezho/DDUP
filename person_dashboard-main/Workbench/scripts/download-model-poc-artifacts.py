"""Download only the reviewed DDUP model POC artifacts with hard size/hash gates."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path


CHUNK_SIZE = 1024 * 1024
PROGRESS_STEP = 32 * 1024 * 1024
ALLOWED_PACKAGE_HOST = "files.pythonhosted.org"
ALLOWED_MODEL_HOST = "huggingface.co"
USER_AGENT = "DDUP-isolated-model-poc/1.0"


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while chunk := handle.read(4 * CHUNK_SIZE):
            digest.update(chunk)
    return digest.hexdigest()


def ensure_outside_repo(runtime_root: Path) -> None:
    repo_root = Path(__file__).resolve().parents[3]
    resolved = runtime_root.resolve()
    if resolved.parent == resolved:
        raise RuntimeError("Runtime root cannot be a drive or filesystem root")
    try:
        resolved.relative_to(repo_root)
    except ValueError:
        return
    raise RuntimeError("Runtime root must be outside the Git repository")


def safe_destination(root: Path, relative_path: str) -> Path:
    destination = (root / relative_path).resolve()
    try:
        destination.relative_to(root.resolve())
    except ValueError as error:
        raise RuntimeError(f"Artifact path escapes the runtime root: {relative_path}") from error
    return destination


def download(
    *,
    url: str,
    destination: Path,
    expected_size: int,
    expected_sha256: str | None,
) -> dict:
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != "https" or parsed.hostname not in {
        ALLOWED_PACKAGE_HOST,
        ALLOWED_MODEL_HOST,
    }:
        raise RuntimeError(f"Unapproved artifact origin: {parsed.scheme}://{parsed.hostname}")
    destination.parent.mkdir(parents=True, exist_ok=True)

    if destination.exists():
        if destination.stat().st_size != expected_size:
            raise RuntimeError(f"Existing artifact has wrong size: {destination.name}")
        actual_hash = sha256_file(destination)
        if expected_sha256 and actual_hash != expected_sha256:
            raise RuntimeError(f"Existing artifact hash mismatch: {destination.name}")
        print(f"verified existing: {destination.name}", flush=True)
        return {"network_bytes": 0, "sha256": actual_hash, "reused": True}

    partial = destination.with_name(destination.name + ".part")
    offset = partial.stat().st_size if partial.exists() else 0
    if offset > expected_size:
        raise RuntimeError(f"Partial artifact exceeds reviewed size: {destination.name}")
    headers = {"User-Agent": USER_AGENT}
    if offset:
        headers["Range"] = f"bytes={offset}-"
    request = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(request, timeout=60) as response:
        status = getattr(response, "status", 200)
        append = offset > 0 and status == 206
        if offset and not append:
            offset = 0
        mode = "ab" if append else "wb"
        received = 0
        next_progress = ((offset // PROGRESS_STEP) + 1) * PROGRESS_STEP
        with partial.open(mode) as handle:
            while chunk := response.read(CHUNK_SIZE):
                handle.write(chunk)
                received += len(chunk)
                current_size = offset + received
                if current_size > expected_size:
                    raise RuntimeError(f"Download exceeded reviewed size: {destination.name}")
                if current_size >= next_progress:
                    print(
                        f"downloading {destination.name}: {current_size / 1024 / 1024:.1f} / "
                        f"{expected_size / 1024 / 1024:.1f} MiB",
                        flush=True,
                    )
                    next_progress += PROGRESS_STEP

    actual_size = partial.stat().st_size
    if actual_size != expected_size:
        raise RuntimeError(
            f"Downloaded size mismatch for {destination.name}: {actual_size} != {expected_size}"
        )
    actual_hash = sha256_file(partial)
    if expected_sha256 and actual_hash != expected_sha256:
        raise RuntimeError(f"Downloaded hash mismatch: {destination.name}")
    os.replace(partial, destination)
    print(f"verified download: {destination.name}", flush=True)
    return {"network_bytes": received, "sha256": actual_hash, "reused": False}


def model_url(model_id: str, revision: str, path: str) -> str:
    encoded_path = "/".join(urllib.parse.quote(part, safe="") for part in path.split("/"))
    return f"https://huggingface.co/{model_id}/resolve/{revision}/{encoded_path}?download=true"


def write_requirements(package_manifest: dict, runtime_root: Path) -> None:
    lines = []
    for package in sorted(
        package_manifest["packages"], key=lambda item: item["normalized_name"]
    ):
        artifact = package["selected_artifact"]
        lines.append(
            f"{package['name']}=={package['version']} --hash=sha256:{artifact['sha256']}"
        )
    (runtime_root / "requirements-hashed.txt").write_text(
        "\n".join(lines) + "\n", encoding="utf-8"
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--package-manifest", required=True)
    parser.add_argument("--model-manifest", required=True)
    parser.add_argument("--runtime-root", required=True)
    parser.add_argument("--phase", choices=("wheels", "model", "all"), default="all")
    args = parser.parse_args()

    runtime_root = Path(args.runtime_root).resolve()
    ensure_outside_repo(runtime_root)
    package_manifest = json.loads(Path(args.package_manifest).read_text(encoding="utf-8"))
    model_manifest = json.loads(Path(args.model_manifest).read_text(encoding="utf-8"))
    reviewed_total = (
        int(package_manifest["summary"]["selected_artifact_download_bytes"])
        + int(model_manifest["summary"]["required_file_bytes"])
    )
    if reviewed_total != 2_558_106_823:
        raise RuntimeError("Reviewed total changed; a new approval is required")

    runtime_root.mkdir(parents=True, exist_ok=True)
    report_items = []
    started = time.perf_counter()

    if args.phase in {"wheels", "all"}:
        wheel_root = runtime_root / "wheelhouse"
        for index, package in enumerate(package_manifest["packages"], start=1):
            artifact = package["selected_artifact"]
            filename = artifact["filename"]
            if Path(filename).name != filename or artifact["packagetype"] != "bdist_wheel":
                raise RuntimeError(f"Unapproved package artifact: {filename}")
            print(
                f"wheel {index}/{len(package_manifest['packages'])}: "
                f"{package['name']}=={package['version']}",
                flush=True,
            )
            result = download(
                url=artifact["url"],
                destination=safe_destination(wheel_root, filename),
                expected_size=int(artifact["size_bytes"]),
                expected_sha256=artifact["sha256"],
            )
            report_items.append(
                {
                    "kind": "wheel",
                    "name": package["name"],
                    "version": package["version"],
                    "relative_path": f"wheelhouse/{filename}",
                    "size_bytes": int(artifact["size_bytes"]),
                    **result,
                }
            )
        write_requirements(package_manifest, runtime_root)

    if args.phase in {"model", "all"}:
        model_root = runtime_root / "model" / "bge-m3"
        for index, artifact in enumerate(model_manifest["files"], start=1):
            print(
                f"model {index}/{len(model_manifest['files'])}: {artifact['path']}",
                flush=True,
            )
            result = download(
                url=model_url(
                    model_manifest["model_id"], model_manifest["revision"], artifact["path"]
                ),
                destination=safe_destination(model_root, artifact["path"]),
                expected_size=int(artifact["size_bytes"]),
                expected_sha256=artifact.get("declared_lfs_sha256"),
            )
            report_items.append(
                {
                    "kind": "model",
                    "relative_path": f"model/bge-m3/{artifact['path']}",
                    "size_bytes": int(artifact["size_bytes"]),
                    "declared_lfs_sha256": artifact.get("declared_lfs_sha256"),
                    **result,
                }
            )

    report = {
        "schema_version": "dd-up-isolated-download-report-v1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "phase": args.phase,
        "reviewed_total_bytes": reviewed_total,
        "elapsed_seconds": round(time.perf_counter() - started, 3),
        "items": report_items,
    }
    report_name = f"download-report-{args.phase}.json"
    (runtime_root / report_name).write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(
        json.dumps(
            {
                "phase": args.phase,
                "items": len(report_items),
                "network_bytes": sum(item["network_bytes"] for item in report_items),
                "elapsed_seconds": report["elapsed_seconds"],
            },
            ensure_ascii=False,
        ),
        flush=True,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
