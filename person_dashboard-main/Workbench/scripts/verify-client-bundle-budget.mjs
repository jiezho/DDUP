#!/usr/bin/env node
import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workbenchRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const clientRoot = join(workbenchRoot, "dist", "client");
const assetsRoot = join(clientRoot, "assets");

export const CLIENT_BUNDLE_BUDGET = Object.freeze({
  entryJavaScriptBytes: 300_000,
  chunkJavaScriptBytes: 500_000,
});

function formatKilobytes(bytes) {
  return `${(bytes / 1_000).toFixed(2)} kB`;
}

export async function verifyClientBundleBudget() {
  const indexHtml = await readFile(join(clientRoot, "index.html"), "utf8");
  const entryMatch = indexHtml.match(/<script[^>]+src="\/assets\/([^"?]+\.js)"/i);
  if (!entryMatch) throw new Error("Client bundle budget failed: index entry script was not found.");

  const javascriptFiles = (await readdir(assetsRoot)).filter((name) => name.endsWith(".js"));
  const sizes = await Promise.all(javascriptFiles.map(async (name) => ({
    name,
    bytes: (await stat(join(assetsRoot, name))).size,
  })));
  const entry = sizes.find(({ name }) => name === entryMatch[1]);
  if (!entry) throw new Error(`Client bundle budget failed: missing entry asset ${entryMatch[1]}.`);

  const largest = sizes.reduce((current, candidate) => (
    candidate.bytes > current.bytes ? candidate : current
  ));
  const failures = [];
  if (entry.bytes > CLIENT_BUNDLE_BUDGET.entryJavaScriptBytes) {
    failures.push(
      `entry ${entry.name} is ${formatKilobytes(entry.bytes)} (limit ${formatKilobytes(CLIENT_BUNDLE_BUDGET.entryJavaScriptBytes)})`,
    );
  }
  if (largest.bytes > CLIENT_BUNDLE_BUDGET.chunkJavaScriptBytes) {
    failures.push(
      `largest chunk ${largest.name} is ${formatKilobytes(largest.bytes)} (limit ${formatKilobytes(CLIENT_BUNDLE_BUDGET.chunkJavaScriptBytes)})`,
    );
  }
  if (failures.length) throw new Error(`Client bundle budget failed: ${failures.join("; ")}.`);

  return { entry, largest, javascriptFileCount: sizes.length };
}

const result = await verifyClientBundleBudget();
console.log(
  `Client bundle budget passed: entry ${result.entry.name} ${formatKilobytes(result.entry.bytes)}, `
  + `largest ${result.largest.name} ${formatKilobytes(result.largest.bytes)}, `
  + `${result.javascriptFileCount} JavaScript chunks.`,
);
