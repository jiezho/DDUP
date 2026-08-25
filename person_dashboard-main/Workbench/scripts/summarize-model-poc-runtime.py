"""Create a path-free evidence summary for the isolated model POC runtime."""

from __future__ import annotations

import argparse
import importlib.metadata
import json
import sys
from datetime import datetime, timezone
from pathlib import Path


def directory_bytes(path: Path) -> int:
    return sum(item.stat().st_size for item in path.rglob("*") if item.is_file())


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--runtime-root", required=True)
    parser.add_argument("--smoke-report", required=True)
    parser.add_argument("--retrieval-report", required=True)
    parser.add_argument("--osv-report", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    runtime_root = Path(args.runtime_root).resolve()
    repo_root = Path(__file__).resolve().parents[3]
    try:
        runtime_root.relative_to(repo_root)
    except ValueError:
        pass
    else:
        raise RuntimeError("Runtime root must remain outside the repository")

    wheel_report = json.loads((runtime_root / "download-report-wheels.json").read_text(encoding="utf-8"))
    model_report = json.loads((runtime_root / "download-report-model.json").read_text(encoding="utf-8"))
    smoke = json.loads(Path(args.smoke_report).read_text(encoding="utf-8"))
    retrieval = json.loads(Path(args.retrieval_report).read_text(encoding="utf-8"))
    osv = json.loads(Path(args.osv_report).read_text(encoding="utf-8"))

    wheel_items = wheel_report["items"]
    model_items = model_report["items"]
    if len(wheel_items) != 70 or len(model_items) != 12:
        raise RuntimeError("Downloaded artifact count differs from the approved manifest")
    if sum(item["size_bytes"] for item in wheel_items) != 262_686_832:
        raise RuntimeError("Wheel download total differs from the approved total")
    if sum(item["size_bytes"] for item in model_items) != 2_295_419_991:
        raise RuntimeError("Model download total differs from the approved total")
    if any(len(item["sha256"]) != 64 for item in [*wheel_items, *model_items]):
        raise RuntimeError("A downloaded artifact is missing its recomputed SHA-256")
    if any(
        item.get("declared_lfs_sha256") and item["sha256"] != item["declared_lfs_sha256"]
        for item in model_items
    ):
        raise RuntimeError("A model LFS digest does not match the recomputed SHA-256")

    output = {
        "schema_version": "dd-up-isolated-model-poc-summary-v1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "status": "isolated_poc_completed_not_integrated",
        "boundary": {
            "runtime_root_outside_repository": True,
            "loopback_service_started": False,
            "workbench_production_dependency_changed": False,
            "real_user_data_used": False,
            "reranker_used": False,
            "generated_answer_enabled": False,
        },
        "downloads": {
            "wheel_count": len(wheel_items),
            "wheel_bytes": sum(item["size_bytes"] for item in wheel_items),
            "model_file_count": len(model_items),
            "model_bytes": sum(item["size_bytes"] for item in model_items),
            "combined_bytes": sum(item["size_bytes"] for item in [*wheel_items, *model_items]),
            "all_sha256_recomputed": True,
            "all_declared_lfs_sha256_matched": True,
            "wheel_download_seconds": wheel_report["elapsed_seconds"],
            "model_download_seconds": model_report["elapsed_seconds"],
        },
        "installation": {
            "mode": "isolated_offline_hash_pinned_venv",
            "python": sys.version.split()[0],
            "versions": {
                "FlagEmbedding": importlib.metadata.version("FlagEmbedding"),
                "torch": importlib.metadata.version("torch"),
                "transformers": importlib.metadata.version("transformers"),
            },
        },
        "disk_bytes": {
            "wheelhouse": directory_bytes(runtime_root / "wheelhouse"),
            "model": directory_bytes(runtime_root / "model"),
            "venv": directory_bytes(runtime_root / "venv"),
        },
        "security_snapshot": {
            "osv_generated_at": osv["generated_at"],
            "package_count": osv["package_count"],
            "affected_package_count": osv["affected_package_count"],
            "vulnerability_record_count": osv["vulnerability_record_count"],
            "empty_result_proves_absence": False,
        },
        "smoke": {
            "status": smoke["status"],
            "embedding_dimension": smoke["embedding"]["dimension"],
            "cuda_available": smoke["runtime"]["cuda_available"],
            "load_seconds": smoke["runtime"]["load_seconds"],
            "encode_seconds": smoke["runtime"]["encode_seconds"],
            "peak_working_set_bytes": smoke["runtime"]["memory_after_encode"]["peak_working_set_bytes"],
        },
        "retrieval": {
            "status": retrieval["status"],
            "query_count": retrieval["query_count"],
            "relative_ndcg_gain": retrieval["comparison"]["relative_ndcg_gain"],
            "recall_delta": retrieval["comparison"]["recall_delta"],
            "raw_unauthorized_leak_count": retrieval["arms"]["rrf_raw"]["summary"]["unauthorized_leak_count"],
            "guarded_unauthorized_leak_count": retrieval["arms"]["rrf_with_deterministic_intent_guard"]["summary"]["unauthorized_leak_count"],
            "no_answer_false_positive_rate": retrieval["arms"]["rrf_with_deterministic_intent_guard"]["by_category"]["no_answer"]["no_answer_false_positive_rate"],
        },
    }
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": output["status"], "combined_bytes": output["downloads"]["combined_bytes"]}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
