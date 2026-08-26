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
const blindEvidenceUrl = new URL(
  "../../../product/evidence/BGE-M3-synthetic-blind-threshold-calibration.json",
  import.meta.url,
);
const blindEmbedScriptUrl = new URL("../scripts/embed-context-bge-m3-blind.py", import.meta.url);
const blindCalibrationScriptUrl = new URL("../scripts/calibrate-context-bge-m3.mjs", import.meta.url);
const boundaryEvidenceUrl = new URL(
  "../../../product/evidence/BGE-M3-synthetic-boundary-evaluation.json",
  import.meta.url,
);
const enduranceEvidenceUrl = new URL(
  "../../../product/evidence/BGE-M3-sidecar-short-endurance.json",
  import.meta.url,
);
const boundaryEmbedScriptUrl = new URL("../scripts/embed-context-bge-m3-boundary.py", import.meta.url);
const boundaryEvaluationScriptUrl = new URL("../scripts/evaluate-context-bge-m3-boundary.mjs", import.meta.url);
const enduranceScriptUrl = new URL("../scripts/benchmark-dense-sidecar.mjs", import.meta.url);

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

test("blind calibration evidence remains synthetic, split-safe and default-off", async () => {
  const [evidence, embedScript, calibrationScript] = await Promise.all([
    readFile(blindEvidenceUrl, "utf8").then(JSON.parse),
    readFile(blindEmbedScriptUrl, "utf8"),
    readFile(blindCalibrationScriptUrl, "utf8"),
  ]);
  assert.equal(evidence.status, "blind_gate_passed_candidate_remains_experimental");
  assert.equal(evidence.boundary.data_classification, "explicitly_synthetic");
  assert.equal(evidence.boundary.production_enabled, false);
  assert.equal(evidence.boundary.generated_answer_enabled, false);
  assert.equal(evidence.boundary.threshold_selected_from, "calibration_split_only");
  assert.equal(evidence.selected_threshold, 0.5);
  assert.equal(evidence.blind.no_answer_false_positive_rate, 0);
  assert.equal(evidence.blind.unsafe_refusal_rate, 1);
  assert.equal(evidence.blind.unauthorized_leak_count, 0);
  assert.ok(evidence.score_envelope.blind.separation_margin > 0);
  assert.match(embedScript, /HF_HUB_OFFLINE/);
  assert.match(embedScript, /local_files_only=True/);
  assert.match(embedScript, /len\(corpus\) != 10 or len\(queries\) != 30/);
  assert.match(calibrationScript, /threshold_selected_from: 'calibration_split_only'/);
  assert.doesNotMatch(embedScript, /ddup-runtime/i);
  assert.doesNotMatch(calibrationScript, /ddup-runtime/i);
});

test("boundary and endurance failures remain synthetic, explicit and default-off", async () => {
  const [boundary, endurance, embedScript, evaluationScript, benchmarkScript] = await Promise.all([
    readFile(boundaryEvidenceUrl, "utf8").then(JSON.parse),
    readFile(enduranceEvidenceUrl, "utf8").then(JSON.parse),
    readFile(boundaryEmbedScriptUrl, "utf8"),
    readFile(boundaryEvaluationScriptUrl, "utf8"),
    readFile(enduranceScriptUrl, "utf8"),
  ]);
  assert.equal(boundary.status, "boundary_gate_failed_keep_default_disabled");
  assert.equal(boundary.boundary.data_classification, "explicitly_synthetic");
  assert.equal(boundary.boundary.production_enabled, false);
  assert.equal(boundary.metrics.threshold, 0.5);
  assert.equal(boundary.metrics.top1_accuracy, 0.7);
  assert.equal(boundary.metrics.no_answer_false_positive_rate, 0);
  assert.equal(boundary.metrics.unauthorized_leak_count, 0);
  assert.equal(boundary.metrics.exact_locator_rate, 1);
  assert.equal(endurance.status, "failed_keep_experimental_disabled");
  assert.equal(endurance.data_classification, "explicitly_synthetic");
  assert.equal(endurance.endpoint_scope, "127.0.0.1_loopback_only");
  assert.equal(endurance.measurements.total_errors, 6);
  assert.equal(endurance.measurements.identity_stable_after_run, true);
  assert.match(embedScript, /HF_HUB_OFFLINE/);
  assert.match(embedScript, /len\(candidates\) != 14 or len\(queries\) != 21/);
  assert.match(evaluationScript, /prior_blind_calibration_unchanged/);
  assert.match(benchmarkScript, /127\.0\.0\.1_loopback_only/);
  for (const content of [embedScript, evaluationScript, benchmarkScript]) {
    assert.doesNotMatch(content, /ddup-runtime/i);
  }
});
