"""Diagnose repeated BGE-M3 query/passage encoding with frozen synthetic text only."""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path


MODEL_REVISION = "5617a9f61b028005a4858fdac845db406aefb181"
QUERY = "如何为可复现实验保留环境哈希、随机种子和停止条件"
CANDIDATES = [
    "虚构科研台账保存环境哈希、随机种子、停止条件、数据版本与负结果，确保运行可以复现。",
    "虚构学习计划使用 claim evidence limitation 结构练习学术英语问答。",
    "虚构电力研究记录灵活性包络、荷电状态和上下调节约束。",
    "虚构周计划汇总力量训练、睡眠偏差和学习投入。",
]


def configure_offline_environment() -> None:
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["TRANSFORMERS_OFFLINE"] = "1"
    os.environ["HF_DATASETS_OFFLINE"] = "1"
    os.environ["PYTHONNOUSERSITE"] = "1"
    os.environ["TOKENIZERS_PARALLELISM"] = "false"


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser()
    parser.add_argument("--model-root", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--iterations", type=int, choices=range(1, 9), required=True)
    parser.add_argument("--mode", choices=("uncached", "cached_passages"), required=True)
    args = parser.parse_args()
    model_root = Path(args.model_root).resolve()
    output = Path(args.output).resolve()
    if not model_root.is_dir():
        raise RuntimeError("reviewed local model directory does not exist")

    configure_offline_environment()
    import numpy as np
    import psutil
    import torch
    from FlagEmbedding import BGEM3FlagModel

    process = psutil.Process()

    def resources() -> dict[str, int]:
        children = [child for child in process.children(recursive=True) if child.is_running()]
        child_rss = 0
        for child in children:
            try:
                child_rss += child.memory_info().rss
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                pass
        return {
            "rss_bytes": process.memory_info().rss,
            "child_rss_bytes": child_rss,
            "os_threads": process.num_threads(),
            "child_processes": len(children),
        }

    report = {
        "schema_version": "dd-up-bge-m3-repeated-encoding-diagnostic-v1",
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "status": "running",
        "data_classification": "explicitly_synthetic",
        "mode": args.mode,
        "model": {
            "id": "BAAI/bge-m3",
            "revision": MODEL_REVISION,
            "device": "cpu",
            "network_allowed": False,
        },
        "configuration": {
            "iterations_requested": args.iterations,
            "candidate_count": len(CANDIDATES),
            "query_max_length": 128,
            "passage_max_length": 128,
            "torch_threads": torch.get_num_threads(),
            "torch_interop_threads": torch.get_num_interop_threads(),
        },
        "samples": [],
        "limits": [
            "direct_python_model_loop_not_http_throughput",
            "short_local_cpu_sample",
            "no_real_data_no_generated_answer_no_production_enablement",
        ],
    }

    def persist() -> None:
        output.parent.mkdir(parents=True, exist_ok=True)
        temporary = output.with_suffix(output.suffix + ".tmp")
        temporary.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        temporary.replace(output)

    persist()
    load_started = time.perf_counter()
    model = BGEM3FlagModel(
        str(model_root), devices="cpu", use_fp16=False, use_bf16=False,
        trust_remote_code=False, local_files_only=True, return_dense=True,
        return_sparse=False, return_colbert_vecs=False, batch_size=4,
        query_max_length=128, passage_max_length=128,
    )
    report["model_load_ms"] = round((time.perf_counter() - load_started) * 1000, 2)
    report["resources_after_load"] = resources()
    persist()
    print(json.dumps({"phase": "model_loaded", "model_load_ms": report["model_load_ms"]}), flush=True)

    cached_documents = None
    if args.mode == "cached_passages":
        passage_started = time.perf_counter()
        cached_documents = np.asarray(model.encode(
            CANDIDATES, batch_size=4, max_length=128,
            return_dense=True, return_sparse=False, return_colbert_vecs=False,
        )["dense_vecs"], dtype=np.float32)
        report["passage_cache_build_ms"] = round((time.perf_counter() - passage_started) * 1000, 2)
        report["resources_after_cache_build"] = resources()
        persist()
        print(json.dumps({"phase": "passage_cache_built", "ms": report["passage_cache_build_ms"]}), flush=True)

    for index in range(args.iterations):
        before = resources()
        query_started = time.perf_counter()
        query_vector = np.asarray(model.encode_queries(
            [QUERY], batch_size=1, max_length=128,
            return_dense=True, return_sparse=False, return_colbert_vecs=False,
        )["dense_vecs"], dtype=np.float32)[0]
        query_ms = round((time.perf_counter() - query_started) * 1000, 2)
        print(json.dumps({"phase": "query", "iteration": index + 1, "ms": query_ms}), flush=True)

        passage_ms = 0.0
        documents = cached_documents
        if documents is None:
            passage_started = time.perf_counter()
            documents = np.asarray(model.encode(
                CANDIDATES, batch_size=4, max_length=128,
                return_dense=True, return_sparse=False, return_colbert_vecs=False,
            )["dense_vecs"], dtype=np.float32)
            passage_ms = round((time.perf_counter() - passage_started) * 1000, 2)
            print(json.dumps({"phase": "passages", "iteration": index + 1, "ms": passage_ms}), flush=True)

        scores = np.dot(documents, query_vector)
        best_index = int(np.argmax(scores))
        sample = {
            "iteration": index + 1,
            "query_ms": query_ms,
            "passage_ms": passage_ms,
            "total_ms": round(query_ms + passage_ms, 2),
            "expected_top1": best_index == 0,
            "resources_before": before,
            "resources_after": resources(),
        }
        report["samples"].append(sample)
        persist()
        print(json.dumps({"phase": "iteration_complete", **sample}), flush=True)

    report["status"] = "completed"
    report["resources_final"] = resources()
    persist()
    print(json.dumps({"status": "completed", "iterations": len(report["samples"]), "mode": args.mode}), flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
