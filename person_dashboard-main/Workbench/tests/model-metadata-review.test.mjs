import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const packageManifestUrl = new URL(
  "../../../product/evidence/FlagEmbedding-1.4.2-py312-win_amd64-metadata-lock.json",
  import.meta.url,
);
const modelManifestUrl = new URL(
  "../../../product/evidence/BGE-M3-5617a9f61b028005a4858fdac845db406aefb181-metadata-manifest.json",
  import.meta.url,
);
const osvAuditUrl = new URL(
  "../../../product/evidence/FlagEmbedding-1.4.2-py312-win_amd64-osv-audit.json",
  import.meta.url,
);
const postDownloadOsvAuditUrl = new URL(
  "../../../product/evidence/FlagEmbedding-1.4.2-py312-win_amd64-osv-audit-post-download.json",
  import.meta.url,
);
const smokeUrl = new URL(
  "../../../product/evidence/BGE-M3-5617a9f61b028005a4858fdac845db406aefb181-cpu-smoke.json",
  import.meta.url,
);
const retrievalUrl = new URL(
  "../../../product/evidence/BGE-M3-5617a9f61b028005a4858fdac845db406aefb181-synthetic-retrieval-evaluation.json",
  import.meta.url,
);
const pocSummaryUrl = new URL(
  "../../../product/evidence/BGE-M3-FlagEmbedding-1.4.2-isolated-poc-summary.json",
  import.meta.url,
);
const downloaderUrl = new URL("../scripts/download-model-poc-artifacts.py", import.meta.url);
const smokeScriptUrl = new URL("../scripts/smoke-test-bge-m3.py", import.meta.url);

test("model POC manifests remain metadata-only and within the reviewed download ceiling", async () => {
  const [packageManifest, modelManifest, osvAudit] = await Promise.all([
    readFile(packageManifestUrl, "utf8").then(JSON.parse),
    readFile(modelManifestUrl, "utf8").then(JSON.parse),
    readFile(osvAuditUrl, "utf8").then(JSON.parse),
  ]);

  assert.equal(packageManifest.status, "metadata_only_candidate_lock");
  assert.equal(packageManifest.summary.package_count, 70);
  assert.equal(packageManifest.summary.sdist_fallback_count, 0);
  assert.equal(packageManifest.network_effects.distribution_artifacts_downloaded, false);
  assert.equal(packageManifest.network_effects.packages_installed, false);
  assert.equal(packageManifest.network_effects.models_downloaded, false);

  assert.equal(modelManifest.status, "metadata_only_not_downloaded");
  assert.equal(modelManifest.revision, "5617a9f61b028005a4858fdac845db406aefb181");
  assert.equal(modelManifest.summary.required_file_count, 12);
  assert.equal(modelManifest.network_effects.model_files_downloaded, false);

  const reviewedBytes = packageManifest.summary.selected_artifact_download_bytes
    + modelManifest.summary.required_file_bytes;
  assert.equal(reviewedBytes, 2_558_106_823);
  assert.equal(osvAudit.package_count, 70);
  assert.equal(osvAudit.affected_package_count, 0);
});

test("the downloaded model POC remains isolated, synthetic-only and not production-enabled", async () => {
  const [postDownloadAudit, smoke, retrieval, summary] = await Promise.all([
    readFile(postDownloadOsvAuditUrl, "utf8").then(JSON.parse),
    readFile(smokeUrl, "utf8").then(JSON.parse),
    readFile(retrievalUrl, "utf8").then(JSON.parse),
    readFile(pocSummaryUrl, "utf8").then(JSON.parse),
  ]);

  assert.equal(postDownloadAudit.artifact_state, "downloaded_hash_verified");
  assert.equal(postDownloadAudit.package_count, 70);
  assert.equal(postDownloadAudit.affected_package_count, 0);
  assert.equal(smoke.status, "passed");
  assert.equal(smoke.boundary.network_allowed, false);
  assert.equal(smoke.boundary.real_user_data_used, false);
  assert.equal(smoke.runtime.cuda_available, false);
  assert.equal(smoke.embedding.dimension, 1024);

  assert.equal(retrieval.query_count, 60);
  assert.equal(retrieval.boundary.production_enabled, false);
  assert.equal(retrieval.boundary.generated_answer_enabled, false);
  assert.equal(retrieval.boundary.reranker_used, false);
  assert.equal(retrieval.quality_gate.unauthorized_leak_count_zero, true);
  assert.equal(retrieval.arms.rrf_raw.summary.unauthorized_leak_count, 60);
  assert.equal(
    retrieval.arms.rrf_with_deterministic_intent_guard.by_category.no_answer.no_answer_false_positive_rate,
    1,
  );

  assert.equal(summary.status, "isolated_poc_completed_not_integrated");
  assert.equal(summary.downloads.combined_bytes, 2_558_106_823);
  assert.equal(summary.boundary.runtime_root_outside_repository, true);
  assert.equal(summary.boundary.workbench_production_dependency_changed, false);
  assert.equal(summary.boundary.real_user_data_used, false);
});

test("the model POC scripts keep hard origin, size, offline and repository-isolation gates", async () => {
  const [downloader, smokeScript] = await Promise.all([
    readFile(downloaderUrl, "utf8"),
    readFile(smokeScriptUrl, "utf8"),
  ]);

  assert.match(downloader, /ALLOWED_PACKAGE_HOST = "files\.pythonhosted\.org"/);
  assert.match(downloader, /ALLOWED_MODEL_HOST = "huggingface\.co"/);
  assert.match(downloader, /reviewed_total != 2_558_106_823/);
  assert.match(downloader, /Runtime root must be outside the Git repository/);
  assert.match(downloader, /Downloaded hash mismatch/);
  assert.match(smokeScript, /HF_HUB_OFFLINE/);
  assert.match(smokeScript, /devices="cpu"/);
  assert.match(smokeScript, /local_files_only=True/);
  assert.doesNotMatch(downloader, /ddup-runtime/i);
  assert.doesNotMatch(smokeScript, /ddup-runtime/i);
});
