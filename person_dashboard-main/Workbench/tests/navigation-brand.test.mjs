import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appShellUrl = new URL("../src/components/AppShell.jsx", import.meta.url);
const prototypeUrl = new URL("../src/prototype/PrototypeApp.jsx", import.meta.url);
const markUrl = new URL("../public/workbench-mark.svg", import.meta.url);
const indexUrl = new URL("../index.html", import.meta.url);

test("sidebar presents media data as a parent with Douyin as a child route", async () => {
  const source = await readFile(appShellUrl, "utf8");

  assert.match(source, /<span>媒体数据<\/span>/);
  assert.match(source, /const mediaNavigation = \[/);
  assert.match(source, /to: "\/douyin", label: "抖音数据"/);
  assert.match(source, /sidebar__nav-item--child/);
});

test("DDUP brand uses the project wordmark and a vector double-D mark", async () => {
  const [shell, prototype, mark, index] = await Promise.all([
    readFile(appShellUrl, "utf8"),
    readFile(prototypeUrl, "utf8"),
    readFile(markUrl, "utf8"),
    readFile(indexUrl, "utf8"),
  ]);

  assert.equal((shell.match(/<span>DDUP<\/span>/g) || []).length, 2);
  assert.match(shell, /Good Good Study  Day Day Up/);
  assert.equal((prototype.match(/<strong>DDUP<\/strong>/g) || []).length, 2);
  assert.match(prototype, /Good Good Study  Day Day Up/);
  assert.equal((prototype.match(/src="\/workbench-mark\.svg"/g) || []).length, 2);
  assert.match(mark, /linearGradient id="dd-up"/);
  assert.match(mark, /M16\.5 16\.5v31/);
  assert.match(index, /<title>DDUP · 个人上下文智能工作台<\/title>/);
});
