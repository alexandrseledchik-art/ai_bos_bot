import { CONSULTANT_MVP_LAYERS } from "../domain/consultant-mvp-schema.js";
import { readXlsxWorkbook } from "../infrastructure/xlsx/xlsx-reader.js";

const LAYER_ALIASES = new Map([
  ["контур собственника", "owner_context"],
  ["внешняя среда", "external_environment"],
  ["внешняя среда и экосистема", "external_environment"],
  ["стратегия", "strategy"],
  ["продукт", "product"],
  ["продукт и ценностное предложение", "product"],
  ["коммерция", "commercial"],
  ["операции", "operations"],
  ["операционная модель", "operations"],
  ["финансы", "finance"],
  ["команда", "team"],
  ["люди и организация", "team"],
  ["управление", "governance"],
  ["управление и риски", "governance"],
  ["технологии", "technology"],
  ["данные", "data_analytics"],
  ["данные и аналитика", "data_analytics"]
]);

const LAYER_NAMES = new Map(CONSULTANT_MVP_LAYERS.map((layer) => [layer.code, layer.name]));
const LAYER_ORDER = new Map(CONSULTANT_MVP_LAYERS.map((layer, index) => [layer.code, index]));

function cleanText(value) {
  return String(value ?? "").trim();
}

function normalizeText(value) {
  return cleanText(value).toLowerCase().replace(/\s+/g, " ");
}

function asNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const normalized = cleanText(value).replace(",", ".");
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function compact(value, maxLength = 220) {
  const text = cleanText(value).replace(/\s+/g, " ");
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trim()}…` : text;
}

function sheetByName(workbook, sheetName) {
  const normalized = normalizeText(sheetName);
  return workbook.sheets.find((sheet) => normalizeText(sheet.name) === normalized) || null;
}

function cell(row, index) {
  return row?.[index] ?? "";
}

function normalizeLayerCode(layerName) {
  const normalized = normalizeText(layerName);
  return LAYER_ALIASES.get(normalized) || "";
}

function parseCompanyProfile(workbook) {
  const sheet = sheetByName(workbook, "О компании");
  if (!sheet) {
    return {};
  }

  const profile = {};
  for (const row of sheet.rows.slice(1)) {
    const question = cleanText(cell(row, 0));
    const answer = cleanText(cell(row, 1));
    if (question || answer) {
      profile[question || "без вопроса"] = answer;
    }
  }

  return profile;
}

function headerIndex(headerRow, names) {
  const normalizedNames = names.map(normalizeText);
  return (headerRow || []).findIndex((header) => normalizedNames.includes(normalizeText(header)));
}

function parseMaturityMatrix(workbook) {
  const sheet = sheetByName(workbook, "Матрица зрелости");
  if (!sheet) {
    return {
      layerScores: [],
      domainRows: [],
      subdomainRows: [],
      allRows: []
    };
  }

  const header = sheet.rows[0] || [];
  const indexes = {
    layerName: headerIndex(header, ["Название уровня"]),
    levelType: headerIndex(header, ["Подуровень"]),
    nodeName: headerIndex(header, ["Название подуровня"]),
    score: headerIndex(header, ["Оценка зрелости"]),
    gap: headerIndex(header, ["Гэп до 3"]),
    status: headerIndex(header, ["Статус"])
  };

  const rows = [];
  for (const row of sheet.rows.slice(1)) {
    const layerName = cleanText(cell(row, indexes.layerName));
    const levelType = cleanText(cell(row, indexes.levelType));
    const nodeName = cleanText(cell(row, indexes.nodeName));
    const score = asNumber(cell(row, indexes.score));
    const layerCode = normalizeLayerCode(layerName);

    if (!layerName || !levelType || !nodeName) {
      continue;
    }

    rows.push({
      layerCode,
      layerName,
      levelType,
      nodeName,
      score,
      gapToThree: asNumber(cell(row, indexes.gap)),
      status: cleanText(cell(row, indexes.status))
    });
  }

  const layerScores = rows
    .filter((row) => row.levelType === "Слой" && row.layerCode)
    .map((row) => ({
      layerCode: row.layerCode,
      layerName: LAYER_NAMES.get(row.layerCode) || row.layerName,
      score: row.score,
      status: row.status,
      gapToThree: row.gapToThree
    }))
    .sort((left, right) => (LAYER_ORDER.get(left.layerCode) ?? 99) - (LAYER_ORDER.get(right.layerCode) ?? 99));

  return {
    layerScores,
    domainRows: rows.filter((row) => row.levelType === "Домен"),
    subdomainRows: rows.filter((row) => row.levelType === "Поддомен"),
    allRows: rows
  };
}

function formatScore(score) {
  return score === null || score === undefined ? "нет оценки" : Number(score).toFixed(2).replace(/\.00$/, "");
}

function layerScoreLine(item) {
  return `${item.layerName}: ${formatScore(item.score)}${item.status ? ` (${item.status})` : ""}`;
}

function weakestSubdomains(matrix, limit = 18) {
  return matrix.subdomainRows
    .filter((row) => row.layerCode && row.score !== null)
    .sort((left, right) => left.score - right.score)
    .slice(0, limit)
    .map((row) => ({
      layerCode: row.layerCode,
      layerName: LAYER_NAMES.get(row.layerCode) || row.layerName,
      name: row.nodeName,
      score: row.score,
      status: row.status,
      gapToThree: row.gapToThree
    }));
}

function strongestSubdomains(matrix, limit = 10) {
  return matrix.subdomainRows
    .filter((row) => row.layerCode && row.score !== null)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map((row) => ({
      layerCode: row.layerCode,
      layerName: LAYER_NAMES.get(row.layerCode) || row.layerName,
      name: row.nodeName,
      score: row.score,
      status: row.status
    }));
}

function upperFrameIsWeak(layerScores) {
  const byLayer = new Map(layerScores.map((item) => [item.layerCode, item.score]));
  return ["owner_context", "external_environment", "strategy"].some((layerCode) => {
    const score = byLayer.get(layerCode);
    return score !== null && score !== undefined && score < 2;
  });
}

function buildDiagnosticText({ profile, matrix, weak, strong }) {
  const layerScoresText = matrix.layerScores.map(layerScoreLine).join("\n");
  const weakText = weak
    .map((item) => `- ${item.layerName} / ${item.name}: ${formatScore(item.score)}${item.status ? ` (${item.status})` : ""}`)
    .join("\n");
  const strongText = strong
    .map((item) => `- ${item.layerName} / ${item.name}: ${formatScore(item.score)}${item.status ? ` (${item.status})` : ""}`)
    .join("\n");

  const profileLines = Object.entries(profile)
    .filter(([, answer]) => cleanText(answer))
    .map(([question, answer]) => `${question}: ${compact(answer, 180)}`)
    .join("\n");

  const upperFrameNote = upperFrameIsWeak(matrix.layerScores)
    ? [
        "Верхняя рамка требует проверки: контур собственника, внешняя среда, рынок, спрос, конкуренты, стратегия, позиционирование и модель роста.",
        "Если эти условия игры не прояснены, финансы, операции, команда и данные могут быть не корнем, а следствием невыбранной игры.",
        "При этом можно параллельно запускать управленческую отчётность, карту ролей и описание текущего потока, потому что они собирают факты и не фиксируют стратегию преждевременно."
      ].join("\n")
    : "";

  return [
    "Глубокая диагностика архитектуры бизнеса.",
    profileLines ? `\nПрофиль компании:\n${profileLines}` : "",
    layerScoresText ? `\nОценки 11 слоёв:\n${layerScoresText}` : "",
    weakText ? `\nСамые слабые поддомены:\n${weakText}` : "",
    strongText ? `\nСильные или относительно сильные поддомены:\n${strongText}` : "",
    upperFrameNote ? `\nДиагностический вывод по верхней рамке:\n${upperFrameNote}` : ""
  ].filter(Boolean).join("\n");
}

export function importDeepDiagnosticXlsx(input) {
  const workbook = readXlsxWorkbook(input);
  const profile = parseCompanyProfile(workbook);
  const matrix = parseMaturityMatrix(workbook);
  const weak = weakestSubdomains(matrix);
  const strong = strongestSubdomains(matrix);
  const contentText = buildDiagnosticText({ profile, matrix, weak, strong });

  return {
    profile,
    layerScores: matrix.layerScores,
    weakestSubdomains: weak,
    strongestSubdomains: strong,
    contentText,
    summary: {
      sheets: workbook.sheets.map((sheet) => sheet.name),
      layerScoreCount: matrix.layerScores.length,
      scoredSubdomainCount: matrix.subdomainRows.filter((row) => row.score !== null).length,
      weakestSubdomains: weak.slice(0, 8),
      strongestSubdomains: strong.slice(0, 5)
    }
  };
}

