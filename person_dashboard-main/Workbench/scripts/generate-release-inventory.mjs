#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const defaultRoot = resolve(dirname(scriptPath), "..");

function packageNameFromLockPath(lockPath) {
  return lockPath.split("node_modules/").at(-1);
}

function reviewReasons(component) {
  const reasons = [];
  if (!component.installed) reasons.push("metadata_unavailable_on_current_platform");
  if (component.license === "UNDECLARED") reasons.push("license_not_declared");
  if (/https?:\/\/|standard license/i.test(component.license)) reasons.push("non_spdx_license_expression");
  return reasons;
}

export async function createDependencyInventory({ root = defaultRoot } = {}) {
  const lockBytes = await readFile(join(root, "package-lock.json"));
  const lock = JSON.parse(lockBytes);
  const directDependencies = new Set(Object.keys(lock.packages?.[""]?.dependencies ?? {}));
  const components = [];

  for (const [lockPath, metadata] of Object.entries(lock.packages ?? {})) {
    if (!lockPath || metadata.dev || metadata.link || !lockPath.includes("node_modules/")) continue;
    const fallbackName = packageNameFromLockPath(lockPath);
    let installedMetadata = null;
    try {
      installedMetadata = JSON.parse(await readFile(join(root, lockPath, "package.json"), "utf8"));
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    const name = installedMetadata?.name ?? metadata.name ?? fallbackName;
    const component = {
      name,
      version: installedMetadata?.version ?? metadata.version ?? "UNDECLARED",
      license: installedMetadata?.license ?? metadata.license ?? "UNDECLARED",
      direct: directDependencies.has(name),
      optional: metadata.optional === true,
      installed: installedMetadata !== null,
      source: metadata.resolved ?? null,
      integrity: metadata.integrity ?? null,
    };
    components.push({ ...component, review_reasons: reviewReasons(component) });
  }

  components.sort((left, right) => (
    left.name.localeCompare(right.name) || left.version.localeCompare(right.version)
  ));
  const licenseCounts = new Map();
  for (const component of components) {
    licenseCounts.set(component.license, (licenseCounts.get(component.license) ?? 0) + 1);
  }

  return {
    schema: "ddup-release-dependency-inventory/v1",
    scope: "package-lock entries not marked dev; this is not artifact reachability analysis or legal approval",
    package: {
      name: lock.name,
      version: lock.version,
      lockfile_version: lock.lockfileVersion,
      lockfile_sha256: createHash("sha256").update(lockBytes).digest("hex"),
    },
    summary: {
      components: components.length,
      direct: components.filter(({ direct }) => direct).length,
      installed: components.filter(({ installed }) => installed).length,
      optional_unavailable: components.filter(({ installed, optional }) => !installed && optional).length,
      review_required: components.filter(({ review_reasons: reasons }) => reasons.length).length,
      licenses: Object.fromEntries([...licenseCounts].sort(([left], [right]) => left.localeCompare(right))),
    },
    components,
  };
}

export async function writeDependencyInventory({ root = defaultRoot } = {}) {
  const inventory = await createDependencyInventory({ root });
  const outputPath = join(root, "dist", "release", "dependency-inventory.json");
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(inventory, null, 2)}\n`, "utf8");
  return { inventory, outputPath };
}

if (resolve(process.argv[1] ?? "") === scriptPath) {
  const { inventory, outputPath } = await writeDependencyInventory();
  console.log(
    `Release dependency inventory written: ${inventory.summary.components} components, `
    + `${inventory.summary.review_required} require review, output ${outputPath}.`,
  );
}
