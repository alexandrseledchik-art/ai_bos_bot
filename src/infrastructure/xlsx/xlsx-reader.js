import zlib from "node:zlib";

const ZIP_CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const ZIP_LOCAL_FILE_SIGNATURE = 0x04034b50;
const ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;

function normalizePath(value) {
  return String(value || "").replace(/^\/+/, "").replace(/\\/g, "/");
}

function dirname(pathname) {
  const normalized = normalizePath(pathname);
  const index = normalized.lastIndexOf("/");
  return index === -1 ? "" : normalized.slice(0, index);
}

function resolvePath(basePath, target) {
  const cleanTarget = normalizePath(target);
  if (cleanTarget.startsWith("xl/")) {
    return cleanTarget;
  }

  const baseDir = dirname(basePath);
  const parts = `${baseDir}/${cleanTarget}`.split("/");
  const resolved = [];

  for (const part of parts) {
    if (!part || part === ".") {
      continue;
    }
    if (part === "..") {
      resolved.pop();
      continue;
    }
    resolved.push(part);
  }

  return resolved.join("/");
}

function findEndOfCentralDirectory(buffer) {
  const minOffset = Math.max(0, buffer.length - 0xffff - 22);
  for (let offset = buffer.length - 22; offset >= minOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE) {
      return offset;
    }
  }

  throw new Error("XLSX ZIP directory not found.");
}

function readZipEntries(buffer) {
  const eocdOffset = findEndOfCentralDirectory(buffer);
  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);
  const entries = new Map();
  let offset = centralDirectoryOffset;

  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(offset) !== ZIP_CENTRAL_DIRECTORY_SIGNATURE) {
      throw new Error("Invalid XLSX central directory entry.");
    }

    const compressionMethod = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const fileName = buffer.slice(offset + 46, offset + 46 + fileNameLength).toString("utf8");

    entries.set(normalizePath(fileName), {
      compressionMethod,
      compressedSize,
      localHeaderOffset
    });

    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
}

function readZipFile(buffer, entries, fileName) {
  const entry = entries.get(normalizePath(fileName));
  if (!entry) {
    return "";
  }

  const offset = entry.localHeaderOffset;
  if (buffer.readUInt32LE(offset) !== ZIP_LOCAL_FILE_SIGNATURE) {
    throw new Error(`Invalid XLSX local file header: ${fileName}`);
  }

  const fileNameLength = buffer.readUInt16LE(offset + 26);
  const extraLength = buffer.readUInt16LE(offset + 28);
  const dataStart = offset + 30 + fileNameLength + extraLength;
  const compressed = buffer.slice(dataStart, dataStart + entry.compressedSize);

  if (entry.compressionMethod === 0) {
    return compressed.toString("utf8");
  }

  if (entry.compressionMethod === 8) {
    return zlib.inflateRawSync(compressed).toString("utf8");
  }

  throw new Error(`Unsupported XLSX compression method ${entry.compressionMethod} for ${fileName}.`);
}

function decodeXml(value) {
  return String(value || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function attrValue(xml, attrName) {
  const match = String(xml || "").match(new RegExp(`\\s${attrName}="([^"]*)"`, "i"));
  return match ? decodeXml(match[1]) : "";
}

function stripXmlTags(value) {
  return decodeXml(String(value || "").replace(/<[^>]+>/g, ""));
}

function parseSharedStrings(xml) {
  if (!xml) {
    return [];
  }

  const strings = [];
  const siMatches = xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g);
  for (const match of siMatches) {
    const textParts = [...match[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)]
      .map((item) => decodeXml(item[1]));
    strings.push(textParts.length ? textParts.join("") : stripXmlTags(match[1]));
  }

  return strings;
}

function parseRelationships(xml) {
  const relationships = new Map();
  for (const match of String(xml || "").matchAll(/<Relationship\b[^>]*\/?>/g)) {
    const raw = match[0];
    const id = attrValue(raw, "Id");
    const target = attrValue(raw, "Target");
    if (id && target) {
      relationships.set(id, target);
    }
  }

  return relationships;
}

function parseWorkbookSheets(xml, rels) {
  const sheets = [];
  for (const match of String(xml || "").matchAll(/<sheet\b[^>]*\/?>/g)) {
    const raw = match[0];
    const name = attrValue(raw, "name");
    const relId = attrValue(raw, "r:id") || attrValue(raw, "id");
    const target = rels.get(relId);
    if (name && target) {
      sheets.push({
        name,
        path: resolvePath("xl/workbook.xml", target)
      });
    }
  }

  return sheets;
}

function columnIndexFromRef(cellRef) {
  const letters = String(cellRef || "").match(/^[A-Z]+/i)?.[0] || "";
  let index = 0;
  for (const letter of letters.toUpperCase()) {
    index = index * 26 + (letter.charCodeAt(0) - 64);
  }
  return Math.max(0, index - 1);
}

function parseCellValue(cellXml, sharedStrings) {
  const type = attrValue(cellXml, "t");

  if (type === "inlineStr") {
    const inline = cellXml.match(/<is\b[^>]*>([\s\S]*?)<\/is>/)?.[1] || "";
    const textParts = [...inline.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((item) => decodeXml(item[1]));
    return textParts.join("");
  }

  const rawValue = cellXml.match(/<v\b[^>]*>([\s\S]*?)<\/v>/)?.[1];
  if (rawValue === undefined) {
    return "";
  }

  const decoded = decodeXml(rawValue);
  if (type === "s") {
    return sharedStrings[Number(decoded)] || "";
  }

  if (type === "str") {
    return decoded;
  }

  const number = Number(decoded);
  return Number.isFinite(number) && decoded.trim() !== "" ? number : decoded;
}

function parseSheetRows(xml, sharedStrings) {
  const rows = [];
  for (const rowMatch of String(xml || "").matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const rowCells = [];
    let fallbackIndex = 0;
    for (const cellMatch of rowMatch[1].matchAll(/<c\b[^>]*>([\s\S]*?)<\/c>/g)) {
      const cellXml = cellMatch[0];
      const cellRef = attrValue(cellXml, "r");
      const index = cellRef ? columnIndexFromRef(cellRef) : fallbackIndex;
      rowCells[index] = parseCellValue(cellXml, sharedStrings);
      fallbackIndex = index + 1;
    }

    while (rowCells.length && (rowCells[rowCells.length - 1] === "" || rowCells[rowCells.length - 1] === undefined)) {
      rowCells.pop();
    }

    rows.push(rowCells.map((item) => item ?? ""));
  }

  return rows;
}

export function readXlsxWorkbook(input) {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input || "");
  const entries = readZipEntries(buffer);
  const workbookXml = readZipFile(buffer, entries, "xl/workbook.xml");
  const workbookRelsXml = readZipFile(buffer, entries, "xl/_rels/workbook.xml.rels");
  const sharedStrings = parseSharedStrings(readZipFile(buffer, entries, "xl/sharedStrings.xml"));
  const relationships = parseRelationships(workbookRelsXml);
  const sheets = parseWorkbookSheets(workbookXml, relationships);

  return {
    sheets: sheets.map((sheet) => ({
      name: sheet.name,
      rows: parseSheetRows(readZipFile(buffer, entries, sheet.path), sharedStrings)
    }))
  };
}

