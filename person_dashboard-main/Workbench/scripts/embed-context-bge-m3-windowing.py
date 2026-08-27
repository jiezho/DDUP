"""Compare frozen BGE-M3 passage-length and local-window strategies on synthetic chunks."""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from pathlib import Path


MODEL_REVISION = "5617a9f61b028005a4858fdac845db406aefb181"
FIXTURE_ID = "dd-up-synthetic-boundary-v1"
CHUNK_ID = re.compile(r"^chk_[0-9a-f]{40}$")
ARMS = (
    {"id": "full_128", "kind": "full", "max_length": 128},
    {"id": "full_256", "kind": "full", "max_length": 256},
    {"id": "full_512", "kind": "full", "max_length": 512},
    {"id": "window_160_40", "kind": "window", "window_chars": 160, "overlap_chars": 40, "max_length": 128},
    {"id": "window_240_60", "kind": "window", "window_chars": 240, "overlap_chars": 60, "max_length": 128},
    {"id": "window_320_80", "kind": "window", "window_chars": 320, "overlap_chars": 80, "max_length": 128},
)


def configure_offline_environment() -> None:
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["TRANSFORMERS_OFFLINE"] = "1"
    os.environ["HF_DATASETS_OFFLINE"] = "1"
    os.environ["PYTHONNOUSERSITE"] = "1"
    os.environ["TOKENIZERS_PARALLELISM"] = "false"


def windows(text: str, size: int, overlap: int) -> list[str]:
    if len(text) <= size:
        return [text]
    step = size - overlap
    result = []
    start = 0
    while start < len(text):
        end = min(len(text), start + size)
        result.append(text[start:end])
        if end == len(text):
            break
        start += step
    return result


def encode_arm(model, np, candidates: list[dict[str, str]], arm: dict[str, object]):
    texts = []
    owners = []
    for candidate_index, candidate in enumerate(candidates):
        pieces = [candidate["text"]] if arm["kind"] == "full" else windows(
            candidate["text"], int(arm["window_chars"]), int(arm["overlap_chars"]),
        )
        for piece in pieces:
            texts.append(f'{candidate["title"]}\n{piece}')
            owners.append(candidate_index)
    started = time.perf_counter()
    vectors = np.asarray(model.encode(
        texts,
        batch_size=4,
        max_length=int(arm["max_length"]),
        return_dense=True,
        return_sparse=False,
        return_colbert_vecs=False,
    )["dense_vecs"], dtype=np.float32)
    return vectors, owners, round((time.perf_counter() - started) * 1000, 2)


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

    payload = json.load(sys.stdin)
    candidates = payload.get("candidates")
    queries = payload.get("queries")
    if payload.get("fixture_id") != FIXTURE_ID or payload.get("data_classification") != "explicitly_synthetic":
        raise RuntimeError("Only the frozen explicitly synthetic boundary fixture is allowed")
    if not isinstance(candidates, list) or len(candidates) != 14 or not isinstance(queries, list) or not 1 <= len(queries) <= 21:
        raise RuntimeError("Unexpected frozen fixture counts")
    if any(set(item) != {"candidate_id", "document_id", "title", "text"} for item in candidates):
        raise RuntimeError("Unexpected candidate shape")
    if any(not CHUNK_ID.fullmatch(item["candidate_id"]) or not item["text"] for item in candidates):
        raise RuntimeError("Invalid frozen chunk")

    configure_offline_environment()
    import numpy as np
    from FlagEmbedding import BGEM3FlagModel

    model = BGEM3FlagModel(
        str(model_root), devices="cpu", use_fp16=False, use_bf16=False,
        trust_remote_code=False, local_files_only=True, return_dense=True,
        return_sparse=False, return_colbert_vecs=False, batch_size=4,
        query_max_length=128, passage_max_length=512,
    )
    query_started = time.perf_counter()
    query_vectors = np.asarray(model.encode_queries(
        [item["query"] for item in queries], batch_size=4, max_length=128,
        return_dense=True, return_sparse=False, return_colbert_vecs=False,
    )["dense_vecs"], dtype=np.float32)
    query_ms = round((time.perf_counter() - query_started) * 1000, 2)

    arm_outputs = {}
    for arm in ARMS:
        vectors, owners, encode_ms = encode_arm(model, np, candidates, arm)
        rankings = {}
        for query_index, query in enumerate(queries):
            best_by_candidate = [-2.0] * len(candidates)
            for vector_index, candidate_index in enumerate(owners):
                score = float(np.dot(query_vectors[query_index], vectors[vector_index]))
                if score > best_by_candidate[candidate_index]:
                    best_by_candidate[candidate_index] = score
            rows = [
                {"candidate_id": candidate["candidate_id"], "score": round(best_by_candidate[index], 8)}
                for index, candidate in enumerate(candidates)
            ]
            rows.sort(key=lambda item: (-item["score"], item["candidate_id"]))
            rankings[query["id"]] = rows
        arm_outputs[str(arm["id"])] = {
            "configuration": arm,
            "encoded_passages": len(vectors),
            "passage_encode_ms": encode_ms,
            "rankings": rankings,
        }

    json.dump({
        "fixture_id": FIXTURE_ID,
        "model": {"id": "BAAI/bge-m3", "revision": MODEL_REVISION, "device": "cpu", "network_allowed": False},
        "query_encode_ms": query_ms,
        "arms": arm_outputs,
    }, sys.stdout, ensure_ascii=False)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
