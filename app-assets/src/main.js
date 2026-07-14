import { PlatformApiClient } from "./api-client.js";

const root = document.getElementById("app");
const api = new PlatformApiClient();
const TELEGRAM_CHAT_URL = "https://t.me/ai_bos_bot";
const PLATFORM_TOUR_STORAGE_KEY = "ai-boss-platform-tour-v1";
const state = {
  bootstrap: null,
  workspace: null,
  loading: true,
  error: null,
  toolQuery: "",
  notice: "",
  diagnosticsByLevel: {},
  diagnosticLoading: "",
  diagnosticError: "",
  diagnosticFilters: {
    basic: { layerKey: "" },
    deep: { layerKey: "", parentKey: "" }
  }
};
let platformTourStep = -1;
let platformTourAutoStarted = false;

const PLATFORM_TOUR_STEPS = [
  {
    selector: '[data-tour-nav="overview"]',
    title: "Обзор",
    text: "Здесь находится текущий запрос, состояние работы и один следующий шаг. При первом входе здесь же можно выбрать удобную точку старта."
  },
  {
    selector: '[data-tour-nav="architecture"]',
    title: "Архитектура",
    text: "Показывает, что в бизнесе уже собрано и подтверждено, а где знания пока существуют только в голове или требуют обновления."
  },
  {
    selector: '[data-tour-nav="diagnostics"]',
    title: "Диагностика",
    text: "Помогает оценить состояние бизнеса и понять, какую часть стоит изучить глубже. Низкая оценка сама по себе ещё не означает главное ограничение."
  },
  {
    selector: '[data-tour-nav="tools"]',
    title: "Инструменты",
    text: "Здесь понимание превращается в рабочие правила, решения, документы и другие результаты по вашей компании."
  },
  {
    selector: '[data-tour-nav="documents"]',
    title: "Документы и память",
    text: "Хранит материалы и подтверждённый контекст компании, чтобы результаты работы не терялись между разговорами."
  },
  {
    selector: ".ai-assistant",
    title: "AI-BOSS",
    text: "Помощника можно вызвать на любом экране: попросить объяснить результат, помочь выбрать действие или продолжить работу с инструментом."
  }
];

const DIAGNOSTIC_LEVEL_COPY = {
  express: {
    title: "Экспресс",
    scope: "Смотрим на бизнес целиком и определяем, где нужна более глубокая проверка",
    time: "10–15 минут",
    description: "Общий срез по 11 слоям бизнеса.",
    when: [
      "проходите диагностику впервые",
      "проблема сформулирована широко",
      "хотите быстро увидеть общую картину",
      "пока непонятно, в какой части бизнеса искать причину"
    ],
    result: "Предварительную карту зрелости и рекомендацию, какие слои изучить глубже.",
    note: "Экспресс показывает направление поиска, но его недостаточно для уверенного определения причины.",
    action: "Получить общую картину"
  },
  basic: {
    title: "Базовая",
    scope: "Разбираем выбранную часть бизнеса и находим, из чего складывается проблема",
    time: "60–90 минут",
    description: "Углубление по доменам выбранных слоёв.",
    when: [
      "уже понятно, какой слой связан с запросом",
      "экспресс показал область для углубления",
      "нужно отличить несколько возможных причин внутри слоя",
      "хотите понять, из каких частей складывается проблема"
    ],
    result: "Более точную картину слоя, его сильные и слабые домены и рабочие гипотезы причины.",
    note: "Базовую диагностику не обязательно проходить целиком. Можно выбрать один или несколько релевантных слоёв.",
    action: "Разобрать выбранные слои"
  },
  deep: {
    title: "Расширенная",
    scope: "Детально проверяем конкретную зону и собираем факты для изменений",
    time: "4–6 часов, обычно в несколько сессий",
    description: "Подробная проверка поддоменов выбранных доменов.",
    when: [
      "нужно проверить конкретную гипотезу",
      "предстоит трансформация, масштабирование или подготовка бизнеса к продаже",
      "нужно понять, что именно менять внутри домена",
      "требуется собрать подтверждённую архитектуру, а не только получить оценку",
      "диагностика проводится с командой, документами и интервью"
    ],
    result: "Детальную картину конкретной зоны, подтверждающие факты, пробелы, связанные инструменты и основу для плана изменений.",
    note: "Расширенную диагностику также не нужно проходить целиком. AI-BOSS рекомендует только те ветки, которые помогут проверить текущее ограничение.",
    action: "Проверить причину детально"
  }
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
    ["/app", "Обзор", "⌂", "overview"], ["/app/architecture", "Архитектура", "◇", "architecture"],
    ["/app/diagnostics", "Диагностика", "◫", "diagnostics"], ["/app/tools", "Инструменты", "✦", "tools"],
    ["/app/documents", "Документы", "▱", "documents"]
  ];
  return items.map(([path, label, icon, tourKey]) => `
    <a href="${path}" class="nav-link ${activePath === path || (path !== "/app" && activePath.startsWith(`${path}/`)) ? "active" : ""}" data-link data-tour-nav="${tourKey}">
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
  return ({ covered: "подтверждено", review: "проверить", draft: "черновик", missing: "не начато", ready: "готово", in_progress: "в работе", waiting_for_user: "ждёт ответа", submitted: "ответы собраны", analyzed: "проанализирован", completed: "завершён", needs_update: "нужно обновить" })[code] || "не начато";
}

function sectionHero(kicker, title, description) {
  return `<section class="section-hero"><a href="/app" data-link>← На главную</a><p class="kicker">${escapeHtml(kicker)}</p><h1>${escapeHtml(title)}</h1><p>${escapeHtml(description)}</p></section>`;
}

function platformTourSeen() {
  try {
    return window.localStorage.getItem(PLATFORM_TOUR_STORAGE_KEY) === "seen";
  } catch {
    return false;
  }
}

function markPlatformTourSeen() {
  try {
    window.localStorage.setItem(PLATFORM_TOUR_STORAGE_KEY, "seen");
  } catch {
    // The tour still works when storage is unavailable.
  }
}

function hasStartedWorkspace(data, workspace) {
  const bootstrapProgress = data.dashboardSummary?.expressProgress || {};
  const workspaceProgress = workspace.diagnostics?.progress || {};
  const confirmedArchitecture = workspace.assembly?.architectureProgress?.confirmed || 0;
  return Boolean(
    Number(bootstrapProgress.answeredCount) > 0
    || Number(workspaceProgress.answeredCount) > 0
    || Number(confirmedArchitecture) > 0
    || workspace.constraintHypothesis
    || workspace.nextStep
    || workspace.toolInstances?.length
    || workspace.documents?.length
    || workspace.artifacts?.length
  );
}

function systemFlow({ compact = false } = {}) {
  return `<section class="system-flow ${compact ? "compact" : ""}">
    <div class="system-flow-head"><div><span class="eyebrow">Основные экраны платформы</span><h2>От общей картины — к собранному бизнесу</h2><p>Ниже — основные экраны AI-BOSS. Каждый решает свою задачу: используйте их отдельно или вместе, в зависимости от текущего запроса.</p></div>${compact ? `<button type="button" class="tour-start-button" data-tour-start>Познакомиться с платформой <span>→</span></button>` : ""}</div>
    <div class="system-flow-grid">
      <a href="/app/architecture" data-link><b>Архитектура</b><p>Показывает, что в бизнесе уже собрано и подтверждено, а что пока хранится только в голове.</p><span>Открыть экран →</span></a>
      <a href="/app/diagnostics" data-link><b>Диагностика</b><p>Помогает оценить состояние бизнеса и понять, какую часть стоит изучить глубже.</p><span>Открыть экран →</span></a>
      <a href="/app/tools" data-link><b>Инструменты</b><p>Помогают превратить понимание в рабочие правила, решения, документы и другие результаты.</p><span>Открыть экран →</span></a>
      <a href="/app/documents" data-link><b>Документы и память</b><p>Сохраняют материалы и подтверждённый контекст компании между разговорами и рабочими циклами.</p><span>Открыть экран →</span></a>
    </div>
    <div class="system-assistant-note"><span>AI</span><p><b>AI-BOSS доступен на каждом экране.</b> Он помогает понять информацию, выбрать действие и продолжить работу.</p></div>
  </section>`;
}

function renderWelcomeDashboard(data) {
  const firstName = data.appUser?.first_name ? `, ${escapeHtml(data.appUser.first_name)}` : "";
  renderShell(`
    <section class="welcome-hero">
      <div class="welcome-copy"><p class="kicker">Добро пожаловать${firstName}</p><h1>Соберите бизнес как систему.</h1><div class="welcome-intro-row"><p class="welcome-lead">AI-BOSS помогает вынести знания из головы, увидеть недостающие элементы, собрать их с помощью рабочих инструментов и определить, что делать дальше.</p><button type="button" class="tour-start-button welcome-tour-button" data-tour-start>Познакомиться с платформой <span>→</span></button></div></div>
      <div class="welcome-choice-title"><span class="eyebrow">Выберите точку входа</span><h2>С чего хотите начать?</h2><p>Оба варианта ведут к сборке архитектуры бизнеса. Выберите то, что полезнее сейчас — маршрут можно изменить позже.</p></div>
      <div class="welcome-entry-grid">
        <article class="welcome-entry"><div class="entry-kind"><span>◇</span><b>Общая картина</b></div><h2>Собрать бизнес как систему</h2><p>Увидеть компанию целиком, последовательно зафиксировать важные договорённости и собрать управляемую архитектуру.</p><a href="/app/profile?mode=system" data-link>Увидеть бизнес целиком <b>→</b></a></article>
        <span class="entry-or">или</span>
        <article class="welcome-entry"><div class="entry-kind"><span>◎</span><b>Текущая задача</b></div><h2>Разобрать конкретную ситуацию</h2><p>Начать с проблемы, отделить симптом от возможной причины и понять, что проверить или сделать первым.</p><a href="/app/profile?mode=problem" data-link>Разобрать текущую задачу <b>→</b></a></article>
      </div>
      <p class="welcome-choice-note">Выбор определяет только начало работы. Разбор задачи всё равно учитывает бизнес целиком, а общая сборка помогает решать конкретные задачи.</p>
    </section>
    ${systemFlow()}
    <section class="work-formats panel"><div><span class="eyebrow">Работайте удобным способом</span><h2>Разговор становится частью системы</h2><p>Можно отвечать текстом или голосом, проходить диагностику, заполнять инструменты вместе с AI-BOSS и подключать рабочие документы. Результаты сохраняются в контексте компании.</p></div><a class="primary-action" href="${TELEGRAM_CHAT_URL}" target="_blank" rel="noopener">Открыть AI-BOSS <span>→</span></a></section>`);
}

function renderReadyDashboard(data, workspace) {
  const request = data.companyProfile?.current_request || "Текущий запрос ещё не зафиксирован";
  renderShell(`
    <section class="dashboard-head ready-head"><div><p class="kicker">Контекст компании сохранён</p><h1>С чего начнём работу?</h1><p>Можно сначала увидеть бизнес целиком или начать с задачи, которая беспокоит прямо сейчас.</p></div></section>
    <section class="request-banner"><div><span>Текущий запрос</span><strong>${escapeHtml(request)}</strong></div><a href="/app/profile" data-link>Уточнить</a></section>
    <section class="ready-entry-grid">
      <article class="ready-entry"><span class="panel-icon">◇</span><div><p class="eyebrow">Общая сборка</p><h2>Увидеть бизнес как систему</h2><p>Начните с общей картины. Диагностика покажет состояние ключевых частей бизнеса, а архитектура поможет последовательно собирать пробелы.</p></div><a class="primary-action" href="/app/diagnostics/express" data-diagnostic-start="express">Получить общую картину <span>→</span></a></article>
      <article class="ready-entry dark"><span class="panel-icon orange">AI</span><div><p class="eyebrow">Текущая задача</p><h2>Разобрать запрос с AI-BOSS</h2><p>Опишите ситуацию своими словами. AI-BOSS соберёт версии, запросит необходимые факты и поможет определить первый следующий шаг.</p></div><a class="primary-action orange-action" href="${TELEGRAM_CHAT_URL}" target="_blank" rel="noopener">Перейти к разбору <span>→</span></a></article>
    </section>
    ${systemFlow({ compact: true })}`);
}

function renderActiveDashboard(data, workspace) {
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
  const currentTool = (workspace.toolInstances || []).find((item) => ["in_progress", "waiting_for_user", "submitted", "needs_update"].includes(item.instance?.status));
  const continueHref = currentTool
    ? `/app/tools/${encodeURIComponent(currentTool.tool?.id || currentTool.instance.tool_id)}`
    : "/app/architecture";
  const continueLabel = currentTool ? "Продолжить инструмент" : "Продолжить маршрут";

  renderShell(`
    <section class="dashboard-head"><div><p class="kicker">Текущая управленческая картина</p><h1>Продолжаем с того места, где остановились</h1></div><a class="primary-action" href="${continueHref}" data-link>${continueLabel} <span>→</span></a></section>
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
      ${currentTool ? `<section class="panel current-tool-panel wide"><div><span class="eyebrow orange-text">Текущий инструмент</span><h2>${escapeHtml(currentTool.tool?.title || "Инструмент в работе")}</h2><p>${escapeHtml(currentTool.tool?.short_description || "Продолжи заполнение — ответы уже сохраняются в памяти компании.")}</p></div><div><b>${percent(currentTool.instance.progress_percent)}%</b><a class="text-action" href="/app/tools/${encodeURIComponent(currentTool.tool?.id || currentTool.instance.tool_id)}" data-link>Продолжить →</a></div></section>` : ""}
    </div>
    <details class="dashboard-guide"><summary>Как связаны разделы AI-BOSS</summary>${systemFlow({ compact: true })}</details>`);
}

function renderDashboard() {
  const data = state.bootstrap;
  const workspace = state.workspace || {};
  if (data.onboardingStatus !== "completed") return renderWelcomeDashboard(data);
  if (!hasStartedWorkspace(data, workspace)) return renderReadyDashboard(data, workspace);
  return renderActiveDashboard(data, workspace);
}

function removePlatformTour() {
  document.querySelectorAll(".platform-tour-layer").forEach((element) => element.remove());
}

function finishPlatformTour() {
  platformTourStep = -1;
  removePlatformTour();
  document.querySelector(".sidebar")?.classList.remove("tour-open");
  markPlatformTourSeen();
}

function platformTourTarget(step) {
  return step?.selector ? document.querySelector(step.selector) : null;
}

function positionPlatformTour(target, spotlight, tooltip) {
  const rect = target.getBoundingClientRect();
  const padding = 8;
  const spotlightLeft = Math.max(4, rect.left - padding);
  const spotlightTop = Math.max(4, rect.top - padding);
  spotlight.style.left = `${spotlightLeft}px`;
  spotlight.style.top = `${spotlightTop}px`;
  spotlight.style.width = `${Math.min(window.innerWidth - spotlightLeft - 4, rect.width + padding * 2)}px`;
  spotlight.style.height = `${Math.min(window.innerHeight - spotlightTop - 4, rect.height + padding * 2)}px`;

  if (window.innerWidth <= 700) {
    tooltip.dataset.placement = "bottom";
    tooltip.style.removeProperty("left");
    tooltip.style.removeProperty("top");
    return;
  }

  const tooltipWidth = Math.min(360, window.innerWidth - 40);
  const gap = 20;
  let left;
  let top = Math.max(18, Math.min(rect.top, window.innerHeight - tooltip.offsetHeight - 18));
  let placement;
  if (rect.right + gap + tooltipWidth < window.innerWidth) {
    left = rect.right + gap;
    placement = "right";
  } else if (rect.left - gap - tooltipWidth > 0) {
    left = rect.left - gap - tooltipWidth;
    placement = "left";
  } else {
    left = Math.max(20, Math.min(rect.left, window.innerWidth - tooltipWidth - 20));
    top = Math.min(window.innerHeight - tooltip.offsetHeight - 18, rect.bottom + gap);
    placement = "below";
  }
  tooltip.style.width = `${tooltipWidth}px`;
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
  tooltip.dataset.placement = placement;
}

function showPlatformTourStep() {
  removePlatformTour();
  const step = PLATFORM_TOUR_STEPS[platformTourStep];
  if (!step) return finishPlatformTour();
  const sidebar = document.querySelector(".sidebar");
  sidebar?.classList.toggle("tour-open", step.selector?.includes("data-tour-nav"));
  const target = platformTourTarget(step);
  if (!target) return finishPlatformTour();

  // The spotlight must use the final viewport coordinates, not an intermediate
  // frame of a smooth scroll animation.
  target.scrollIntoView({ behavior: "auto", block: "center", inline: "nearest" });
  const layer = document.createElement("div");
  layer.className = "platform-tour-layer";
  layer.innerHTML = `<button type="button" class="tour-scrim" data-tour-skip aria-label="Закрыть знакомство"></button>
    <div class="tour-spotlight" aria-hidden="true"></div>
    <section class="tour-tooltip" role="dialog" aria-modal="true" aria-label="Знакомство с платформой">
      <div class="tour-tooltip-top"><span>${platformTourStep + 1} из ${PLATFORM_TOUR_STEPS.length}</span><button type="button" data-tour-skip aria-label="Закрыть">×</button></div>
      <h2>${escapeHtml(step.title)}</h2><p>${escapeHtml(step.text)}</p>
      <div class="tour-actions"><button type="button" class="quiet" data-tour-prev ${platformTourStep === 0 ? "disabled" : ""}>Назад</button><button type="button" data-tour-next>${platformTourStep === PLATFORM_TOUR_STEPS.length - 1 ? "Готово" : "Далее"}</button></div>
      <button type="button" class="tour-skip-link" data-tour-skip>Пропустить знакомство</button>
    </section>`;
  document.body.append(layer);
  const spotlight = layer.querySelector(".tour-spotlight");
  const tooltip = layer.querySelector(".tour-tooltip");
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => positionPlatformTour(target, spotlight, tooltip));
  });
}

function startPlatformTour() {
  const guide = document.querySelector(".dashboard-guide");
  if (guide) guide.open = true;
  platformTourStep = 0;
  showPlatformTourStep();
}

function maybeAutoStartPlatformTour() {
  if (
    platformTourAutoStarted
    || platformTourSeen()
    || state.error
    || currentPath() !== "/app"
  ) return;

  platformTourAutoStarted = true;
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      if (!platformTourSeen() && currentPath() === "/app" && document.querySelector('[data-tour-nav="overview"]')) {
        startPlatformTour();
      }
    });
  });
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

function diagnosticLevelFromPath(path = currentPath()) {
  return path.match(/^\/app\/diagnostics\/(express|basic|deep)$/)?.[1] || "";
}

function diagnosticProgress(level) {
  return state.workspace?.diagnostics?.depthOptions?.[level]?.progress || {
    answeredCount: 0,
    totalCount: level === "express" ? 11 : level === "basic" ? 72 : 288,
    percent: 0
  };
}

function diagnosticGroupStats(items, answers, key, value) {
  const grouped = items.filter((item) => item[key] === value);
  const answered = grouped.filter((item) => answers[item.subjectKey]).length;
  return { answered, total: grouped.length, percent: grouped.length ? Math.round((answered / grouped.length) * 100) : 0 };
}

function diagnosticLevelCard(level) {
  const copy = DIAGNOSTIC_LEVEL_COPY[level];
  const progress = diagnosticProgress(level);
  const started = progress.answeredCount > 0;
  return `<article class="diagnostic-level-card ${level}">
    <div class="diagnostic-level-top"><span class="diagnostic-level-mark">${level === "express" ? "01" : level === "basic" ? "02" : "03"}</span><span class="status-pill ${started ? "in_progress" : ""}">${started ? "в работе" : "не начато"}</span></div>
    <div><h2>${escapeHtml(copy.title)}</h2><p class="diagnostic-scope-copy"><b>Что проверяем:</b> ${escapeHtml(copy.scope)}.</p></div>
    <div class="diagnostic-when"><b>Когда выбирать</b><ul>${copy.when.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>
    <div class="diagnostic-result"><b>Что получите</b><p>${escapeHtml(copy.result)}</p></div>
    <p class="diagnostic-note"><b>Важно:</b> ${escapeHtml(copy.note)}</p>
    <div class="diagnostic-card-progress"><strong>Время прохождения: ${escapeHtml(copy.time)}</strong>${started ? `<i title="Прогресс ${percent(progress.percent)}%"><em style="width:${percent(progress.percent)}%"></em></i>` : ""}</div>
    <a class="diagnostic-start" href="/app/diagnostics/${level}" data-diagnostic-start="${level}">${started ? "Продолжить" : escapeHtml(copy.action)} <span>→</span></a>
  </article>`;
}

function renderDiagnosticQuestion(item, answer, level) {
  const score = Number(answer?.score) || 0;
  return `<details class="diagnostic-question ${score ? "answered" : ""}">
    <summary>
      <div><span class="question-number">${String(item.order).padStart(2, "0")}</span><span><b>${escapeHtml(item.title)}</b><small>${escapeHtml(item.description || "Выберите описание, которое ближе всего к текущей реальности.")}</small></span></div>
      <span class="question-score">${score ? `${score}/5` : "Оценить"}</span>
    </summary>
    <div class="maturity-options">
      <p>Выберите не желаемое состояние, а описание, которое лучше всего подтверждается текущими фактами.</p>
      ${(item.levels || []).map((description, index) => {
        const optionScore = index + 1;
        return `<button type="button" class="maturity-option ${score === optionScore ? "selected" : ""}" data-diagnostic-answer data-level="${level}" data-subject-key="${escapeHtml(item.subjectKey)}" data-score="${optionScore}"><span>${optionScore}</span><p>${escapeHtml(description)}</p>${score === optionScore ? "<b>Выбрано</b>" : ""}</button>`;
      }).join("")}
    </div>
  </details>`;
}

function uniqueDiagnosticLayers(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (seen.has(item.layerKey)) return false;
    seen.add(item.layerKey);
    return true;
  }).map((item) => ({ key: item.layerKey, title: item.layerTitle, classKey: item.classKey }));
}

function renderDiagnosticLayerSelector(level, data) {
  const answers = data.answers || {};
  const layers = uniqueDiagnosticLayers(data.items || []);
  const filter = state.diagnosticFilters[level];
  if (!filter.layerKey || !layers.some((layer) => layer.key === filter.layerKey)) {
    const firstIncomplete = layers.find((layer) => diagnosticGroupStats(data.items, answers, "layerKey", layer.key).percent < 100);
    filter.layerKey = firstIncomplete?.key || layers[0]?.key || "";
  }

  return `<section class="diagnostic-scope"><div class="scope-heading"><span class="eyebrow">Выберите слой</span><h2>${level === "basic" ? "Какой слой разобрать по доменам" : "В каком слое искать нужный домен"}</h2><p>Проходить всю диагностику сразу не нужно. Выберите ветку, связанную с текущим запросом.</p></div><div class="scope-tabs">${layers.map((layer) => {
    const stats = diagnosticGroupStats(data.items, answers, "layerKey", layer.key);
    return `<button type="button" class="scope-tab ${filter.layerKey === layer.key ? "active" : ""}" data-diagnostic-layer="${escapeHtml(layer.key)}" data-level="${level}"><span>${escapeHtml(layer.classKey)}</span><b>${escapeHtml(layer.title)}</b><small>${stats.answered}/${stats.total}</small></button>`;
  }).join("")}</div></section>`;
}

function renderDiagnosticDomainSelector(data) {
  const filter = state.diagnosticFilters.deep;
  const layerItems = (data.items || []).filter((item) => item.layerKey === filter.layerKey);
  const seen = new Set();
  const domains = layerItems.filter((item) => {
    if (seen.has(item.parentKey)) return false;
    seen.add(item.parentKey);
    return true;
  }).map((item) => ({ key: item.parentKey, title: item.parentTitle }));
  if (!filter.parentKey || !domains.some((domain) => domain.key === filter.parentKey)) {
    const firstIncomplete = domains.find((domain) => diagnosticGroupStats(data.items, data.answers || {}, "parentKey", domain.key).percent < 100);
    filter.parentKey = firstIncomplete?.key || domains[0]?.key || "";
  }

  return `<section class="diagnostic-domain-picker"><span class="eyebrow">Выберите домен</span><div>${domains.map((domain) => {
    const stats = diagnosticGroupStats(data.items, data.answers || {}, "parentKey", domain.key);
    return `<button type="button" class="domain-tab ${filter.parentKey === domain.key ? "active" : ""}" data-diagnostic-domain="${escapeHtml(domain.key)}"><b>${escapeHtml(domain.title)}</b><span>${stats.answered}/${stats.total}</span></button>`;
  }).join("")}</div></section>`;
}

function renderDiagnosticLevel(level) {
  const copy = DIAGNOSTIC_LEVEL_COPY[level];
  const data = state.diagnosticsByLevel[level];
  if (state.diagnosticLoading === level || !data) {
    return renderShell(`${sectionHero("Диагностика", copy.title, copy.description)}<section class="panel diagnostic-loading"><h2>Готовим вопросы</h2><p>Загружаю актуальную структуру архитектуры и сохранённые ответы.</p></section>`);
  }
  if (state.diagnosticError) {
    return renderShell(`${sectionHero("Диагностика", copy.title, copy.description)}<section class="panel empty-state"><h2>Не удалось открыть диагностику</h2><p>${escapeHtml(state.diagnosticError)}</p><a href="/app/diagnostics" data-link>Вернуться к выбору</a></section>`);
  }

  const answers = data.answers || {};
  let visibleItems = data.items || [];
  let selectors = "";
  if (level !== "express") {
    selectors += renderDiagnosticLayerSelector(level, data);
    visibleItems = visibleItems.filter((item) => item.layerKey === state.diagnosticFilters[level].layerKey);
  }
  if (level === "deep") {
    selectors += renderDiagnosticDomainSelector(data);
    visibleItems = visibleItems.filter((item) => item.parentKey === state.diagnosticFilters.deep.parentKey);
  }

  renderShell(`
    <section class="section-hero diagnostic-detail-hero"><a href="/app/diagnostics" data-link>← Ко всем вариантам</a><p class="kicker">${escapeHtml(copy.scope)}</p><h1>${escapeHtml(copy.title)}</h1><p>${escapeHtml(copy.when)}</p></section>
    <section class="panel diagnostic-level-progress"><div>${progressRing(data.progress?.percent)}</div><div><span class="eyebrow">Текущий прогресс</span><h2>${data.progress?.answeredCount || 0} из ${data.progress?.totalCount || 0} оценено</h2><p>Ответ сохраняется сразу. В любой момент можно вернуться, уточнить оценку или продолжить другую ветку.</p></div></section>
    ${selectors}
    <section class="diagnostic-question-list">${visibleItems.map((item) => renderDiagnosticQuestion(item, answers[item.subjectKey], level)).join("")}</section>
    <section class="diagnostic-help panel"><div><span class="eyebrow">Сложно выбрать описание?</span><h2>Попросите AI-BOSS разобрать факты</h2><p>Опишите ситуацию своими словами. Бот поможет сопоставить факты с уровнями, но не будет выбирать ответ за вас.</p></div><a class="primary-action" href="${TELEGRAM_CHAT_URL}" target="_blank" rel="noopener">Спросить AI-BOSS <span>→</span></a></section>`);
}

function renderDiagnostics() {
  const diagnostics = state.workspace?.diagnostics || {};
  const answers = diagnostics.answers || {};
  const answered = diagnostics.progress?.answeredCount || 0;
  renderShell(`
    ${sectionHero(state.bootstrap.company?.name || "Компания", "Диагностика бизнеса", "Диагностика помогает оценить, насколько собраны разные части бизнеса.")}
    <section class="diagnostic-principle panel"><span class="panel-icon">?</span><div><h2>Как выбрать глубину диагностики</h2><p>Выберите глубину: быстрый обзор всей системы или подробный разбор конкретной зоны. Результаты можно уточнять постепенно — проходить всё за один раз не нужно.</p></div></section>
    <section class="diagnostic-level-grid">${["express", "basic", "deep"].map(diagnosticLevelCard).join("")}</section>
    <section class="diagnostic-results-head"><div><span class="eyebrow">Текущая картина</span><h2>Результаты по слоям</h2><p>Самый низкий балл не обязательно является главным ограничением. Матрица показывает состояние, а причина определяется отдельно.</p></div>${answered ? `<a href="/app/diagnostics/express" data-diagnostic-start="express">Уточнить оценки →</a>` : ""}</section>
    ${answered ? `<section class="diagnostic-list">${(diagnostics.layers || []).map((layer) => {
      const answer = answers[layer.key];
      const score = Number(answer?.score) || 0;
      return `<article class="diagnostic-row"><div><span class="class-badge">${escapeHtml(layer.classKey)}</span><h3>${escapeHtml(layer.title)}</h3><p>${escapeHtml(answer?.selectedDescription || layer.shortDescription)}</p></div><div class="score-block"><b>${score ? `${score}/5` : "—"}</b><i><em style="width:${score * 20}%"></em></i><span>${score ? "подтверждено" : "нет оценки"}</span></div></article>`;
    }).join("")}</section>` : `<section class="empty-diagnostic"><h2>Оценок пока нет</h2><p>Для первого знакомства с системой обычно достаточно экспресс-диагностики по 11 слоям.</p><a class="primary-action" href="/app/diagnostics/express" data-diagnostic-start="express">Начать экспресс-диагностику <span>→</span></a></section>`}`);
}

function renderTools() {
  const query = state.toolQuery.trim().toLowerCase();
  const matchingTools = (state.workspace?.tools || [])
    .filter((tool) => !query || [tool.title, tool.short_description, tool.layer, tool.domain].join(" ").toLowerCase().includes(query))
    .sort((left, right) => Number(isOwnerSuccessPilot(right)) - Number(isOwnerSuccessPilot(left)));
  const tools = matchingTools.slice(0, 60);
  renderShell(`
    ${sectionHero(state.bootstrap.company?.name || "Компания", "Инструменты", "Каталог рабочих шаблонов по архитектуре бизнеса. AI-BOSS помогает выбрать инструмент и сопровождает его заполнение.")}
    <section class="tool-toolbar"><label><span>Поиск по каталогу</span><input type="search" value="${escapeHtml(state.toolQuery)}" placeholder="Например: роли, стратегия, финансы" data-tool-search /></label><b>${matchingTools.length} найдено${matchingTools.length > tools.length ? ` · показано ${tools.length}` : ""}</b></section>
    <section class="tool-grid">${tools.length ? tools.map((tool) => {
      const active = (state.workspace?.toolInstances || []).find((item) => item.instance?.tool_id === tool.id);
      const nativePilot = isOwnerSuccessPilot(tool);
      const title = nativePilot ? "Канва критериев успеха собственника" : tool.title;
      return `<article class="tool-card ${nativePilot ? "is-native-tool" : ""}"><div><span class="eyebrow">${escapeHtml(tool.layer || tool.domain || "Инструмент")}</span>${nativePilot ? `<span class="native-tool-badge">Заполняется в кабинете</span>` : ""}<h2>${escapeHtml(title)}</h2><p>${escapeHtml(tool.short_description || "Рабочий инструмент для сборки этого участка бизнеса.")}</p></div><div class="tool-result"><b>Результат</b><span>${escapeHtml(tool.result || tool.when_to_use || "Зафиксированный управленческий артефакт.")}</span></div><a href="/app/tools/${encodeURIComponent(tool.id)}" data-link data-tool-open="${escapeHtml(tool.id)}">${active ? `Продолжить · ${percent(active.instance.progress_percent)}%` : "Открыть инструмент"} →</a></article>`;
    }).join("") : `<div class="empty-state"><h2>Ничего не найдено</h2><p>Измени поисковый запрос или попроси AI-BOSS подобрать инструмент по текущей задаче.</p></div>`}</section>`);
}

function toolByRoute() {
  const match = currentPath().match(/^\/app\/tools\/([^/]+)$/);
  if (!match) return null;
  const id = decodeURIComponent(match[1]);
  return (state.workspace?.tools || []).find((tool) => tool.id === id || tool.slug === id) || null;
}

function isOwnerSuccessPilot(tool) {
  const slug = String(tool?.slug || "").toLowerCase();
  return ["ba-tool-0007", "owner-success-canvas"].includes(slug)
    || String(tool?.title || "").toLowerCase().includes("канва критериев успеха собственника");
}

function nativeAnswerMap(answers = []) {
  return new Map(answers.map((answer) => [answer.question_key, answer.answer_text || ""]));
}

function renderNativeField(field, answerMap) {
  const value = answerMap.get(field.key) || "";
  const common = `name="${escapeHtml(field.key)}" ${field.required ? "required" : ""}`;
  const control = field.type === "select"
    ? `<select ${common}><option value="">Выберите вариант</option>${(field.options || []).map((option) => `<option value="${escapeHtml(option)}" ${value === option ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}</select>`
    : `<textarea ${common} rows="5" placeholder="${escapeHtml(field.placeholder || "Напишите своими словами")}">${escapeHtml(value)}</textarea>`;
  return `<label class="native-tool-field"><span>${escapeHtml(field.label)}${field.required ? " <i>обязательно</i>" : ""}</span><p>${escapeHtml(field.question)}</p>${control}${field.help ? `<small>${escapeHtml(field.help)}</small>` : ""}</label>`;
}

function renderNativeToolWorkspace(context) {
  const definition = context.nativeWorkspace;
  const answerMap = nativeAnswerMap(context.answers);
  const completed = context.instance?.status === "completed";
  return `
    ${completed && context.latestSnapshot ? `<section class="native-tool-result"><span class="eyebrow">Сохранённый результат</span><h2>Критерии успеха стали частью контекста компании</h2><p>${escapeHtml(context.latestSnapshot.summary)}</p><div><button type="button" data-edit-native-tool>Уточнить ответы</button><a href="/app/architecture" data-link>Посмотреть архитектуру →</a></div></section>` : ""}
    <form class="native-tool-form ${completed ? "is-completed" : ""}" data-native-tool-form data-instance-id="${escapeHtml(context.instance.id)}">
      ${(definition.sections || []).map((section, index) => `<section class="native-tool-section"><header><span>0${index + 1}</span><div><h2>${escapeHtml(section.title)}</h2><p>${escapeHtml(section.description || "")}</p></div></header><div class="native-tool-fields">${(context.questions || []).filter((field) => field.sectionKey === section.key).map((field) => renderNativeField(field, answerMap)).join("")}</div></section>`).join("")}
      <footer class="native-tool-actions"><div><b>Ответы сохраняются в контексте компании</b><span>Можно сохранить черновик и продолжить позже или в разговоре с AI-BOSS.</span></div><button type="submit" name="action" value="draft" formnovalidate class="secondary-action">Сохранить черновик</button><button type="submit" name="action" value="complete" class="primary-action">Подтвердить результат <span>→</span></button><small data-native-tool-status></small></footer>
    </form>`;
}

function renderToolDetail() {
  const tool = toolByRoute();
  if (!tool) {
    return renderShell(`${sectionHero("Инструменты", "Инструмент не найден", "Вернись в каталог и выбери доступный инструмент.")}<a class="primary-action" href="/app/tools" data-link>К каталогу <span>→</span></a>`);
  }
  const context = (state.workspace?.toolInstances || []).find((item) => item.instance?.tool_id === tool.id) || null;
  const instance = context?.instance;
  const document = context?.document;
  const questions = context?.questions || [];
  const answers = context?.answers || [];
  const masterUrl = safeUrl(tool.templateUrl || tool.template_url);
  const chatUrl = instance?.telegram_start_token
    ? `${TELEGRAM_CHAT_URL}?start=tool_${instance.telegram_start_token}`
    : TELEGRAM_CHAT_URL;
  const nativePilot = isOwnerSuccessPilot(tool);
  const displayTitle = nativePilot ? "Канва критериев успеха собственника" : tool.title;
  const displayDescription = nativePilot
    ? "Помогает определить, что лично для собственника будет означать победу в бизнесе через 3–10 лет."
    : tool.short_description || "AI-BOSS проведёт по инструменту, сохранит ответы и добавит результат в память компании.";
  const displayResult = nativePilot
    ? "Согласованные критерии успеха, красные линии и ориентиры для решений по бизнесу."
    : tool.result || "Заполненный управленческий артефакт, связанный с контекстом компании.";
  renderShell(`
    ${sectionHero("Инструмент архитектуры", displayTitle, displayDescription)}
    <section class="tool-workspace-grid">
      <article class="panel tool-purpose"><span class="eyebrow">Зачем сейчас</span><h2>${escapeHtml(tool.when_to_use || "Структурировать этот участок бизнеса и получить рабочий результат.")}</h2><p><b>Результат:</b> ${escapeHtml(displayResult)}</p></article>
      <article class="panel tool-progress-panel"><span class="eyebrow">Состояние</span><div class="tool-progress-number">${percent(instance?.progress_percent)}%</div><p>${instance ? `Статус: ${escapeHtml(statusLabel(instance.status))}. Сохранено ответов: ${answers.length} из ${questions.length || "—"}.` : "Инструмент ещё не начат. Выбери удобный способ работы."}</p></article>
    </section>
    ${nativePilot && context?.nativeWorkspace ? renderNativeToolWorkspace(context) : `<section class="fill-mode-grid">
      <article class="fill-mode-card"><span>01</span><h2>Пройти с AI-BOSS</h2><p>Бот задаёт по одному вопросу, принимает текст и голос, сохраняет ответы и после завершения добавляет выводы в память компании.</p>${instance?.fill_mode === "chat" ? `<a class="primary-action" href="${escapeHtml(chatUrl)}" target="_blank" rel="noopener">Продолжить в Telegram <span>→</span></a>` : `<button class="primary-action" type="button" data-start-tool="${escapeHtml(tool.id)}" data-mode="chat">Начать в чате <span>→</span></button>`}</article>
      ${nativePilot ? `<article class="fill-mode-card native-mode"><span>02</span><h2>Заполнить в кабинете</h2><p>Ответы сохраняются прямо в AI-BOSS. Можно начать в кабинете, продолжить в чате и не переносить данные между файлами.</p><button class="primary-action secondary" type="button" data-start-tool="${escapeHtml(tool.id)}" data-mode="web">Открыть рабочую область <span>→</span></button></article>` : `<article class="fill-mode-card"><span>02</span><h2>Заполнить рабочую копию</h2><p>Пока инструмент не перенесён в кабинет, можно использовать копию Google-шаблона или привязать уже созданный документ.</p>${document?.google_file_url ? `<a class="primary-action secondary" href="${escapeHtml(safeUrl(document.google_file_url))}" target="_blank" rel="noopener">Открыть рабочую копию <span>↗</span></a>` : `<button class="primary-action secondary" type="button" data-copy-tool="${escapeHtml(tool.id)}">Создать рабочую копию <span>→</span></button>`}${masterUrl ? `<a class="quiet-link" href="${escapeHtml(masterUrl)}" target="_blank" rel="noopener">Посмотреть исходный шаблон ↗</a>` : ""}</article>`}
    </section>
    ${nativePilot ? "" : `<form class="panel document-link-form" data-document-link-form data-tool-id="${escapeHtml(tool.id)}"><div><span class="eyebrow">Уже сделали копию?</span><h2>Привязать свой документ</h2><p>Ссылка сохранится в компании и будет доступна AI-BOSS как источник актуального контекста.</p></div><label><input type="url" name="url" required placeholder="https://docs.google.com/..." value="${escapeHtml(document?.google_file_url || "")}" /><button type="submit">Сохранить ссылку</button></label><small data-document-status></small></form>`}`}
    ${answers.length && !nativePilot ? `<section class="panel saved-answers"><span class="eyebrow">Сохранённые ответы</span><h2>${answers.length} из ${questions.length}</h2>${answers.map((answer) => `<div><b>${escapeHtml(answer.question_text || answer.question_key)}</b><p>${escapeHtml(answer.answer_text)}</p></div>`).join("")}</section>` : ""}`);
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
  const mode = new URLSearchParams(window.location.search).get("mode") || "";
  const isFirstSetup = state.bootstrap.onboardingStatus !== "completed";
  const profileTitle = mode === "system"
    ? "Сначала зафиксируем контекст"
    : mode === "problem"
      ? "Опишите компанию и текущую задачу"
      : "Профиль компании";
  const profileDescription = mode === "system"
    ? "Несколько фактов помогут связать общую картину бизнеса с вашим масштабом, ролью и целью сборки."
    : mode === "problem"
      ? "Контекст поможет AI-BOSS не отвечать общими советами, а разбирать задачу относительно вашей компании."
      : "Этот контекст нужен AI-BOSS, чтобы связывать инструменты и решения с реальным масштабом, ролью собственника и текущим запросом.";
  renderShell(`
    ${sectionHero(company.name || "Компания", profileTitle, profileDescription)}
    <form class="profile-form panel" data-profile-form>
      <label><span>Название компании</span><input name="companyName" required value="${escapeHtml(company.name || "")}" /></label>
      <label><span>Отрасль</span><input name="industry" value="${escapeHtml(profile.industry || "")}" placeholder="Например: управленческий консалтинг" /></label>
      <label><span>Размер компании</span><input name="companySize" value="${escapeHtml(profile.company_size || "")}" placeholder="Например: 1–10 человек" /></label>
      <label><span>Выручка / диапазон</span><input name="revenueRange" value="${escapeHtml(profile.revenue_range || "")}" placeholder="Можно указать диапазон" /></label>
      <label><span>Твоя роль</span><input name="userRole" required value="${escapeHtml(profile.user_role || "")}" placeholder="Собственник" /></label>
      <label class="full"><span>${mode === "system" ? "Что хотите получить от сборки бизнеса" : "Текущий запрос"}</span><textarea name="currentRequest" required rows="5" placeholder="${mode === "system" ? "Например: увидеть бизнес целиком, перестать держать решения в голове и последовательно собрать систему" : "Опишите, что сейчас происходит и какой результат хотите получить"}">${escapeHtml(profile.current_request || "")}</textarea></label>
      <div class="form-actions full"><button class="primary-action" type="submit">${isFirstSetup ? "Продолжить" : "Сохранить профиль"} <span>→</span></button><span data-save-status></span></div>
    </form>`);
}

function render() {
  if (state.loading) return;
  if (state.error) return renderLogin();
  const path = currentPath();
  if (path === "/app/architecture") return renderArchitecture();
  if (path === "/app/diagnostics") return renderDiagnostics();
  if (diagnosticLevelFromPath(path)) return renderDiagnosticLevel(diagnosticLevelFromPath(path));
  if (path === "/app/tools") return renderTools();
  if (path.startsWith("/app/tools/")) return renderToolDetail();
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

async function openDiagnosticLevel(level, path = `/app/diagnostics/${level}`) {
  if (!state.diagnosticsByLevel[level]) {
    state.diagnosticLoading = level;
    state.diagnosticError = "";
    navigate(path);
    try {
      state.diagnosticsByLevel[level] = await api.getDiagnosticLevel(level);
    } catch (error) {
      state.diagnosticError = error.message;
    } finally {
      state.diagnosticLoading = "";
    }
  } else if (currentPath() !== path) {
    navigate(path);
  }
  render();
}

document.addEventListener("click", async (event) => {
  const tourStart = event.target.closest("[data-tour-start]");
  if (tourStart) {
    event.preventDefault();
    startPlatformTour();
    return;
  }
  if (event.target.closest("[data-tour-dismiss-invite]")) {
    markPlatformTourSeen();
    renderDashboard();
    return;
  }
  if (event.target.closest("[data-tour-skip]")) {
    finishPlatformTour();
    return;
  }
  if (event.target.closest("[data-tour-prev]")) {
    if (platformTourStep > 0) {
      platformTourStep -= 1;
      showPlatformTourStep();
    }
    return;
  }
  if (event.target.closest("[data-tour-next]")) {
    if (platformTourStep >= PLATFORM_TOUR_STEPS.length - 1) {
      finishPlatformTour();
    } else {
      platformTourStep += 1;
      showPlatformTourStep();
    }
    return;
  }
  const diagnosticStart = event.target.closest("[data-diagnostic-start]");
  if (diagnosticStart) {
    event.preventDefault();
    await openDiagnosticLevel(diagnosticStart.dataset.diagnosticStart, diagnosticStart.getAttribute("href"));
    return;
  }
  const diagnosticLayer = event.target.closest("[data-diagnostic-layer]");
  if (diagnosticLayer) {
    state.diagnosticFilters[diagnosticLayer.dataset.level].layerKey = diagnosticLayer.dataset.diagnosticLayer;
    if (diagnosticLayer.dataset.level === "deep") state.diagnosticFilters.deep.parentKey = "";
    renderDiagnosticLevel(diagnosticLayer.dataset.level);
    return;
  }
  const diagnosticDomain = event.target.closest("[data-diagnostic-domain]");
  if (diagnosticDomain) {
    state.diagnosticFilters.deep.parentKey = diagnosticDomain.dataset.diagnosticDomain;
    renderDiagnosticLevel("deep");
    return;
  }
  const diagnosticAnswer = event.target.closest("[data-diagnostic-answer]");
  if (diagnosticAnswer) {
    const level = diagnosticAnswer.dataset.level;
    const subjectKey = diagnosticAnswer.dataset.subjectKey;
    diagnosticAnswer.disabled = true;
    try {
      const result = await api.saveDiagnosticAnswer(level, {
        subjectKey,
        layerKey: level === "express" ? subjectKey : undefined,
        score: Number(diagnosticAnswer.dataset.score)
      });
      state.diagnosticsByLevel[level] = result;
      if (state.workspace?.diagnostics?.depthOptions?.[level]) {
        state.workspace.diagnostics.depthOptions[level].progress = result.progress;
      }
      if (level === "express") {
        state.workspace.diagnostics.answers = result.answers;
        state.workspace.diagnostics.progress = result.progress;
      }
      state.notice = "Оценка сохранена.";
    } catch (error) {
      state.notice = error.message;
    }
    renderDiagnosticLevel(level);
    return;
  }
  const link = event.target.closest("[data-link]");
  if (link) {
    event.preventDefault();
    if (link.dataset.toolOpen) api.markToolOpened(link.dataset.toolOpen).catch(() => null);
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
  const startButton = event.target.closest("[data-start-tool]");
  if (startButton) {
    startButton.disabled = true;
    try {
      const context = await api.startTool(startButton.dataset.startTool, startButton.dataset.mode || "chat");
      state.workspace.toolInstances = [context, ...(state.workspace.toolInstances || []).filter((item) => item.instance?.id !== context.instance.id)];
      state.notice = startButton.dataset.mode === "web"
        ? "Рабочая область создана. Ответы можно сохранять постепенно."
        : "Инструмент запущен. Открой Telegram — AI-BOSS начнёт с первого вопроса.";
      renderToolDetail();
    } catch (error) {
      state.notice = error.message;
      renderToolDetail();
    }
    return;
  }
  if (event.target.closest("[data-edit-native-tool]")) {
    document.querySelector("[data-native-tool-form]")?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  const copyButton = event.target.closest("[data-copy-tool]");
  if (copyButton) {
    copyButton.disabled = true;
    try {
      let context = (state.workspace.toolInstances || []).find((item) => item.instance?.tool_id === copyButton.dataset.copyTool);
      if (!context) context = await api.startTool(copyButton.dataset.copyTool, "document");
      context = await api.createToolDocument(context.instance.id);
      state.workspace.toolInstances = [context, ...(state.workspace.toolInstances || []).filter((item) => item.instance?.id !== context.instance.id)];
      state.notice = "Личная копия создана и привязана к компании.";
    } catch (error) {
      state.notice = error.message;
    }
    renderToolDetail();
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
  const nativeToolForm = event.target.closest("[data-native-tool-form]");
  if (nativeToolForm) {
    event.preventDefault();
    const status = nativeToolForm.querySelector("[data-native-tool-status]");
    const buttons = nativeToolForm.querySelectorAll("button[type=submit]");
    const complete = event.submitter?.value === "complete";
    status.textContent = complete ? "Проверяю и сохраняю результат..." : "Сохраняю черновик...";
    buttons.forEach((button) => { button.disabled = true; });
    try {
      const values = Object.fromEntries([...new FormData(nativeToolForm).entries()].filter(([key]) => key !== "action"));
      const context = await api.saveToolAnswers(nativeToolForm.dataset.instanceId, values, { complete });
      state.workspace.toolInstances = [context, ...(state.workspace.toolInstances || []).filter((item) => item.instance?.id !== context.instance.id)];
      state.notice = complete
        ? "Результат подтверждён и добавлен в контекст компании."
        : "Черновик сохранён. Можно продолжить позже или в Telegram.";
      renderToolDetail();
    } catch (error) {
      status.textContent = error.message;
      buttons.forEach((button) => { button.disabled = false; });
    }
    return;
  }
  const documentForm = event.target.closest("[data-document-link-form]");
  if (documentForm) {
    event.preventDefault();
    const status = documentForm.querySelector("[data-document-status]");
    status.textContent = "Сохраняю...";
    try {
      const toolId = documentForm.dataset.toolId;
      let context = (state.workspace.toolInstances || []).find((item) => item.instance?.tool_id === toolId);
      if (!context) context = await api.startTool(toolId, "document");
      context = await api.attachToolDocument(context.instance.id, new FormData(documentForm).get("url"));
      state.workspace.toolInstances = [context, ...(state.workspace.toolInstances || []).filter((item) => item.instance?.id !== context.instance.id)];
      state.notice = "Документ привязан к инструменту и компании.";
      renderToolDetail();
    } catch (error) {
      status.textContent = error.message;
    }
    return;
  }
  const form = event.target.closest("[data-profile-form]");
  if (!form) return;
  event.preventDefault();
  const mode = new URLSearchParams(window.location.search).get("mode") || "";
  const wasFirstSetup = state.bootstrap.onboardingStatus !== "completed";
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
    if (wasFirstSetup && mode === "system") {
      await openDiagnosticLevel("express");
      return;
    }
    if (wasFirstSetup && mode === "problem") {
      window.location.assign(TELEGRAM_CHAT_URL);
      return;
    }
    if (wasFirstSetup) navigate("/app");
  } catch (error) {
    status.textContent = error.message;
  } finally {
    submit.disabled = false;
  }
});

window.addEventListener("resize", () => {
  if (platformTourStep < 0) return;
  const step = PLATFORM_TOUR_STEPS[platformTourStep];
  const target = platformTourTarget(step);
  const spotlight = document.querySelector(".tour-spotlight");
  const tooltip = document.querySelector(".tour-tooltip");
  if (target && spotlight && tooltip) positionPlatformTour(target, spotlight, tooltip);
});

document.addEventListener("keydown", (event) => {
  if (platformTourStep < 0) return;
  if (event.key === "Escape") return finishPlatformTour();
  if (event.key === "ArrowLeft" && platformTourStep > 0) {
    platformTourStep -= 1;
    showPlatformTourStep();
  }
  if (event.key === "ArrowRight") {
    if (platformTourStep >= PLATFORM_TOUR_STEPS.length - 1) return finishPlatformTour();
    platformTourStep += 1;
    showPlatformTourStep();
  }
});

window.addEventListener("popstate", () => {
  state.notice = "";
  if (platformTourStep >= 0) finishPlatformTour();
  render();
  maybeAutoStartPlatformTour();
});

async function start() {
  try {
    state.bootstrap = await api.bootstrap();
    state.workspace = await api.workspace();
    const initialDiagnosticLevel = diagnosticLevelFromPath();
    if (initialDiagnosticLevel) {
      state.diagnosticLoading = initialDiagnosticLevel;
      try {
        state.diagnosticsByLevel[initialDiagnosticLevel] = await api.getDiagnosticLevel(initialDiagnosticLevel);
      } catch (error) {
        state.diagnosticError = error.message;
      } finally {
        state.diagnosticLoading = "";
      }
    }
  } catch (error) {
    state.error = error;
  } finally {
    state.loading = false;
    render();
    maybeAutoStartPlatformTour();
  }
}

start();
