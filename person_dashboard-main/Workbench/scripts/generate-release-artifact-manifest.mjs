#!/usr/bin/env node
import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const defaultPackageRoot = resolve(dirname(scriptPath), "..");
const allowedRoots = ["client", "server", ".openai", "release"];
const manifestRelativePath = "release/artifact-manifest.json";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function portablePath(root, absolute) {
  return relative(root, absolute).split(sep).join("/");
}

async function collectFiles(distRoot) {
  const files = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Release artifact cannot contain a symbolic link: ${portablePath(distRoot, absolute)}`);
      if (entry.isDirectory()) await visit(absolute);
      else if (entry.isFile()) files.push(absolute);
      else throw new Error(`Release artifact contains an unsupported entry: ${portablePath(distRoot, absolute)}`);
    }
  }
  for (const rootName of allowedRoots) {
    const root = join(distRoot, rootName);
    const details = await lstat(root).catch((error) => error?.code === "ENOENT" ? null : Promise.reject(error));
    if (!details) continue;
    if (!details.isDirectory()) throw new Error(`Release artifact root is not a directory: ${rootName}`);
    await visit(root);
  }
  return files
    .filter((absolute) => portablePath(distRoot, absolute) !== manifestRelativePath)
    .sort((left, right) => portablePath(distRoot, left).localeCompare(portablePath(distRoot, right)));
}

export async function createReleaseArtifactManifest({
  packageRoot = defaultPackageRoot,
  distRoot = join(packageRoot, "dist"),
} = {}) {
  const packageJson = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));
  const lockBytes = await readFile(join(packageRoot, "package-lock.json"));
  const files = [];
  for (const absolute of await collectFiles(distRoot)) {
    const bytes = await readFile(absolute);
    files.push({ path: portablePath(distRoot, absolute), byte_size: bytes.byteLength, sha256: sha256(bytes) });
  }
  if (!files.some(({ path }) => path === "release/dependency-inventory.json")) {
    throw new Error("Release artifact is missing dependency-inventory.json");
  }
  const bundleDigest = createHash("sha256");
  for (const file of files) bundleDigest.update(`${file.path}\0${file.byte_size}\0${file.sha256}\n`);
  return {
    schema: "ddup-release-artifact-manifest/v1",
    package: {
      name: packageJson.name,
      version: packageJson.version,
      lockfile_sha256: sha256(lockBytes),
    },
    bundle: {
      file_count: files.length,
      byte_size: files.reduce((sum, file) => sum + file.byte_size, 0),
      sha256: bundleDigest.digest("hex"),
    },
    files,
  };
}

export async function writeReleaseArtifactManifest(options = {}) {
  const packageRoot = options.packageRoot ?? defaultPackageRoot;
  const distRoot = options.distRoot ?? join(packageRoot, "dist");
  const manifest = await createReleaseArtifactManifest({ packageRoot, distRoot });
  const outputPath = join(distRoot, ...manifestRelativePath.split("/"));
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: "utf8", flag: "w", mode: 0o600 });
  return { manifest, outputPath };
}

export async function verifyReleaseArtifactManifest({ distRoot }) {
  const manifest = JSON.parse(await readFile(join(distRoot, ...manifestRelativePath.split("/")), "utf8"));
  if (manifest.schema !== "ddup-release-artifact-manifest/v1" || !Array.isArray(manifest.files)) {
    throw new Error("Unsupported release artifact manifest");
  }
  if (
    !manifest.bundle
    || manifest.bundle.file_count !== manifest.files.length
    || !Number.isSafeInteger(manifest.bundle.byte_size)
    || manifest.bundle.byte_size < 0
    || !/^[a-f0-9]{64}$/.test(manifest.bundle.sha256 ?? "")
  ) throw new Error("Unsupported release artifact summary");
  const actualPaths = (await collectFiles(distRoot)).map((absolute) => portablePath(distRoot, absolute));
  const expectedPaths = manifest.files.map((record) => typeof record?.path === "string" ? record.path : "");
  const sortedExpectedPaths = [...expectedPaths].sort((left, right) => left.localeCompare(right));
  if (new Set(expectedPaths).size !== expectedPaths.length || JSON.stringify(actualPaths) !== JSON.stringify(sortedExpectedPaths)) {
    throw new Error("Release artifact file set does not match its manifest");
  }
  const bundleDigest = createHash("sha256");
  let bundleBytes = 0;
  for (const record of manifest.files) {
    if (
      !record
      || typeof record.path !== "string"
      || !allowedRoots.some((root) => record.path.startsWith(`${root}/`))
      || record.path.includes("..")
      || record.path.includes("\\")
      || !Number.isSafeInteger(record.byte_size)
      || record.byte_size < 0
      || !/^[a-f0-9]{64}$/.test(record.sha256 ?? "")
    ) {
      throw new Error(`Unsupported release artifact path: ${record?.path ?? "missing"}`);
    }
    const bytes = await readFile(join(distRoot, ...record.path.split("/")));
    if (bytes.byteLength !== record.byte_size || sha256(bytes) !== record.sha256) {
      throw new Error(`Release artifact integrity failure: ${record.path}`);
    }
    bundleBytes += record.byte_size;
    bundleDigest.update(`${record.path}\0${record.byte_size}\0${record.sha256}\n`);
  }
  if (bundleBytes !== manifest.bundle.byte_size) throw new Error("Release artifact byte total mismatch");
  if (bundleDigest.digest("hex") !== manifest.bundle.sha256) throw new Error("Release artifact bundle digest mismatch");
  return manifest;
}

if (resolve(process.argv[1] ?? "") === scriptPath) {
  const { manifest } = await writeReleaseArtifactManifest();
  console.log(
    `Release artifact manifest written: ${manifest.bundle.file_count} files, `
    + `${manifest.bundle.byte_size} bytes, SHA-256 ${manifest.bundle.sha256}.`,
  );
}
