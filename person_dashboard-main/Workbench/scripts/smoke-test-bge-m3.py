"""Run the approved BGE-M3 CPU smoke test without network access or real data."""

from __future__ import annotations

import argparse
import importlib.metadata
import json
import math
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path


MODEL_REVISION = "5617a9f61b028005a4858fdac845db406aefb181"
SYNTHETIC_TEXT = "合成科研项目需要可追溯证据、权限过滤和明确的下一步。"


def working_set(process) -> dict[str, int | None]:
    memory = process.memory_info()
    return {
        "rss_bytes": int(memory.rss),
        "peak_working_set_bytes": int(getattr(memory, "peak_wset", 0)) or None,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model-root", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    model_root = Path(args.model_root).resolve()
    if not model_root.is_dir():
        raise RuntimeError("The reviewed local model directory does not exist")
    output = Path(args.output).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)

    # These flags must be set before importing the model stack. They turn a
    # missing local file into a hard failure instead of an unreviewed download.
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["TRANSFORMERS_OFFLINE"] = "1"
    os.environ["HF_DATASETS_OFFLINE"] = "1"
    os.environ["PYTHONNOUSERSITE"] = "1"
    os.environ["TOKENIZERS_PARALLELISM"] = "false"

    import numpy as np
    import psutil
    import torch
    from FlagEmbedding import BGEM3FlagModel

    process = psutil.Process()
    memory_before = working_set(process)
    load_started = time.perf_counter()
    model = BGEM3FlagModel(
        str(model_root),
        devices="cpu",
        use_fp16=False,
        use_bf16=False,
        trust_remote_code=False,
        local_files_only=True,
        return_dense=True,
        return_sparse=False,
        return_colbert_vecs=False,
        batch_size=1,
        query_max_length=128,
        passage_max_length=128,
    )
    load_seconds = time.perf_counter() - load_started
    memory_after_load = working_set(process)

    encode_started = time.perf_counter()
    encoded = model.encode(
        [SYNTHETIC_TEXT],
        batch_size=1,
        max_length=128,
        return_dense=True,
        return_sparse=False,
        return_colbert_vecs=False,
    )
    encode_seconds = time.perf_counter() - encode_started
    memory_after_encode = working_set(process)

    dense = np.asarray(encoded["dense_vecs"], dtype=np.float32)
    if dense.ndim != 2 or dense.shape[0] != 1:
        raise RuntimeError(f"Unexpected dense embedding shape: {dense.shape}")
    finite = bool(np.isfinite(dense).all())
    if not finite:
        raise RuntimeError("Dense embedding contains a non-finite value")
    vector_norm = float(np.linalg.norm(dense[0]))
    if not math.isfinite(vector_norm) or vector_norm <= 0:
        raise RuntimeError("Dense embedding norm is invalid")

    report = {
        "schema_version": "dd-up-bge-m3-cpu-smoke-v1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "status": "passed",
        "boundary": {
            "model_id": "BAAI/bge-m3",
            "model_revision": MODEL_REVISION,
            "model_source": "reviewed_local_directory",
            "network_allowed": False,
            "device_requested": "cpu",
            "real_user_data_used": False,
            "input_kind": "explicitly_synthetic_short_text",
        },
        "versions": {
            "python": sys.version.split()[0],
            "FlagEmbedding": importlib.metadata.version("FlagEmbedding"),
            "torch": torch.__version__,
            "transformers": importlib.metadata.version("transformers"),
        },
        "runtime": {
            "cuda_available": bool(torch.cuda.is_available()),
            "cuda_version": torch.version.cuda,
            "load_seconds": round(load_seconds, 3),
            "encode_seconds": round(encode_seconds, 3),
            "memory_before": memory_before,
            "memory_after_load": memory_after_load,
            "memory_after_encode": memory_after_encode,
        },
        "embedding": {
            "batch_size": int(dense.shape[0]),
            "dimension": int(dense.shape[1]),
            "finite": finite,
            "l2_norm": round(vector_norm, 6),
        },
    }
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
