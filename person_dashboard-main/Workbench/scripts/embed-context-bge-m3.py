"""Rank the approved synthetic corpus with the local BGE-M3 CPU model."""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path


MODEL_REVISION = "5617a9f61b028005a4858fdac845db406aefb181"


def working_set(process) -> dict[str, int | None]:
    memory = process.memory_info()
    return {
        "rss_bytes": int(memory.rss),
        "peak_working_set_bytes": int(getattr(memory, "peak_wset", 0)) or None,
    }


def main() -> int:
    sys.stdin.reconfigure(encoding="utf-8")
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser()
    parser.add_argument("--model-root", required=True)
    args = parser.parse_args()
    model_root = Path(args.model_root).resolve()
    if not model_root.is_dir():
        raise RuntimeError("The reviewed local model directory does not exist")

    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["TRANSFORMERS_OFFLINE"] = "1"
    os.environ["HF_DATASETS_OFFLINE"] = "1"
    os.environ["PYTHONNOUSERSITE"] = "1"
    os.environ["TOKENIZERS_PARALLELISM"] = "false"

    import numpy as np
    import psutil
    import torch
    from FlagEmbedding import BGEM3FlagModel

    payload = json.load(sys.stdin)
    corpus = payload["corpus"]
    queries = payload["queries"]
    if len(corpus) != 12 or len(queries) != 60:
        raise RuntimeError("Only the approved 12-document/60-query synthetic fixture is allowed")
    if payload.get("data_classification") != "explicitly_synthetic":
        raise RuntimeError("Input is not marked as explicitly synthetic")

    process = psutil.Process()
    started = time.perf_counter()
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
        batch_size=4,
        query_max_length=128,
        passage_max_length=128,
    )
    load_seconds = time.perf_counter() - started
    memory_after_load = working_set(process)

    document_texts = [f"{item['title']}\n{item['body']}" for item in corpus]
    encode_documents_started = time.perf_counter()
    document_vectors = np.asarray(
        model.encode(
            document_texts,
            batch_size=4,
            max_length=128,
            return_dense=True,
            return_sparse=False,
            return_colbert_vecs=False,
        )["dense_vecs"],
        dtype=np.float32,
    )
    encode_documents_seconds = time.perf_counter() - encode_documents_started

    encode_queries_started = time.perf_counter()
    query_vectors = np.asarray(
        model.encode_queries(
            [item["query"] for item in queries],
            batch_size=4,
            max_length=128,
            return_dense=True,
            return_sparse=False,
            return_colbert_vecs=False,
        )["dense_vecs"],
        dtype=np.float32,
    )
    encode_queries_seconds = time.perf_counter() - encode_queries_started
    memory_after_encode = working_set(process)

    rankings = {}
    for query_index, query in enumerate(queries):
        allowed_projects = set(query["scope"]["project_ids"])
        candidates = []
        for document_index, document in enumerate(corpus):
            if allowed_projects and document["project_id"] not in allowed_projects:
                continue
            score = float(np.dot(query_vectors[query_index], document_vectors[document_index]))
            candidates.append({"document_id": document["id"], "score": round(score, 8)})
        candidates.sort(key=lambda item: (-item["score"], item["document_id"]))
        rankings[query["id"]] = candidates[:20]

    result = {
        "schema_version": "dd-up-bge-m3-synthetic-ranking-v1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "model": {
            "id": "BAAI/bge-m3",
            "revision": MODEL_REVISION,
            "device": "cpu",
            "network_allowed": False,
        },
        "data": {
            "classification": "explicitly_synthetic",
            "document_count": len(corpus),
            "query_count": len(queries),
        },
        "runtime": {
            "cuda_available": bool(torch.cuda.is_available()),
            "load_seconds": round(load_seconds, 3),
            "encode_documents_seconds": round(encode_documents_seconds, 3),
            "encode_queries_seconds": round(encode_queries_seconds, 3),
            "memory_after_load": memory_after_load,
            "memory_after_encode": memory_after_encode,
        },
        "rankings": rankings,
    }
    json.dump(result, sys.stdout, ensure_ascii=False)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
