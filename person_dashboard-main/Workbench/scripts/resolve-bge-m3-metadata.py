"""Freeze the official BGE-M3 revision and required-file metadata without downloads."""

from __future__ import annotations

import argparse
import json
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path


MODEL_ID = "BAAI/bge-m3"
API_URL = f"https://huggingface.co/api/models/{MODEL_ID}?blobs=true"
REQUIRED_FILES = {
    "1_Pooling/config.json",
    "colbert_linear.pt",
    "config.json",
    "config_sentence_transformers.json",
    "modules.json",
    "pytorch_model.bin",
    "sentence_bert_config.json",
    "sentencepiece.bpe.model",
    "sparse_linear.pt",
    "special_tokens_map.json",
    "tokenizer.json",
    "tokenizer_config.json",
}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    request = urllib.request.Request(
        API_URL,
        headers={"Accept": "application/json", "User-Agent": "DDUP-metadata-review/1.0"},
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        metadata = json.load(response)

    siblings = {item["rfilename"]: item for item in metadata.get("siblings") or []}
    missing = sorted(REQUIRED_FILES - set(siblings))
    if missing:
        raise RuntimeError(f"Required model metadata is missing: {', '.join(missing)}")

    files = []
    for filename in sorted(REQUIRED_FILES):
        item = siblings[filename]
        lfs = item.get("lfs") or {}
        files.append(
            {
                "path": filename,
                "size_bytes": int(item.get("size") or 0),
                "git_blob_sha1": item.get("blobId"),
                "declared_lfs_sha256": lfs.get("sha256"),
                "local_sha256": None,
            }
        )

    total_bytes = sum(item["size_bytes"] for item in files)
    output = {
        "schema_version": "dd-up-huggingface-model-metadata-v1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "status": "metadata_only_not_downloaded",
        "model_id": MODEL_ID,
        "revision": metadata.get("sha"),
        "license": metadata.get("cardData", {}).get("license") or "mit",
        "source_api": API_URL,
        "summary": {
            "required_file_count": len(files),
            "required_file_bytes": total_bytes,
            "required_file_mib": round(total_bytes / 1024 / 1024, 2),
            "required_file_gib": round(total_bytes / 1024 / 1024 / 1024, 3),
        },
        "network_effects": {
            "model_metadata_read": True,
            "model_files_downloaded": False,
        },
        "verification_gate": [
            "Download only from the fixed revision URL after separate approval.",
            "Recompute SHA-256 for every downloaded file before use.",
            "For LFS files, require the local SHA-256 to equal declared_lfs_sha256.",
            "For non-LFS files, record the newly computed local SHA-256 in the run manifest.",
        ],
        "files": files,
    }
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps(output["summary"], ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
