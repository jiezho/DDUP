"""Resolve a PyPI metadata-only candidate lock without downloading package files.

This script is intentionally separate from the Workbench runtime. It reads only
official PyPI JSON metadata, evaluates Windows/Python 3.12 markers, selects a
compatible wheel (or records an sdist fallback), and writes a review manifest.
It does not install packages, fetch distribution artifacts, or fetch models.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict, deque
from datetime import datetime, timezone
from pathlib import Path

from packaging.markers import default_environment
from packaging.requirements import Requirement
from packaging.specifiers import SpecifierSet
from packaging.tags import sys_tags
from packaging.utils import canonicalize_name, parse_wheel_filename
from packaging.version import InvalidVersion, Version


PYPI_BASE = "https://pypi.org/pypi"
PYTHON_VERSION = "3.12.13"
ROOT_REQUIREMENT = Requirement("FlagEmbedding==1.4.2")
USER_AGENT = "DDUP-metadata-review/1.0"


def fetch_json(url: str, attempts: int = 3) -> dict:
    request = urllib.request.Request(
        url,
        headers={"Accept": "application/json", "User-Agent": USER_AGENT},
    )
    for attempt in range(1, attempts + 1):
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                return json.load(response)
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
            if attempt == attempts:
                raise
            time.sleep(attempt)
    raise RuntimeError("unreachable")


class MetadataResolver:
    def __init__(self) -> None:
        self.project_cache: dict[str, dict] = {}
        self.version_cache: dict[tuple[str, str], dict] = {}
        self.selected: dict[str, str] = {}
        self.edges: dict[str, list[Requirement]] = {}
        self.files: dict[str, dict] = {}
        self.target_tags = list(sys_tags())
        self.tag_rank = {tag: index for index, tag in enumerate(self.target_tags)}
        self.marker_env = default_environment()
        self.marker_env.update(
            {
                "python_version": "3.12",
                "python_full_version": PYTHON_VERSION,
                "implementation_name": "cpython",
                "implementation_version": PYTHON_VERSION,
                "os_name": "nt",
                "sys_platform": "win32",
                "platform_system": "Windows",
                "platform_machine": "AMD64",
                "platform_python_implementation": "CPython",
            }
        )

    def project(self, name: str) -> dict:
        normalized = canonicalize_name(name)
        if normalized not in self.project_cache:
            encoded = urllib.parse.quote(name)
            self.project_cache[normalized] = fetch_json(f"{PYPI_BASE}/{encoded}/json")
        return self.project_cache[normalized]

    def version(self, name: str, version: str) -> dict:
        normalized = canonicalize_name(name)
        key = (normalized, version)
        if key not in self.version_cache:
            encoded_name = urllib.parse.quote(name)
            encoded_version = urllib.parse.quote(version)
            self.version_cache[key] = fetch_json(
                f"{PYPI_BASE}/{encoded_name}/{encoded_version}/json"
            )
        return self.version_cache[key]

    def marker_applies(self, requirement: Requirement, extras: set[str]) -> bool:
        if requirement.marker is None:
            return True
        candidates = extras or {""}
        candidates = set(candidates) | {""}
        return any(
            requirement.marker.evaluate({**self.marker_env, "extra": extra})
            for extra in candidates
        )

    def compatible_file(self, files: list[dict]) -> dict | None:
        compatible_wheels: list[tuple[int, dict]] = []
        sdists: list[dict] = []
        python_version = Version(PYTHON_VERSION)

        for file in files:
            if file.get("yanked"):
                continue
            requires_python = file.get("requires_python")
            if requires_python:
                try:
                    if python_version not in SpecifierSet(requires_python):
                        continue
                except Exception:
                    continue
            filename = file.get("filename", "")
            packagetype = file.get("packagetype")
            if packagetype == "bdist_wheel":
                try:
                    _, _, _, wheel_tags = parse_wheel_filename(filename)
                except Exception:
                    continue
                ranks = [self.tag_rank[tag] for tag in wheel_tags if tag in self.tag_rank]
                if ranks:
                    compatible_wheels.append((min(ranks), file))
            elif packagetype == "sdist":
                sdists.append(file)

        if compatible_wheels:
            compatible_wheels.sort(key=lambda item: (item[0], item[1].get("filename", "")))
            return compatible_wheels[0][1]
        if sdists:
            sdists.sort(key=lambda item: item.get("filename", ""))
            return sdists[0]
        return None

    def choose_version(self, name: str, requirements: list[Requirement]) -> tuple[str, dict]:
        project = self.project(name)
        candidates: list[tuple[Version, str, dict]] = []
        for version_text, release_files in project.get("releases", {}).items():
            try:
                parsed = Version(version_text)
            except InvalidVersion:
                continue
            if parsed.is_prerelease or parsed.is_devrelease:
                continue
            if not all(parsed in requirement.specifier for requirement in requirements):
                continue
            selected_file = self.compatible_file(release_files)
            if selected_file is not None:
                candidates.append((parsed, version_text, selected_file))
        if not candidates:
            rendered = ", ".join(str(req) for req in requirements)
            raise RuntimeError(f"No compatible PyPI release for {name}: {rendered}")
        candidates.sort(key=lambda item: item[0], reverse=True)
        _, version_text, selected_file = candidates[0]
        return version_text, selected_file

    def rebuild_constraints(self) -> tuple[dict[str, list[Requirement]], dict[str, set[str]], set[str]]:
        constraints: dict[str, list[Requirement]] = defaultdict(list)
        extras: dict[str, set[str]] = defaultdict(set)
        reachable: set[str] = set()
        root_name = canonicalize_name(ROOT_REQUIREMENT.name)
        constraints[root_name].append(ROOT_REQUIREMENT)
        extras[root_name].update(ROOT_REQUIREMENT.extras)
        queue = deque([root_name])

        while queue:
            parent = queue.popleft()
            if parent in reachable:
                continue
            reachable.add(parent)
            for requirement in self.edges.get(parent, []):
                if not self.marker_applies(requirement, extras[parent]):
                    continue
                child = canonicalize_name(requirement.name)
                constraints[child].append(requirement)
                extras[child].update(requirement.extras)
                if child not in reachable:
                    queue.append(child)
        return constraints, extras, reachable

    def resolve(self) -> tuple[dict[str, list[Requirement]], dict[str, set[str]]]:
        for round_index in range(1, 80):
            constraints, extras, reachable = self.rebuild_constraints()
            changed = False
            for stale in set(self.selected) - reachable:
                self.selected.pop(stale, None)
                self.edges.pop(stale, None)
                self.files.pop(stale, None)
                changed = True

            for name in sorted(reachable):
                version_text, selected_file = self.choose_version(name, constraints[name])
                if self.selected.get(name) == version_text and name in self.edges:
                    continue
                metadata = self.version(name, version_text)
                dependencies = []
                for raw_requirement in metadata.get("info", {}).get("requires_dist") or []:
                    try:
                        dependencies.append(Requirement(raw_requirement))
                    except Exception as error:
                        raise RuntimeError(
                            f"Invalid requires_dist for {name}=={version_text}: {raw_requirement}"
                        ) from error
                self.selected[name] = version_text
                self.edges[name] = dependencies
                self.files[name] = selected_file
                changed = True
                if len(self.selected) % 10 == 0:
                    print(f"metadata resolved: {len(self.selected)} packages", flush=True)

            if not changed:
                final_constraints, final_extras, final_reachable = self.rebuild_constraints()
                if final_reachable != set(self.selected):
                    continue
                for name, requirements in final_constraints.items():
                    version = Version(self.selected[name])
                    if not all(version in requirement.specifier for requirement in requirements):
                        raise RuntimeError(f"Unresolved constraint conflict for {name}")
                print(f"metadata resolution converged in {round_index} rounds", flush=True)
                return final_constraints, final_extras
        raise RuntimeError("Metadata resolution did not converge")

    @staticmethod
    def license_summary(info: dict) -> str:
        expression = info.get("license_expression")
        if expression:
            return expression
        classifiers = [
            value.removeprefix("License :: OSI Approved :: ")
            for value in info.get("classifiers") or []
            if value.startswith("License :: OSI Approved :: ")
        ]
        if classifiers:
            return "; ".join(classifiers)
        license_text = (info.get("license") or "").strip()
        return license_text if 0 < len(license_text) <= 120 else "not_declared_in_summary"

    def manifest(self, constraints: dict[str, list[Requirement]], extras: dict[str, set[str]]) -> dict:
        required_by: dict[str, set[str]] = defaultdict(set)
        root_name = canonicalize_name(ROOT_REQUIREMENT.name)
        required_by[root_name].add("root")
        for parent, requirements in self.edges.items():
            for requirement in requirements:
                if self.marker_applies(requirement, extras.get(parent, set())):
                    child = canonicalize_name(requirement.name)
                    if child in self.selected:
                        required_by[child].add(parent)

        packages = []
        total_bytes = 0
        sdist_count = 0
        for name in sorted(self.selected):
            version_text = self.selected[name]
            metadata = self.version(name, version_text)
            info = metadata.get("info", {})
            selected_file = self.files[name]
            size = int(selected_file.get("size") or 0)
            total_bytes += size
            is_sdist = selected_file.get("packagetype") == "sdist"
            sdist_count += int(is_sdist)
            digests = selected_file.get("digests") or {}
            packages.append(
                {
                    "name": info.get("name") or name,
                    "normalized_name": name,
                    "version": version_text,
                    "constraints": sorted(str(req.specifier) or "*" for req in constraints[name]),
                    "requested_extras": sorted(extras.get(name, set())),
                    "required_by": sorted(required_by[name]),
                    "license": self.license_summary(info),
                    "requires_python": info.get("requires_python"),
                    "selected_artifact": {
                        "filename": selected_file.get("filename"),
                        "packagetype": selected_file.get("packagetype"),
                        "build_from_source": is_sdist,
                        "size_bytes": size,
                        "sha256": digests.get("sha256"),
                        "url": selected_file.get("url"),
                    },
                    "project_url": info.get("project_url"),
                    "upload_time": selected_file.get("upload_time_iso_8601"),
                }
            )

        return {
            "schema_version": "dd-up-pypi-metadata-lock-v1",
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "status": "metadata_only_candidate_lock",
            "root_requirement": str(ROOT_REQUIREMENT),
            "target": {
                "python": PYTHON_VERSION,
                "implementation": "CPython",
                "os": "Windows",
                "architecture": "AMD64",
            },
            "network_effects": {
                "pypi_json_metadata_read": True,
                "distribution_artifacts_downloaded": False,
                "packages_installed": False,
                "models_downloaded": False,
            },
            "summary": {
                "package_count": len(packages),
                "sdist_fallback_count": sdist_count,
                "selected_artifact_download_bytes": total_bytes,
                "selected_artifact_download_mib": round(total_bytes / 1024 / 1024, 2),
                "installed_disk_bytes": None,
                "installed_disk_note": "Cannot be measured without the separately approved artifact download/install step.",
            },
            "limitations": [
                "This is a metadata candidate lock, not a pip installation report.",
                "Selected artifacts were not downloaded, so archive hashes were not recomputed locally.",
                "PyPI-declared SHA-256 values must be verified after a separately approved download.",
                "Any sdist fallback requires an additional build-tool and source review before download.",
                "Model weights and optional training extras are excluded.",
            ],
            "packages": packages,
        }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    output = Path(args.output)
    resolver = MetadataResolver()
    constraints, extras = resolver.resolve()
    manifest = resolver.manifest(constraints, extras)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(manifest["summary"], ensure_ascii=False), flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
