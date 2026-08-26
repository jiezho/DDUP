"""Rank only the frozen DDUP synthetic retrieval-boundary fixture with the reviewed local BGE-M3 model."""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path


MODEL_REVISION = "5617a9f61b028005a4858fdac845db406aefb181"
FIXTURE_ID = "dd-up-synthetic-boundary-v1"
CHUNK_ID = re.compile(r"^chk_[0-9a-f]{40}$")


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
    from FlagEmbedding import BGEM3FlagModel

    payload = json.load(sys.stdin)
    candidates = payload.get("candidates")
    queries = payload.get("queries")
    if payload.get("fixture_id") != FIXTURE_ID or payload.get("data_classification") != "explicitly_synthetic":
        raise RuntimeError("Only the frozen explicitly synthetic boundary fixture is allowed")
    if not isinstance(candidates, list) or not isinstance(queries, list) or len(candidates) != 14 or len(queries) != 21:
        raise RuntimeError("The frozen boundary fixture must contain exactly 14 chunks and 21 queries")
    if any(set(item) != {"candidate_id", "document_id", "title", "text"} for item in candidates):
        raise RuntimeError("Unexpected candidate shape")
    if any(not CHUNK_ID.fullmatch(item["candidate_id"]) or not item["text"] for item in candidates):
        raise RuntimeError("Invalid frozen chunk")

    model = BGEM3FlagModel(
        str(model_root), devices="cpu", use_fp16=False, use_bf16=False,
        trust_remote_code=False, local_files_only=True, return_dense=True,
        return_sparse=False, return_colbert_vecs=False, batch_size=4,
        query_max_length=128, passage_max_length=128,
    )
    documents = np.asarray(model.encode(
        [f"{item['title']}\n{item['text']}" for item in candidates], batch_size=4, max_length=128,
        return_dense=True, return_sparse=False, return_colbert_vecs=False,
    )["dense_vecs"], dtype=np.float32)
    query_vectors = np.asarray(model.encode_queries(
        [item["query"] for item in queries], batch_size=4, max_length=128,
        return_dense=True, return_sparse=False, return_colbert_vecs=False,
    )["dense_vecs"], dtype=np.float32)

    rankings = {}
    for query_index, query in enumerate(queries):
        rows = [
            {"candidate_id": candidate["candidate_id"], "score": round(float(np.dot(query_vectors[query_index], documents[index])), 8)}
            for index, candidate in enumerate(candidates)
        ]
        rows.sort(key=lambda item: (-item["score"], item["candidate_id"]))
        rankings[query["id"]] = rows

    json.dump({
        "fixture_id": FIXTURE_ID,
        "model": {"id": "BAAI/bge-m3", "revision": MODEL_REVISION, "device": "cpu", "network_allowed": False},
        "rankings": rankings,
    }, sys.stdout, ensure_ascii=False)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
