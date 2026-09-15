import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { createDependencyInventory } from "../scripts/generate-release-inventory.mjs";

const workbenchRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("release dependency inventory is deterministic, privacy-safe and keeps review gaps explicit", async () => {
  const inventory = await createDependencyInventory({ root: workbenchRoot });
  const names = new Set(inventory.components.map(({ name }) => name));
  const serialized = JSON.stringify(inventory);

  assert.equal(inventory.schema, "ddup-release-dependency-inventory/v1");
  assert.ok(names.has("react"));
  assert.ok(names.has("xlsx"));
  assert.equal(names.has("@playwright/test"), false);
  assert.ok(inventory.summary.components > inventory.summary.installed);
  assert.ok(inventory.summary.review_required > 0);
  assert.equal(serialized.includes(workbenchRoot), false);
  assert.equal(serialized.includes("E:\\"), false);
});
