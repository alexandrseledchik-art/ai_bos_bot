import { initWorkspaceChat } from "/companies-assets/src/workspace-chat.js?v=20260512-1";

const TOKEN_KEY = "aibos_admin_token";

const state = {
  token: localStorage.getItem(TOKEN_KEY) || "",
  view: "conversations",
  selectedConversationId: "",
  search: "",
  usersStatus: ""
};

const tokenPanel = document.querySelector("#tokenPanel");
const workspace = document.querySelector("#workspace");
const content = document.querySelector("#content");
const tokenForm = document.querySelector("#tokenForm");
const tokenInput = document.querySelector("#tokenInput");
const pasteTokenButton = document.querySelector("#pasteTokenButton");
const tokenHint = document.querySelector("#tokenHint");
const logoutButton = document.querySelector("#logoutButton");
const tabs = [...document.querySelectorAll(".tab")];

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
    return "";
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

function scoreClass(status) {
  if (status === "good") {
    return "green";
  }
  if (status === "critical") {
    return "red";
  }
  return "orange";
}

function severityClass(severity) {
  if (severity === "critical" || severity === "high") {
    return "high";
  }
  if (severity === "low") {
    return "low";
  }
  return "";
}

function setAuthenticated(isAuthenticated) {
  tokenPanel.hidden = isAuthenticated;
  workspace.hidden = !isAuthenticated;
  logoutButton.hidden = !isAuthenticated;
}

function setTokenHint(message, type = "") {
  if (!tokenHint) {
    return;
  }

  tokenHint.textContent = message;
  tokenHint.dataset.type = type;
}

function setTokenValue(value) {
  tokenInput.value = String(value || "").trim();
  tokenInput.focus();
  tokenInput.setSelectionRange(tokenInput.value.length, tokenInput.value.length);
}

async function api(path, options = {}) {
  const response = await fetch(`/api/admin/${path}`, {
    method: options.method || "GET",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${state.token}`
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {})
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `Admin API error: ${response.status}`);
  }

  return payload;
}

function setActiveTab(view) {
  tabs.forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.view === view);
  });
}

function renderError(error) {
  content.innerHTML = `<div class="error">${escapeHtml(error.message || error)}</div>`;
}

function renderLoading(label = "Загрузка") {
  content.innerHTML = `<div class="empty">${escapeHtml(label)}...</div>`;
}

function conversationTitle(item) {
  return item.company?.name || item.thread?.telegram_chat_id || item.thread?.external_id || "Диалог";
}

function accessStatusLabel(status) {
  if (status === "approved") {
    return "доступ открыт";
  }
  if (status === "blocked") {
    return "заблокирован";
  }
  return "ожидает доступа";
}

function pilotStageLabel(stage) {
  const labels = {
    registered: "зарегистрирован",
    dialogue: "рабочий диалог",
    diagnostic_case: "диагностический кейс",
    facts: "собраны факты",
    hypothesis: "рабочая гипотеза",
    first_step: "первый шаг",
    decision_locked: "решение зафиксировано",
    result: "получен результат"
  };
  return labels[stage] || stage || "не определён";
}

function pilotChannelLabel(channel) {
  const labels = {
    book: "книга",
    qr: "QR",
    telegram: "Telegram",
    website: "сайт",
    consultation: "консультация",
    referral: "рекомендация",
    web_cabinet: "платформа",
    unknown: "не определён"
  };
  return labels[channel] || channel || labels.unknown;
}

function renderConversationList(payload) {
  const rows = payload.conversations || [];
  const list = rows.length
    ? rows.map((item) => {
        const latest = item.latestMessage?.text || "Сообщений пока нет";
        const messagesCount = Number(item.counters?.messages || 0);
        const canEvaluate = !item.isPlaceholder && messagesCount > 0;
        const evaluation = item.latestEvaluation
          ? `<span class="pill ${scoreClass(item.latestEvaluation.status)}">оценка: ${item.latestEvaluation.score}/100</span>`
          : `<span class="pill orange">без оценки</span>`;
        const accessStatus = item.appUser?.access_status
          ? `<span class="pill ${item.appUser.access_status === "approved" ? "green" : item.appUser.access_status === "blocked" ? "red" : "orange"}">${escapeHtml(accessStatusLabel(item.appUser.access_status))}</span>`
          : "";
        const placeholder = item.isPlaceholder
          ? `<span class="pill orange">диалога пока нет</span>`
          : "";

        return `
          <article class="row">
            <div>
              <div class="row-title">${escapeHtml(conversationTitle(item))}</div>
              <p>${escapeHtml(latest.slice(0, 220))}</p>
              <div class="meta">
                <span class="pill">${escapeHtml(messagesCount)} сообщений</span>
                ${accessStatus}
                ${placeholder}
                ${evaluation}
                <span class="pill">${escapeHtml(formatDate(item.updatedAt))}</span>
              </div>
            </div>
            <div class="meta">
              <button class="secondary" data-open="${escapeHtml(item.id)}" type="button">Открыть</button>
              <button data-evaluate="${escapeHtml(item.id)}" type="button" ${canEvaluate ? "" : "disabled"} title="${canEvaluate ? "" : "Оценка появится, когда будет сохранённая переписка"}">Оценить</button>
            </div>
          </article>
        `;
      }).join("")
    : `<div class="empty">Диалогов не найдено.</div>`;

  content.innerHTML = `
    <div class="toolbar">
      <div>
        <h2>Диалоги</h2>
        <p>Здесь видно, что происходило в чате и где ломается логика диагностики.</p>
      </div>
      <form id="searchForm">
        <input id="searchInput" type="search" value="${escapeHtml(state.search)}" placeholder="Поиск по компании, чату или последнему сообщению">
        <button type="submit">Найти</button>
      </form>
    </div>
    <div class="grid">${list}</div>
    <div id="conversationDetail"></div>
  `;

  content.querySelector("#searchForm").addEventListener("submit", (event) => {
    event.preventDefault();
    state.search = content.querySelector("#searchInput").value.trim();
    loadConversations();
  });

  content.querySelectorAll("[data-open]").forEach((button) => {
    button.addEventListener("click", () => loadConversationDetail(button.dataset.open));
  });

  content.querySelectorAll("[data-evaluate]").forEach((button) => {
    button.addEventListener("click", () => evaluateConversation(button.dataset.evaluate));
  });
}

function renderMessages(messages = []) {
  if (!messages.length) {
    return `<div class="empty">Сообщений нет.</div>`;
  }

  return `
    <div class="messages">
      ${messages.map((message) => `
        <article class="message ${message.role === "assistant" ? "assistant" : ""}">
          <div class="message-role">${escapeHtml(message.role)} · ${escapeHtml(formatDate(message.created_at))}</div>
          ${escapeHtml(message.text)}
        </article>
      `).join("")}
    </div>
  `;
}

function renderEvaluation(evaluation) {
  if (!evaluation) {
    return `
      <div class="card">
        <h3>Оценка еще не создана</h3>
        <p>Нажми “Оценить диалог”, чтобы evaluator разобрал качество логики и собрал улучшения.</p>
      </div>
    `;
  }

  const issues = Array.isArray(evaluation.issues) ? evaluation.issues : [];
  const strengths = Array.isArray(evaluation.strengths) ? evaluation.strengths : [];

  return `
    <div class="card">
      <h3>Оценка качества</h3>
      <div class="meta">
        <span class="pill ${scoreClass(evaluation.status)}">${escapeHtml(evaluation.score)}/100</span>
        <span class="pill">${escapeHtml(evaluation.status)}</span>
      </div>
      <p>${escapeHtml(evaluation.summary)}</p>
      ${strengths.length ? `
        <h3>Что уже хорошо</h3>
        <div class="issue-list">
          ${strengths.map((item) => `<div class="issue low">${escapeHtml(item)}</div>`).join("")}
        </div>
      ` : ""}
      <h3>Что улучшить</h3>
      <div class="issue-list">
        ${issues.length ? issues.map((issue) => `
          <div class="issue ${severityClass(issue.severity)}">
            <strong>${escapeHtml(issue.title)}</strong>
            <p>${escapeHtml(issue.description)}</p>
            <p><strong>Что сделать:</strong> ${escapeHtml(issue.suggestion)}</p>
          </div>
        `).join("") : `<div class="empty">Серьезных проблем не найдено.</div>`}
      </div>
    </div>
  `;
}

function renderConversationDetail(payload) {
  const detail = payload.conversation || payload;
  const target = content.querySelector("#conversationDetail");
  if (!target) {
    return;
  }
  const canEvaluate = !detail.isPlaceholder && (detail.messages || []).length > 0;

  target.innerHTML = `
    <section class="detail">
      <div class="toolbar">
        <div>
          <h2>${escapeHtml(detail.company?.name || detail.thread?.telegram_chat_id || "Диалог")}</h2>
          <p>${escapeHtml(detail.isPlaceholder ? "Пользователь есть в списке доступа, но сохранённой переписки пока нет." : detail.activeCase?.summary || "Рабочий диагностический кейс")}</p>
        </div>
        <button data-evaluate-detail="${escapeHtml(detail.thread.id)}" type="button" ${canEvaluate ? "" : "disabled"}>${canEvaluate ? "Оценить диалог" : "Пока нечего оценивать"}</button>
      </div>
      <div class="columns">
        <div>
          <h3>Переписка</h3>
          ${renderMessages(detail.messages)}
        </div>
        <div>
          ${renderEvaluation(detail.latestEvaluation)}
        </div>
      </div>
    </section>
  `;

  target.querySelector("[data-evaluate-detail]").addEventListener("click", () => evaluateConversation(detail.thread.id));
  target.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderEvaluations(payload) {
  const rows = payload.evaluations || [];
  content.innerHTML = `
    <div class="toolbar">
      <div>
        <h2>Оценки</h2>
        <p>Последние разборы качества диалогов.</p>
      </div>
    </div>
    <div class="grid">
      ${rows.length ? rows.map((item) => `
        <article class="row">
          <div>
            <div class="row-title">${escapeHtml(item.company?.name || item.thread?.telegram_chat_id || "Диалог")}</div>
            <p>${escapeHtml(item.summary)}</p>
            <div class="meta">
              <span class="pill ${scoreClass(item.status)}">${escapeHtml(item.score)}/100</span>
              <span class="pill">${escapeHtml((item.issues || []).length)} проблем</span>
              <span class="pill">${escapeHtml(formatDate(item.created_at))}</span>
            </div>
          </div>
          <button class="secondary" data-open="${escapeHtml(item.thread_id)}" type="button">Открыть диалог</button>
        </article>
      `).join("") : `<div class="empty">Оценок пока нет.</div>`}
    </div>
  `;

  content.querySelectorAll("[data-open]").forEach((button) => {
    button.addEventListener("click", async () => {
      state.view = "conversations";
      setActiveTab(state.view);
      await loadConversations();
      await loadConversationDetail(button.dataset.open);
    });
  });
}

function renderImprovements(payload) {
  const rows = payload.improvements || [];
  content.innerHTML = `
    <div class="toolbar">
      <div>
        <h2>Улучшения</h2>
        <p>Повторяющиеся проблемы, которые стоит превращать в изменения продукта и логики.</p>
      </div>
      <button id="collectButton" type="button">Пересобрать</button>
    </div>
    <div class="grid">
      ${rows.length ? rows.map((item) => `
        <article class="row">
          <div>
            <div class="row-title">${escapeHtml(item.title)}</div>
            <p>${escapeHtml(item.description)}</p>
            <p><strong>Что сделать:</strong> ${escapeHtml(item.suggestion)}</p>
            <div class="meta">
              <span class="pill ${scoreClass(item.severity === "critical" || item.severity === "high" ? "critical" : item.severity === "low" ? "good" : "watch")}">${escapeHtml(item.severity)}</span>
              <span class="pill">частота: ${escapeHtml(item.frequency || 1)}</span>
              <span class="pill">${escapeHtml(item.category)}</span>
              <span class="pill">${escapeHtml(item.status)}</span>
            </div>
          </div>
        </article>
      `).join("") : `<div class="empty">Улучшений пока нет. Сначала оцени несколько диалогов.</div>`}
    </div>
  `;

  content.querySelector("#collectButton").addEventListener("click", collectImprovements);
}

function renderUsers(payload) {
  const users = payload.users || [];
  const statusOptions = [
    ["", "Все"],
    ["pending", "Заявки"],
    ["approved", "С доступом"],
    ["blocked", "Закрыт доступ"]
  ];

  content.innerHTML = `
    <div class="toolbar">
      <div>
        <h2>Доступы</h2>
        <p>Здесь можно открыть или закрыть доступ к боту. Сейчас MVP работает по Telegram ID: пользователь пишет боту, появляется в списке, администратор меняет статус.</p>
      </div>
      <form id="accessFilterForm">
        <select id="accessStatusFilter" aria-label="Фильтр доступа">
          ${statusOptions.map(([value, label]) => `<option value="${escapeHtml(value)}" ${state.usersStatus === value ? "selected" : ""}>${escapeHtml(label)}</option>`).join("")}
        </select>
        <button class="secondary" type="submit">Показать</button>
      </form>
    </div>
    <div class="access-note">
      <strong>Логика доступа:</strong> pending — человек попросил вход, approved — может пользоваться ботом, blocked — доступ закрыт. Компаниям и ролям позже можно добавить отдельные права, но сначала держим простой контур.
    </div>
    <div class="grid">
      ${users.length ? users.map((user) => {
        const name = [user.first_name, user.last_name].filter(Boolean).join(" ").trim() || "Без имени";
        const username = user.username ? `@${user.username}` : "username не указан";
        const status = user.access_status || "pending";
        return `
          <article class="row access-row">
            <div>
              <div class="row-title">${escapeHtml(name)}</div>
              <p>${escapeHtml(username)} · Telegram ID: ${escapeHtml(user.telegram_user_id)}</p>
              <div class="meta">
                <span class="pill ${status === "approved" ? "green" : status === "blocked" ? "red" : "orange"}">${escapeHtml(accessStatusLabel(status))}</span>
                <span class="pill">обновлён: ${escapeHtml(formatDate(user.updated_at || user.access_decided_at))}</span>
                ${user.access_note ? `<span class="pill">${escapeHtml(user.access_note)}</span>` : ""}
              </div>
            </div>
            <div class="access-actions">
              <button data-access-action="approved" data-user-id="${escapeHtml(user.telegram_user_id)}" type="button">Открыть</button>
              <button class="secondary" data-access-action="pending" data-user-id="${escapeHtml(user.telegram_user_id)}" type="button">В заявку</button>
              <button class="secondary danger" data-access-action="blocked" data-user-id="${escapeHtml(user.telegram_user_id)}" type="button">Закрыть</button>
            </div>
          </article>
        `;
      }).join("") : `<div class="empty">Пользователей пока нет. Они появятся после первого обращения к боту.</div>`}
    </div>
  `;

  content.querySelector("#accessFilterForm").addEventListener("submit", (event) => {
    event.preventDefault();
    state.usersStatus = content.querySelector("#accessStatusFilter").value;
    loadUsers();
  });

  content.querySelectorAll("[data-access-action]").forEach((button) => {
    button.addEventListener("click", () => updateUserAccess(button.dataset.userId, button.dataset.accessAction));
  });
}

function renderPilot(payload) {
  const report = payload.report || {};
  const summary = report.summary || {};
  const funnel = report.funnel || [];
  const channels = report.channels || [];
  const participants = report.participants || [];
  const metric = (label, value, note = "") => `
    <article class="metric-card">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value ?? "—")}</strong>
      ${note ? `<small>${escapeHtml(note)}</small>` : ""}
    </article>
  `;

  content.innerHTML = `
    <div class="toolbar">
      <div>
        <h2>Альфа-пилот</h2>
        <p>Путь пользователя от регистрации до зафиксированного фактического результата.</p>
      </div>
      <button class="secondary" id="refreshPilotButton" type="button">Обновить</button>
    </div>

    <div class="metric-grid">
      ${metric("Зарегистрированы", summary.registered || 0)}
      ${metric("Начали диалог", summary.started || 0)}
      ${metric("Из книги", summary.bookEntrants || 0)}
      ${metric("Первый шаг", summary.firstSteps || 0)}
      ${metric("Зафиксировали решение", summary.decisionsLocked || 0)}
      ${metric("Получили результат", summary.resultsReported || 0)}
      ${metric("Средняя оценка", summary.averageQualityScore, summary.evaluated ? `${summary.evaluated} оценено` : "оценок пока нет")}
      ${metric("До первого шага", summary.averageTimeToFirstStepMinutes === null || summary.averageTimeToFirstStepMinutes === undefined ? "—" : `${summary.averageTimeToFirstStepMinutes} мин`, "среднее по кейсам с шагом")}
    </div>

    <section class="pilot-section">
      <h3>Воронка пилота</h3>
      <div class="funnel-list">
        ${funnel.map((item) => `
          <div class="funnel-row">
            <span>${escapeHtml(item.label)}</span>
            <strong>${escapeHtml(item.count)}</strong>
            <span>${escapeHtml(item.percentOfRegistered)}%</span>
          </div>
        `).join("") || `<div class="empty">Данных пока нет.</div>`}
      </div>
    </section>

    <section class="pilot-section">
      <h3>Каналы входа</h3>
      <div class="meta">
        ${channels.map((item) => `<span class="pill">${escapeHtml(pilotChannelLabel(item.value))}: ${escapeHtml(item.count)}</span>`).join("") || `<span class="pill">нет данных</span>`}
      </div>
    </section>

    <section class="pilot-section">
      <h3>Участники</h3>
      <div class="grid">
        ${participants.length ? participants.map((item) => `
          <article class="row pilot-participant">
            <div>
              <div class="row-title">${escapeHtml(item.name)}</div>
              <p>${escapeHtml(item.username ? `@${item.username} · ` : "")}Telegram ID: ${escapeHtml(item.telegramId)}</p>
              <div class="meta">
                <span class="pill ${item.resultReported ? "green" : item.started ? "" : "orange"}">${escapeHtml(pilotStageLabel(item.stage))}</span>
                <span class="pill">вход: ${escapeHtml(pilotChannelLabel(item.entryChannel))}</span>
                <span class="pill">факты: ${escapeHtml(item.factCount)}</span>
                <span class="pill">гипотезы: ${escapeHtml(item.hypothesisCount)}</span>
                <span class="pill">шаги: ${escapeHtml(item.firstStepCount)}</span>
                ${item.primarySegmentTitle ? `<span class="pill green">${escapeHtml(item.primarySegmentTitle)}</span>` : ""}
              </div>
            </div>
            ${item.id.startsWith("app_user:") ? "" : `<button class="secondary" data-pilot-open="${escapeHtml(item.id)}" type="button">Открыть диалог</button>`}
          </article>
        `).join("") : `<div class="empty">Участников пока нет.</div>`}
      </div>
    </section>
  `;

  content.querySelector("#refreshPilotButton").addEventListener("click", loadPilot);
  content.querySelectorAll("[data-pilot-open]").forEach((button) => {
    button.addEventListener("click", async () => {
      state.view = "conversations";
      setActiveTab(state.view);
      await loadConversations();
      await loadConversationDetail(button.dataset.pilotOpen);
    });
  });
}

async function loadConversations() {
  renderLoading("Загружаю диалоги");
  try {
    const params = new URLSearchParams({ limit: "40" });
    if (state.search) {
      params.set("search", state.search);
    }
    renderConversationList(await api(`conversations?${params.toString()}`));
  } catch (error) {
    renderError(error);
  }
}

async function loadConversationDetail(threadId) {
  state.selectedConversationId = threadId;
  const target = content.querySelector("#conversationDetail");
  if (target) {
    target.innerHTML = `<div class="detail"><div class="empty">Загружаю диалог...</div></div>`;
  }

  try {
    renderConversationDetail(await api(`conversations/${encodeURIComponent(threadId)}`));
  } catch (error) {
    if (target) {
      target.innerHTML = `<div class="detail"><div class="error">${escapeHtml(error.message)}</div></div>`;
    }
  }
}

async function evaluateConversation(threadId) {
  try {
    await api(`conversations/${encodeURIComponent(threadId)}/evaluate`, {
      method: "POST",
      body: { persist: true }
    });
    await loadConversations();
    await loadConversationDetail(threadId);
  } catch (error) {
    renderError(error);
  }
}

async function loadEvaluations() {
  renderLoading("Загружаю оценки");
  try {
    renderEvaluations(await api("evaluations?limit=80"));
  } catch (error) {
    renderError(error);
  }
}

async function loadImprovements() {
  renderLoading("Загружаю улучшения");
  try {
    renderImprovements(await api("improvements?limit=120"));
  } catch (error) {
    renderError(error);
  }
}

async function loadUsers() {
  renderLoading("Загружаю доступы");
  try {
    const params = new URLSearchParams({ limit: "120" });
    if (state.usersStatus) {
      params.set("status", state.usersStatus);
    }
    renderUsers(await api(`users?${params.toString()}`));
  } catch (error) {
    renderError(error);
  }
}

async function loadPilot() {
  renderLoading("Собираю показатели пилота");
  try {
    renderPilot(await api("pilot?limit=300"));
  } catch (error) {
    renderError(error);
  }
}

async function updateUserAccess(telegramUserId, status) {
  try {
    await api(`users/${encodeURIComponent(telegramUserId)}/access`, {
      method: "PATCH",
      body: {
        status,
        note: status === "approved" ? "approved from admin" : status === "blocked" ? "blocked from admin" : "returned to pending from admin"
      }
    });
    await loadUsers();
  } catch (error) {
    renderError(error);
  }
}

async function collectImprovements() {
  renderLoading("Пересобираю улучшения");
  try {
    await api("improvements/collect", {
      method: "POST",
      body: { limit: 150 }
    });
    await loadImprovements();
  } catch (error) {
    renderError(error);
  }
}

async function loadCurrentView() {
  setActiveTab(state.view);
  if (state.view === "pilot") {
    await loadPilot();
    return;
  }
  if (state.view === "evaluations") {
    await loadEvaluations();
    return;
  }
  if (state.view === "improvements") {
    await loadImprovements();
    return;
  }
  if (state.view === "access") {
    await loadUsers();
    return;
  }
  await loadConversations();
}

tokenForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  state.token = tokenInput.value.trim();
  if (!state.token) {
    setTokenHint("Сначала вставь токен доступа.", "error");
    tokenInput.focus();
    return;
  }

  localStorage.setItem(TOKEN_KEY, state.token);
  setAuthenticated(true);
  await loadCurrentView();
});

tokenInput.addEventListener("paste", (event) => {
  const pasted = event.clipboardData?.getData("text") || "";
  if (!pasted.trim()) {
    return;
  }

  event.preventDefault();
  setTokenValue(pasted);
  setTokenHint("Токен вставлен. Теперь нажми “Открыть”.", "success");
});

pasteTokenButton?.addEventListener("click", async () => {
  try {
    const text = await navigator.clipboard.readText();
    if (!text.trim()) {
      setTokenHint("В буфере обмена нет токена.", "error");
      return;
    }

    setTokenValue(text);
    setTokenHint("Токен вставлен. Теперь нажми “Открыть”.", "success");
  } catch {
    tokenInput.focus();
    setTokenHint("Браузер не дал доступ к буферу. Нажми в поле и вставь Cmd/Ctrl+V.", "error");
  }
});

logoutButton.addEventListener("click", () => {
  state.token = "";
  localStorage.removeItem(TOKEN_KEY);
  setAuthenticated(false);
});

tabs.forEach((tab) => {
  tab.addEventListener("click", async () => {
    state.view = tab.dataset.view;
    await loadCurrentView();
  });
});

setAuthenticated(Boolean(state.token));
if (state.token) {
  loadCurrentView();
}

initWorkspaceChat({
  endpoint: "/api/admin/chat",
  title: "AI-BOSS",
  tokenProvider: () => state.token,
  contextProvider: () => ({
    page: `admin:${state.view}`,
    selectedConversationId: state.selectedConversationId
  })
});
