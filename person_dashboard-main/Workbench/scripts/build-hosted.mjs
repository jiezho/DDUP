#!/usr/bin/env node
// Keep the hosted build free of the local Vault API plugin on every shell.
// Setting the variable inside Node avoids platform-specific `NAME=value` syntax.
process.env.VITE_WORKBENCH_HOSTED = "true";

const [{ build }, { default: config }] = await Promise.all([
  import("vite"),
  import("../vite.config.mjs"),
]);

// Loading the checked-in config directly also avoids Vite's transient config
// bundle under node_modules, which can be blocked in managed Windows sandboxes.
await build({ ...config, configFile: false });
await import("./verify-client-bundle-budget.mjs");
await import("./prepare-sites-build.mjs");
const { writeDependencyInventory } = await import("./generate-release-inventory.mjs");
const { inventory } = await writeDependencyInventory();
console.log(`Prepared dependency inventory: ${inventory.summary.components} components, ${inventory.summary.review_required} require review.`);
const { writeReleaseArtifactManifest } = await import("./generate-release-artifact-manifest.mjs");
const { manifest } = await writeReleaseArtifactManifest();
console.log(`Prepared release manifest: ${manifest.bundle.file_count} files, SHA-256 ${manifest.bundle.sha256}.`);
