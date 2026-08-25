import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";

const root = resolve(import.meta.dirname, "..");
const svg = await readFile(resolve(root, "public/workbench-mark.svg"), "utf8");
const source = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
const browser = await chromium.launch({ headless: true });

try {
  for (const [size, filename] of [
    [32, "favicon-32.png"],
    [180, "apple-touch-icon.png"],
  ]) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(
      `<style>*{box-sizing:border-box}html,body{margin:0;width:${size}px;height:${size}px;background:transparent}img{display:block;width:${size}px;height:${size}px}</style><img alt="" src="${source}">`,
    );
    await page.locator("img").screenshot({
      omitBackground: true,
      path: resolve(root, "public", filename),
    });
    await page.close();
  }
} finally {
  await browser.close();
}

console.log("Rendered DDUP favicon-32.png and apple-touch-icon.png from workbench-mark.svg.");
