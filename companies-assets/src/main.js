import { initWorkspaceChat } from "./workspace-chat.js?v=20260512-1";

const TOKEN_KEY = "aibos_companies_token";

const state = {
  token: localStorage.getItem(TOKEN_KEY) || "",
  companies: [],
  selectedCompanyId: "",
  selectedDetail: null,
  methodology: null,
  toolSearch: "",
  loading: false
};

const tokenPanel = document.querySelector("#tokenPanel");
const tokenForm = document.querySelector("#tokenForm");
const tokenInput = document.querySelector("#tokenInput");
const tokenHint = document.querySelector("#tokenHint");
const workspace = document.querySelector("#workspace");
const companyList = document.querySelector("#companyList");
const content = document.querySelector("#content");
const logoutButton = document.querySelector("#logoutButton");
const refreshButton = document.querySelector("#refreshButton");
const newCompanyButton = document.querySelector("#newCompanyButton");
const siteNavLinks = [...document.querySelectorAll("[data-site-view]")];

const SITE_VIEWS = new Set(["architecture", "tools", "maturity", "guide"]);

const LAYER_LABELS = {
  owner_context: "Контур собственника",
  external_environment: "Внешняя среда",
  strategy: "Стратегия",
  product: "Продукт",
  commercial: "Коммерция",
  operations: "Операции",
  finance: "Финансы",
  team: "Команда",
  governance: "Управление",
  technology: "Технологии",
  data_analytics: "Данные и аналитика"
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value) {
  if (!value) {
    return "нет";
  }
  try {
    return new Intl.DateTimeFormat("ru-RU", {
      dateStyle: "short",
      timeStyle: "short"
    }).format(new Date(value));
  } catch {
    return String(value);
  }
}

function confidenceClass(value) {
  if (value === "HIGH") {
    return "green";
  }
  if (value === "MEDIUM") {
    return "orange";
  }
  return "";
}

function confidenceLabel(value) {
  if (value === "HIGH") {
    return "много сигналов";
  }
  if (value === "MEDIUM") {
    return "есть сигналы";
  }
  return "сигналов мало";
}

function coverageClass(percent) {
  if (percent >= 70) {
    return "green";
  }
  if (percent > 0) {
    return "orange";
  }
  return "";
}

function coverageLabel(percent) {
  if (percent >= 70) {
    return "хорошо заполнено";
  }
  if (percent >= 35) {
    return "заполнено частично";
  }
  if (percent > 0) {
    return "заполнено мало";
  }
  return "данных нет";
}

function conclusionConfidenceLabel(value) {
  if (value === "HIGH") {
    return "вывод хорошо подтверждён";
  }
  if (value === "MEDIUM") {
    return "вывод рабочий, нужны факты";
  }
  if (value === "LOW") {
    return "вывод предварительный";
  }
  return "без анализа";
}

function diagnosticQualityLabel(score) {
  if (score == null) {
    return "";
  }

  return `логика разбора: ${score}/10`;
}

function asArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function cleanHumanText(value) {
  return String(value ?? "")
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function csvParts(value) {
  return cleanHumanText(value)
    .replace(/^["']|["']$/g, "")
    .split(",")
    .map((part) => part.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean);
}

function humanizeEvidenceItem(item) {
  const original = cleanHumanText(item);
  if (!original) {
    return "";
  }

  const withoutNoise = original
    .replace(/"{2,}/g, "\"")
    .replace(/,{2,}/g, ",")
    .replace(/,+$/g, "")
    .replace(/\s+,/g, ",")
    .trim();

  const parts = csvParts(withoutNoise);
  const lower = withoutNoise.toLowerCase();

  if (
    parts.length >= 4 &&
    /сегмент|профиль|выруч|роль|запрос|продукт|марж|канал|клиент/i.test(withoutNoise) &&
    parts.every((part) => part.length <= 48)
  ) {
    return `В источнике есть таблица с полями: ${parts.slice(0, 8).join(", ")}.`;
  }

  if (/^сегмент\s+[a-zа-я]/i.test(withoutNoise.replace(/^["']/, ""))) {
    return `Описан клиентский сегмент: ${withoutNoise.replace(/^["']|["']$/g, "")}.`;
  }

  if (lower.includes("ikigai") || lower.includes("икигай")) {
    return `Есть артефакт про смысл, фокус и сильную сторону бизнеса: ${withoutNoise.replace(/\.$/, "")}.`;
  }

  if (lower.includes("customer & jobs") || lower.includes("customer jobs")) {
    return `Есть карта клиентов и задач, которые они решают: ${withoutNoise}.`;
  }

  if (lower.includes("customer journey")) {
    return `Есть карта пути клиента: ${withoutNoise}.`;
  }

  if (parts.length >= 5) {
    return `В источнике перечислены: ${parts.slice(0, 8).join(", ")}.`;
  }

  return withoutNoise;
}

function humanizeMissingField(value) {
  const text = cleanHumanText(value);
  if (!text) {
    return "";
  }

  const dictionary = {
    "owner goal": "цель собственника",
    "goal": "цель",
    "horizon": "горизонт",
    "role": "роль",
    "strategy": "стратегия",
    "icp": "портрет целевого клиента",
    "unit economics": "экономика сделки",
    "cash flow": "движение денег",
    "decision rights": "кто принимает какие решения"
  };

  return dictionary[text.toLowerCase()] || text;
}

function humanizeBusinessLanguage(value) {
  let text = cleanHumanText(value);
  if (!text) {
    return "";
  }

  const replacements = [
    [/слаб(?:ая|ую|ой)\s+верхн(?:яя|юю|ей)\s+рамк[ауеи]/gi, "не до конца ясные главные ориентиры"],
    [/верхн(?:яя|юю|ей)\s+рамк[ауеи]/gi, "главные ориентиры"],
    [/общ(?:ая|ую|ей)\s+рамк[ауеи]/gi, "общую картину"],
    [/рабоч(?:ая|ую|ей)\s+рамк[ауеи]/gi, "рабочую картину"],
    [/собрать\s+рамк[ауеи]\s+собственник-рынок/gi, "сформулировать цель собственника и выбрать клиентские сегменты"],
    [/собрать\s+рамк[ауеи]\s+собственника/gi, "сформулировать цель, горизонт и ограничения собственника"],
    [/рамк[ауеи]\s+собственник-рынок/gi, "цель собственника и карту клиентских сегментов"],
    [/рамк[ауеи]\s+собственника/gi, "цель, горизонт и ограничения собственника"],
    [/рамк[ауеи]\s+сравнения/gi, "точку сравнения"],
    [/условия\s+игры:\s*собственник,\s*рынок\s+и\s+стратегия/gi, "цель собственника, рынок и стратегия"],
    [/условия\s+игры/gi, "главные ориентиры бизнеса"],
    [/нижн(?:их|ие|ими)\s+просад(?:ок|ки|ками)/gi, "слабых мест ниже по системе"],
    [/просад(?:ок|ки|ками)/gi, "слабых мест"],
    [/невыбранн(?:ой|ую|ая|ого)\s+игр(?:ы|у|а|ой)/gi, "невыбранного направления"],
    [/невыбранн(?:ой|ую|ая|ого)\s+модел(?:и|ь|ью)/gi, "неясной модели работы"],
    [/какую\s+игру\s+компания\s+выбирает/gi, "какое направление компания выбирает"],
    [/какой\s+игрой\s+занимается\s+компания/gi, "в каком направлении развивается компания"],
    [/игра\s+сверху\s+не\s+выбрана/gi, "главное направление ещё не выбрано"],
    [/слоем\s+выше/gi, "более общей причиной"],
    [/верхн(?:ий|его|ему)\s+уров(?:ень|ня|ню)/gi, "более общий уровень"],
    [/нижн(?:ий|его|ему|их)\s+сло(?:й|я|ю|ёв)/gi, "практические области ниже по системе"]
  ];

  for (const [pattern, replacement] of replacements) {
    text = text.replace(pattern, replacement);
  }

  return text;
}

function renderSmallList(items, emptyText = "Пока нет данных.", formatter = (item) => item) {
  const rows = asArray(items)
    .map((item) => formatter(item))
    .map((item) => humanizeBusinessLanguage(item))
    .filter((item) => String(item || "").trim());
  if (!rows.length) {
    return `<p class="hint-text">${escapeHtml(emptyText)}</p>`;
  }

  return `
    <ul class="split-list compact-list">
      ${rows.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
    </ul>
  `;
}

function renderRejectedRows(rejected = []) {
  const rows = asArray(rejected).slice(0, 4);
  if (!rows.length) {
    return `<p class="hint-text">Пока нет сильных альтернатив основной версии.</p>`;
  }

  return `
    <ul class="split-list compact-list">
      ${rows.map((item) => `<li><strong>${escapeHtml(item.layerName || item.layer || "Версия")}</strong> — ${escapeHtml(humanizeBusinessLanguage(item.reason || "объясняет запрос слабее основной версии"))}</li>`).join("")}
    </ul>
  `;
}

function layerLabel(layer) {
  return layer?.layerName || LAYER_LABELS[layer?.layerCode] || layer?.layerCode || "Слой";
}

function normalizeLookup(value) {
  return String(value || "")
    .toLowerCase()
    .replaceAll("ё", "е")
    .replace(/[^а-яa-z0-9]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function lookupTokens(value) {
  const stopWords = new Set([
    "для",
    "или",
    "как",
    "что",
    "это",
    "при",
    "над",
    "под",
    "карта",
    "канва",
    "документ",
    "матрица",
    "шаблон",
    "the",
    "and",
    "with",
    "map",
    "canvas"
  ]);
  return normalizeLookup(value)
    .split(" ")
    .filter((token) => token.length >= 4 && !stopWords.has(token));
}

function domainsOverlap(left, right) {
  const leftText = normalizeLookup(left);
  const rightText = normalizeLookup(right);
  if (!leftText || !rightText) {
    return false;
  }

  if (leftText.includes(rightText) || rightText.includes(leftText)) {
    return true;
  }

  const leftTokens = new Set(lookupTokens(leftText));
  return lookupTokens(rightText).some((token) => leftTokens.has(token));
}

function sourceToolMatches(source) {
  if (isReferenceCatalogSource(source)) {
    return [];
  }

  return Array.isArray(source?.sourceMeta?.toolMatches) ? source.sourceMeta.toolMatches : [];
}

function sourceContentMatches(source) {
  if (isReferenceCatalogSource(source)) {
    return [];
  }

  return Array.isArray(source?.sourceMeta?.contentMatches) ? source.sourceMeta.contentMatches : [];
}

function sourceMatchesLayerByTool(source, layerCode) {
  const matches = sourceToolMatches(source);
  return matches.some((match) => match.layerId === layerCode);
}

function sourceMatchesLayerByContent(source, layerCode) {
  return sourceContentMatches(source).some((match) => match.layerId === layerCode);
}

function itemSubdomain(item) {
  return item?.subdomain || item?.domain || "";
}

function itemParentDomain(item) {
  return item?.parentDomain || "Без домена";
}

function sourceMatchCoversArchitectureItem(match, item) {
  return match.layerId === item.layerCode && domainsOverlap(match.subdomain || match.domain, itemSubdomain(item));
}

function sourceArchitectureItemMatches(source, item) {
  return sourceToolMatches(source).filter((match) => sourceMatchCoversArchitectureItem(match, item));
}

function sourceArchitectureContentMatches(source, item) {
  return sourceContentMatches(source).filter((match) => sourceMatchCoversArchitectureItem(match, item));
}

function sourceReadableContent(source) {
  return [source?.contentText, source?.aiSummary].filter(Boolean).join(" ");
}

function isReferenceCatalogSource(source) {
  const title = normalizeLookup(source?.title || "");
  const fileUrl = normalizeLookup(source?.fileUrl || "");
  const content = normalizeLookup(sourceReadableContent(source));
  const joined = [title, fileUrl, content].filter(Boolean).join(" ");

  const titleSignals = [
    "сводная таблица инструментов",
    "карта инструментов",
    "business architecture tools map",
    "business_architecture_tools_map",
    "архитектурная карта инструментов"
  ];

  if (titleSignals.some((signal) => joined.includes(normalizeLookup(signal)))) {
    return true;
  }

  const markers = [
    "инструмент методология",
    "домен поддомен",
    "ссылка на инструмент",
    "когда применять",
    "применять",
    "статус",
    "результат",
    "слой"
  ];

  return markers.reduce((count, marker) => count + Number(content.includes(normalizeLookup(marker))), 0) >= 5;
}

function sourceWordCount(source) {
  return normalizeLookup(sourceReadableContent(source))
    .split(" ")
    .filter((token) => token.length >= 3).length;
}

function sourceBusinessDetailScore(source) {
  const text = normalizeLookup(sourceReadableContent(source));
  const detailSignals = [
    /\d/,
    /руб|млн|тыс/,
    /цель|горизонт|мисси|видени|ценност|смысл|сильн/,
    /сегмент|рынк|спрос|конкурент|клиент/,
    /выруч|марж|прибыл|cash|деньг/,
    /роль|ответствен|команд|решени|процесс/,
    /канал|заявк|лид|воронк|продаж/,
    /вывод|риск|огранич|следующ|приоритет/
  ];

  return detailSignals.reduce((count, pattern) => count + Number(pattern.test(text)), 0);
}

function contentMatchQuality(contentMatches = []) {
  if (contentMatches.some((match) => match.contentQuality === "sufficient")) {
    return "sufficient";
  }
  if (contentMatches.some((match) => match.contentQuality === "partial")) {
    return "partial";
  }
  return "";
}

function assessSourceFillingForItem({ source, item, contentMatches = [] }) {
  const explicitQuality = contentMatchQuality(contentMatches);
  const words = sourceWordCount(source);
  const detailScore = sourceBusinessDetailScore(source);
  const hasText = Boolean(sourceReadableContent(source).trim());

  if (!hasText) {
    return {
      status: "unreadable",
      label: "текст не прочитан",
      summary: "Название файла похоже на нужный инструмент, но текст внутри не извлечён. По одному названию нельзя считать строку закрытой.",
      missing: ["нужно открыть файл или добавить текстовое содержимое"]
    };
  }

  if (explicitQuality === "sufficient") {
    return {
      status: "sufficient",
      label: "заполнение подтверждено",
      summary: "Внутри есть данные, которые совпадают с описанием строки и похожи на заполненный инструмент.",
      reasons: contentMatches.flatMap((match) => match.qualityReasons || []).slice(0, 3)
    };
  }

  if (explicitQuality === "partial" || (words >= 12 && detailScore >= 2)) {
    const missing = contentMatches.flatMap((match) => match.missingEvidence || []).filter(Boolean);
    return {
      status: "partial",
      label: "нужно дополнить",
      summary: "Артефакт не пустой, но пока не видно полного результата по описанию и ожидаемому итогу строки.",
      missing: missing.length ? missing.slice(0, 3) : [
        item.expectedResult ? `проверить, есть ли результат: ${item.expectedResult}` : "добавить явный вывод по инструменту",
        item.description ? `сверить с описанием: ${item.description}` : "добавить данные по смыслу строки"
      ]
    };
  }

  return {
    status: "insufficient",
    label: "не подтверждает строку",
    summary: "Файл найден, но в прочитанном тексте пока нет достаточного содержания по этой строке карты.",
    missing: [
      item.description ? `добавить данные по описанию: ${item.description}` : "добавить данные по описанию строки",
      item.expectedResult ? `зафиксировать ожидаемый результат: ${item.expectedResult}` : "зафиксировать результат инструмента"
    ].slice(0, 2)
  };
}

function architectureItemEvidence(item, sources) {
  const directArtifacts = sources
    .map((source) => ({
      source,
      matches: sourceArchitectureItemMatches(source, item),
      contentMatches: sourceArchitectureContentMatches(source, item)
    }))
    .filter((entry) => entry.matches.length)
    .map((entry) => ({
      ...entry,
      quality: assessSourceFillingForItem({
        source: entry.source,
        item,
        contentMatches: entry.contentMatches
      })
    }));
  const confirmedArtifacts = directArtifacts.filter((entry) => entry.quality.status === "sufficient");
  const incompleteArtifacts = directArtifacts.filter((entry) => entry.quality.status !== "sufficient");
  const draftSources = sources
    .map((source) => ({
      source,
      contentMatches: sourceArchitectureContentMatches(source, item)
    }))
    .map((entry) => ({
      ...entry,
      quality: assessSourceFillingForItem({
        source: entry.source,
        item,
        contentMatches: entry.contentMatches
      })
    }))
    .filter((entry) =>
      entry.contentMatches.length &&
      ["sufficient", "partial"].includes(entry.quality.status) &&
      !sourceToolMatches(entry.source).length &&
      !sourceArchitectureItemMatches(entry.source, item).length
    );

  return {
    confirmedArtifacts,
    incompleteArtifacts,
    draftSources
  };
}

function layerHasEvidence(source, layerCode) {
  const toolMatches = sourceToolMatches(source);
  if (toolMatches.length) {
    return sourceMatchesLayerByTool(source, layerCode);
  }

  return sourceMatchesLayerByContent(source, layerCode);
}

function evidenceSnippetForSource(source, labels = []) {
  const text = cleanHumanText(sourceReadableContent(source));
  if (!text) {
    return "";
  }

  const labelTokens = labels
    .flatMap((label) => lookupTokens(normalizeLookup(label)))
    .filter((token) => token.length >= 4);
  const chunks = text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((chunk) => cleanHumanText(chunk))
    .filter(Boolean);
  const matchedChunk = chunks.find((chunk) => {
    const normalized = normalizeLookup(chunk);
    return labelTokens.some((token) => normalized.includes(token));
  });
  const snippet = matchedChunk || chunks[0] || text;

  return snippet.length > 260 ? `${snippet.slice(0, 259).trim()}…` : snippet;
}

function renderEvidenceEntry({ source, matches = [], contentMatches = [], quality = null }) {
  const matchLabels = [
    ...matches.map((match) => match.name || match.domain),
    ...contentMatches.map((match) => match.subdomain || match.domain || match.description)
  ].filter(Boolean);
  const snippet = evidenceSnippetForSource(source, matchLabels);

  return `
    <span class="source-evidence">
      ${source.fileUrl
        ? `<a href="${escapeHtml(source.fileUrl)}" target="_blank" rel="noreferrer">${escapeHtml(source.title || source.fileUrl)}</a>`
        : `<span>${escapeHtml(source.title || "Источник")}</span>`}
      ${quality ? `<em class="source-quality source-quality-${escapeHtml(quality.status)}">${escapeHtml(quality.label)}</em>` : ""}
      ${matchLabels.length ? `<small>${escapeHtml(matchLabels.join("; "))}</small>` : ""}
      ${snippet ? `<small><b>Фрагмент:</b> ${escapeHtml(snippet)}</small>` : ""}
      ${quality?.summary ? `<small>${escapeHtml(quality.summary)}</small>` : ""}
      ${quality?.missing?.length ? `<small><b>Что проверить:</b> ${escapeHtml(quality.missing.slice(0, 2).join("; "))}</small>` : ""}
    </span>
  `;
}

function filledPercent(item) {
  const filled = Number(item.filledFieldsCount || Object.keys(item.filledFields || {}).length || 0);
  const missing = Number(item.missingFieldsCount || (item.missingFields || []).length || 0);
  const total = filled + missing;
  return total ? Math.round((filled / total) * 100) : 0;
}

function architectureItemStatus(item) {
  if (item.evidence.confirmedArtifacts.length) {
    return {
      code: "covered",
      label: "Артефакт заполнен",
      percent: 100,
      className: "is-covered"
    };
  }

  if (item.evidence.incompleteArtifacts.length) {
    const hasPartial = item.evidence.incompleteArtifacts.some((entry) => entry.quality.status === "partial");
    return {
      code: "review",
      label: hasPartial ? "Нужно дополнить" : "Проверить содержание",
      percent: hasPartial ? 55 : 25,
      className: "is-review"
    };
  }

  if (item.evidence.draftSources.length) {
    return {
      code: "draft",
      label: "Есть данные, артефакт не собран",
      percent: 35,
      className: "is-draftable"
    };
  }

  return {
    code: "missing",
    label: "Нет данных",
    percent: 0,
    className: ""
  };
}

function coveragePercent(items = []) {
  if (!items.length) {
    return 0;
  }

  const total = items.reduce((sum, item) => sum + architectureItemStatus(item).percent, 0);
  return Math.round(total / items.length);
}

function groupArchitectureRowsByDomain(items = []) {
  const groups = new Map();
  for (const item of items) {
    const domain = itemParentDomain(item);
    if (!groups.has(domain)) {
      groups.set(domain, []);
    }
    groups.get(domain).push(item);
  }

  return [...groups.entries()].map(([domain, rows]) => ({
    domain,
    rows,
    percent: coveragePercent(rows),
    confirmedCount: rows.filter((item) => architectureItemStatus(item).code === "covered").length,
    draftCount: rows.filter((item) => architectureItemStatus(item).code === "draft").length,
    reviewCount: rows.filter((item) => architectureItemStatus(item).code === "review").length,
    missingCount: rows.filter((item) => architectureItemStatus(item).code === "missing").length
  }));
}

function formatScore(value) {
  const score = Number(value);
  if (!Number.isFinite(score)) {
    return "нет";
  }
  return score.toFixed(2).replace(/\.00$/, "");
}

function setAuthenticated(isAuthenticated) {
  tokenPanel.hidden = isAuthenticated;
  workspace.hidden = !isAuthenticated;
  logoutButton.hidden = !isAuthenticated;
  refreshButton.hidden = !isAuthenticated;
}

function setTokenHint(message, type = "") {
  tokenHint.textContent = message || "";
  tokenHint.dataset.type = type;
}

async function api(path, options = {}) {
  const apiPath = path ? `/api/companies${path}` : "/api/companies/index";
  const response = await fetch(apiPath, {
    method: options.method || "GET",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${state.token}`
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {})
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `Companies API error: ${response.status}`);
  }

  return payload;
}

function routeSiteView() {
  const value = window.location.hash.replace(/^#/, "").trim();
  return SITE_VIEWS.has(value) ? value : "";
}

function setActiveSiteNav(view = "companies") {
  siteNavLinks.forEach((link) => {
    link.classList.toggle("active", link.dataset.siteView === view);
  });
}

function routeCompanyId() {
  const match = window.location.pathname.match(/^\/companies\/([^/]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

function setRoute(companyId) {
  const target = companyId ? `/companies/${encodeURIComponent(companyId)}` : "/companies";
  if (window.location.pathname !== target) {
    window.history.pushState({}, "", target);
  }
}

async function loadMethodology() {
  if (state.methodology) {
    return state.methodology;
  }

  const payload = await api("/methodology");
  state.methodology = {
    layerClasses: payload.layerClasses || [],
    layers: payload.layers || [],
    items: payload.items || [],
    tools: payload.tools || []
  };
  return state.methodology;
}

function renderLoading(label = "Загрузка") {
  content.innerHTML = `<section class="content-section loading">${escapeHtml(label)}...</section>`;
}

function renderError(error) {
  content.innerHTML = `
    <section class="error-state">
      <h2>Что-то не загрузилось</h2>
      <p>${escapeHtml(error.message || error)}</p>
    </section>
  `;
}

function renderCompanyList() {
  if (!state.companies.length) {
    companyList.innerHTML = `<div class="empty-state"><h2>Пусто</h2><p>Создай первую компанию.</p></div>`;
    return;
  }

  companyList.innerHTML = state.companies.map((company) => {
    const active = company.id === state.selectedCompanyId ? " active" : "";
    const constraint = company.probableConstraint?.title || "без ограничения";
    return `
      <button class="company-item${active}" data-company-id="${escapeHtml(company.id)}" type="button">
        <strong>${escapeHtml(company.name)}</strong>
        <span>${escapeHtml(company.industry || "отрасль не указана")}</span>
        <span>${escapeHtml(constraint)}</span>
      </button>
    `;
  }).join("");

  companyList.querySelectorAll("[data-company-id]").forEach((button) => {
    button.addEventListener("click", () => openCompany(button.dataset.companyId));
  });
}

function renderEmpty() {
  content.innerHTML = `
    <section class="empty-state">
      <h2>Выбери компанию</h2>
      <p>Слева появятся рабочие кейсы консультанта.</p>
    </section>
  `;
}

function enrichMethodologyItems(items = []) {
  const currentDomainByLayer = new Map();
  return items.map((item) => {
    const block = String(item.block || "");
    let parentDomain = item.domain || "";
    if (block === "Домен") {
      currentDomainByLayer.set(item.layerId, item.domain || "");
    }
    if (block === "Поддомен") {
      parentDomain = currentDomainByLayer.get(item.layerId) || "Без домена";
    }

    return {
      ...item,
      parentDomain
    };
  });
}

function renderMethodologyDetails(row) {
  const rows = [
    ["Что это", row.description],
    ["Что делаем", row.action],
    ["Результат", row.expectedResult],
    ["Инструменты", row.toolHints]
  ].filter(([, value]) => String(value || "").trim());

  if (!rows.length) {
    return "";
  }

  return `
    <div class="methodology-note">
      ${rows.map(([label, value]) => `
        <p><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</p>
      `).join("")}
    </div>
  `;
}

function renderArchitecturePortal(methodology) {
  const enriched = enrichMethodologyItems(methodology.items);
  const itemsByLayer = new Map();
  const layersByClass = new Map();
  const classesById = new Map(methodology.layerClasses.map((item) => [item.classId, item]));
  for (const item of enriched) {
    if (!itemsByLayer.has(item.layerId)) {
      itemsByLayer.set(item.layerId, []);
    }
    itemsByLayer.get(item.layerId).push(item);
  }
  for (const layer of methodology.layers) {
    if (!layersByClass.has(layer.classId)) {
      layersByClass.set(layer.classId, []);
    }
    layersByClass.get(layer.classId).push(layer);
  }

  const sequenceSteps = [
    {
      classId: "A",
      label: "Сначала",
      note: "Проверяем, чего хочет собственник и есть ли рынок, в котором вообще можно играть."
    },
    {
      classId: "B",
      label: "Затем",
      note: "Смотрим, какую ценность создаём, кому продаём и почему клиент должен купить."
    },
    {
      classId: "C",
      label: "После этого",
      note: "Проверяем, как спрос проходит через исполнение и превращается в деньги."
    },
    {
      classId: "D",
      label: "Параллельно",
      note: "Команда, управление, технологии и данные проверяются рядом со всеми шагами, потому что они либо поддерживают поток, либо ломают его."
    }
  ];

  content.innerHTML = `
    <section class="content-section portal-hero">
      <p class="eyebrow">Методология</p>
      <h2>Архитектура бизнеса</h2>
      <p>Это карта, по которой AI-BOSS раскладывает бизнес: от воли собственника и рынка до процессов, денег, команды, технологий и данных. Здесь не нужно ничего заполнять — это справочник логики.</p>
    </section>
    <section class="content-section">
      <div class="section-head">
        <h3>4 класса и 11 слоёв</h3>
      </div>
      <div class="portal-class-grid">
        ${methodology.layerClasses.map((item) => `
          <article class="card architecture-class-card">
            <p class="eyebrow">Класс ${escapeHtml(item.classId)}</p>
            <h3>${escapeHtml(item.name)}</h3>
            <p>${escapeHtml(item.description)}</p>
            <div class="class-layer-list" aria-label="Слои класса ${escapeHtml(item.classId)}">
              ${(layersByClass.get(item.classId) || []).map((layer) => `
                <span>${escapeHtml(layer.name)}</span>
              `).join("")}
            </div>
          </article>
        `).join("")}
      </div>
    </section>
    <section class="content-section">
      <div class="section-head">
        <div>
          <h3>Как идти по архитектуре</h3>
          <p class="section-note">Это не жёсткая анкета, а логика проверки бизнеса: сначала задаём условия игры, потом смотрим поток ценности и результата. Устойчивость проверяется параллельно, потому что команда, управление, технологии и данные влияют на каждый этап.</p>
        </div>
      </div>
      <div class="architecture-sequence">
        ${sequenceSteps.map((step) => {
          const classItem = classesById.get(step.classId);
          const layers = layersByClass.get(step.classId) || [];
          return `
            <article class="sequence-step ${step.classId === "D" ? "is-parallel" : ""}">
              <p class="eyebrow">${escapeHtml(step.label)} · класс ${escapeHtml(step.classId)}</p>
              <h4>${escapeHtml(classItem?.name || "")}</h4>
              <p>${escapeHtml(step.note)}</p>
              <div class="class-layer-list">
                ${layers.map((layer) => `<span>${escapeHtml(layer.name)}</span>`).join("")}
              </div>
            </article>
          `;
        }).join("")}
      </div>
    </section>
    <section class="content-section">
      <div class="section-head">
        <h3>Слои, домены и поддомены</h3>
      </div>
      <div class="stack">
        ${methodology.layers.map((layer, index) => {
          const rows = itemsByLayer.get(layer.id) || [];
          const layerRow = rows.find((item) => item.block === "Слой");
          const domains = rows.filter((item) => item.block === "Домен");
          return `
            <details class="portal-details">
              <summary>
                <div>
                  <strong>${escapeHtml(layer.name)}</strong>
                  <span>Класс ${escapeHtml(layer.classId || "")} · слой ${index + 1} из 11 · ${escapeHtml(layer.whatItIs || "")}</span>
                </div>
                <span class="portal-toggle"></span>
              </summary>
              <div class="portal-details-body">
                ${layerRow ? renderMethodologyDetails(layerRow) : ""}
                <div class="stack">
                  ${domains.map((domain) => {
                    const subdomains = rows.filter((item) => item.block === "Поддомен" && item.parentDomain === domain.domain);
                    return `
                      <details class="domain-group">
                        <summary>
                          <div>
                            <strong>${escapeHtml(domain.domain)}</strong>
                            <span>${escapeHtml(subdomains.length)} поддоменов</span>
                          </div>
                          <span class="portal-toggle compact-toggle"></span>
                        </summary>
                        <div class="portal-domain-body">
                          ${renderMethodologyDetails(domain)}
                          <div class="portal-subdomain-grid">
                            ${subdomains.map((subdomain) => `
                              <article class="portal-subdomain">
                                <h4>${escapeHtml(subdomain.domain)}</h4>
                                ${renderMethodologyDetails(subdomain)}
                              </article>
                            `).join("")}
                          </div>
                        </div>
                      </details>
                    `;
                  }).join("")}
                </div>
              </div>
            </details>
          `;
        }).join("")}
      </div>
    </section>
  `;
}

function renderToolsPortal(methodology) {
  const query = normalizeLookup(state.toolSearch);
  const tools = methodology.tools.filter((tool) => {
    if (!query) {
      return true;
    }
    return normalizeLookup([
      tool.layer,
      tool.domain,
      tool.name,
      tool.description,
      tool.whenToUse,
      tool.result
    ].filter(Boolean).join(" ")).includes(query);
  });
  const grouped = tools.reduce((map, tool) => {
    const layer = tool.layer || LAYER_LABELS[tool.layerId] || tool.layerId || "Без слоя";
    if (!map.has(layer)) {
      map.set(layer, []);
    }
    map.get(layer).push(tool);
    return map;
  }, new Map());

  content.innerHTML = `
    <section class="content-section portal-hero">
      <p class="eyebrow">Справочник</p>
      <h2>Инструменты</h2>
      <p>Инструмент закреплён за своим слоем, доменом и поддоменом. Его нельзя подменять другим файлом. Но данные из соседних артефактов можно использовать как опору, если видно, откуда они взялись.</p>
      <form class="portal-search" id="toolSearchForm">
        <label>Поиск по инструментам
          <input id="toolSearch" type="search" value="${escapeHtml(state.toolSearch)}" placeholder="Например: BHAG, RACI, cash flow, сегменты">
        </label>
        <button type="submit">Найти</button>
      </form>
    </section>
    <section class="content-section">
      <div class="section-head">
        <h3>Карта инструментов</h3>
        <span class="pill">${escapeHtml(tools.length)} найдено</span>
      </div>
      <div class="stack">
        ${[...grouped.entries()].map(([layer, rows]) => `
          <details class="portal-details">
            <summary>
              <div>
                <strong>${escapeHtml(layer)}</strong>
                <span>${escapeHtml(rows.length)} инструментов</span>
              </div>
              <span class="portal-toggle"></span>
            </summary>
            <div class="portal-tool-grid">
              ${rows.map((tool) => `
                <article class="portal-tool-card">
                  <p class="eyebrow">${escapeHtml(tool.domain || "без домена")}</p>
                  <h4>${escapeHtml(tool.name)}</h4>
                  ${tool.description ? `<p>${escapeHtml(tool.description)}</p>` : ""}
                  ${tool.whenToUse ? `<p><strong>Когда применять:</strong> ${escapeHtml(tool.whenToUse)}</p>` : ""}
                  ${tool.result ? `<p><strong>Результат:</strong> ${escapeHtml(tool.result)}</p>` : ""}
                  ${tool.url ? `<a href="${escapeHtml(tool.url)}" target="_blank" rel="noreferrer">Открыть инструмент</a>` : ""}
                </article>
              `).join("")}
            </div>
          </details>
        `).join("") || `<div class="empty-state compact-empty"><h2>Ничего не найдено</h2><p>Попробуй другой запрос.</p></div>`}
      </div>
    </section>
  `;

  content.querySelector("#toolSearchForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    state.toolSearch = content.querySelector("#toolSearch").value.trim();
    renderToolsPortal(methodology);
  });
}

function renderMaturityPortal(methodology) {
  const layerRows = methodology.items.filter((item) => item.block === "Слой");
  const maturityScale = [
    {
      level: "1",
      title: "Хаос",
      text: "Область держится на ручном управлении, личной памяти и отдельных людях. Результат плохо повторяется."
    },
    {
      level: "2",
      title: "Есть отдельные практики",
      text: "Что-то уже работает, но система не собрана: правила разные, данные неполные, ответственность часто размыта."
    },
    {
      level: "3",
      title: "Рабочий стандарт",
      text: "Есть понятный способ работы. Результат в целом предсказуем, но ещё зависит от дисциплины и ручного контроля."
    },
    {
      level: "4",
      title: "Сильная система",
      text: "Область управляется регулярно, выдерживает рост и помогает принимать решения быстрее и спокойнее."
    },
    {
      level: "5",
      title: "Ориентир",
      text: "Эталонный уровень. Не обязательная цель для всех, а верхняя планка, с которой можно сравнивать потенциал."
    }
  ];

  content.innerHTML = `
    <section class="content-section portal-hero">
      <p class="eyebrow">Диагностика</p>
      <h2>Матрица зрелости бизнеса</h2>
      <p>Это не оценка ради оценки и не финальный диагноз. Матрица показывает, насколько каждая область бизнеса уже управляется: где всё держится на ручном режиме, где есть рабочий порядок, а где можно опираться на систему для роста.</p>
    </section>

    <section class="content-section">
      <div class="maturity-explainer-grid">
        <article class="card">
          <h3>Зачем она нужна</h3>
          <p>Матрица помогает быстро увидеть слабые и сильные области. Но она не выбирает главное ограничение автоматически: низкая оценка может быть причиной, а может быть следствием другой проблемы.</p>
        </article>
        <article class="card">
          <h3>Как AI-BOSS её использует</h3>
          <p>AI-BOSS смотрит на оценки как на карту сигналов: где нужна проверка, какие данные собрать, что можно улучшать параллельно и какую версию ограничения стоит проверить первой.</p>
        </article>
      </div>
    </section>

    <section class="content-section">
      <div class="section-head">
        <div>
          <h3>Что означает шкала 1–5</h3>
          <p class="section-note">Шкала показывает уровень управляемости области, а не “хорошая компания или плохая”.</p>
        </div>
      </div>
      <div class="maturity-scale-grid">
        ${maturityScale.map((item) => `
          <article class="maturity-scale-card">
            <strong>${escapeHtml(item.level)}</strong>
            <div>
              <h4>${escapeHtml(item.title)}</h4>
              <p>${escapeHtml(item.text)}</p>
            </div>
          </article>
        `).join("")}
      </div>
    </section>

    <section class="content-section">
      <div class="section-head">
        <div>
          <h3>Шкала по 11 слоям</h3>
          <p class="section-note">Раскрой слой, чтобы увидеть, как выглядит зрелость от 1 до 5 именно в этой области.</p>
        </div>
      </div>
      <div class="stack">
        ${layerRows.map((row) => `
          <details class="portal-details">
            <summary>
              <div>
                <strong>${escapeHtml(row.layer)}</strong>
                <span>${escapeHtml(row.description || "Как эта область выглядит на разных уровнях зрелости.")}</span>
              </div>
              <span class="portal-toggle"></span>
            </summary>
            ${row.action || row.expectedResult ? `
              <div class="methodology-note maturity-layer-note">
                ${row.action ? `<p><strong>Что проверяем:</strong> ${escapeHtml(row.action)}</p>` : ""}
                ${row.expectedResult ? `<p><strong>Что должно стать понятнее:</strong> ${escapeHtml(row.expectedResult)}</p>` : ""}
              </div>
            ` : ""}
            <div class="maturity-levels">
              ${Object.entries(row.maturity || {}).map(([level, text]) => `
                <article class="maturity-level">
                  <strong>${escapeHtml(level)}</strong>
                  <p>${escapeHtml(text)}</p>
                </article>
              `).join("")}
            </div>
          </details>
        `).join("")}
      </div>
    </section>
  `;
}

function renderGuidePortal() {
  content.innerHTML = `
    <section class="content-section portal-hero">
      <p class="eyebrow">Рабочий порядок</p>
      <h2>Как пользоваться AI-BOSS</h2>
      <p>Главная идея простая: сначала собираем факты, потом проверяем, каким инструментом они закрываются, затем делаем вывод и выбираем один следующий шаг.</p>
    </section>
    <section class="content-section">
      <div class="portal-guide-grid">
        <article class="card">
          <h3>1. Создай компанию</h3>
          <p>Зафиксируй название, отрасль, цель собственника и текущий запрос. Это не диагноз, а стартовый контекст.</p>
        </article>
        <article class="card">
          <h3>2. Добавь источники</h3>
          <p>Подключи папку Google Drive, вставь документы, таблицы, ссылки или заметки. AI-BOSS смотрит не только название файла, но и содержание внутри.</p>
        </article>
        <article class="card">
          <h3>3. Проверь слои</h3>
          <p>Слой раскрывается до доменов и поддоменов. Рабочая единица анализа — поддомен: у него должен быть свой артефакт или понятные данные.</p>
        </article>
        <article class="card">
          <h3>4. Запусти анализ</h3>
          <p>AI-BOSS отделяет факты от версий, показывает пробелы, выбирает рабочую гипотезу и предлагает один следующий шаг.</p>
        </article>
        <article class="card">
          <h3>5. Используй чат</h3>
          <p>На любой странице можно открыть окно AI-BOSS и спросить, что значит показатель, какой инструмент нужен или почему выбран следующий шаг.</p>
        </article>
      </div>
    </section>
  `;
}

async function renderSitePage(view) {
  setActiveSiteNav(view);
  renderLoading("Загружаю раздел");
  try {
    const methodology = view === "guide" ? null : await loadMethodology();
    state.selectedCompanyId = "";
    state.selectedDetail = null;
    renderCompanyList();
    if (view === "architecture") {
      renderArchitecturePortal(methodology);
      return;
    }
    if (view === "tools") {
      renderToolsPortal(methodology);
      return;
    }
    if (view === "maturity") {
      renderMaturityPortal(methodology);
      return;
    }
    renderGuidePortal();
  } catch (error) {
    renderError(error);
  }
}

function renderOverview(detail) {
  const { company, analysis } = detail;
  const constraint = analysis?.probableConstraint || company.probableConstraint || {};
  const nextStep = analysis?.nextStep || company.nextStep || {};
  const diagnosticQuality = analysis?.diagnosticQuality || {};
  const rejectedHypotheses = analysis?.rejectedHypotheses || constraint.rejectedAlternatives || [];
  const evidence = asArray(constraint.evidence).length
    ? asArray(constraint.evidence)
    : asArray(analysis?.keyProblemAreas).flatMap((item) => asArray(item.evidence)).slice(0, 4);
  const selectionBasis = asArray(constraint.selectionBasis);
  const missingForHigh = asArray(constraint.missingForHigh);
  const nextStepBasis = asArray(nextStep.basis);
  const layerSummary = analysis?.layerSummary || [];
  const avgFilled = layerSummary.length
    ? Math.round(layerSummary.reduce((sum, item) => sum + filledPercent(item), 0) / layerSummary.length)
    : 0;

  return `
    <section class="content-section">
      <div class="section-head">
        <div>
          <p class="eyebrow">Компания</p>
          <h2>${escapeHtml(company.name)}</h2>
        </div>
        <div class="actions">
          <button class="secondary" id="editCompanyButton" type="button">Редактировать</button>
          <button class="danger secondary" id="deleteCompanyButton" type="button">Удалить</button>
          <button id="analyzeButton" type="button">Проанализировать</button>
        </div>
      </div>
      <div class="grid-three">
        <article class="card metric">
          <span class="muted">Отрасль</span>
          <b>${escapeHtml(company.industry || "не указана")}</b>
        </article>
        <article class="card metric">
          <span class="muted">Вероятное ограничение</span>
          <b>${escapeHtml(constraint.title || "не выбрано")}</b>
        </article>
        <article class="card metric">
          <span class="muted">Заполненность слоёв</span>
          <b>${escapeHtml(avgFilled)}%</b>
          <div class="progress" aria-hidden="true"><span style="--value: ${avgFilled}%"></span></div>
        </article>
      </div>
    </section>

    <section class="content-section">
      <div class="grid-two">
        <article class="card">
          <h3>Цель</h3>
          <p>${escapeHtml(company.ownerGoal || "Не указана.")}</p>
        </article>
        <article class="card">
          <h3>Текущий запрос</h3>
          <p>${escapeHtml(company.currentRequest || "Не указан.")}</p>
        </article>
      </div>
    </section>

    <section class="content-section">
      <div class="section-head">
        <h3>Вывод AI-BOSS</h3>
        <div class="pill-row">
          <span class="pill ${confidenceClass(analysis?.confidence)}" title="Насколько фактов хватает, чтобы опираться на текущий вывод.">${escapeHtml(conclusionConfidenceLabel(analysis?.confidence))}</span>
          ${diagnosticQuality.score10 != null ? `<span class="pill green" title="Оценивает не результат бизнеса, а дисциплину рассуждения: отделены факты, версии и следующий шаг.">${escapeHtml(diagnosticQualityLabel(diagnosticQuality.score10))}</span>` : ""}
          <span class="pill">${escapeHtml(formatDate(analysis?.createdAt || company.lastAnalysisAt))}</span>
        </div>
      </div>
      ${analysis ? `
        <p class="section-note">Уверенность показывает, насколько вывод подтверждён данными. Логика разбора показывает, аккуратно ли AI-BOSS отделил факты, версии и следующий шаг.</p>
      ` : ""}
      <div class="grid-two">
        <article class="card">
          <h3>Главный вывод</h3>
          <p>${escapeHtml(humanizeBusinessLanguage(analysis?.summary || "Анализ ещё не запускался."))}</p>
        </article>
        <article class="card">
          <h3>Следующий шаг</h3>
          <p>${escapeHtml(humanizeBusinessLanguage(nextStep.title || "Не выбран."))}</p>
          ${nextStep.why ? `<p><strong>Зачем:</strong> ${escapeHtml(humanizeBusinessLanguage(nextStep.why))}</p>` : ""}
        </article>
      </div>
      ${analysis ? `
        <div class="grid-two evidence-grid">
          <article class="card">
            <h3>Как AI-BOSS пришёл к выводу</h3>
            ${selectionBasis.length ? `
              <p><strong>Почему выбрана эта версия:</strong></p>
              ${renderSmallList(selectionBasis.slice(0, 3))}
            ` : ""}
            <p><strong>На что опираюсь:</strong></p>
            ${renderSmallList(evidence.slice(0, 3), "Пока нет понятных опор в данных. Нужно открыть области и источники.", humanizeEvidenceItem)}
            <p><strong>Что важно, но пока не похоже на главную причину:</strong></p>
            ${renderRejectedRows(rejectedHypotheses)}
          </article>
          <article class="card">
            <h3>Почему следующий шаг такой</h3>
            ${nextStepBasis.length ? renderSmallList(nextStepBasis) : renderSmallList([
              nextStep.why || "Шаг выбран как минимальная проверка текущей версии.",
              "Он должен снизить неопределённость, а не сразу запустить большой проект изменений."
            ])}
            ${nextStep.expectedResult ? `<p><strong>Что должно получиться:</strong> ${escapeHtml(humanizeBusinessLanguage(nextStep.expectedResult))}</p>` : ""}
            ${nextStep.successCriteria ? `<p><strong>Критерий результата:</strong> ${escapeHtml(humanizeBusinessLanguage(nextStep.successCriteria))}</p>` : ""}
            ${missingForHigh.length ? `
              <p><strong>Чего не хватает, чтобы говорить увереннее:</strong></p>
              ${renderSmallList(missingForHigh.slice(0, 4), "Пока дополнительных уточнений не нужно.", humanizeMissingField)}
            ` : ""}
          </article>
        </div>
      ` : ""}
      ${diagnosticQuality.missing?.length ? `
        <article class="card">
          <h3>Что мешает диагностике быть 10/10</h3>
          <ul class="split-list">
            ${diagnosticQuality.missing.slice(0, 4).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
          </ul>
        </article>
      ` : ""}
    </section>
  `;
}

function renderSources(detail) {
  const rows = detail.sources || [];
  const processedCount = rows.filter((source) => source.processingStatus === "processed").length;
  const driveCount = rows.filter((source) => ["google_drive", "google_public_folder"].includes(source.sourceOrigin)).length;
  const layerCount = new Set(rows.flatMap((source) => source.relatedLayers || [])).size;

  return `
    <section class="content-section">
      <div class="section-head">
        <div>
          <h3>Данные</h3>
          <p class="section-note">Источники лежат в рабочем пространстве компании и учитываются при следующем анализе.</p>
        </div>
        <div class="actions">
          <button class="secondary" id="importDeepDiagnosticButton" type="button">Импорт диагностики Excel</button>
          <button id="addSourceButton" type="button">Добавить источник</button>
        </div>
      </div>
      ${rows.length ? `
        <details class="data-drawer">
          <summary>
            <div>
              <strong>${escapeHtml(rows.length)} источников</strong>
              <span>${escapeHtml(processedCount)} прочитано · ${escapeHtml(driveCount)} из Google Drive · ${escapeHtml(layerCount)} слоёв затронуто</span>
            </div>
            <span class="drawer-toggle"></span>
          </summary>
          <div class="stack data-source-list">
            ${rows.map((source) => `
              <article class="source-row">
                <h4>${escapeHtml(source.title || "Источник")}</h4>
                <p>${escapeHtml(source.aiSummary || source.contentText || source.fileUrl || "")}</p>
                <div class="pill-row">
                  <span class="pill">${escapeHtml(source.sourceOrigin || "source")}</span>
                  <span class="pill">${escapeHtml(source.processingStatus || "")}</span>
                  ${(source.relatedLayers || []).slice(0, 4).map((layer) => `<span class="pill orange">${escapeHtml(LAYER_LABELS[layer] || layer)}</span>`).join("")}
                </div>
              </article>
            `).join("")}
          </div>
        </details>
      ` : `<div class="empty-state compact-empty"><h2>Источников нет</h2><p>Добавь заметку, файл или публичную ссылку на Google Doc / Sheet.</p></div>`}
    </section>
  `;
}

function renderIntegrations(detail) {
  const integrations = detail.integrations || {};
  const drive = integrations.googleDrive || {};
  const apiConnectors = integrations.apiConnectors || [];
  const driveServiceReady = Boolean(drive.configured || drive.status === "service_account_ready" || drive.status === "ready");
  const drivePublicFolderConnected = Boolean(drive.publicFolderConnected || drive.status === "public_folder_connected" || Number(drive.publicFolderSourceCount || 0) > 0);
  const driveConnected = Boolean(drive.connected || driveServiceReady || drivePublicFolderConnected);
  const driveStatusLabel = driveServiceReady && drivePublicFolderConnected
    ? "подключён"
    : drivePublicFolderConnected
      ? "папка подключена"
      : driveServiceReady
        ? "service account готов"
        : "папка не подключена";
  const publicFolderActionLabel = drivePublicFolderConnected ? "Обновить папку по ссылке" : "Подключить папку по ссылке";

  return `
    <section class="content-section">
      <div class="section-head">
        <div>
          <p class="eyebrow">Подключения</p>
          <h3>Интеграции и доступы</h3>
        </div>
      </div>
      <div class="grid-two">
        <article class="card integration-card">
          <div class="section-head compact-head">
            <div>
              <h3>Google Drive</h3>
              <p>Основной быстрый способ сейчас — подключить папку по публичной ссылке. AI-BOSS добавит файлы как источники компании и прочитает текст из Google Docs, Sheets и Slides, где это возможно.</p>
            </div>
            <span class="pill ${driveConnected ? "green" : "orange"}">${driveStatusLabel}</span>
          </div>
          <div class="stack compact-stack">
            <p><strong>Рабочая папка:</strong> ${escapeHtml(drive.expectedFolderName || detail.company?.name || "")}</p>
            <p><strong>Подключение по ссылке:</strong> ${drivePublicFolderConnected ? "подключено" : "не подключено"}</p>
            <p><strong>Источников из Drive:</strong> ${escapeHtml(drive.sourceCount || 0)} · из папки по ссылке: ${escapeHtml(drive.publicFolderSourceCount || 0)} · прочитано текстом: ${escapeHtml(drive.readableCount || 0)}</p>
            <p><strong>Последняя синхронизация:</strong> ${escapeHtml(formatDate(drive.lastSyncedAt))}</p>
            <div class="actions inline-actions">
              <button class="secondary" id="syncPublicGoogleFolderButton" type="button">${publicFolderActionLabel}</button>
            </div>
            ${driveServiceReady ? `
              <div class="actions inline-actions">
                <button id="syncGoogleDriveButton" type="button">Синхронизировать Drive</button>
              </div>
            ` : `
              <p><strong>${drivePublicFolderConnected ? "Важно:" : "Как подключить:"}</strong> ${drivePublicFolderConnected
                ? "папка по ссылке уже подключена, её файлы учитываются в источниках и следующем анализе. Закрытая интеграция через service account не обязательна для этого сценария."
                : "открой доступ к папке «Все, у кого есть ссылка, могут просматривать» и нажми «Подключить папку по ссылке»."}</p>
              <details>
                <summary>Закрытая интеграция через service account</summary>
                <p>Этот вариант нужен позже, если нужно читать закрытую корневую папку без публичных ссылок. Тогда в Vercel env понадобятся:</p>
                <div class="code-list">
                  ${(drive.setupRequired || []).map((item) => `<code>${escapeHtml(item)}</code>`).join("")}
                </div>
              </details>
            `}
          </div>
        </article>

        <article class="card integration-card">
          <div class="section-head compact-head">
            <div>
              <h3>API</h3>
              <p>CRM, финансы и маркетинг подключаются отдельными backend-коннекторами. Секреты не вводим в браузере.</p>
            </div>
            <span class="pill">план</span>
          </div>
          <div class="stack compact-stack">
            ${apiConnectors.map((connector) => `
              <div class="mini-row">
                <strong>${escapeHtml(connector.title)}</strong>
                <span>${escapeHtml(connector.status || "planned")}</span>
                <p>${escapeHtml(connector.description || "")}</p>
              </div>
            `).join("")}
          </div>
        </article>
      </div>
    </section>
  `;
}

function renderDeepDiagnostic(detail) {
  const diagnostic = detail.analysis?.deepDiagnostic;
  if (!diagnostic) {
    return "";
  }

  const overall = diagnostic.overall || {};
  const root = diagnostic.rootHypothesis || {};
  const nextStep = diagnostic.nextStep || {};
  const classes = diagnostic.classSummary || [];
  const weakZones = diagnostic.weakZones || [];
  const strengths = diagnostic.strengths || [];
  const parallel = diagnostic.parallelActions || [];
  const missingForConfidence = diagnostic.missingForConfidence || [];

  return `
    <section class="content-section">
      <div class="section-head">
        <div>
          <p class="eyebrow">Глубокая диагностика</p>
          <h3>Срез по диагностической матрице</h3>
        </div>
        <div class="pill-row">
          <span class="pill">слоёв: ${escapeHtml(overall.layerCount || 0)}</span>
          <span class="pill">поддоменов: ${escapeHtml(overall.scoredSubdomainCount || 0)}</span>
          <span class="pill orange">средняя: ${escapeHtml(formatScore(overall.averageScore))}</span>
        </div>
      </div>

      <article class="card">
        <h3>Что показывает диагностика</h3>
        <p>${escapeHtml(humanizeBusinessLanguage(overall.conclusion || ""))}</p>
        ${root.title || root.why ? `
          <p><strong>Вероятная причина:</strong> ${escapeHtml(humanizeBusinessLanguage(root.title || "пока не выбрана"))}</p>
          ${root.why ? `<p>${escapeHtml(humanizeBusinessLanguage(root.why))}</p>` : ""}
          ${root.notRootYet?.length ? `<p><strong>Что пока не считаю главной причиной:</strong> ${escapeHtml(root.notRootYet.join(", "))}.</p>` : ""}
        ` : ""}
      </article>

      <div class="grid-two single-card-grid">
        <article class="card">
          <h3>Что проверить дальше</h3>
          <p><strong>${escapeHtml(humanizeBusinessLanguage(nextStep.title || "Не выбрано"))}</strong></p>
          <p>${escapeHtml(humanizeBusinessLanguage(nextStep.why || ""))}</p>
          ${nextStep.result ? `<p><strong>Что должно получиться:</strong> ${escapeHtml(humanizeBusinessLanguage(nextStep.result))}</p>` : ""}
          ${missingForConfidence.length ? `
            <p><strong>Чтобы говорить увереннее, нужно:</strong></p>
            <ul class="split-list">
              ${missingForConfidence.slice(0, 5).map((item) => `<li>${escapeHtml(humanizeBusinessLanguage(item))}</li>`).join("")}
            </ul>
          ` : ""}
        </article>
      </div>

      <div class="grid-two">
        <article class="card">
          <h3>Классы системы</h3>
          <div class="stack compact-stack">
            ${classes.map((item) => `
              <div class="mini-row">
                <strong>${escapeHtml(item.classKey)} · ${escapeHtml(item.title || "")}</strong>
                <span>${escapeHtml(formatScore(item.averageScore))} · ${escapeHtml(item.status || "")}</span>
                <p>${escapeHtml(humanizeBusinessLanguage(item.conclusion || ""))}</p>
              </div>
            `).join("")}
          </div>
        </article>
        <article class="card">
          <h3>Что можно запускать параллельно</h3>
          ${parallel.length ? `
            <ul class="split-list">
              ${parallel.slice(0, 4).map((item) => `<li><strong>${escapeHtml(humanizeBusinessLanguage(item.title))}</strong> — ${escapeHtml(humanizeBusinessLanguage(item.why || ""))}</li>`).join("")}
            </ul>
          ` : `<p>Параллельные действия пока не выделены.</p>`}
        </article>
      </div>

      <div class="grid-two">
        <article class="card">
          <h3>Слабые зоны</h3>
          <ul class="split-list">
            ${weakZones.slice(0, 8).map((item) => `<li>${escapeHtml(item.layerName)} / ${escapeHtml(item.title)}: ${escapeHtml(formatScore(item.score))}</li>`).join("")}
          </ul>
        </article>
        <article class="card">
          <h3>Возможные опоры</h3>
          <ul class="split-list">
            ${strengths.slice(0, 6).map((item) => `<li>${escapeHtml(item.layerName)} / ${escapeHtml(item.title)}: ${escapeHtml(formatScore(item.score))}</li>`).join("") || "<li>Явные опоры пока не выделены.</li>"}
          </ul>
        </article>
      </div>
    </section>
  `;
}

function renderLayers(detail) {
  const rows = detail.layerAnalyses || [];
  const sourceById = new Map((detail.sources || []).map((source) => [source.id, source]));
  const architectureItemsByLayer = (detail.architectureItems || []).reduce((map, item) => {
    const key = item.layerCode || "";
    if (!map.has(key)) {
      map.set(key, []);
    }
    map.get(key).push(item);
    return map;
  }, new Map());

  return `
    <section class="content-section">
      <div class="section-head">
        <h3>11 слоёв</h3>
      </div>
      <div class="stack">
        ${rows.length ? rows.map((layer, index) => {
          const architectureItems = architectureItemsByLayer.get(layer.layerCode) || [];
          const layerSources = [
            ...(layer.sourceIds || []).map((sourceId) => sourceById.get(sourceId)),
            ...(detail.sources || []).filter((source) => (source.relatedLayers || []).includes(layer.layerCode))
          ]
            .filter(Boolean)
            .filter((source, sourceIndex, sources) => sources.findIndex((item) => item.id === source.id) === sourceIndex)
            .filter((source) => layerHasEvidence(source, layer.layerCode))
            .slice(0, 5);
          const filledEntries = Object.entries(layer.filledFields || {});
          const missingFields = layer.missingFields || [];
          const architectureRows = architectureItems.map((item) => ({
            ...item,
            evidence: architectureItemEvidence(item, detail.sources || [])
          }));
          const percent = architectureRows.length ? coveragePercent(architectureRows) : filledPercent(layer);
          const domainGroups = groupArchitectureRowsByDomain(architectureRows);
          const confirmedArchitectureItems = architectureRows.filter((item) => item.evidence.confirmedArtifacts.length);
          const draftArchitectureItems = architectureRows.filter((item) =>
            !item.evidence.confirmedArtifacts.length && item.evidence.draftSources.length
          );
          const needsReviewArchitectureItems = architectureRows.filter((item) =>
            !item.evidence.confirmedArtifacts.length && !item.evidence.draftSources.length && item.evidence.incompleteArtifacts.length
          );
          const missingArchitectureItems = architectureRows.filter((item) =>
            !item.evidence.confirmedArtifacts.length &&
            !item.evidence.draftSources.length &&
            !item.evidence.incompleteArtifacts.length
          );
          const visibleFacts = layerSources.length ? (layer.facts || []) : [];
          return `
	            <details class="layer-row layer-row-details">
	              <summary class="layer-summary">
	                <div>
	                  <h4>${escapeHtml(layerLabel(layer))}</h4>
	                  <span class="meta">Слой ${index + 1} из 11</span>
	                  <span class="pill ${coverageClass(percent)}" title="Заполненность считается по поддоменам карты инструментов, а не по общему числу сигналов.">${escapeHtml(coverageLabel(percent))}</span>
	                </div>
	                <div>
	                  <p>${escapeHtml((layer.conclusions || [])[0] || "")}</p>
	                  <div class="layer-quick-stats">
	                    <span>сигналы: ${escapeHtml(confidenceLabel(layer.confidence))}</span>
	                    <span>эталон: ${escapeHtml(filledEntries.length)}/${escapeHtml(filledEntries.length + missingFields.length)}</span>
	                    <span>${escapeHtml(confirmedArchitectureItems.length)} поддоменов подтверждено</span>
	                    <span>${escapeHtml(needsReviewArchitectureItems.length)} проверить</span>
	                    <span>${escapeHtml(draftArchitectureItems.length)} можно собрать</span>
	                    <span>${escapeHtml(missingArchitectureItems.length)} без данных</span>
	                  </div>
	                </div>
                <div>
                  <span class="meta">${percent}%</span>
                  <div class="progress" aria-hidden="true"><span style="--value: ${percent}%"></span></div>
                  <span class="layer-toggle"></span>
                </div>
              </summary>
              <div class="layer-expand">
                <div class="layer-expand-grid single-panel">
                  <div class="layer-panel">
                    <h5>Домены и поддомены</h5>
                    <p>Слой и домен показывают общую заполненность. Рабочая единица ниже — поддомен: именно по нему проверяется свой артефакт, его содержание и недостающие данные.</p>
                    <div class="domain-coverage-list">
                      ${domainGroups.length ? domainGroups.map((group) => `
                        <details class="domain-group">
                          <summary>
                            <div>
                              <strong>${escapeHtml(group.domain)}</strong>
                              <span>${escapeHtml(group.confirmedCount)} подтверждено · ${escapeHtml(group.reviewCount)} проверить · ${escapeHtml(group.draftCount)} можно собрать · ${escapeHtml(group.missingCount)} пусто · ${escapeHtml(group.rows.length)} поддоменов</span>
                            </div>
                            <div class="domain-meter">
                              <span>${escapeHtml(group.percent)}%</span>
                              <div class="progress" aria-hidden="true"><span style="--value: ${group.percent}%"></span></div>
                            </div>
                          </summary>
                          <div class="architecture-list">
                            ${group.rows.map((item) => {
                              const status = architectureItemStatus(item);
                              return `
                                <details class="architecture-item ${escapeHtml(status.className)}">
                                  <summary class="architecture-item-head">
                                    <div>
                                      <strong>${escapeHtml(itemSubdomain(item))}</strong>
                                      <span>Поддомен · ${escapeHtml(itemParentDomain(item))}</span>
                                    </div>
                                    <em class="source-quality source-quality-${escapeHtml(status.code === "covered" ? "sufficient" : status.code === "review" ? "partial" : status.code === "draft" ? "partial" : "insufficient")}">${escapeHtml(status.label)} · ${escapeHtml(status.percent)}%</em>
                                  </summary>
                                  <div class="architecture-item-body">
                                    ${renderMethodologyDetails(item)}
                                    ${status.code === "covered" ? `
                                      <div class="source-link-list compact-source-list">
                                        <strong>Основание:</strong>
                                        ${item.evidence.confirmedArtifacts.map(renderEvidenceEntry).join("")}
                                      </div>
                                    ` : ""}
                                    ${status.code === "review" ? `
                                      <p>Артефакт найден, но его содержание ещё не закрывает поддомен уверенно.</p>
                                      <div class="source-link-list compact-source-list">
                                        <strong>Проверить:</strong>
                                        ${item.evidence.incompleteArtifacts.map(renderEvidenceEntry).join("")}
                                      </div>
                                    ` : ""}
                                    ${status.code === "draft" ? `
                                      <p>Полезные данные есть в других источниках. Их можно использовать как опору, но нужно собрать отдельный артефакт по этому поддомену.</p>
                                      ${item.toolHints ? `<p><b>Что собрать:</b> ${escapeHtml(item.toolHints)}</p>` : ""}
                                      <div class="source-link-list compact-source-list">
                                        <strong>Данные найдены:</strong>
                                        ${item.evidence.draftSources.map(renderEvidenceEntry).join("")}
                                      </div>
                                    ` : ""}
                                    ${status.code === "missing" ? `
                                      ${item.toolHints ? `<p><b>Что собрать:</b> ${escapeHtml(item.toolHints)}</p>` : ""}
                                      <p>Пока нет ни подтверждённого артефакта, ни достаточных данных по этому поддомену.</p>
                                    ` : ""}
                                  </div>
                                </details>
                              `;
                            }).join("")}
                          </div>
                        </details>
                      `).join("") : `<p class="hint-text">Поддомены слоя ещё не загружены из карты инструментов.</p>`}
                    </div>
                  </div>
                </div>

                <div class="layer-panel">
                  <h5>Факты и артефакты</h5>
                  ${visibleFacts.length ? `
                    <ul class="split-list">
                      ${visibleFacts.map((fact) => `<li>${escapeHtml(fact)}</li>`).join("")}
                    </ul>
                  ` : `<p class="hint-text">Факты по этой области пока не подтверждены содержанием источников.</p>`}
                  ${layerSources.length ? `
                    <div class="source-link-list">
                      <strong>Источники слоя:</strong>
                      ${layerSources.map((source) => source.fileUrl
                        ? `<a href="${escapeHtml(source.fileUrl)}" target="_blank" rel="noreferrer">${escapeHtml(source.title || source.fileUrl)}</a>`
                        : `<span>${escapeHtml(source.title || "Источник")}</span>`
                      ).join("")}
                    </div>
                  ` : `<p class="hint-text">Привязанных артефактов пока нет.</p>`}
                </div>
              </div>
            </details>
          `;
        }).join("") : `<div class="empty-state"><h2>Слои не собраны</h2><p>Запусти анализ.</p></div>`}
      </div>
    </section>
  `;
}

function renderProblems(detail) {
  const analysis = detail.analysis || {};
  const missing = analysis.missingData || [];
  const constraint = analysis.probableConstraint || {};
  const parallelActions = analysis.parallelActions || constraint.parallelActions || [];

  return `
    ${parallelActions.length ? `
      <section class="content-section">
        <div class="section-head">
          <h3>Параллельные действия</h3>
        </div>
        <div class="stack">
          ${parallelActions.slice(0, 3).map((action) => `
            <article class="problem-row">
              <h4>${escapeHtml(action.title)}</h4>
              <p>${escapeHtml(action.description || "")}</p>
              ${action.why ? `<p><strong>Зачем:</strong> ${escapeHtml(action.why)}</p>` : ""}
              <div class="pill-row">
                <span class="pill orange">${escapeHtml(action.layerName || action.layer)}</span>
              </div>
            </article>
          `).join("")}
        </div>
      </section>
    ` : ""}

    <section class="content-section">
      <div class="section-head">
        <h3>Пробелы</h3>
      </div>
      <p class="section-note">Это не список всех пустых мест. Здесь только ближайшие данные, которые сильнее всего влияют на текущий вывод и следующий шаг.</p>
      <div class="stack">
        ${missing.length ? missing.slice(0, 8).map((item) => `
          <article class="problem-row">
            <h4>${escapeHtml(item.layerName || item.layer)}</h4>
            <p>${escapeHtml(item.whyNeeded)}</p>
            <div class="pill-row">
              ${(item.missingFields || []).slice(0, 6).map((field) => `<span class="pill">${escapeHtml(field)}</span>`).join("")}
            </div>
          </article>
        `).join("") : `<div class="empty-state"><h2>Пробелов нет</h2><p>Или анализ ещё не запускался.</p></div>`}
      </div>
    </section>
  `;
}

function renderDetail() {
  const detail = state.selectedDetail;
  if (!detail) {
    renderEmpty();
    return;
  }

  content.innerHTML = [
    renderOverview(detail),
    renderDeepDiagnostic(detail),
    renderIntegrations(detail),
    renderSources(detail),
    renderLayers(detail),
    renderProblems(detail)
  ].join("");

  document.querySelector("#analyzeButton")?.addEventListener("click", analyzeSelectedCompany);
  document.querySelector("#editCompanyButton")?.addEventListener("click", () => openCompanyModal(detail.company));
  document.querySelector("#deleteCompanyButton")?.addEventListener("click", deleteSelectedCompany);
  document.querySelector("#syncGoogleDriveButton")?.addEventListener("click", syncGoogleDrive);
  document.querySelector("#syncPublicGoogleFolderButton")?.addEventListener("click", openPublicGoogleFolderModal);
  document.querySelector("#addSourceButton")?.addEventListener("click", openSourceModal);
  document.querySelector("#importDeepDiagnosticButton")?.addEventListener("click", importSelectedDeepDiagnostic);
}

function openModal(markup) {
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `<section class="modal">${markup}</section>`;
  document.body.append(backdrop);
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop || event.target.closest("[data-close-modal]")) {
      backdrop.remove();
    }
  });
  return backdrop;
}

function openCompanyModal(company = null) {
  const isEdit = Boolean(company?.id);
  const backdrop = openModal(`
    <div class="modal-head">
      <h2>${isEdit ? "Компания" : "Новая компания"}</h2>
      <button class="close-button ghost" data-close-modal type="button">×</button>
    </div>
    <form id="companyForm" class="form-grid">
      <label>Название
        <input name="name" required value="${escapeHtml(company?.name || "")}">
      </label>
      <label>Отрасль
        <input name="industry" value="${escapeHtml(company?.industry || "")}">
      </label>
      <label class="wide">Описание
        <textarea name="description">${escapeHtml(company?.description || "")}</textarea>
      </label>
      <label class="wide">Цель собственника
        <textarea name="ownerGoal">${escapeHtml(company?.ownerGoal || "")}</textarea>
      </label>
      <label class="wide">Текущий запрос
        <textarea name="currentRequest">${escapeHtml(company?.currentRequest || "")}</textarea>
      </label>
      ${isEdit ? "" : `
        <label class="wide">Комментарий
          <textarea name="comment"></textarea>
        </label>
      `}
      <div class="wide actions">
        <button class="secondary" data-close-modal type="button">Отмена</button>
        <button type="submit">Сохранить</button>
      </div>
    </form>
  `);

  backdrop.querySelector("#companyForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body = Object.fromEntries(form.entries());
    try {
      if (isEdit) {
        await api(`/${encodeURIComponent(company.id)}`, { method: "PATCH", body });
        await openCompany(company.id, { replaceRoute: true });
      } else {
        const payload = await api("", { method: "POST", body });
        await loadCompanies();
        await openCompany(payload.company.id);
      }
      backdrop.remove();
    } catch (error) {
      alert(error.message || error);
    }
  });
}

function openSourceModal() {
  const backdrop = openModal(`
    <div class="modal-head">
      <h2>Источник</h2>
      <button class="close-button ghost" data-close-modal type="button">×</button>
    </div>
    <form id="sourceForm" class="form-grid">
      <label>Название
        <input name="title" value="">
      </label>
      <label>Тип
        <select name="type">
          <option value="text">текст</option>
          <option value="meeting_note">заметка со встречи</option>
          <option value="link">ссылка</option>
          <option value="document">документ</option>
          <option value="table">таблица</option>
        </select>
      </label>
      <label class="wide">Ссылка
        <input name="fileUrl" placeholder="Google Doc / Sheet или другая ссылка" value="">
        <span class="hint">Быстрый вариант: открой доступ «Все, у кого есть ссылка, могут просматривать» и вставь ссылку на Google Doc или Sheet. Для папки используй кнопку «Подключить папку по ссылке» в блоке интеграций.</span>
      </label>
      <label class="wide">Текст
        <textarea name="contentText" placeholder="Можно вставить текст вручную, если ссылка закрытая или это не Google Doc / Sheet."></textarea>
      </label>
      <div class="wide actions">
        <button class="secondary" data-close-modal type="button">Отмена</button>
        <button type="submit">Добавить</button>
      </div>
    </form>
  `);

  backdrop.querySelector("#sourceForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body = Object.fromEntries(form.entries());
    try {
      await api(`/${encodeURIComponent(state.selectedCompanyId)}/sources`, { method: "POST", body });
      await openCompany(state.selectedCompanyId, { replaceRoute: true });
      backdrop.remove();
    } catch (error) {
      alert(error.message || error);
    }
  });
}

function openPublicGoogleFolderModal() {
  const backdrop = openModal(`
    <div class="modal-head">
      <h2>Папка Google Drive</h2>
      <button class="close-button ghost" data-close-modal type="button">×</button>
    </div>
    <form id="publicFolderForm" class="form-grid">
      <label class="wide">Ссылка на папку
        <input name="folderUrl" required placeholder="https://drive.google.com/drive/folders/..." value="">
        <span class="hint">Открой доступ к папке: «Все, у кого есть ссылка, могут просматривать». AI-BOSS попробует прочитать Google Docs, Sheets и Slides внутри папки. PDF и изображения сохранятся ссылками или потребуют отдельного извлечения.</span>
      </label>
      <div class="wide actions">
        <button class="secondary" data-close-modal type="button">Отмена</button>
        <button type="submit">Синхронизировать</button>
      </div>
    </form>
  `);

  backdrop.querySelector("#publicFolderForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body = Object.fromEntries(form.entries());
    try {
      renderLoading("Читаю публичную папку Google Drive");
      const payload = await api(`/${encodeURIComponent(state.selectedCompanyId)}/integrations/google-drive/public-folder/sync`, {
        method: "POST",
        body
      });
      await loadCompanies();
      await openCompany(state.selectedCompanyId, { replaceRoute: true });
      backdrop.remove();

      const result = payload.publicFolder || {};
      if (!result.ok) {
        alert(result.reason || "Папка не синхронизирована.");
        return;
      }

      alert(`Папка синхронизирована.\nНайдено файлов: ${result.filesFound || 0}\nСохранено источников: ${result.syncedCount || 0}\nПрочитано текстом: ${result.readableCount || 0}`);
    } catch (error) {
      backdrop.remove();
      renderError(error);
    }
  });
}

async function loadCompanies() {
  const payload = await api("");
  state.companies = payload.companies || [];
  renderCompanyList();
}

async function openCompany(companyId, options = {}) {
  state.selectedCompanyId = companyId;
  setActiveSiteNav("companies");
  if (!options.replaceRoute) {
    setRoute(companyId);
  }
  renderCompanyList();
  renderLoading("Загружаю компанию");
  const payload = await api(`/${encodeURIComponent(companyId)}`);
  state.selectedDetail = payload;
  renderCompanyList();
  renderDetail();
}

async function analyzeSelectedCompany() {
  if (!state.selectedCompanyId) {
    return;
  }

  renderLoading("Анализирую компанию");
  await api(`/${encodeURIComponent(state.selectedCompanyId)}/analyze`, { method: "POST" });
  await loadCompanies();
  await openCompany(state.selectedCompanyId, { replaceRoute: true });
}

async function deleteSelectedCompany() {
  const detail = state.selectedDetail;
  const company = detail?.company;
  if (!company?.id) {
    return;
  }

  const confirmation = window.prompt(`Удалить компанию «${company.name}» и все связанные данные?\n\nЧтобы подтвердить, введи: УДАЛИТЬ`);
  if (confirmation !== "УДАЛИТЬ") {
    return;
  }

  try {
    renderLoading("Удаляю компанию");
    await api(`/${encodeURIComponent(company.id)}`, { method: "DELETE" });
    state.selectedCompanyId = "";
    state.selectedDetail = null;
    setRoute("");
    await loadCompanies();
    const nextCompanyId = state.companies[0]?.id || "";
    if (nextCompanyId) {
      await openCompany(nextCompanyId);
    } else {
      renderEmpty();
    }
  } catch (error) {
    renderError(error);
  }
}

async function syncGoogleDrive() {
  if (!state.selectedCompanyId) {
    return;
  }

  try {
    renderLoading("Синхронизирую Google Drive");
    const payload = await api(`/${encodeURIComponent(state.selectedCompanyId)}/integrations/google-drive/sync`, { method: "POST" });
    await loadCompanies();
    await openCompany(state.selectedCompanyId, { replaceRoute: true });

    const result = payload.googleDrive || {};
    if (!result.ok) {
      alert(result.message || "Google Drive не синхронизирован.");
      return;
    }

    alert(`Google Drive синхронизирован.\nСохранено источников: ${result.syncedCount || 0}\nПрочитано текстом: ${result.readableCount || 0}`);
  } catch (error) {
    renderError(error);
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("error", () => reject(reader.error || new Error("Не удалось прочитать файл.")));
    reader.addEventListener("load", () => {
      const bytes = new Uint8Array(reader.result);
      let binary = "";
      const chunkSize = 0x8000;
      for (let index = 0; index < bytes.length; index += chunkSize) {
        binary += String.fromCharCode(...bytes.slice(index, index + chunkSize));
      }
      resolve(btoa(binary));
    });
    reader.readAsArrayBuffer(file);
  });
}

async function importSelectedDeepDiagnostic() {
  if (!state.selectedCompanyId) {
    return;
  }

  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    try {
      renderLoading("Импортирую глубокую диагностику");
      const fileBase64 = await fileToBase64(file);
      await api(`/${encodeURIComponent(state.selectedCompanyId)}/import/deep-diagnostic`, {
        method: "POST",
        body: {
          fileName: file.name,
          fileBase64
        }
      });
      await api(`/${encodeURIComponent(state.selectedCompanyId)}/analyze`, { method: "POST" });
      await loadCompanies();
      await openCompany(state.selectedCompanyId, { replaceRoute: true });
    } catch (error) {
      renderError(error);
    }
  });
  input.click();
}

async function bootstrap() {
  setAuthenticated(Boolean(state.token));
  if (!state.token) {
    return;
  }

  try {
    await loadCompanies();
    const siteView = routeSiteView();
    if (siteView) {
      await renderSitePage(siteView);
      return;
    }
    setActiveSiteNav("companies");
    const fromRoute = routeCompanyId();
    const firstId = fromRoute || state.companies[0]?.id || "";
    if (firstId) {
      await openCompany(firstId, { replaceRoute: Boolean(fromRoute) });
    } else {
      renderEmpty();
    }
  } catch (error) {
    setTokenHint(error.message || String(error), "error");
    renderError(error);
  }
}

tokenForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  state.token = tokenInput.value.trim();
  localStorage.setItem(TOKEN_KEY, state.token);
  setAuthenticated(Boolean(state.token));
  await bootstrap();
});

logoutButton.addEventListener("click", () => {
  state.token = "";
  localStorage.removeItem(TOKEN_KEY);
  setAuthenticated(false);
});

refreshButton.addEventListener("click", async () => {
  if (!state.token) {
    return;
  }
  await bootstrap();
});

newCompanyButton.addEventListener("click", () => openCompanyModal());

window.addEventListener("popstate", async () => {
  const siteView = routeSiteView();
  if (siteView) {
    await renderSitePage(siteView);
    return;
  }
  const companyId = routeCompanyId();
  if (companyId) {
    await openCompany(companyId, { replaceRoute: true });
  } else {
    state.selectedCompanyId = "";
    state.selectedDetail = null;
    renderCompanyList();
    renderEmpty();
  }
});

window.addEventListener("hashchange", async () => {
  if (!state.token) {
    return;
  }
  const siteView = routeSiteView();
  if (siteView) {
    await renderSitePage(siteView);
    return;
  }
  await bootstrap();
});

if (state.token) {
  tokenInput.value = state.token;
}

bootstrap();

initWorkspaceChat({
  endpoint: "/api/companies/chat",
  title: "AI-BOSS",
  tokenProvider: () => state.token,
  contextProvider: () => ({
    page: routeSiteView() || "companies",
    companyId: state.selectedCompanyId,
    companyName: state.selectedDetail?.company?.name || ""
  })
});
