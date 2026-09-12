import { promises as fs } from "node:fs";
import path from "node:path";
import XLSX from "xlsx";

export const LEGACY_XLSX_LIMITS = Object.freeze({
  maxFileBytes: 20 * 1024 * 1024,
  maxUncompressedBytes: 100 * 1024 * 1024,
  maxArchiveEntries: 10_000,
  maxSheets: 32,
  maxRowsPerSheet: 100_000,
  maxCells: 1_000_000,
});

const LEGACY_XLSX_ALLOWED_ROOT = "10_raw/douyin";

export class VaultXlsxError extends Error {
  constructor(code, relativePath, details = {}) {
    super(code);
    this.name = "VaultXlsxError";
    this.code = code;
    this.relativePath = relativePath || null;
    this.details = details;
  }
}

function toPosixPath(value) {
  return String(value).split(path.sep).join("/");
}

function safeRelative(root, candidate) {
  const relative = toPosixPath(path.relative(root, candidate));
  if (
    !relative ||
    relative === ".." ||
    relative.startsWith("../") ||
    path.isAbsolute(relative)
  ) {
    return null;
  }
  return relative;
}

function mergeLimits(overrides = {}) {
  const limits = { ...LEGACY_XLSX_LIMITS, ...overrides };
  for (const [name, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new TypeError(`${name} must be a positive safe integer`);
    }
  }
  return limits;
}

async function resolveControlledPath(vaultRoot, filePath) {
  const resolvedRoot = await fs.realpath(path.resolve(vaultRoot));
  let resolvedFile;
  try {
    resolvedFile = await fs.realpath(path.resolve(filePath));
  } catch (error) {
    throw new VaultXlsxError("XLSX_FILE_UNAVAILABLE", null, {
      cause: error?.code || "UNKNOWN",
    });
  }

  const relativePath = safeRelative(resolvedRoot, resolvedFile);
  const normalized = relativePath?.toLocaleLowerCase("en-US") ?? null;
  if (
    !normalized ||
    !normalized.startsWith(`${LEGACY_XLSX_ALLOWED_ROOT}/`) ||
    path.posix.extname(normalized) !== ".xlsx"
  ) {
    throw new VaultXlsxError("XLSX_PATH_NOT_ALLOWED", relativePath);
  }

  return { relativePath, resolvedFile };
}

function workbookRange(sheet) {
  const reference = sheet?.["!fullref"] || sheet?.["!ref"];
  if (!reference) return null;
  try {
    return XLSX.utils.decode_range(reference);
  } catch {
    throw new VaultXlsxError("XLSX_RANGE_INVALID", null);
  }
}

function countCells(sheet) {
  return Object.keys(sheet || {}).filter((key) => !key.startsWith("!")).length;
}

function inspectZipContainer(payload, relativePath, limits) {
  const minimumOffset = Math.max(0, payload.length - 65_557);
  let eocdOffset = -1;
  for (let offset = payload.length - 22; offset >= minimumOffset; offset -= 1) {
    if (payload.readUInt32LE(offset) === 0x06054b50) {
      eocdOffset = offset;
      break;
    }
  }
  if (eocdOffset < 0) {
    throw new VaultXlsxError("XLSX_CONTAINER_INVALID", relativePath);
  }

  const entryCount = payload.readUInt16LE(eocdOffset + 10);
  const centralSize = payload.readUInt32LE(eocdOffset + 12);
  const centralOffset = payload.readUInt32LE(eocdOffset + 16);
  if (
    entryCount === 0xffff ||
    centralSize === 0xffffffff ||
    centralOffset === 0xffffffff
  ) {
    throw new VaultXlsxError("XLSX_ZIP64_UNSUPPORTED", relativePath);
  }
  if (entryCount > limits.maxArchiveEntries) {
    throw new VaultXlsxError("XLSX_ARCHIVE_ENTRY_LIMIT_EXCEEDED", relativePath, {
      entryCount,
      maxArchiveEntries: limits.maxArchiveEntries,
    });
  }
  if (centralOffset + centralSize > eocdOffset) {
    throw new VaultXlsxError("XLSX_CONTAINER_INVALID", relativePath);
  }

  let offset = centralOffset;
  let totalUncompressedBytes = 0;
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > payload.length || payload.readUInt32LE(offset) !== 0x02014b50) {
      throw new VaultXlsxError("XLSX_CONTAINER_INVALID", relativePath);
    }
    const flags = payload.readUInt16LE(offset + 8);
    const uncompressedBytes = payload.readUInt32LE(offset + 24);
    const nameLength = payload.readUInt16LE(offset + 28);
    const extraLength = payload.readUInt16LE(offset + 30);
    const commentLength = payload.readUInt16LE(offset + 32);
    const end = offset + 46 + nameLength + extraLength + commentLength;
    if (end > payload.length || flags & 0x0001) {
      throw new VaultXlsxError("XLSX_CONTAINER_INVALID", relativePath);
    }

    const entryName = payload
      .subarray(offset + 46, offset + 46 + nameLength)
      .toString("utf8")
      .replaceAll("\\", "/");
    const normalizedName = entryName.toLocaleLowerCase("en-US");
    if (
      !entryName ||
      entryName.startsWith("/") ||
      entryName.split("/").includes("..") ||
      /^[a-z]:\//i.test(entryName)
    ) {
      throw new VaultXlsxError("XLSX_ARCHIVE_PATH_INVALID", relativePath);
    }
    if (
      normalizedName.endsWith("/vbaproject.bin") ||
      normalizedName.startsWith("xl/externallinks/") ||
      normalizedName.startsWith("xl/activex/") ||
      normalizedName.startsWith("xl/embeddings/")
    ) {
      throw new VaultXlsxError("XLSX_ACTIVE_CONTENT_REJECTED", relativePath);
    }

    totalUncompressedBytes += uncompressedBytes;
    if (totalUncompressedBytes > limits.maxUncompressedBytes) {
      throw new VaultXlsxError(
        "XLSX_UNCOMPRESSED_LIMIT_EXCEEDED",
        relativePath,
        {
          totalUncompressedBytes,
          maxUncompressedBytes: limits.maxUncompressedBytes,
        },
      );
    }
    offset = end;
  }
  if (offset !== centralOffset + centralSize) {
    throw new VaultXlsxError("XLSX_CONTAINER_INVALID", relativePath);
  }
}

/**
 * Read the single legacy XLSX surface. Inputs are treated as untrusted even
 * though callers discover them inside the local Vault.
 */
export async function readControlledLegacyWorkbook(
  vaultRoot,
  filePath,
  limitOverrides = {},
) {
  const limits = mergeLimits(limitOverrides);
  const { relativePath, resolvedFile } = await resolveControlledPath(
    vaultRoot,
    filePath,
  );
  const stats = await fs.stat(resolvedFile);
  if (!stats.isFile()) {
    throw new VaultXlsxError("XLSX_NOT_A_FILE", relativePath);
  }
  if (stats.size > limits.maxFileBytes) {
    throw new VaultXlsxError("XLSX_FILE_TOO_LARGE", relativePath, {
      sizeBytes: stats.size,
      maxFileBytes: limits.maxFileBytes,
    });
  }

  const payload = await fs.readFile(resolvedFile);
  if (
    payload.length < 4 ||
    payload[0] !== 0x50 ||
    payload[1] !== 0x4b ||
    payload[2] !== 0x03 ||
    payload[3] !== 0x04
  ) {
    throw new VaultXlsxError("XLSX_CONTAINER_INVALID", relativePath);
  }
  inspectZipContainer(payload, relativePath, limits);

  let workbook;
  try {
    workbook = XLSX.read(payload, {
      type: "buffer",
      cellFormula: false,
      cellHTML: false,
      cellNF: false,
      cellStyles: false,
      bookDeps: false,
      bookFiles: false,
      bookLinks: false,
      bookVBA: false,
      sheetRows: limits.maxRowsPerSheet + 1,
      WTF: false,
    });
  } catch {
    throw new VaultXlsxError("XLSX_PARSE_FAILED", relativePath);
  }

  if (workbook.SheetNames.length > limits.maxSheets) {
    throw new VaultXlsxError("XLSX_SHEET_LIMIT_EXCEEDED", relativePath, {
      sheetCount: workbook.SheetNames.length,
      maxSheets: limits.maxSheets,
    });
  }

  let totalCells = 0;
  const sheets = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const range = workbookRange(sheet);
    const rowCount = range ? range.e.r - range.s.r + 1 : 0;
    if (rowCount > limits.maxRowsPerSheet) {
      throw new VaultXlsxError("XLSX_ROW_LIMIT_EXCEEDED", relativePath, {
        sheetName,
        rowCount,
        maxRowsPerSheet: limits.maxRowsPerSheet,
      });
    }

    totalCells += countCells(sheet);
    if (totalCells > limits.maxCells) {
      throw new VaultXlsxError("XLSX_CELL_LIMIT_EXCEEDED", relativePath, {
        totalCells,
        maxCells: limits.maxCells,
      });
    }

    sheets.push({
      sheetName,
      rows: XLSX.utils.sheet_to_json(sheet, {
        defval: null,
        raw: true,
      }),
    });
  }

  return Object.freeze({
    relativePath,
    sheetCount: sheets.length,
    totalCells,
    sheets,
  });
}
