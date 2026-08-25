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
