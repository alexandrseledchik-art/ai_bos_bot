const TOKEN_KEY = "aibos_companies_token";

const state = {
  token: localStorage.getItem(TOKEN_KEY) || "",
  companies: [],
  selectedCompanyId: "",
  selectedDetail: null,
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
    return "данных достаточно";
  }
  if (value === "MEDIUM") {
    return "часть данных есть";
  }
  return "данных мало";
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

  return `качество разбора: ${score}/10`;
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

function renderSmallList(items, emptyText = "Пока нет данных.", formatter = (item) => item) {
  const rows = asArray(items)
    .map((item) => formatter(item))
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

function renderLayerEvidenceRows(layers = []) {
  const rows = asArray(layers).slice(0, 5);
  if (!rows.length) {
    return `<p class="hint-text">Пока не видно, какие области реально объясняют ситуацию.</p>`;
  }

  return `
    <div class="stack compact-stack">
      ${rows.map((layer) => `
        <div class="mini-row evidence-row">
          <strong>${escapeHtml(layer.layerName || layer.layer || "Слой")}</strong>
          <span>${escapeHtml(confidenceLabel(layer.confidence))}</span>
          ${asArray(layer.facts).length ? `<p><b>Что уже видно:</b> ${escapeHtml(asArray(layer.facts).slice(0, 2).map(humanizeEvidenceItem).filter(Boolean).join(" "))}</p>` : ""}
          ${asArray(layer.missingFields).length ? `<p><b>Чего не хватает:</b> ${escapeHtml(asArray(layer.missingFields).slice(0, 3).map(humanizeMissingField).filter(Boolean).join(", "))}</p>` : ""}
        </div>
      `).join("")}
    </div>
  `;
}

function renderRejectedRows(rejected = []) {
  const rows = asArray(rejected).slice(0, 4);
  if (!rows.length) {
    return `<p class="hint-text">Пока нет сильных альтернатив основной версии.</p>`;
  }

  return `
    <ul class="split-list compact-list">
      ${rows.map((item) => `<li><strong>${escapeHtml(item.layerName || item.layer || "Версия")}</strong> — ${escapeHtml(item.reason || "объясняет запрос слабее основной версии")}</li>`).join("")}
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
  return Array.isArray(source?.sourceMeta?.toolMatches) ? source.sourceMeta.toolMatches : [];
}

function sourceContentMatches(source) {
  return Array.isArray(source?.sourceMeta?.contentMatches) ? source.sourceMeta.contentMatches : [];
}

function sourceMatchesLayerByTool(source, layerCode) {
  const matches = sourceToolMatches(source);
  return matches.some((match) => match.layerId === layerCode);
}

function sourceMatchesLayerByContent(source, layerCode) {
  return sourceContentMatches(source).some((match) => match.layerId === layerCode);
}

function sourceMatchCoversArchitectureItem(match, item) {
  return match.layerId === item.layerCode && domainsOverlap(match.domain, item.domain);
}

function sourceArchitectureItemMatches(source, item) {
  return sourceToolMatches(source).filter((match) => sourceMatchCoversArchitectureItem(match, item));
}

function sourceArchitectureContentMatches(source, item) {
  return sourceContentMatches(source).filter((match) => sourceMatchCoversArchitectureItem(match, item));
}

function architectureItemEvidence(item, sources) {
  const directArtifacts = sources
    .map((source) => ({
      source,
      matches: sourceArchitectureItemMatches(source, item),
      contentMatches: sourceArchitectureContentMatches(source, item)
    }))
    .filter((entry) => entry.matches.length);
  const confirmedArtifacts = directArtifacts.filter((entry) => entry.contentMatches.length);
  const incompleteArtifacts = directArtifacts.filter((entry) => !entry.contentMatches.length);
  const draftSources = sources
    .map((source) => ({
      source,
      contentMatches: sourceArchitectureContentMatches(source, item)
    }))
    .filter((entry) =>
      entry.contentMatches.length &&
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

function renderEvidenceEntry({ source, matches = [], contentMatches = [] }) {
  const matchLabels = [
    ...matches.map((match) => match.name || match.domain),
    ...contentMatches.map((match) => match.domain || match.description)
  ].filter(Boolean);

  return `
    <span class="source-evidence">
      ${source.fileUrl
        ? `<a href="${escapeHtml(source.fileUrl)}" target="_blank" rel="noreferrer">${escapeHtml(source.title || source.fileUrl)}</a>`
        : `<span>${escapeHtml(source.title || "Источник")}</span>`}
      ${matchLabels.length ? `<small>${escapeHtml(matchLabels.join("; "))}</small>` : ""}
    </span>
  `;
}

function filledPercent(item) {
  const filled = Number(item.filledFieldsCount || Object.keys(item.filledFields || {}).length || 0);
  const missing = Number(item.missingFieldsCount || (item.missingFields || []).length || 0);
  const total = filled + missing;
  return total ? Math.round((filled / total) * 100) : 0;
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

function renderOverview(detail) {
  const { company, analysis } = detail;
  const constraint = analysis?.probableConstraint || company.probableConstraint || {};
  const nextStep = analysis?.nextStep || company.nextStep || {};
  const parallelActions = analysis?.parallelActions || constraint.parallelActions || [];
  const diagnosticQuality = analysis?.diagnosticQuality || {};
  const rejectedHypotheses = analysis?.rejectedHypotheses || constraint.rejectedAlternatives || [];
  const diagnosticChain = analysis?.diagnosticChain || constraint.relatedLayers || [];
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
          ${diagnosticQuality.score10 != null ? `<span class="pill green" title="Оценивает не результат бизнеса, а качество рассуждения AI-BOSS: отделяет факты от гипотез, не путает причину и следствие, выбирает один следующий шаг.">${escapeHtml(diagnosticQualityLabel(diagnosticQuality.score10))}</span>` : ""}
          <span class="pill">${escapeHtml(formatDate(analysis?.createdAt || company.lastAnalysisAt))}</span>
        </div>
      </div>
      ${analysis ? `
        <p class="section-note">Уверенность показывает, насколько вывод подтверждён данными. Качество разбора показывает, аккуратно ли AI-BOSS отделил факты, версии и следующий шаг.</p>
      ` : ""}
      <div class="grid-two">
        <article class="card">
          <h3>Главный вывод</h3>
          <p>${escapeHtml(analysis?.summary || "Анализ ещё не запускался.")}</p>
        </article>
        <article class="card">
          <h3>Следующий шаг</h3>
          <p>${escapeHtml(nextStep.title || "Не выбран.")}</p>
          ${nextStep.why ? `<p><strong>Зачем:</strong> ${escapeHtml(nextStep.why)}</p>` : ""}
        </article>
      </div>
      ${analysis ? `
        <div class="grid-two evidence-grid">
          <article class="card">
            <h3>Как AI-BOSS пришёл к выводу</h3>
            ${selectionBasis.length ? `
              <p><strong>Почему выбрана эта версия:</strong></p>
              ${renderSmallList(selectionBasis)}
            ` : ""}
            <p><strong>На что опираюсь:</strong></p>
            ${renderSmallList(evidence, "Пока нет понятных опор в данных. Нужно открыть области и источники.", humanizeEvidenceItem)}
            <p><strong>Какие области проверил:</strong></p>
            ${renderLayerEvidenceRows(diagnosticChain)}
            <p><strong>Что важно, но пока не похоже на главную причину:</strong></p>
            ${renderRejectedRows(rejectedHypotheses)}
          </article>
          <article class="card">
            <h3>Почему следующий шаг такой</h3>
            ${nextStepBasis.length ? renderSmallList(nextStepBasis) : renderSmallList([
              nextStep.why || "Шаг выбран как минимальная проверка текущей версии.",
              "Он должен снизить неопределённость, а не сразу запустить большой проект изменений."
            ])}
            ${nextStep.expectedResult ? `<p><strong>Что должно получиться:</strong> ${escapeHtml(nextStep.expectedResult)}</p>` : ""}
            ${nextStep.successCriteria ? `<p><strong>Критерий результата:</strong> ${escapeHtml(nextStep.successCriteria)}</p>` : ""}
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
      ${parallelActions.length ? `
        <article class="card">
          <h3>Что можно делать параллельно</h3>
          <p>Это не заменяет главный фокус. Такие шаги можно делать уже сейчас: они дают факты и не заставляют преждевременно перестраивать весь бизнес.</p>
          <ul class="split-list">
            ${parallelActions.slice(0, 3).map((action) => `<li><strong>${escapeHtml(action.title)}</strong>${action.why ? ` — ${escapeHtml(action.why)}` : ""}</li>`).join("")}
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
        <p>${escapeHtml(overall.conclusion || "")}</p>
      </article>

      <div class="grid-two">
        <article class="card">
          <h3>Главная рабочая версия</h3>
          <p><strong>${escapeHtml(root.title || "Пока не выбрана")}</strong></p>
          <p>${escapeHtml(root.why || "")}</p>
          ${root.notRootYet?.length ? `<p><strong>Не считаю корнем прямо сейчас:</strong> ${escapeHtml(root.notRootYet.join(", "))}.</p>` : ""}
        </article>
        <article class="card">
          <h3>Следующий шаг</h3>
          <p><strong>${escapeHtml(nextStep.title || "Не выбран")}</strong></p>
          <p>${escapeHtml(nextStep.why || "")}</p>
          ${nextStep.result ? `<p><strong>Результат:</strong> ${escapeHtml(nextStep.result)}</p>` : ""}
          ${missingForConfidence.length ? `
            <p><strong>Для большей уверенности нужны:</strong></p>
            <ul class="split-list">
              ${missingForConfidence.slice(0, 5).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
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
                <p>${escapeHtml(item.conclusion || "")}</p>
              </div>
            `).join("")}
          </div>
        </article>
        <article class="card">
          <h3>Что можно запускать параллельно</h3>
          ${parallel.length ? `
            <ul class="split-list">
              ${parallel.slice(0, 4).map((item) => `<li><strong>${escapeHtml(item.title)}</strong> — ${escapeHtml(item.why || "")}</li>`).join("")}
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
          const percent = filledPercent(layer);
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
            <details class="layer-row layer-row-details" ${index === 0 ? "open" : ""}>
              <summary class="layer-summary">
                <div>
                  <h4>${escapeHtml(layerLabel(layer))}</h4>
                  <span class="meta">Слой ${index + 1} из 11</span>
                  <span class="pill ${confidenceClass(layer.confidence)}">${escapeHtml(confidenceLabel(layer.confidence))}</span>
                </div>
                <div>
                  <p>${escapeHtml((layer.conclusions || [])[0] || "")}</p>
                  <div class="layer-quick-stats">
                    <span>${escapeHtml(filledEntries.length)} собрано</span>
                    <span>${escapeHtml(missingFields.length)} не заполнено</span>
                    <span>${escapeHtml(confirmedArchitectureItems.length)} подтверждено</span>
                    <span>${escapeHtml(draftArchitectureItems.length)} можно собрать</span>
                  </div>
                </div>
                <div>
                  <span class="meta">${percent}%</span>
                  <div class="progress" aria-hidden="true"><span style="--value: ${percent}%"></span></div>
                  <span class="layer-toggle"></span>
                </div>
              </summary>
              <div class="layer-expand">
                <div class="layer-expand-grid">
                  <div class="layer-panel">
                    <h5>С чем сравниваем реальность</h5>
                    <p>Это минимальные параметры, без которых нельзя честно сказать, хорошо или плохо работает эта область.</p>
                    <div class="parameter-list">
                      ${filledEntries.length ? filledEntries.map(([field, value]) => `
                        <div class="parameter-row is-covered">
                          <span class="parameter-status">✓</span>
                          <div>
                            <strong>${escapeHtml(field)}</strong>
                            <p>${escapeHtml(value)}</p>
                          </div>
                        </div>
                      `).join("") : ""}
                      ${missingFields.length ? missingFields.map((field) => `
                        <div class="parameter-row is-missing">
                          <span class="parameter-status">!</span>
                          <div>
                            <strong>${escapeHtml(field)}</strong>
                            <p>По этому параметру пока нет достаточного факта или документа.</p>
                          </div>
                        </div>
                      `).join("") : ""}
                      ${!filledEntries.length && !missingFields.length ? `<p class="hint-text">Эталон слоя ещё не собран. Запусти анализ или добавь источники.</p>` : ""}
                    </div>
                  </div>
                  <div class="layer-panel">
                    <h5>Параметры архитектуры</h5>
                    <p>Строку закрывает только свой артефакт из карты инструментов и его содержание. Данные из чужих инструментов могут быть связанной опорой, но не заменяют отсутствующий артефакт.</p>
                    <div class="architecture-split">
                      <div>
                        <strong>Подтверждено артефактом</strong>
                        <div class="architecture-list">
                          ${confirmedArchitectureItems.length
                            ? confirmedArchitectureItems.map((item) => `
                              <div class="architecture-item is-covered">
                                <strong>${escapeHtml(item.domain)}</strong>
                                <span>${escapeHtml(item.block || "Параметр")}</span>
                                <p>${escapeHtml(item.description || "")}</p>
                                <div class="source-link-list compact-source-list">
                                  <strong>Основание:</strong>
                                  ${item.evidence.confirmedArtifacts.map(renderEvidenceEntry).join("")}
                                </div>
                              </div>
                            `).join("")
                            : `<span class="hint-text">Пока нет строки, где совпали и артефакт, и его содержание.</span>`}
                        </div>
                        ${draftArchitectureItems.length ? `
                          <strong class="subsection-title">Можно собрать артефакт</strong>
                          <div class="architecture-list">
                            ${draftArchitectureItems.map((item) => `
                              <div class="architecture-item is-draftable">
                                <strong>${escapeHtml(item.domain)}</strong>
                                <span>${escapeHtml(item.block || "Параметр")}</span>
                                <p>Данные уже есть в неразмеченных источниках, но отдельный артефакт по этой строке ещё не найден.</p>
                                ${item.toolHints ? `<p><b>Что собрать:</b> ${escapeHtml(item.toolHints)}</p>` : ""}
                                <div class="source-link-list compact-source-list">
                                  <strong>Данные найдены:</strong>
                                  ${item.evidence.draftSources.map(renderEvidenceEntry).join("")}
                                </div>
                              </div>
                            `).join("")}
                          </div>
                        ` : ""}
                        ${needsReviewArchitectureItems.length ? `
                          <strong class="subsection-title">Артефакт есть, надо проверить наполнение</strong>
                          <div class="architecture-list">
                            ${needsReviewArchitectureItems.map((item) => `
                              <div class="architecture-item is-review">
                                <strong>${escapeHtml(item.domain)}</strong>
                                <span>${escapeHtml(item.block || "Параметр")}</span>
                                <p>Файл похож на нужный артефакт, но в прочитанном тексте пока не видно нужных данных по этой строке.</p>
                                <div class="source-link-list compact-source-list">
                                  <strong>Проверить:</strong>
                                  ${item.evidence.incompleteArtifacts.map(renderEvidenceEntry).join("")}
                                </div>
                              </div>
                            `).join("")}
                          </div>
                        ` : ""}
                      </div>
                      <div>
                        <strong>Нужно добрать</strong>
                        <div class="architecture-list">
                          ${missingArchitectureItems.length
                            ? missingArchitectureItems.map((item) => `
                              <div class="architecture-item">
                                <strong>${escapeHtml(item.domain)}</strong>
                                <span>${escapeHtml(item.block || "Параметр")}</span>
                                <p>${escapeHtml(item.description || "")}</p>
                              </div>
                            `).join("")
                            : `<p class="hint-text">По всем параметрам слоя есть артефакт, данные или кандидат на сборку.</p>`}
                        </div>
                      </div>
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
  const problems = analysis.keyProblemAreas || [];
  const missing = analysis.missingData || [];
  const constraint = analysis.probableConstraint || {};
  const rejected = analysis.rejectedHypotheses || constraint.rejectedAlternatives || [];
  const parallelActions = analysis.parallelActions || constraint.parallelActions || [];

  return `
    <section class="content-section">
      <div class="section-head">
        <h3>Проблематики</h3>
      </div>
      <div class="stack">
        ${problems.length ? problems.map((problem) => `
          <article class="problem-row">
            <h4>${escapeHtml(problem.title)}</h4>
            <p>${escapeHtml(problem.whyImportant)}</p>
            <div class="pill-row">
              <span class="pill orange">${escapeHtml(problem.layerName || problem.layer)}</span>
              <span class="pill ${confidenceClass(problem.confidence)}">${escapeHtml(confidenceLabel(problem.confidence))}</span>
            </div>
          </article>
        `).join("") : `<div class="empty-state"><h2>Нет проблематик</h2><p>Нужны данные или анализ.</p></div>`}
      </div>
    </section>

    <section class="content-section">
      <div class="section-head">
        <h3>Вероятное ограничение</h3>
        <span class="pill ${confidenceClass(constraint.confidence)}">${escapeHtml(conclusionConfidenceLabel(constraint.confidence))}</span>
      </div>
      <article class="card">
        <h3>${escapeHtml(constraint.title || "Пока не выбрано")}</h3>
        <p>${escapeHtml(constraint.explanation || "Запусти анализ после добавления данных.")}</p>
        ${constraint.cause ? `<p><strong>Причина:</strong> ${escapeHtml(constraint.cause)}</p>` : ""}
        ${rejected.length ? `
          <p><strong>Почему не они:</strong> ${escapeHtml(rejected.slice(0, 3).map((item) => item.layerName || item.layer).join(", "))} важны, но сейчас больше похожи на следствие или источник фактов, а не на главную причину.</p>
        ` : ""}
      </article>
    </section>

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

if (state.token) {
  tokenInput.value = state.token;
}

bootstrap();
