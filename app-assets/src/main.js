import { PlatformApiClient } from "./api-client.js";

const root = document.getElementById("app");
const api = new PlatformApiClient();
const state = {
  bootstrap: null,
  loading: true,
  error: null
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function initials(user = {}) {
  const parts = [user.first_name, user.last_name].filter(Boolean);
  return parts.map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "AI";
}

function currentPath() {
  const normalized = window.location.pathname.replace(/\/+$/, "");
  return normalized || "/app";
}

function routeMeta(path) {
  const routes = {
    "/app/profile": ["Профиль компании", "Контекст, который помогает AI-BOSS точнее понимать решения и ограничения."],
    "/app/architecture": ["Архитектура бизнеса", "Последовательный маршрут по 11 слоям и рабочим инструментам."],
    "/app/tools": ["Инструменты", "Каталог, рекомендации и личные экземпляры документов компании."],
    "/app/documents": ["Документы", "Единое место для ссылок, материалов и актуального контекста компании."],
    "/app/diagnostics": ["Диагностика", "Срез зрелости и гипотезы, которые ещё нужно подтвердить фактами."]
  };
  return routes[path] || null;
}

function authMessage() {
  const auth = new URLSearchParams(window.location.search).get("auth");
  if (auth === "pending") {
    return "Заявка уже есть. Кабинет откроется после подтверждения доступа.";
  }
  if (auth === "blocked") {
    return "Доступ к кабинету закрыт. Если это ошибка, напиши Александру в Telegram.";
  }
  if (auth === "invalid") {
    return "Ссылка устарела или уже недействительна. Запроси новую кнопку в чате AI-BOSS.";
  }
  if (auth === "unavailable") {
    return "Веб-вход пока не настроен на сервере. Mini App в Telegram продолжает работать.";
  }
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
        <div class="value-list">
          <span>11 слоёв бизнеса</span>
          <span>Единая память компании</span>
          <span>Живое сопровождение</span>
        </div>
      </section>
      <section class="login-card">
        <span class="card-number">01</span>
        <p class="kicker">Вход через Telegram</p>
        <h2>Открой свой кабинет</h2>
        <p>${escapeHtml(authMessage())}</p>
        <div class="login-steps">
          <div><b>1</b><span>Пройди регистрацию и получи доступ в боте</span></div>
          <div><b>2</b><span>Нажми «Открыть в браузере» под сообщением</span></div>
          <div><b>3</b><span>Дальше кабинет запомнит вход на этом устройстве</span></div>
        </div>
        <p class="privacy-note">Пароль не нужен. Вход подписан Telegram-профилем, а доступ можно отозвать в любой момент.</p>
      </section>
    </main>
  `;
}

function navigation(activePath) {
  const items = [
    ["/app", "Обзор", "⌂"],
    ["/app/architecture", "Архитектура", "◇"],
    ["/app/diagnostics", "Диагностика", "◫"],
    ["/app/tools", "Инструменты", "✦"],
    ["/app/documents", "Документы", "▱"]
  ];
  return items.map(([path, label, icon]) => `
    <a href="${path}" class="nav-link ${activePath === path ? "active" : ""}" data-link>
      <span aria-hidden="true">${icon}</span>${label}
    </a>
  `).join("");
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
        <div class="sidebar-foot">
          <p>Текущая компания</p>
          <strong>${escapeHtml(company)}</strong>
          <button type="button" data-logout>Выйти из кабинета</button>
        </div>
      </aside>
      <main class="workspace">
        <header class="topbar">
          <button class="mobile-menu" type="button" data-menu aria-label="Открыть меню">☰</button>
          <div><p>Кабинет компании</p><strong>${escapeHtml(company)}</strong></div>
          <a class="profile-chip" href="/app/profile" data-link><span>${escapeHtml(initials(data.appUser))}</span><div><b>${escapeHtml(userName)}</b><small>владелец пространства</small></div></a>
        </header>
        ${content}
      </main>
      <button class="ai-assistant" type="button" data-ai><span>AI</span><b>Спросить AI-BOSS</b></button>
    </div>
  `;
}

function progressRing(percent) {
  const safe = Math.max(0, Math.min(100, Number(percent) || 0));
  return `<div class="progress-ring" style="--progress:${safe * 3.6}deg"><span>${safe}%</span></div>`;
}

function renderDashboard() {
  const data = state.bootstrap;
  const summary = data.dashboardSummary || {};
  const progress = summary.expressProgress || { answeredCount: 0, totalCount: 11, percent: 0 };
  const request = data.companyProfile?.current_request || "Текущий запрос ещё не зафиксирован";
  const profileReady = data.onboardingStatus === "completed";
  renderShell(`
    <section class="dashboard-head">
      <div><p class="kicker">Текущая управленческая картина</p><h1>${profileReady ? "Продолжаем собирать архитектуру" : "Начнём с контекста компании"}</h1></div>
      <a class="primary-action" href="/app/architecture" data-link>Продолжить маршрут <span>→</span></a>
    </section>
    <section class="request-banner">
      <div><span>Текущий запрос</span><strong>${escapeHtml(request)}</strong></div>
      <a href="/app/profile" data-link>${profileReady ? "Уточнить" : "Заполнить профиль"}</a>
    </section>
    <div class="dashboard-grid">
      <section class="panel maturity-panel">
        <div class="panel-title"><div><span class="panel-icon">◫</span><h2>Состояние компании</h2></div><a href="/app/diagnostics" data-link>Подробнее</a></div>
        <div class="maturity-body">
          ${progressRing(progress.percent)}
          <div><strong>${progress.answeredCount || 0} из ${progress.totalCount || 11} областей</strong><p>Экспресс-диагностика показывает карту зрелости, но не назначает главное ограничение автоматически.</p></div>
        </div>
      </section>
      <section class="panel next-panel">
        <div class="panel-title"><div><span class="panel-icon orange">→</span><h2>Следующий шаг</h2></div></div>
        <p>${profileReady ? "Продолжить путь по архитектуре и зафиксировать первый незаполненный инструмент." : "Заполнить профиль компании: роль, масштаб и текущий запрос."}</p>
        <a class="text-action" href="${profileReady ? "/app/architecture" : "/app/profile"}" data-link>Открыть шаг →</a>
      </section>
      <section class="panel route-panel wide">
        <div class="panel-title"><div><span class="panel-icon">◇</span><h2>Маршрут по архитектуре</h2></div><span class="status-tag">единый контекст</span></div>
        <div class="route-track">
          <div class="route-stage active"><b>A</b><span>Рамка</span><small>собственник и среда</small></div>
          <i></i><div class="route-stage"><b>B</b><span>Поток</span><small>стратегия и коммерция</small></div>
          <i></i><div class="route-stage"><b>C</b><span>Результат</span><small>операции и деньги</small></div>
          <i></i><div class="route-stage"><b>D</b><span>Устойчивость</span><small>команда и управление</small></div>
        </div>
      </section>
    </div>
  `);
}

function renderSection(path, meta) {
  const [title, description] = meta;
  const company = state.bootstrap.company?.name || "компании";
  renderShell(`
    <section class="section-hero">
      <a href="/app" data-link>← На главную</a>
      <p class="kicker">${escapeHtml(company)}</p>
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(description)}</p>
    </section>
    <section class="panel phase-panel">
      <span class="phase-label">Собираем следующий контур</span>
      <h2>Основа уже подключена</h2>
      <p>Профиль, компания и история из Telegram связаны с этим кабинетом. В следующем этапе сюда войдут рабочие экраны и личные экземпляры инструментов без повторного ввода данных.</p>
      <div class="phase-facts"><span>Одна компания</span><span>Один контекст</span><span>Два интерфейса</span></div>
    </section>
  `);
}

function render() {
  if (state.loading) {
    return;
  }
  if (state.error) {
    renderLogin();
    return;
  }
  const path = currentPath();
  const meta = routeMeta(path);
  if (meta) {
    renderSection(path, meta);
  } else {
    renderDashboard();
  }
}

function navigate(path) {
  window.history.pushState({}, "", path);
  render();
}

document.addEventListener("click", async (event) => {
  const link = event.target.closest("[data-link]");
  if (link) {
    event.preventDefault();
    navigate(link.getAttribute("href"));
    return;
  }
  if (event.target.closest("[data-menu]")) {
    document.querySelector(".sidebar")?.classList.toggle("open");
    return;
  }
  if (event.target.closest("[data-ai]")) {
    window.alert("На следующем этапе этот помощник будет получать контекст открытого экрана. Пока продолжай разговор с AI-BOSS в Telegram — контекст компании уже общий.");
    return;
  }
  if (event.target.closest("[data-logout]")) {
    await api.logout().catch(() => null);
    window.location.assign("/app");
  }
});

window.addEventListener("popstate", render);

async function start() {
  try {
    state.bootstrap = await api.bootstrap();
  } catch (error) {
    state.error = error;
  } finally {
    state.loading = false;
    render();
  }
}

start();
