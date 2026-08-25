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
await import("./prepare-sites-build.mjs");
