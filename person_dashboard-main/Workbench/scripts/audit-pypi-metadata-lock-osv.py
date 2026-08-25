"""Query OSV for a generated PyPI metadata lock without installing packages."""

from __future__ import annotations

import argparse
import json
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path


OSV_BATCH_URL = "https://api.osv.dev/v1/querybatch"
USER_AGENT = "DDUP-metadata-review/1.0"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    manifest = json.loads(Path(args.manifest).read_text(encoding="utf-8"))
    packages = manifest.get("packages") or []
    body = {
        "queries": [
            {
                "package": {"ecosystem": "PyPI", "name": item["name"]},
                "version": item["version"],
            }
            for item in packages
        ]
    }
    request = urllib.request.Request(
        OSV_BATCH_URL,
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Accept": "application/json",
            "Content-Type": "application/json",
            "User-Agent": USER_AGENT,
        },
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        result = json.load(response)

    findings = []
    results = result.get("results") or []
    if len(results) != len(packages):
        raise RuntimeError("OSV result count does not match the manifest package count")
    for package, package_result in zip(packages, results, strict=True):
        vulnerabilities = package_result.get("vulns") or []
        if vulnerabilities:
            findings.append(
                {
                    "name": package["name"],
                    "version": package["version"],
                    "vulnerabilities": [
                        {
                            "id": vulnerability.get("id"),
                            "modified": vulnerability.get("modified"),
                        }
                        for vulnerability in vulnerabilities
                    ],
                }
            )

    output = {
        "schema_version": "dd-up-osv-metadata-audit-v1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": OSV_BATCH_URL,
        "ecosystem": "PyPI",
        "package_count": len(packages),
        "affected_package_count": len(findings),
        "vulnerability_record_count": sum(
            len(item["vulnerabilities"]) for item in findings
        ),
        "limitations": [
            "The audit reflects OSV records available at the generated timestamp.",
            "An empty result does not prove absence of vulnerabilities.",
            "Package artifacts were not downloaded and their hashes were not recomputed locally.",
        ],
        "findings": findings,
    }
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(
        json.dumps(
            {
                "package_count": output["package_count"],
                "affected_package_count": output["affected_package_count"],
                "vulnerability_record_count": output["vulnerability_record_count"],
            },
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
