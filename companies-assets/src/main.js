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

function filledPercent(item) {
  const filled = Number(item.filledFieldsCount || Object.keys(item.filledFields || {}).length || 0);
  const missing = Number(item.missingFieldsCount || (item.missingFields || []).length || 0);
  const total = filled + missing;
  return total ? Math.round((filled / total) * 100) : 0;
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
          <span class="pill ${confidenceClass(analysis?.confidence)}">${escapeHtml(analysis?.confidence || "без анализа")}</span>
          <span class="pill">${escapeHtml(formatDate(analysis?.createdAt || company.lastAnalysisAt))}</span>
        </div>
      </div>
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
    </section>
  `;
}

function renderSources(detail) {
  const rows = detail.sources || [];
  return `
    <section class="content-section">
      <div class="section-head">
        <h3>Данные</h3>
        <button id="addSourceButton" type="button">Добавить источник</button>
      </div>
      <div class="stack">
        ${rows.length ? rows.map((source) => `
          <article class="source-row">
            <h4>${escapeHtml(source.title || "Источник")}</h4>
            <p>${escapeHtml(source.aiSummary || source.contentText || source.fileUrl || "")}</p>
            <div class="pill-row">
              <span class="pill">${escapeHtml(source.sourceOrigin || "source")}</span>
              <span class="pill">${escapeHtml(source.processingStatus || "")}</span>
              ${(source.relatedLayers || []).slice(0, 4).map((layer) => `<span class="pill orange">${escapeHtml(layer)}</span>`).join("")}
            </div>
          </article>
        `).join("") : `<div class="empty-state"><h2>Источников нет</h2><p>Добавь заметку или ссылку.</p></div>`}
      </div>
    </section>
  `;
}

function renderLayers(detail) {
  const rows = detail.layerAnalyses || [];
  return `
    <section class="content-section">
      <div class="section-head">
        <h3>11 слоёв</h3>
      </div>
      <div class="stack">
        ${rows.length ? rows.map((layer) => {
          const percent = filledPercent(layer);
          return `
            <article class="layer-row">
              <div>
                <h4>${escapeHtml(layer.layerCode)}</h4>
                <span class="pill ${confidenceClass(layer.confidence)}">${escapeHtml(layer.confidence)}</span>
              </div>
              <div>
                <p>${escapeHtml((layer.conclusions || [])[0] || "")}</p>
                <ul class="split-list">
                  ${(layer.facts || []).slice(0, 2).map((fact) => `<li>${escapeHtml(fact)}</li>`).join("")}
                </ul>
              </div>
              <div>
                <span class="meta">${percent}%</span>
                <div class="progress" aria-hidden="true"><span style="--value: ${percent}%"></span></div>
              </div>
            </article>
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
              <span class="pill ${confidenceClass(problem.confidence)}">${escapeHtml(problem.confidence)}</span>
            </div>
          </article>
        `).join("") : `<div class="empty-state"><h2>Нет проблематик</h2><p>Нужны данные или анализ.</p></div>`}
      </div>
    </section>

    <section class="content-section">
      <div class="section-head">
        <h3>Вероятное ограничение</h3>
        <span class="pill ${confidenceClass(constraint.confidence)}">${escapeHtml(constraint.confidence || "LOW")}</span>
      </div>
      <article class="card">
        <h3>${escapeHtml(constraint.title || "Пока не выбрано")}</h3>
        <p>${escapeHtml(constraint.explanation || "Запусти анализ после добавления данных.")}</p>
        ${constraint.cause ? `<p><strong>Причина:</strong> ${escapeHtml(constraint.cause)}</p>` : ""}
      </article>
    </section>

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
    renderSources(detail),
    renderLayers(detail),
    renderProblems(detail)
  ].join("");

  document.querySelector("#analyzeButton")?.addEventListener("click", analyzeSelectedCompany);
  document.querySelector("#editCompanyButton")?.addEventListener("click", () => openCompanyModal(detail.company));
  document.querySelector("#addSourceButton")?.addEventListener("click", openSourceModal);
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
        <input name="fileUrl" value="">
      </label>
      <label class="wide">Текст
        <textarea name="contentText"></textarea>
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
