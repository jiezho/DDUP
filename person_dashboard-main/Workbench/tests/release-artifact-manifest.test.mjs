import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  verifyReleaseArtifactManifest,
  writeReleaseArtifactManifest,
} from "../scripts/generate-release-artifact-manifest.mjs";

const workbenchRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("release artifact manifest fixes the exact file set and detects later changes", async () => {
  const root = await mkdtemp(join(tmpdir(), "workbench-release-manifest-test-"));
  try {
    for (const directory of ["client", "server", ".openai", "release"]) {
      await mkdir(join(root, directory), { recursive: true });
    }
    await writeFile(join(root, "client", "index.html"), "<!doctype html><title>Synthetic release</title>");
    await writeFile(join(root, "server", "index.js"), "export default {};\n");
    await writeFile(join(root, ".openai", "hosting.json"), "{}\n");
    await writeFile(join(root, "release", "dependency-inventory.json"), "{\"synthetic\":true}\n");

    const { manifest } = await writeReleaseArtifactManifest({ packageRoot: workbenchRoot, distRoot: root });
    assert.equal(manifest.bundle.file_count, 4);
    assert.deepEqual(manifest.files.map(({ path }) => path), [
      ".openai/hosting.json",
      "client/index.html",
      "release/dependency-inventory.json",
      "server/index.js",
    ]);
    assert.equal((await verifyReleaseArtifactManifest({ distRoot: root })).bundle.sha256, manifest.bundle.sha256);

    const manifestPath = join(root, "release", "artifact-manifest.json");
    const originalManifest = await readFile(manifestPath);
    const verifyCli = () => spawnSync(process.execPath, [
      join(workbenchRoot, "scripts", "verify-release-artifact.mjs"), "--dist", root,
    ], { cwd: workbenchRoot, encoding: "utf8" });
    const verified = verifyCli();
    assert.equal(verified.status, 0, verified.stderr);
    assert.match(verified.stdout, /Release artifact verified: 4 files/);
    assert.deepEqual(await readFile(manifestPath), originalManifest);

    await writeFile(join(root, "client", "index.html"), "changed after manifest");
    const rejected = verifyCli();
    assert.equal(rejected.status, 1);
    assert.match(rejected.stderr, /integrity failure/);
    assert.deepEqual(await readFile(manifestPath), originalManifest);
    await assert.rejects(
      verifyReleaseArtifactManifest({ distRoot: root }),
      /integrity failure/,
    );

    await writeFile(join(root, "client", "index.html"), "<!doctype html><title>Synthetic release</title>");
    await writeFile(join(root, "client", "unexpected.js"), "throw new Error('not manifested');\n");
    await assert.rejects(
      verifyReleaseArtifactManifest({ distRoot: root }),
      /file set does not match/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("current production build includes dependency inventory without local absolute paths", async () => {
  const distRoot = join(workbenchRoot, "dist");
  const manifest = await verifyReleaseArtifactManifest({ distRoot });
  const serialized = JSON.stringify(manifest);
  assert.ok(manifest.files.some(({ path }) => path === "client/index.html"));
  assert.ok(manifest.files.some(({ path }) => path === "server/index.js"));
  assert.ok(manifest.files.some(({ path }) => path === "release/dependency-inventory.json"));
  assert.equal(serialized.includes(workbenchRoot), false);
  assert.equal(serialized.includes("E:\\"), false);
  assert.match(await readFile(join(distRoot, "release", "dependency-inventory.json"), "utf8"), /ddup-release-dependency-inventory/);
});

test("copied production artifact verifies in a clean directory and tampering is rejected without rewriting the manifest", async () => {
  const root = await mkdtemp(join(tmpdir(), "workbench-release-copy-test-"));
  const copyRoot = join(root, "copied-dist");
  try {
    await cp(join(workbenchRoot, "dist"), copyRoot, { recursive: true, errorOnExist: true, force: false });
    const manifestPath = join(copyRoot, "release", "artifact-manifest.json");
    const originalManifest = await readFile(manifestPath);
    const verified = spawnSync(process.execPath, [
      join(workbenchRoot, "scripts", "verify-release-artifact.mjs"), "--dist", copyRoot,
    ], { cwd: root, encoding: "utf8" });
    assert.equal(verified.status, 0, verified.stderr);
    const expectedCount = JSON.parse(originalManifest.toString("utf8")).bundle.file_count;
    assert.match(verified.stdout, new RegExp(`Release artifact verified: ${expectedCount} files`));
    assert.deepEqual(await readFile(manifestPath), originalManifest);

    await writeFile(join(copyRoot, "client", "index.html"), "tampered synthetic copy");
    const rejected = spawnSync(process.execPath, [
      join(workbenchRoot, "scripts", "verify-release-artifact.mjs"), "--dist", copyRoot,
    ], { cwd: root, encoding: "utf8" });
    assert.equal(rejected.status, 1);
    assert.match(rejected.stderr, /integrity failure/);
    assert.deepEqual(await readFile(manifestPath), originalManifest);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
