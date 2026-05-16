const GOOGLE_SHEETS_EXPORT_BASE = "https://docs.google.com/spreadsheets/d";

function stripBom(value) {
  return String(value || "").replace(/^\uFEFF/, "");
}

export function extractSpreadsheetId(value = "") {
  const trimmed = String(value || "").trim();
  const match = trimmed.match(/\/spreadsheets\/d\/([^/]+)/);
  return match ? match[1] : trimmed;
}

export function buildGoogleSheetCsvExportUrl({ spreadsheetId, gid }) {
  const id = extractSpreadsheetId(spreadsheetId);
  if (!id) {
    throw new Error("Google Sheet spreadsheet id is required.");
  }

  const url = new URL(`${GOOGLE_SHEETS_EXPORT_BASE}/${id}/export`);
  url.searchParams.set("format", "csv");
  if (gid !== undefined && gid !== null && String(gid).trim()) {
    url.searchParams.set("gid", String(gid).trim());
  }

  return url.toString();
}

export function normalizeCsvHeader(value) {
  return stripBom(value)
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        cell += '"';
        index += 1;
        continue;
      }

      if (char === '"') {
        inQuotes = false;
        continue;
      }

      cell += char;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === ",") {
      row.push(cell);
      cell = "";
      continue;
    }

    if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    if (char === "\r") {
      continue;
    }

    cell += char;
  }

  row.push(cell);
  if (row.some((item) => String(item || "").trim())) {
    rows.push(row);
  }

  return rows;
}

export function csvRowsToObjects(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return [];
  }

  const headers = rows[0].map(normalizeCsvHeader);

  return rows.slice(1).map((cells, index) => {
    const result = {
      sourceRow: index + 2
    };

    for (let column = 0; column < headers.length; column += 1) {
      const header = headers[column];
      if (!header) {
        continue;
      }
      result[header] = String(cells[column] || "").trim();
    }

    return result;
  });
}

export function pickCsvValue(row, aliases = []) {
  for (const alias of aliases) {
    const key = normalizeCsvHeader(alias);
    const value = row?.[key];
    if (value !== undefined && String(value).trim()) {
      return String(value).trim();
    }
  }

  return "";
}

export async function readGoogleSheetToolsCsv({
  spreadsheetId,
  gid,
  csvUrl = "",
  fetchImpl = fetch
} = {}) {
  const url = csvUrl || buildGoogleSheetCsvExportUrl({ spreadsheetId, gid });
  const response = await fetchImpl(url);

  if (!response.ok) {
    throw new Error(`Google Sheet CSV export failed: ${response.status} ${await response.text()}`);
  }

  const text = await response.text();
  return {
    url,
    rows: csvRowsToObjects(parseCsv(text)),
    rawTextLength: text.length
  };
}
