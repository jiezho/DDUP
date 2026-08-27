"""Run the reviewed BGE-M3 CPU model as a token-protected loopback-only POC sidecar."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import threading
from collections import OrderedDict
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


MODEL_ID = "BAAI/bge-m3"
MODEL_REVISION = "5617a9f61b028005a4858fdac845db406aefb181"
MAX_REQUEST_BYTES = 1024 * 1024
MAX_CANDIDATES = 200
MAX_TEXT_CHARS = 2300
MAX_CACHED_VECTORS = 512
IDENTIFIER = re.compile(r"^[A-Za-z0-9_-]{1,100}$")


class RuntimeBusyError(RuntimeError):
    """The single CPU inference slot is already serving another request."""


def configure_offline_environment() -> None:
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["TRANSFORMERS_OFFLINE"] = "1"
    os.environ["HF_DATASETS_OFFLINE"] = "1"
    os.environ["PYTHONNOUSERSITE"] = "1"
    os.environ["TOKENIZERS_PARALLELISM"] = "false"


def validate_rank_request(payload: object) -> tuple[str, list[dict[str, str]], int]:
    if not isinstance(payload, dict) or set(payload) != {"query", "candidates", "limit"}:
        raise ValueError("invalid request shape")
    query = payload["query"]
    candidates = payload["candidates"]
    limit = payload["limit"]
    if not isinstance(query, str) or not 2 <= len(query.strip()) <= 200 or not any(char.isalnum() for char in query):
        raise ValueError("invalid query")
    if not isinstance(candidates, list) or not 1 <= len(candidates) <= MAX_CANDIDATES:
        raise ValueError("invalid candidates")
    if not isinstance(limit, int) or isinstance(limit, bool) or not 1 <= limit <= 30:
        raise ValueError("invalid limit")
    normalized = []
    seen = set()
    for item in candidates:
        if not isinstance(item, dict) or set(item) != {"candidate_id", "text"}:
            raise ValueError("invalid candidate shape")
        candidate_id = item["candidate_id"]
        text = item["text"]
        if not isinstance(candidate_id, str) or not IDENTIFIER.fullmatch(candidate_id) or candidate_id in seen:
            raise ValueError("invalid candidate id")
        if not isinstance(text, str) or not 1 <= len(text) <= MAX_TEXT_CHARS:
            raise ValueError("invalid candidate text")
        seen.add(candidate_id)
        normalized.append({"candidate_id": candidate_id, "text": text})
    return query.strip(), normalized, min(limit, len(normalized))


class ModelRuntime:
    def __init__(self, model_root: Path):
        import numpy as np
        from FlagEmbedding import BGEM3FlagModel

        self._np = np
        self._lock = threading.Lock()
        # Process-local derived vectors only: plaintext candidate text is never retained.
        self._vector_cache: OrderedDict[str, object] = OrderedDict()
        self._model = BGEM3FlagModel(
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

    @staticmethod
    def _cache_key(candidate: dict[str, str]) -> str:
        digest = hashlib.sha256(candidate["text"].encode("utf-8")).hexdigest()
        return f'{candidate["candidate_id"]}:{digest}'

    def _document_vectors(self, candidates: list[dict[str, str]]):
        keys = [self._cache_key(item) for item in candidates]
        missing_indexes = [index for index, key in enumerate(keys) if key not in self._vector_cache]
        if missing_indexes:
            encoded = self._np.asarray(self._model.encode(
                [candidates[index]["text"] for index in missing_indexes],
                batch_size=4,
                max_length=128,
                return_dense=True,
                return_sparse=False,
                return_colbert_vecs=False,
            )["dense_vecs"], dtype=self._np.float32)
            for offset, index in enumerate(missing_indexes):
                self._vector_cache[keys[index]] = encoded[offset].copy()
        vectors = []
        for key in keys:
            vector = self._vector_cache[key]
            self._vector_cache.move_to_end(key)
            vectors.append(vector)
        while len(self._vector_cache) > MAX_CACHED_VECTORS:
            self._vector_cache.popitem(last=False)
        return self._np.stack(vectors)

    def rank(self, query: str, candidates: list[dict[str, str]], limit: int) -> list[dict[str, object]]:
        if not self._lock.acquire(blocking=False):
            raise RuntimeBusyError("runtime busy")
        try:
            query_vector = self._np.asarray(self._model.encode_queries(
                [query], batch_size=1, max_length=128,
                return_dense=True, return_sparse=False, return_colbert_vecs=False,
            )["dense_vecs"], dtype=self._np.float32)[0]
            document_vectors = self._document_vectors(candidates)
            ranked = [
                {"candidate_id": item["candidate_id"], "score": float(self._np.dot(query_vector, document_vectors[index]))}
                for index, item in enumerate(candidates)
            ]
            ranked.sort(key=lambda item: (-item["score"], item["candidate_id"]))
            return ranked[:limit]
        finally:
            self._lock.release()


def handler_factory(runtime: ModelRuntime, token: str):
    class Handler(BaseHTTPRequestHandler):
        server_version = "DDUPDenseSidecar/1.0"

        def log_message(self, *_args) -> None:
            return

        def send_json(self, status: HTTPStatus, payload: object) -> None:
            body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
            self.send_response(status)
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("X-Content-Type-Options", "nosniff")
            self.end_headers()
            self.wfile.write(body)

        def authorized(self) -> bool:
            return self.headers.get("Authorization") == f"Bearer {token}"

        def do_GET(self) -> None:
            if not self.authorized():
                self.send_json(HTTPStatus.UNAUTHORIZED, {"error": "unauthorized"})
                return
            if self.path != "/health":
                self.send_json(HTTPStatus.NOT_FOUND, {"error": "not_found"})
                return
            self.send_json(HTTPStatus.OK, {
                "status": "ok", "model_id": MODEL_ID, "model_revision": MODEL_REVISION, "device": "cpu",
            })

        def do_POST(self) -> None:
            if not self.authorized():
                self.send_json(HTTPStatus.UNAUTHORIZED, {"error": "unauthorized"})
                return
            if self.path != "/rank" or self.headers.get_content_type() != "application/json":
                self.send_json(HTTPStatus.NOT_FOUND, {"error": "not_found"})
                return
            try:
                content_length = int(self.headers.get("Content-Length", "0"))
            except ValueError:
                content_length = 0
            if not 1 <= content_length <= MAX_REQUEST_BYTES:
                self.send_json(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, {"error": "invalid_size"})
                return
            try:
                payload = json.loads(self.rfile.read(content_length).decode("utf-8"))
                query, candidates, limit = validate_rank_request(payload)
                results = runtime.rank(query, candidates, limit)
            except (UnicodeDecodeError, json.JSONDecodeError, ValueError):
                self.send_json(HTTPStatus.UNPROCESSABLE_ENTITY, {"error": "invalid_request"})
                return
            except RuntimeBusyError:
                self.send_json(HTTPStatus.SERVICE_UNAVAILABLE, {"error": "runtime_busy"})
                return
            except Exception:
                self.send_json(HTTPStatus.SERVICE_UNAVAILABLE, {"error": "runtime_unavailable"})
                return
            self.send_json(HTTPStatus.OK, {"results": results})

    return Handler


def main() -> int:
    sys.stdin.reconfigure(encoding="utf-8")
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser()
    parser.add_argument("--model-root", required=True)
    parser.add_argument("--port", type=int, default=8792)
    args = parser.parse_args()
    if not 1024 <= args.port <= 65535:
        raise RuntimeError("port must be between 1024 and 65535")
    token = os.environ.get("WORKBENCH_DENSE_SIDECAR_TOKEN", "")
    if not 32 <= len(token) <= 256:
        raise RuntimeError("WORKBENCH_DENSE_SIDECAR_TOKEN must contain 32 to 256 characters")
    model_root = Path(args.model_root).resolve()
    if not model_root.is_dir():
        raise RuntimeError("reviewed local model directory does not exist")

    configure_offline_environment()
    runtime = ModelRuntime(model_root)
    server = ThreadingHTTPServer(("127.0.0.1", args.port), handler_factory(runtime, token))
    server.daemon_threads = True
    print(json.dumps({
        "status": "ready", "host": "127.0.0.1", "port": args.port,
        "model_id": MODEL_ID, "model_revision": MODEL_REVISION, "device": "cpu",
    }), flush=True)
    try:
        server.serve_forever(poll_interval=0.25)
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
