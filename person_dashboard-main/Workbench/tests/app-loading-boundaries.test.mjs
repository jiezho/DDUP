import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appUrl = new URL("../src/App.jsx", import.meta.url);

test("loads routes and optional overlays behind explicit suspense boundaries", async () => {
  const source = await readFile(appUrl, "utf8");

  assert.match(source, /import \{ lazy, Suspense,/);
  assert.doesNotMatch(source, /from "\.\/pages\//);
  for (const moduleName of [
    "TodayPage",
    "ProjectsPage",
    "ContextLibraryPage",
    "RuntimePage",
    "ProfessionalPage",
    "GrowthPage",
    "SocialInsightsPage",
    "PrototypeApp",
  ]) {
    assert.ok(source.includes(`import("./${moduleName === "PrototypeApp" ? "prototype" : "pages"}/${moduleName}")`));
  }
  assert.match(source, /searchOpen \? \([\s\S]*?<Suspense[\s\S]*?<SearchPalette/);
  assert.match(source, /selectedDocumentId \? \([\s\S]*?<Suspense[\s\S]*?<DocumentDrawer/);
  assert.match(source, /role="status" aria-live="polite"/);
});
