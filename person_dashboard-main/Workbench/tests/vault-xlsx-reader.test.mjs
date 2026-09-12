import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import XLSX, { version as XLSX_VERSION } from "xlsx";
import {
  LEGACY_XLSX_LIMITS,
  readControlledLegacyWorkbook,
} from "../server/vault-xlsx-reader.mjs";

const workbenchRoot = fileURLToPath(new URL("../", import.meta.url));

async function fixture() {
  const workspace = await mkdtemp(path.join(tmpdir(), "workbench-xlsx-"));
  const vaultRoot = path.join(workspace, "vault");
  const controlledDirectory = path.join(
    vaultRoot,
    "10_raw",
    "douyin",
    "synthetic-work-001",
  );
  await mkdir(controlledDirectory, { recursive: true });
  return {
    controlledDirectory,
    vaultRoot,
    workspace,
    async cleanup() {
      await rm(workspace, { recursive: true, force: true });
    },
  };
}

async function writeWorkbook(filePath, sheets) {
  const workbook = XLSX.utils.book_new();
  for (const [name, rows] of sheets) {
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet(rows),
      name,
    );
  }
  await writeFile(filePath, XLSX.write(workbook, { bookType: "xlsx", type: "buffer" }));
}

async function rejectsWithCode(promise, code) {
  await assert.rejects(promise, (error) => {
    assert.equal(error.code, code);
    assert.doesNotMatch(JSON.stringify(error), /[A-Z]:\\\\|\/Users\//);
    return true;
  });
}

test("pins the audited SheetJS artifact and verifies its supply-chain record", async () => {
  const archive = await readFile(
    path.join(workbenchRoot, "vendor", "xlsx-0.20.3.tgz"),
  );
  const manifest = JSON.parse(
    await readFile(
      path.join(workbenchRoot, "vendor", "xlsx-0.20.3.manifest.json"),
      "utf8",
    ),
  );
  const packageManifest = JSON.parse(
    await readFile(path.join(workbenchRoot, "package.json"), "utf8"),
  );
  const lock = JSON.parse(
    await readFile(path.join(workbenchRoot, "package-lock.json"), "utf8"),
  );
  const installedManifest = JSON.parse(
    await readFile(
      path.join(workbenchRoot, "node_modules", "xlsx", "package.json"),
      "utf8",
    ),
  );

  assert.equal(archive.byteLength, manifest.sizeBytes);
  assert.equal(
    createHash("sha256").update(archive).digest("hex"),
    manifest.sha256,
  );
  assert.equal(manifest.sourceUrl, "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz");
  assert.equal(manifest.license, "Apache-2.0");
  assert.equal(manifest.hasInstallLifecycleScripts, false);
  assert.equal(manifest.packageFiles.length, 26);
  assert.equal(packageManifest.dependencies.xlsx, "file:vendor/xlsx-0.20.3.tgz");
  assert.equal(lock.packages["node_modules/xlsx"].resolved, "file:vendor/xlsx-0.20.3.tgz");
  assert.equal(installedManifest.version, "0.20.3");
  assert.equal(installedManifest.scripts.preinstall, undefined);
  assert.equal(installedManifest.scripts.install, undefined);
  assert.equal(installedManifest.scripts.postinstall, undefined);
  assert.equal(XLSX_VERSION, "0.20.3");
});

test("reads a synthetic legacy workbook deterministically with cached formula values", async () => {
  const f = await fixture();
  try {
    const filePath = path.join(f.controlledDirectory, "synthetic-metrics.xlsx");
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
      ["指标", "值"],
      ["播放量", 2],
    ]);
    sheet.B2 = { t: "n", v: 2, f: "1+1" };
    XLSX.utils.book_append_sheet(workbook, sheet, "基础数据");
    await writeFile(filePath, XLSX.write(workbook, { bookType: "xlsx", type: "buffer" }));

    const first = await readControlledLegacyWorkbook(f.vaultRoot, filePath);
    const second = await readControlledLegacyWorkbook(f.vaultRoot, filePath);
    assert.deepEqual(second, first);
    assert.equal(first.sheetCount, 1);
    assert.deepEqual(first.sheets[0].rows, [{ 指标: "播放量", 值: 2 }]);
    assert.equal(first.relativePath, "10_raw/douyin/synthetic-work-001/synthetic-metrics.xlsx");

    await writeFile(filePath, "not an xlsx archive");
    await rejectsWithCode(
      readControlledLegacyWorkbook(f.vaultRoot, filePath),
      "XLSX_CONTAINER_INVALID",
    );
    assert.deepEqual(first.sheets[0].rows, [{ 指标: "播放量", 值: 2 }]);
  } finally {
    await f.cleanup();
  }
});

test("rejects corrupt, oversized, sheet, row and cell budget violations", async () => {
  const f = await fixture();
  try {
    const corruptPath = path.join(f.controlledDirectory, "corrupt.xlsx");
    await writeFile(corruptPath, "broken");
    await rejectsWithCode(
      readControlledLegacyWorkbook(f.vaultRoot, corruptPath),
      "XLSX_CONTAINER_INVALID",
    );

    const normalPath = path.join(f.controlledDirectory, "normal.xlsx");
    await writeWorkbook(normalPath, [["Sheet1", [["a", "b"], [1, 2]]]]);
    await rejectsWithCode(
      readControlledLegacyWorkbook(f.vaultRoot, normalPath, { maxFileBytes: 64 }),
      "XLSX_FILE_TOO_LARGE",
    );
    await rejectsWithCode(
      readControlledLegacyWorkbook(f.vaultRoot, normalPath, { maxRowsPerSheet: 1 }),
      "XLSX_ROW_LIMIT_EXCEEDED",
    );
    await rejectsWithCode(
      readControlledLegacyWorkbook(f.vaultRoot, normalPath, { maxCells: 3 }),
      "XLSX_CELL_LIMIT_EXCEEDED",
    );
    await rejectsWithCode(
      readControlledLegacyWorkbook(f.vaultRoot, normalPath, { maxArchiveEntries: 1 }),
      "XLSX_ARCHIVE_ENTRY_LIMIT_EXCEEDED",
    );

    const expandedPath = path.join(f.controlledDirectory, "expanded-limit.xlsx");
    const expandedPayload = await readFile(normalPath);
    const centralHeader = expandedPayload.indexOf(
      Buffer.from([0x50, 0x4b, 0x01, 0x02]),
    );
    assert.ok(centralHeader >= 0);
    expandedPayload.writeUInt32LE(1024, centralHeader + 24);
    await writeFile(expandedPath, expandedPayload);
    await rejectsWithCode(
      readControlledLegacyWorkbook(f.vaultRoot, expandedPath, {
        maxUncompressedBytes: 512,
      }),
      "XLSX_UNCOMPRESSED_LIMIT_EXCEEDED",
    );

    const sheetsPath = path.join(f.controlledDirectory, "many-sheets.xlsx");
    await writeWorkbook(sheetsPath, [
      ["one", [[1]]],
      ["two", [[2]]],
      ["three", [[3]]],
    ]);
    await rejectsWithCode(
      readControlledLegacyWorkbook(f.vaultRoot, sheetsPath, { maxSheets: 2 }),
      "XLSX_SHEET_LIMIT_EXCEEDED",
    );
  } finally {
    await f.cleanup();
  }
});

test("enforces the documented production limits and controlled Vault allowlist", async () => {
  assert.deepEqual(LEGACY_XLSX_LIMITS, {
    maxFileBytes: 20 * 1024 * 1024,
    maxUncompressedBytes: 100 * 1024 * 1024,
    maxArchiveEntries: 10_000,
    maxSheets: 32,
    maxRowsPerSheet: 100_000,
    maxCells: 1_000_000,
  });

  const f = await fixture();
  try {
    const outsidePath = path.join(f.workspace, "outside.xlsx");
    await writeWorkbook(outsidePath, [["Sheet1", [[1]]]]);
    await rejectsWithCode(
      readControlledLegacyWorkbook(f.vaultRoot, outsidePath),
      "XLSX_PATH_NOT_ALLOWED",
    );
  } finally {
    await f.cleanup();
  }
});

test("rejects a symlink or junction that escapes the controlled Vault", async (t) => {
  const f = await fixture();
  try {
    const outsideDirectory = path.join(f.workspace, "external-source");
    await mkdir(outsideDirectory);
    const outsidePath = path.join(outsideDirectory, "escaped.xlsx");
    await writeWorkbook(outsidePath, [["Sheet1", [[1]]]]);

    const linkPath = path.join(f.controlledDirectory, "linked");
    try {
      await symlink(
        outsideDirectory,
        linkPath,
        process.platform === "win32" ? "junction" : "dir",
      );
    } catch (error) {
      if (["EPERM", "EACCES", "ENOSYS"].includes(error?.code)) {
        t.skip(`symlink creation unavailable: ${error.code}`);
        return;
      }
      throw error;
    }

    await rejectsWithCode(
      readControlledLegacyWorkbook(
        f.vaultRoot,
        path.join(linkPath, "escaped.xlsx"),
      ),
      "XLSX_PATH_NOT_ALLOWED",
    );
  } finally {
    await f.cleanup();
  }
});
