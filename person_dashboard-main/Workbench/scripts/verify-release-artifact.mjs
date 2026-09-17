#!/usr/bin/env node
import { resolve } from "node:path";

import { verifyReleaseArtifactManifest } from "./generate-release-artifact-manifest.mjs";

const args = process.argv.slice(2);
if (args.length !== 0 && (args.length !== 2 || args[0] !== "--dist" || !args[1])) {
  console.error("Usage: npm run release:verify -- [--dist <build-directory>]");
  process.exitCode = 2;
} else {
  const distRoot = resolve(args[1] ?? "dist");
  try {
    const manifest = await verifyReleaseArtifactManifest({ distRoot });
    console.log(`Release artifact verified: ${manifest.bundle.file_count} files, SHA-256 ${manifest.bundle.sha256}.`);
  } catch (error) {
    console.error(`Release artifact verification failed: ${error.message}`);
    process.exitCode = 1;
  }
}
