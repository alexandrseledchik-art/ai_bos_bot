import { PlatformApiClient } from "./api-client.js";

const root = document.getElementById("app");
const api = new PlatformApiClient();
const TELEGRAM_CHAT_URL = "https://t.me/ai_bos_bot";
const state = {
  bootstrap: null,
  workspace: null,
  loading: true,
  error: null,
  toolQuery: "",
  notice: ""
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : "";
  } catch {
    return "";
  }
}

function initials(user = {}) {
  const parts = [user.first_name, user.last_name].filter(Boolean);
  return parts.map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "AI";
}

function currentPath() {
  const normalized = window.location.pathname.replace(/\/+$/, "");
  return normalized || "/app";
}

function percent(value) {
  return Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
}

function formatDate(value) {
  if (!value) return "";
  try {
    return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
  } catch {
    return "";
  }
}

function authMessage() {
  const auth = new URLSearchParams(window.location.search).get("auth");
  if (auth === "pending") return "Заявка уже есть. Кабинет откроется после подтверждения доступа.";
  if (auth === "blocked") return "Доступ к кабинету закрыт. Если это ошибка, напиши Александру в Telegram.";
  if (auth === "invalid") return "Ссылка устарела или уже недействительна. Запроси новую кнопку в чате AI-BOSS.";
  if (auth === "unavailable") return "Веб-вход пока не настроен на сервере. Telegram-бот продолжает работать.";
  return "Открой чат AI-BOSS в Telegram и нажми кнопку «Открыть в браузере». Она безопасно привяжет кабинет к твоей компании.";
}

function renderLogin() {
  root.innerHTML = `
    <main class="login-shell">
      <section class="login-copy">
        <a class="wordmark" href="/app"><span class="brand-mark">A</span><span>AI-BOSS</span></a>
        <p class="kicker">Управленческий контур бизнеса</p>
        <h1>Бизнес не должен храниться только в голове.</h1>
        <p class="lead">AI-BOSS собирает контекст компании, ведёт по архитектуре и инструментам, помогает отделять симптомы от причин и удерживает следующий шаг.</p>
        <div class="value-list"><span>11 слоёв бизнеса</span><span>Единая память компании</span><span>Живое сопровождение</span></div>
      </section>
      <section class="login-card">
        <span class="card-number">01</span><p class="kicker">Вход через Telegram</p><h2>Открой свой кабинет</h2>
        <p>${escapeHtml(authMessage())}</p>
        <div class="login-steps">
          <div><b>1</b><span>Пройди регистрацию и получи доступ в боте</span></div>
          <div><b>2</b><span>Нажми «Открыть в браузере» под сообщением</span></div>
          <div><b>3</b><span>Кабинет запомнит вход на этом устройстве</span></div>
        </div>
        <a class="primary-action login-action" href="${TELEGRAM_CHAT_URL}" target="_blank" rel="noopener">Открыть AI-BOSS в Telegram <span>→</span></a>
        <p class="privacy-note">Пароль не нужен. Вход подписан Telegram-профилем, а доступ можно отозвать в любой момент.</p>
      </section>
    </main>`;
}

function navigation(activePath) {
  const items = [
    ["/app", "Обзор", "⌂"], ["/app/architecture", "Архитектура", "◇"],
    ["/app/diagnostics", "Диагностика", "◫"], ["/app/tools", "Инструменты", "✦"],
    ["/app/documents", "Документы", "▱"]
  ];
  return items.map(([path, label, icon]) => `
    <a href="${path}" class="nav-link ${activePath === path ? "active" : ""}" data-link>
      <span aria-hidden="true">${icon}</span>${label}
    </a>`).join("");
}

function renderShell(content) {
  const data = state.bootstrap;
  const activePath = currentPath();
  const company = data.company?.name || "Компания";
  const userName = [data.appUser?.first_name, data.appUser?.last_name].filter(Boolean).join(" ") || data.appUser?.username || "Пользователь";
  root.innerHTML = `
    <div class="platform-shell">
      <aside class="sidebar">
        <a class="wordmark inverse" href="/app" data-link><span class="brand-mark light">A</span><span>AI-BOSS</span></a>
        <p class="sidebar-caption">Операционный слой мышления над бизнесом</p>
        <nav>${navigation(activePath)}</nav>
        <div class="sidebar-foot"><p>Текущая компания</p><strong>${escapeHtml(company)}</strong><button type="button" data-logout>Выйти из кабинета</button></div>
      </aside>
      <main class="workspace">
        <header class="topbar">
          <button class="mobile-menu" type="button" data-menu aria-label="Открыть меню">☰</button>
          <div><p>Кабинет компании</p><strong>${escapeHtml(company)}</strong></div>
          <a class="profile-chip" href="/app/profile" data-link><span>${escapeHtml(initials(data.appUser))}</span><div><b>${escapeHtml(userName)}</b><small>владелец пространства</small></div></a>
        </header>
        ${state.notice ? `<div class="notice" role="status">${escapeHtml(state.notice)}</div>` : ""}
        ${content}
      </main>
      <a class="ai-assistant" href="${TELEGRAM_CHAT_URL}" target="_blank" rel="noopener"><span>AI</span><b>Спросить AI-BOSS</b></a>
    </div>`;
}

function progressRing(value) {
  const safe = percent(value);
  return `<div class="progress-ring" style="--progress:${safe * 3.6}deg"><span>${safe}%</span></div>`;
}

function statusLabel(code) {
  return ({ covered: "подтверждено", review: "проверить", draft: "черновик", missing: "не начато", ready: "готово", in_progress: "в работе" })[code] || "не начато";
}

function sectionHero(kicker, title, description) {
  return `<section class="section-hero"><a href="/app" data-link>← На главную</a><p class="kicker">${escapeHtml(kicker)}</p><h1>${escapeHtml(title)}</h1><p>${escapeHtml(description)}</p></section>`;
}

function renderDashboard() {
  const data = state.bootstrap;
  const workspace = state.workspace || {};
  const assembly = workspace.assembly || {};
  const journey = assembly.journey || {};
  const progress = data.dashboardSummary?.expressProgress || { answeredCount: 0, totalCount: 11, percent: 0 };
  const request = data.companyProfile?.current_request || "Текущий запрос ещё не зафиксирован";
  const profileReady = data.onboardingStatus === "completed";
  const next = assembly.nextRequest || {};
  const constraint = workspace.constraintHypothesis;
  const nextStep = workspace.nextStep;
  const toolCount = workspace.tools?.length || 0;
  const documentCount = workspace.documents?.length || 0;

  renderShell(`
    <section class="dashboard-head"><div><p class="kicker">Текущая управленческая картина</p><h1>${profileReady ? "Продолжаем собирать архитектуру" : "Начнём с контекста компании"}</h1></div><a class="primary-action" href="/app/architecture" data-link>Продолжить маршрут <span>→</span></a></section>
    <section class="request-banner"><div><span>Текущий запрос</span><strong>${escapeHtml(request)}</strong></div><a href="/app/profile" data-link>${profileReady ? "Уточнить" : "Заполнить профиль"}</a></section>
    <div class="dashboard-grid">
      <section class="panel maturity-panel">
        <div class="panel-title"><div><span class="panel-icon">◇</span><h2>Архитектура компании</h2></div><a href="/app/architecture" data-link>Открыть карту</a></div>
        <div class="maturity-body">${progressRing(journey.percent || assembly.architectureProgress?.percent)}<div><strong>${journey.coveredItems || 0} из ${journey.totalItems || 0} участков подтверждено</strong><p>Прогресс считается по фактам, заполненным инструментам и документам, а не по количеству открытых экранов.</p></div></div>
      </section>
      <section class="panel next-panel">
        <div class="panel-title"><div><span class="panel-icon orange">→</span><h2>Следующий шаг</h2></div></div>
        <p>${escapeHtml(nextStep?.title || next?.title || (profileReady ? "Продолжить первый незаполненный участок архитектуры." : "Заполнить профиль компании."))}</p>
        <small>${escapeHtml(nextStep?.description || next?.text || "")}</small>
        <a class="text-action" href="${profileReady ? "/app/architecture" : "/app/profile"}" data-link>Открыть шаг →</a>
      </section>
      ${constraint ? `<section class="panel constraint-panel wide"><div><span class="eyebrow orange-text">Рабочая гипотеза, не окончательный диагноз</span><h2>${escapeHtml(constraint.title)}</h2><p>${escapeHtml(constraint.explanation || "Гипотеза собрана из текущего запроса, наблюдений и подтверждённых данных.")}</p></div><div class="constraint-score"><b>${Math.round((Number(constraint.confidence) || 0) * 100)}%</b><span>уверенность</span></div></section>` : ""}
      <section class="panel route-panel wide">
        <div class="panel-title"><div><span class="panel-icon">◫</span><h2>Рабочее состояние</h2></div><span class="status-tag">единый контекст</span></div>
        <div class="stat-strip"><div><b>${progress.answeredCount || 0}/11</b><span>экспресс-оценок</span></div><div><b>${assembly.completedLayers || 0}/11</b><span>собранных слоёв</span></div><div><b>${documentCount}</b><span>документов</span></div><div><b>${toolCount}</b><span>инструментов в каталоге</span></div></div>
      </section>
    </div>`);
}

function renderArchitecture() {
  const assembly = state.workspace?.assembly || {};
  const currentKey = assembly.nextRequest?.layer?.layerKey || assembly.journey?.currentLayer?.layerCode || "";
  const layers = assembly.layers || [];
  renderShell(`
    ${sectionHero(state.bootstrap.company?.name || "Компания", "Архитектура бизнеса", "11 слоёв показывают, что уже подтверждено фактами и инструментами, а где контекст ещё хранится только в голове.")}
    <section class="architecture-summary panel"><div>${progressRing(assembly.architectureProgress?.percent)}</div><div><span class="eyebrow">Общий прогресс</span><h2>${assembly.architectureProgress?.confirmed || 0} из ${assembly.architectureProgress?.total || 0} участков</h2><p>${escapeHtml(assembly.nextRequest?.text || "Выбери первый слой и добавляй рабочие материалы последовательно.")}</p></div></section>
    <section class="layer-grid">${layers.map((layer) => `
      <article class="layer-card ${layer.layerKey === currentKey ? "current" : ""}">
        <div class="layer-order">${String(layer.order || "").padStart(2, "0")}</div>
        <div class="layer-card-main"><span class="eyebrow">Класс ${escapeHtml(layer.classKey || "")}</span><h2>${escapeHtml(layer.title)}</h2><p>${escapeHtml(layer.shortDescription || layer.role || "")}</p></div>
        <div class="layer-progress"><b>${percent(layer.architectureProgress?.percent)}%</b><span>${layer.architectureProgress?.confirmed || 0}/${layer.architectureProgress?.total || 0} подтверждено</span><i><em style="width:${percent(layer.architectureProgress?.percent)}%"></em></i></div>
        <div class="layer-meta"><span class="status-pill ${escapeHtml(layer.status)}">${escapeHtml(statusLabel(layer.status))}</span><span>${layer.toolCount || 0} инструментов</span></div>
      </article>`).join("")}</section>`);
}

function renderDiagnostics() {
  const diagnostics = state.workspace?.diagnostics || {};
  const answers = diagnostics.answers || {};
  renderShell(`
    ${sectionHero(state.bootstrap.company?.name || "Компания", "Диагностика", "Экспресс-срез помогает увидеть зрелость по слоям. Самый низкий балл не обязательно является главным ограничением.")}
    <section class="panel diagnostic-intro"><div>${progressRing(diagnostics.progress?.percent)}</div><div><span class="eyebrow">Экспресс-диагностика</span><h2>${diagnostics.progress?.answeredCount || 0} из ${diagnostics.progress?.totalCount || 11} слоёв оценено</h2><p>Официальная матрица учитывает только ответы, которые пользователь подтвердил или исправил.</p></div></section>
    <section class="diagnostic-list">${(diagnostics.layers || []).map((layer) => {
      const answer = answers[layer.key];
      const score = Number(answer?.score) || 0;
      return `<article class="diagnostic-row"><div><span class="class-badge">${escapeHtml(layer.classKey)}</span><h3>${escapeHtml(layer.title)}</h3><p>${escapeHtml(answer?.selectedDescription || layer.shortDescription)}</p></div><div class="score-block"><b>${score ? `${score}/5` : "—"}</b><i><em style="width:${score * 20}%"></em></i><span>${score ? "подтверждено" : "нет оценки"}</span></div></article>`;
    }).join("")}</section>`);
}

function renderTools() {
  const query = state.toolQuery.trim().toLowerCase();
  const tools = (state.workspace?.tools || []).filter((tool) => !query || [tool.title, tool.short_description, tool.layer, tool.domain].join(" ").toLowerCase().includes(query));
  renderShell(`
    ${sectionHero(state.bootstrap.company?.name || "Компания", "Инструменты", "Каталог рабочих шаблонов по архитектуре бизнеса. AI-BOSS помогает выбрать инструмент и сопровождает его заполнение.")}
    <section class="tool-toolbar"><label><span>Поиск по каталогу</span><input type="search" value="${escapeHtml(state.toolQuery)}" placeholder="Например: роли, стратегия, финансы" data-tool-search /></label><b>${tools.length} найдено</b></section>
    <section class="tool-grid">${tools.length ? tools.map((tool) => {
      const url = safeUrl(tool.templateUrl || tool.template_url);
      return `<article class="tool-card"><div><span class="eyebrow">${escapeHtml(tool.layer || tool.domain || "Инструмент")}</span><h2>${escapeHtml(tool.title)}</h2><p>${escapeHtml(tool.short_description || "Рабочий инструмент для сборки этого участка бизнеса.")}</p></div><div class="tool-result"><b>Результат</b><span>${escapeHtml(tool.result || tool.when_to_use || "Зафиксированный управленческий артефакт.")}</span></div>${url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener" data-tool-open="${escapeHtml(tool.id)}">Открыть шаблон →</a>` : `<span class="tool-unavailable">Шаблон готовится</span>`}</article>`;
    }).join("") : `<div class="empty-state"><h2>Ничего не найдено</h2><p>Измени поисковый запрос или попроси AI-BOSS подобрать инструмент по текущей задаче.</p></div>`}</section>`);
}

function renderDocuments() {
  const documents = state.workspace?.documents || [];
  const artifacts = state.workspace?.artifacts || [];
  renderShell(`
    ${sectionHero(state.bootstrap.company?.name || "Компания", "Документы и память", "Ссылки на рабочие материалы и сохранённые выводы становятся актуальным контекстом AI-BOSS.")}
    <section class="memory-summary"><div><b>${documents.length}</b><span>подключённых документов</span></div><div><b>${artifacts.length}</b><span>сохранённых артефактов</span></div><div><b>${documents.filter((item) => item.latestSnapshot).length}</b><span>проанализировано</span></div></section>
    <section class="document-list">${documents.length ? documents.map((doc) => {
      const url = safeUrl(doc.url);
      return `<article class="document-row"><span class="document-icon">▱</span><div><h3>${escapeHtml(doc.title || "Документ компании")}</h3><p>${escapeHtml(doc.latestSnapshot?.summary || (doc.status === "analyzed" ? "Документ проанализирован" : "Ссылка сохранена, анализ ещё не выполнен"))}</p><small>${escapeHtml(formatDate(doc.last_analyzed_at || doc.updated_at))}</small></div><span class="status-pill ${escapeHtml(doc.status)}">${escapeHtml(doc.status === "analyzed" ? "проанализирован" : "сохранён")}</span>${url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">Открыть ↗</a>` : ""}</article>`;
    }).join("") : `<div class="empty-state"><h2>Документов пока нет</h2><p>Пришли AI-BOSS ссылку или файл в Telegram. Он сохранит материал в кейсе и поможет разобрать его содержание.</p><a class="primary-action" href="${TELEGRAM_CHAT_URL}" target="_blank" rel="noopener">Отправить документ <span>→</span></a></div>`}</section>`);
}

function renderProfile() {
  const company = state.bootstrap.company || {};
  const profile = state.bootstrap.companyProfile || {};
  renderShell(`
    ${sectionHero(company.name || "Компания", "Профиль компании", "Этот контекст нужен AI-BOSS, чтобы связывать инструменты и решения с реальным масштабом, ролью собственника и текущим запросом.")}
    <form class="profile-form panel" data-profile-form>
      <label><span>Название компании</span><input name="companyName" required value="${escapeHtml(company.name || "")}" /></label>
      <label><span>Отрасль</span><input name="industry" value="${escapeHtml(profile.industry || "")}" placeholder="Например: управленческий консалтинг" /></label>
      <label><span>Размер компании</span><input name="companySize" value="${escapeHtml(profile.company_size || "")}" placeholder="Например: 1–10 человек" /></label>
      <label><span>Выручка / диапазон</span><input name="revenueRange" value="${escapeHtml(profile.revenue_range || "")}" placeholder="Можно указать диапазон" /></label>
      <label><span>Твоя роль</span><input name="userRole" required value="${escapeHtml(profile.user_role || "")}" placeholder="Собственник" /></label>
      <label class="full"><span>Текущий запрос</span><textarea name="currentRequest" required rows="5">${escapeHtml(profile.current_request || "")}</textarea></label>
      <div class="form-actions full"><button class="primary-action" type="submit">Сохранить профиль <span>→</span></button><span data-save-status></span></div>
    </form>`);
}

function render() {
  if (state.loading) return;
  if (state.error) return renderLogin();
  const path = currentPath();
  if (path === "/app/architecture") return renderArchitecture();
  if (path === "/app/diagnostics") return renderDiagnostics();
  if (path === "/app/tools") return renderTools();
  if (path === "/app/documents") return renderDocuments();
  if (path === "/app/profile") return renderProfile();
  return renderDashboard();
}

function navigate(path) {
  window.history.pushState({}, "", path);
  state.notice = "";
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

document.addEventListener("click", async (event) => {
  const link = event.target.closest("[data-link]");
  if (link) {
    event.preventDefault();
    navigate(link.getAttribute("href"));
    document.querySelector(".sidebar")?.classList.remove("open");
    return;
  }
  if (event.target.closest("[data-menu]")) {
    document.querySelector(".sidebar")?.classList.toggle("open");
    return;
  }
  const toolLink = event.target.closest("[data-tool-open]");
  if (toolLink) {
    api.markToolOpened(toolLink.dataset.toolOpen).catch(() => null);
    return;
  }
  if (event.target.closest("[data-logout]")) {
    await api.logout().catch(() => null);
    window.location.assign("/app");
  }
});

document.addEventListener("input", (event) => {
  if (!event.target.matches("[data-tool-search]")) return;
  state.toolQuery = event.target.value;
  renderTools();
  const input = document.querySelector("[data-tool-search]");
  if (input) {
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }
});

document.addEventListener("submit", async (event) => {
  const form = event.target.closest("[data-profile-form]");
  if (!form) return;
  event.preventDefault();
  const status = form.querySelector("[data-save-status]");
  const submit = form.querySelector("button[type=submit]");
  status.textContent = "Сохраняю...";
  submit.disabled = true;
  try {
    const values = Object.fromEntries(new FormData(form));
    const result = await api.saveProfile(values);
    state.bootstrap.company = result.company;
    state.bootstrap.companyProfile = result.companyProfile;
    state.bootstrap.onboardingStatus = result.onboardingStatus;
    status.textContent = "Сохранено";
    state.notice = "Профиль обновлён. AI-BOSS будет использовать новый запрос в дальнейшей работе.";
  } catch (error) {
    status.textContent = error.message;
  } finally {
    submit.disabled = false;
  }
});

window.addEventListener("popstate", () => { state.notice = ""; render(); });

async function start() {
  try {
    state.bootstrap = await api.bootstrap();
    state.workspace = await api.workspace();
  } catch (error) {
    state.error = error;
  } finally {
    state.loading = false;
    render();
  }
}

start();
