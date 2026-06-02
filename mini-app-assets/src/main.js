import { MiniAppApiClient } from "./api-client.js";
import { initializeTelegramShell } from "./telegram.js";
import { ROUTES, matchRoute, normalizePath } from "./routes.js";

const appRoot = document.getElementById("app");
const telegram = initializeTelegramShell();
const api = new MiniAppApiClient({ initData: telegram.initData });

const state = {
  bootstrap: null,
  loading: true,
  error: "",
  currentRoute: matchRoute(window.location.pathname),
  onboarding: {
    data: null,
    loading: false,
    saving: false,
    error: "",
    message: ""
  },
  express: {
    data: null,
    loading: false,
    savingLayerKey: "",
    prefillLoading: false,
    prefillError: "",
    error: ""
  },
  maturity: {
    data: null,
    loading: false,
    error: ""
  },
  constraint: {
    data: null,
    loading: false,
    actionSaving: "",
    chatRequesting: false,
    message: "",
    error: ""
  },
  nextStep: {
    data: null,
    loading: false,
    actionSaving: "",
    error: ""
  },
  ceo: {
    data: null,
    loading: false,
    error: ""
  },
  assembly: {
    data: null,
    loading: false,
    creatingArtifactId: "",
    error: "",
    message: ""
  },
  tools: {
    catalog: null,
    recommended: null,
    loading: false,
    recommendedLoading: false,
    openingToolId: "",
    query: "",
    error: ""
  },
  documents: {
    data: null,
    loading: false,
    saving: false,
    analyzingId: "",
    error: "",
    message: ""
  },
  consultation: {
    data: null,
    loading: false,
    generating: false,
    requestSaving: false,
    error: "",
    message: ""
  }
};

function displayStatus(value) {
  const map = {
    draft: "черновик",
    completed: "заполнен",
    suggested: "гипотеза",
    confirmed: "подтверждено",
    corrected: "исправлено",
    rejected: "отклонено",
    accepted: "сохранён как следующий шаг",
    done: "выполнено",
    skipped: "пропущено",
    missing: "пока нет",
    link_added: "ссылка добавлена",
    analyzed: "проанализировано"
  };
  return map[value] || value || "";
}

function errorMessage(error, fallback) {
  if (!error) {
    return fallback;
  }

  if (typeof error === "string") {
    return error;
  }

  if (typeof error.message === "string" && error.message.trim()) {
    return error.message;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function navigate(path) {
  const normalized = normalizePath(path);
  window.history.pushState({}, "", normalized);
  state.currentRoute = matchRoute(normalized);
  render();
  loadRouteData();
}

function goBack() {
  if (window.history.length > 1 && normalizePath(window.location.pathname) !== "/mini-app") {
    window.history.back();
    return;
  }

  navigate("/mini-app");
}

window.addEventListener("popstate", () => {
  state.currentRoute = matchRoute(window.location.pathname);
  render();
  loadRouteData();
});

function routeLink(route) {
  return `
    <li>
      <a href="${route.path}" data-link>
        <strong>${route.title}</strong>
        <span>Открыть</span>
      </a>
    </li>
  `;
}

function renderBootstrapCard() {
  if (state.loading) {
    return `
      <section class="card">
        <h3>Кабинет</h3>
        <p>Загружаю состояние компании...</p>
        <div class="status-row">
          <span class="pill neutral">загрузка</span>
        </div>
      </section>
    `;
  }

  if (state.error) {
    return `
      <section class="card">
        <h3>Кабинет не загружен</h3>
        <p>${escapeHtml(state.error)}</p>
        <div class="status-row">
          <span class="pill neutral">ошибка обработана</span>
          <span class="pill neutral">нужен запуск из Telegram</span>
        </div>
      </section>
    `;
  }

  const companyName = state.bootstrap?.company?.name || "Компания";
  const onboarding = state.bootstrap?.onboardingStatus || "draft";
  const profileIsReady = onboarding === "completed";

  return `
    <section class="card">
      <h3>${escapeHtml(companyName)}</h3>
      <p>${profileIsReady
        ? "Входной профиль заполнен. Можно обновить контекст или перейти к диагностике, чтобы собрать текущий срез бизнеса."
        : "Мы подготовили рабочее пространство. Заполни входной профиль, затем пройди диагностику — так система точнее соберёт контекст и слабые места."}</p>
      <div class="status-row">
        <span class="pill ${profileIsReady ? "success" : "neutral"}">${profileIsReady ? "профиль заполнен" : "профиль пока не заполнен"}</span>
      </div>
    </section>
  `;
}

function renderDashboard() {
  const bootstrapExpressProgress = state.bootstrap?.dashboardSummary?.expressProgress || {
    answeredCount: 0,
    totalCount: 11,
    percent: state.bootstrap?.dashboardSummary?.diagnosticProgress?.express ?? 0
  };
  const expressProgress = state.express.data?.progress || bootstrapExpressProgress;
  const expressAnsweredCount = Number(expressProgress.answeredCount || 0);
  const expressTotalCount = Number(expressProgress.totalCount || 0);
  const expressPercent = Number(expressProgress.percent || 0);
  const companyName = state.bootstrap?.company?.name || "Компания";
  const onboarding = state.bootstrap?.onboardingStatus ||
    state.bootstrap?.dashboardSummary?.onboardingStatus ||
    "draft";
  const profileActionLabel = onboarding === "completed" ? "Профиль" : "Заполнить профиль";

  return `
    <section class="hero">
      <p>AI-BOSS</p>
      <h2>Кабинет компании</h2>
      <p>${escapeHtml(companyName)}: здесь собираются профиль компании, диагностика, архитектура бизнеса по 11 слоям, матрица зрелости и инструменты.</p>
      <div class="actions">
        <button class="primary-button" data-navigate="/mini-app/onboarding">${profileActionLabel}</button>
        <button class="secondary-button" data-navigate="/mini-app/assembly">Архитектура бизнеса</button>
        <button class="secondary-button" data-navigate="/mini-app/diagnostics/express">Пройти диагностику</button>
        <button class="secondary-button" data-navigate="/mini-app/maturity">Матрица зрелости</button>
        <button class="secondary-button" data-navigate="/mini-app/tools">Инструменты</button>
        <button class="secondary-button" data-navigate="/mini-app/consultation">Разбор с экспертом</button>
      </div>
    </section>

    ${renderBootstrapCard()}

    ${renderAssemblySummaryCard()}

    <div class="grid two">
      <section class="card">
        <h3>Экспресс-диагностика</h3>
        <p>Это не анкета ради оценки. Экспресс нужен, чтобы быстро увидеть, где бизнес теряет результат, и не перепутать слабую область с главным ограничением.</p>
        ${renderDiagnosticProgress({
          answeredCount: expressAnsweredCount,
          totalCount: expressTotalCount,
          percent: expressPercent,
          caption: "Шкала показывает, сколько областей уже оценено. Это не итоговая оценка бизнеса."
        })}
        <div class="actions">
          <button class="secondary-button compact-button" data-navigate="/mini-app/next-step">Следующий шаг</button>
        </div>
      </section>
    </div>

    <section class="card next-card">
      <h3>Как пользоваться Кабинетом</h3>
      <ul class="plain-list">
        <li>
          <strong>Чат</strong>
          <span>Задавай вопросы, присылай ситуацию, голос или ссылку. В чате удобно думать вслух.</span>
        </li>
        <li>
          <strong>Кабинет</strong>
          <span>Здесь фиксируются профиль, диагностика, архитектура бизнеса, матрица зрелости, инструменты и документы по кейсу.</span>
        </li>
        <li>
          <strong>Маршрут</strong>
          <span>Можно идти двумя путями: быстрый срез через диагностику или последовательная сборка бизнеса через 11 слоёв.</span>
        </li>
      </ul>
    </section>
  `;
}

function renderCeoSummaryCard() {
  const ceoBrief = state.ceo.data?.ceoBrief;

  if (!ceoBrief) {
    return `
      <section class="card">
        <h3>CEO-контур</h3>
        <p>AI-BOSS должен не только отвечать, но и держать управленческую повестку: что собрать, что решить, что взять в работу и где нужен факт.</p>
        <div class="actions">
          <button class="secondary-button compact-button" data-navigate="/mini-app/ceo">Открыть контур</button>
        </div>
      </section>
    `;
  }

  return `
    <section class="card">
      <h3>CEO-контур</h3>
      <p>${escapeHtml(ceoBrief.summary)}</p>
      <div class="status-row">
        <span class="pill ${ceoBrief.mode === "active_ceo_loop" ? "success" : "neutral"}">готовность: ${escapeHtml(ceoBrief.operatingScore)}/${escapeHtml(ceoBrief.operatingScoreMax)}</span>
        <span class="pill neutral">повестка: ${escapeHtml(ceoBrief.agenda?.length || 0)}</span>
      </div>
      <div class="actions">
        <button class="secondary-button compact-button" data-navigate="/mini-app/ceo">Открыть контур</button>
      </div>
    </section>
  `;
}

function renderAssemblySummaryCard() {
  const assembly = state.assembly.data?.assembly;

  if (!assembly) {
    return `
      <section class="card next-card">
        <h3>Архитектура бизнеса</h3>
        <p>Последовательная сборка бизнеса по 11 слоям: от цели собственника и рынка до процессов, команды, управления, технологий и данных.</p>
        <div class="actions">
          <button class="secondary-button compact-button" data-navigate="/mini-app/assembly">Открыть архитектуру</button>
        </div>
      </section>
    `;
  }

  const progress = assembly.artifactProgress || { ready: 0, total: 0, percent: 0 };

  return `
    <section class="card next-card">
      <h3>Архитектура бизнеса</h3>
      <p>${escapeHtml(assembly.nextRequest?.title || assembly.summary)}</p>
      <div class="status-row">
        <span class="pill ${Number(progress.percent || 0) >= 100 ? "success" : "neutral"}">документы: ${escapeHtml(progress.ready)}/${escapeHtml(progress.total)}</span>
        <span class="pill neutral">слои: ${escapeHtml(assembly.completedLayers || 0)}/${escapeHtml(assembly.totalLayers || 11)}</span>
      </div>
      <div class="actions">
        <button class="secondary-button compact-button" data-navigate="/mini-app/assembly">Открыть архитектуру</button>
      </div>
    </section>
  `;
}

function renderOnboarding() {
  const block = state.onboarding;

  if (block.loading) {
    return renderLoadingCard("Загружаю профиль компании...");
  }

  if (block.error) {
    return renderErrorCard(block.error, "Повторить", "/mini-app/onboarding");
  }

  if (!block.data) {
    return renderLoadingCard("Готовлю профиль компании...");
  }

  const values = block.data?.values || {};

  return `
    <section class="hero compact">
      <p>Профиль компании</p>
      <h2>Минимальный контекст для диагностики</h2>
      <p>Эти данные помогают AI-BOSS не трактовать ответы в вакууме: важны отрасль, масштаб, текущий запрос и твоя роль.</p>
    </section>

    <form class="card form-card" data-onboarding-form>
      <label>
        <span>Название компании</span>
        <input name="companyName" required value="${escapeAttribute(values.companyName || "")}" placeholder="Например, AI-BOSS" />
      </label>
      <label>
        <span>Отрасль</span>
        <input name="industry" value="${escapeAttribute(values.industry || "")}" placeholder="Например, консалтинг, e-commerce, производство" />
      </label>
      <label>
        <span>Размер компании</span>
        <select name="companySize">
          ${renderOption("", "Не указано", values.companySize)}
          ${renderOption("solo", "1 человек", values.companySize)}
          ${renderOption("2-10", "2-10 человек", values.companySize)}
          ${renderOption("11-50", "11-50 человек", values.companySize)}
          ${renderOption("51-200", "51-200 человек", values.companySize)}
          ${renderOption("200+", "200+ человек", values.companySize)}
        </select>
      </label>
      <label>
        <span>Выручка / диапазон</span>
        <input name="revenueRange" value="${escapeAttribute(values.revenueRange || "")}" placeholder="Например, 5-10 млн ₽ в месяц" />
      </label>
      <label>
        <span>Твоя роль</span>
        <input name="userRole" required value="${escapeAttribute(values.userRole || "")}" placeholder="Например, собственник, CEO, консультант" />
      </label>
      <label>
        <span>Текущий запрос</span>
        <textarea name="currentRequest" required placeholder="Например, слабые продажи при большом числе лидов">${escapeHtml(values.currentRequest || "")}</textarea>
      </label>

      <div class="form-actions">
        <button class="primary-button" type="submit" data-onboarding-intent="stay" ${block.saving ? "disabled" : ""}>
          ${block.saving ? "Сохраняю..." : "Сохранить профиль"}
        </button>
        <button class="secondary-button" type="submit" data-onboarding-intent="diagnostics" ${block.saving ? "disabled" : ""}>
          ${block.saving ? "Сохраняю..." : "Сохранить и перейти к диагностике"}
        </button>
      </div>
      ${block.message ? `<p class="hint-text">${escapeHtml(block.message)}</p>` : ""}
    </form>
  `;
}

function renderExpressDiagnostics() {
  const block = state.express;

  if (block.loading) {
    return renderLoadingCard("Загружаю диагностику...");
  }

  if (block.error) {
    return renderErrorCard(block.error, "Повторить", "/mini-app/diagnostics/express");
  }

  if (!block.data) {
    return renderLoadingCard("Готовлю диагностику...");
  }

  const progress = block.data.progress || { answeredCount: 0, totalCount: 11, percent: 0 };
  const answeredCount = Number(progress.answeredCount || 0);
  const totalCount = Number(progress.totalCount || 0);
  const percent = Number(progress.percent || 0);

  return `
    <section class="hero compact">
      <p>Экспресс-диагностика</p>
      <h2>Соберём быстрый срез бизнеса</h2>
      <p>Выбирай описание, которое ближе всего к текущей реальности. Это не экзамен: ответы нужны, чтобы отличить симптом от причины и понять, куда копать первым.</p>
      ${renderDiagnosticProgress({
        answeredCount,
        totalCount,
        percent,
        className: "hero-progress",
        caption: "Шкала показывает прогресс заполнения: сколько областей уже оценено. Это не итоговая оценка бизнеса."
      })}
    </section>

    <div class="diagnostic-list">
      ${(block.data.layers || []).map((layer) =>
        renderLayerCard(
          layer,
          block.data.answers?.[layer.key],
          block.data.prefillByLayer?.[layer.key]
        )
      ).join("")}
    </div>

    <section class="card next-card">
      <h3>Матрица зрелости</h3>
      <p>Матрица покажет фактические оценки по компании. Главное ограничение мы потом ищем отдельно: по оценкам, запросу и сигналам из диалога.</p>
      <div class="actions">
        <button class="primary-button" data-navigate="/mini-app/maturity">Матрица зрелости</button>
      </div>
    </section>
  `;
}

function renderLayerCard(layer, answer, suggestion) {
  const hasAnswer = Number.isFinite(Number(answer?.score));
  const isSavingAnswer = answer?.status === "saving";
  return `
    <section class="card layer-card" id="layer-${escapeAttribute(layer.key)}">
      <div class="layer-head">
        <div>
          <p class="eyebrow">Класс ${escapeHtml(layer.classKey)}</p>
          <h3>${escapeHtml(layer.title)}</h3>
        </div>
        <span class="score-badge ${answer?.score ? "filled" : ""} ${isSavingAnswer ? "saving" : ""}">
          ${answer?.score ? `${answer.score}/5${isSavingAnswer ? " · сохраняю" : ""}` : "не оценено"}
        </span>
      </div>
      <p>${escapeHtml(layer.shortDescription)}</p>
      <p class="diagnostic-question">${escapeHtml(layer.diagnosticQuestion)}</p>
      <p class="hint-text">${hasAnswer
        ? isSavingAnswer
          ? `Выбор ${Number(answer.score)}/5 уже отмечен. Сохраняю его в кейсе.`
          : `Сейчас выбрано ${Number(answer.score)}/5. Чтобы изменить оценку, нажми другой вариант ниже.`
        : "Выбери один вариант. Если передумаешь, позже можно нажать другой уровень и заменить оценку."
      }</p>
      ${!answer && suggestion ? renderSuggestionCard(layer, suggestion) : ""}

      <div class="level-options">
        ${(layer.levels || []).map((description, index) => {
          const score = index + 1;
          const selected = Number(answer?.score) === score;
          const saving = state.express.savingLayerKey === layer.key;
          return `
            <button
              class="level-option ${selected ? "selected" : ""}"
              type="button"
              data-answer-layer="${escapeAttribute(layer.key)}"
              data-answer-score="${score}"
              ${saving ? "disabled" : ""}
            >
              <strong>${score}</strong>
              <span>
                ${escapeHtml(description)}
                ${selected ? `<em>Текущий выбор</em>` : ""}
              </span>
            </button>
          `;
        }).join("")}
      </div>
    </section>
  `;
}

function formatDiagnosticCoverage(answeredCount, totalCount) {
  if (!Number.isFinite(totalCount) || totalCount <= 0) {
    return "0/0";
  }

  const safeAnswered = Number.isFinite(answeredCount) ? Math.max(0, Math.min(answeredCount, totalCount)) : 0;
  return `${safeAnswered}/${totalCount}`;
}

function renderDiagnosticProgress({ answeredCount, totalCount, percent, className = "", caption = "" }) {
  const coverage = formatDiagnosticCoverage(answeredCount, totalCount);
  const safePercent = Number.isFinite(Number(percent)) ? Math.max(0, Math.min(100, Number(percent))) : 0;

  return `
    <div class="progress-block ${escapeAttribute(className)}">
      <div class="progress-label">
        <span>Заполнение диагностики</span>
        <strong>Оценено ${escapeHtml(coverage)} областей</strong>
      </div>
      <div class="progress progress-single" aria-label="Заполнение диагностики: оценено ${escapeAttribute(coverage)} областей">
        <div class="progress-bar"><span style="width: ${safePercent}%"></span></div>
      </div>
      ${caption ? `<p class="progress-caption">${escapeHtml(caption)}</p>` : ""}
    </div>
  `;
}

function renderSuggestionCard(layer, suggestion) {
  const evidence = (suggestion.evidence || []).slice(0, 3);
  return `
    <div class="suggestion-card">
      <div class="suggestion-head">
        <span class="pill">${escapeHtml(suggestion.displayConfidence || "предположение системы")}</span>
        <strong>${Number(suggestion.score)}/5</strong>
      </div>
      <p>${escapeHtml(suggestion.reason || suggestion.reasons?.[0] || "")}</p>
      ${evidence.length > 0 ? `
        <div class="evidence-list">
          <span>Почему система так думает:</span>
          ${evidence.map((item) => `<em>${escapeHtml(item.statement || "")}</em>`).join("")}
        </div>
      ` : ""}
      <div class="actions">
        <button
          class="primary-button compact-button"
          type="button"
          data-prefill-action="confirm"
          data-prefill-layer="${escapeAttribute(layer.key)}"
        >
          Подтвердить
        </button>
        <button
          class="secondary-button compact-button"
          type="button"
          data-prefill-action="reject"
          data-prefill-layer="${escapeAttribute(layer.key)}"
        >
          Отклонить
        </button>
      </div>
      <p class="hint-text">Если оценка неточная, выбери правильный уровень ниже — это будет исправление предположения.</p>
    </div>
  `;
}

function renderMaturity() {
  const block = state.maturity;

  if (block.loading) {
    return renderLoadingCard("Собираю матрицу зрелости...");
  }

  if (block.error) {
    return renderErrorCard(block.error, "Повторить", "/mini-app/maturity");
  }

  if (!block.data) {
    return renderLoadingCard("Готовлю матрицу...");
  }

  const maturity = block.data.maturity || {};
  const scores = maturity.scores || [];
  const answeredCount = Number(maturity.answeredCount ?? scores.filter((item) => item.status === "answered").length);
  const totalCount = Number(maturity.totalCount ?? scores.length);
  const averageScore = formatMaturityAverage(maturity.averageScore);

  return `
    <section class="hero compact">
      <p>Матрица зрелости</p>
      <h2>Срез зрелости по областям</h2>
      <p>Это быстрый срез по оцененным областям: что уже работает, где есть слабые места и где бизнес может терять результат. Средняя оценка показывает общее состояние, а детали по областям помогают понять, что проверить дальше. Главное ограничение выбираем отдельно: по текущему запросу, сигналам из диалога и связям между областями.</p>
      <div class="status-row">
        <span class="pill">оценено областей: ${escapeHtml(formatMaturityCoverage(answeredCount, totalCount))}</span>
        <span class="pill neutral">средняя зрелость: ${escapeHtml(averageScore)}</span>
      </div>
    </section>

    ${renderMaturityInterpretation(maturity)}

    <section class="card maturity-card">
      <h3>Ключевые области бизнеса</h3>
      <div class="maturity-grid">
        ${scores.map(renderMaturityRow).join("")}
      </div>
    </section>

    <section class="card next-card">
      <h3>Перейти к ограничению</h3>
      <p>Дальше система проверит, какая область не просто слабая, а сильнее всего объясняет текущий запрос и тянет за собой остальные проблемы.</p>
      <div class="actions">
        <button class="primary-button" data-navigate="/mini-app/diagnostics/express">Вернуться к диагностике</button>
        <button class="secondary-button" data-navigate="/mini-app/constraint">Построить гипотезу</button>
      </div>
    </section>
  `;
}

function formatMaturityCoverage(answeredCount, totalCount) {
  if (!Number.isFinite(totalCount) || totalCount <= 0) {
    return "нет данных";
  }

  const safeAnswered = Number.isFinite(answeredCount) ? Math.max(0, Math.min(answeredCount, totalCount)) : 0;
  return `${safeAnswered}/${totalCount}`;
}

function formatMaturityAverage(value) {
  const score = Number(value);
  if (!Number.isFinite(score)) {
    return "нет данных";
  }
  return `${score}/5`;
}

function renderMaturityInterpretation(maturity = {}) {
  const answeredScores = (maturity.scores || [])
    .map((item) => ({
      ...item,
      numericScore: Number(item.score)
    }))
    .filter((item) => item.status === "answered" && Number.isFinite(item.numericScore));
  const average = Number(maturity.averageScore);
  const weakest = answeredScores
    .filter((item) => item.numericScore <= 2)
    .sort((a, b) => a.numericScore - b.numericScore)
    .slice(0, 3);
  const strongest = answeredScores
    .filter((item) => item.numericScore >= 4)
    .sort((a, b) => b.numericScore - a.numericScore)
    .slice(0, 3);
  const sorted = [...answeredScores].sort((a, b) => a.numericScore - b.numericScore);
  const minScore = sorted[0]?.numericScore ?? null;
  const maxScore = sorted[sorted.length - 1]?.numericScore ?? null;

  const insights = [
    {
      title: "В целом",
      text: getMaturityAverageInsight(average, answeredScores.length)
    },
    {
      title: "Что может мешать",
      text: weakest.length
        ? `${formatMaturityAreas(weakest)} — сначала проверяем, мешают ли эти области решить текущий запрос или просто показывают последствия другой проблемы.`
        : "По оценкам нет явных провалов 1-2/5. Тогда главное ограничение лучше искать по текущему запросу, сигналам из диалога и связям между областями."
    },
    {
      title: "Что уже работает",
      text: strongest.length
        ? `${formatMaturityAreas(strongest)} — эти области можно использовать как сильные стороны, когда выбираем следующий практический шаг.`
        : "Сильные места 4-5/5 пока не видны. Значит, ближайший шаг лучше сделать небольшим: проверить фактами, а не запускать большие изменения."
    },
    {
      title: "Как читать оценки вместе",
      text: getMaturitySpreadInsight(minScore, maxScore)
    }
  ];

  return `
    <section class="card next-card">
      <h3>Что видно по срезу</h3>
      <ul class="plain-list">
        ${insights.map((item) => `
          <li>
            <strong>${escapeHtml(item.title)}</strong>
            <span>${escapeHtml(item.text)}</span>
          </li>
        `).join("")}
      </ul>
      <div class="scale-guide">
        <strong>Как читать оценку</strong>
        <span>1 — хаос, зависимость от людей, нет устойчивой системы.</span>
        <span>2 — отдельные практики есть, но система ещё не собрана.</span>
        <span>3 — рабочий стандарт: область в целом функционирует предсказуемо.</span>
        <span>4 — сильная управленческая система, которая поддерживает рост и масштаб.</span>
        <span>5 — эталонный уровень: верхняя планка и ориентир потенциала.</span>
      </div>
    </section>
  `;
}

function getMaturityAverageInsight(average, answeredCount) {
  if (!answeredCount || !Number.isFinite(average)) {
    return "Пока недостаточно ответов, чтобы сделать аккуратный вывод по состоянию бизнеса.";
  }

  if (average < 2) {
    return "Похоже, многое держится на ручном управлении: результат может зависеть от отдельных людей и постоянного контроля.";
  }

  if (average < 3) {
    return "Некоторые процессы уже есть, но бизнес работает неровно: слабые места могут быстро тормозить рост или выполнение текущего запроса.";
  }

  if (average < 4) {
    return "У бизнеса есть рабочая основа. Теперь важно понять, какая область больше всего влияет на текущий запрос.";
  }

  return "Большинство оценённых областей выглядят сильными. Вероятно, проблема не во всей системе, а в конкретном узком месте или новом уровне нагрузки.";
}

function getMaturitySpreadInsight(minScore, maxScore) {
  if (!Number.isFinite(minScore) || !Number.isFinite(maxScore)) {
    return "Сравнение появится после оценок по областям.";
  }

  if (maxScore - minScore >= 2) {
    return `Оценки сильно отличаются: от ${minScore}/5 до ${maxScore}/5. Значит, важно проверить, не тормозит ли слабая область то, что уже работает лучше.`;
  }

  return "Оценки близки друг к другу: вероятно, дело не в одной явной слабой области, а в том, как текущий запрос проходит от начала до результата.";
}

function formatMaturityAreas(items) {
  return items.map((item) => `${item.title} (${item.numericScore}/5)`).join(", ");
}

function renderMaturityRow(item) {
  const score = item.score == null ? 0 : Number(item.score);
  const width = score > 0 ? (score / 5) * 100 : 0;
  return `
    <article class="maturity-row">
      <div>
        <p class="eyebrow">Класс ${escapeHtml(item.classKey)}</p>
        <strong>${escapeHtml(item.title)}</strong>
      </div>
      <div class="maturity-meter">
        <span style="width: ${width}%"></span>
      </div>
      <b>${item.score == null ? "нет" : `${item.score}/5`}</b>
    </article>
  `;
}

function renderConstraint() {
  const block = state.constraint;

  if (block.loading) {
    return renderLoadingCard("Собираю гипотезу ограничения...");
  }

  if (block.error) {
    return renderErrorCard(block.error, "Пересчитать", "/mini-app/constraint");
  }

  if (!block.data?.constraintHypothesis) {
    return renderLoadingCard("Готовлю гипотезу...");
  }

  const hypothesis = block.data.constraintHypothesis;
  if (hypothesis.status === "rejected") {
    return renderRejectedConstraintHandoff(hypothesis);
  }

  const confidence = Math.round(Number(hypothesis.confidence || 0) * 100);
  const isLowConfidence = Number(hypothesis.confidence || 0) < 0.55;
  const constraintMeaning = getConstraintMeaning(hypothesis);
  const strengthMeaning = getHypothesisStrengthMeaning(hypothesis.confidence);
  return `
    ${renderConstraintDiagnosticSummary(block.data.maturity, hypothesis)}

    <section class="hero compact">
      <p>Главное ограничение</p>
      <h2>${escapeHtml(hypothesis.layerTitle || hypothesis.title)}</h2>
      <p>Это не финальный диагноз. Система выбирает область, которая лучше всего объясняет текущий запрос, и показывает, что проверить дальше фактами.</p>
      <div class="status-row">
        <span class="pill neutral">сила версии: ${confidence}%</span>
      </div>
    </section>

    ${renderConstraintSelectionExplanation(hypothesis, block.data.reasoning)}
    ${renderConstraintGrowthMap(block.data.maturity, hypothesis)}

    <section class="card insight-card">
      <p class="eyebrow">Рабочая версия</p>
      <h3>${escapeHtml(hypothesis.title)}</h3>
      <p>${escapeHtml(hypothesis.explanation)}</p>
      ${isLowConfidence ? `<p class="hint-text">Данных пока мало, поэтому это слабая гипотеза. Её нужно проверить, а не принимать как диагноз.</p>` : ""}
      <div class="status-row">
        <span class="pill">${escapeHtml(constraintMeaning.label)}</span>
        <span class="pill neutral">${escapeHtml(strengthMeaning.label)}</span>
      </div>
      <ul class="plain-list">
        <li>
          <strong>Что проверяем</strong>
          <span>${escapeHtml(constraintMeaning.description)}</span>
        </li>
        <li>
          <strong>Зачем это знать</strong>
          <span>${escapeHtml(constraintMeaning.purpose)}</span>
        </li>
        <li>
          <strong>Как относиться к версии</strong>
          <span>${escapeHtml(strengthMeaning.description)}</span>
        </li>
      </ul>
      <div class="decision-note">
        <strong>Что меняют кнопки</strong>
        <span><b>Подтвердить</b> — взять эту версию как рабочую основу: следующий шаг, рекомендации и резюме кейса будут опираться на неё.</span>
        <span><b>Отклонить</b> — не вести маршрут от этой версии. Тогда стоит уточнить ответы или добавить факты, чтобы выбрать другую гипотезу.</span>
      </div>
      <div class="actions">
        <button
          class="primary-button"
          type="button"
          data-constraint-action="confirm"
          data-constraint-id="${escapeAttribute(hypothesis.id)}"
          ${block.actionSaving ? "disabled" : ""}
        >
          Подтвердить как рабочую версию
        </button>
        <button
          class="secondary-button"
          type="button"
          data-constraint-action="reject"
          data-constraint-id="${escapeAttribute(hypothesis.id)}"
          ${block.actionSaving ? "disabled" : ""}
        >
          Отклонить версию
        </button>
        <button class="secondary-button" type="button" data-navigate="/mini-app/next-step">К следующему шагу</button>
      </div>
    </section>

    <div class="grid two">
      <section class="card list-card">
        <h3>Что это объясняет</h3>
        ${renderBulletList(hypothesis.whatItExplains)}
      </section>
      <section class="card list-card">
        <h3>Что ещё нужно проверить</h3>
        ${renderBulletList(hypothesis.missingEvidence)}
      </section>
    </div>

    <section class="card list-card">
      <h3>Что проверить следующим</h3>
      ${renderBulletList(hypothesis.whatToCheckNext)}
    </section>

    <section class="card list-card">
      <h3>Поддерживающие наблюдения</h3>
      ${renderObservationList(hypothesis.supportingObservations)}
    </section>

    <section class="card list-card">
      <h3>Альтернативные версии</h3>
      ${renderAlternativeList(hypothesis.alternatives)}
    </section>
  `;
}

function renderRejectedConstraintHandoff(hypothesis) {
  const block = state.constraint;
  const title = hypothesis.layerTitle || hypothesis.title || "предыдущая версия";

  return `
    <section class="hero compact">
      <p>Версия отклонена</p>
      <h2>Уточним, что не сходится</h2>
      <p>Мы не ведём маршрут от гипотезы «${escapeHtml(title)}». Чтобы выбрать более точную версию, лучше дать живое объяснение в чате: какой факт я не учёл, почему это похоже на следствие или какая область кажется ближе к корню.</p>
    </section>

    <section class="card next-card">
      <h3>Следующий ход</h3>
      <p>Нажми кнопку ниже — я отправлю в Telegram короткий вопрос. Ответь на него одним сообщением, и этот ответ сохранится как новый сигнал для пересборки гипотезы.</p>
      <div class="decision-note">
        <strong>Что изменится после ответа</strong>
        <span>AI-BOSS перестанет опираться на отклонённую версию как на рабочую.</span>
        <span>Твоё объяснение попадёт в кейс как факт обратной связи.</span>
        <span>Новая гипотеза будет пересчитана с учётом этого сигнала.</span>
      </div>
      <div class="actions">
        <button
          class="primary-button"
          type="button"
          data-constraint-chat="${escapeAttribute(hypothesis.id)}"
          ${block.chatRequesting ? "disabled" : ""}
        >
          ${block.chatRequesting ? "Отправляю в чат..." : "Объяснить в чате"}
        </button>
        <button class="secondary-button" type="button" data-reload-route>Пересобрать гипотезу</button>
        <button class="secondary-button" type="button" data-navigate="/mini-app/maturity">К матрице</button>
      </div>
      ${block.message ? `<p class="hint-text">${escapeHtml(block.message)}</p>` : ""}
    </section>
  `;
}

function renderConstraintDiagnosticSummary(maturity = {}, hypothesis = {}) {
  const scores = getAnsweredMaturityScores(maturity);
  const average = Number(maturity?.averageScore);
  const weak = scores
    .filter((item) => item.numericScore <= 2)
    .sort((a, b) => a.numericScore - b.numericScore)
    .slice(0, 4);
  const strong = scores
    .filter((item) => item.numericScore >= 4)
    .sort((a, b) => b.numericScore - a.numericScore)
    .slice(0, 4);
  const selectedScore = scores.find((item) => item.layerKey === (hypothesis.layerKey || hypothesis.layer));

  return `
    <section class="card next-card">
      <h3>Что показала диагностика</h3>
      <p>${escapeHtml(getConstraintDiagnosticIntro(average, scores.length))}</p>
      <ul class="plain-list">
        <li>
          <strong>Что уже работает</strong>
          <span>${escapeHtml(strong.length
            ? `${formatMaturityAreas(strong)} — эти области сейчас выглядят сильнее других. Их можно использовать как основу для следующего шага.`
            : "Пока нет областей с оценкой 4-5/5. Поэтому лучше не начинать с больших изменений: сначала проверяем одну понятную гипотезу."
          )}</span>
        </li>
        <li>
          <strong>Что может мешать</strong>
          <span>${escapeHtml(weak.length
            ? `${formatMaturityAreas(weak)} — здесь оценки низкие. Эти места стоит проверить, но низкая оценка сама по себе ещё не доказывает причину.`
            : "Явных низких оценок 1-2/5 нет. Тогда причину ищем по текущему запросу, сигналам из диалога и связям между областями."
          )}</span>
        </li>
        <li>
          <strong>Что проверяем первым</strong>
          <span>${escapeHtml(selectedScore
            ? `${selectedScore.title} (${selectedScore.numericScore}/5): сейчас эта область лучше всего совпадает с текущим запросом и другими сигналами. Поэтому начинаем проверку с неё.`
            : `${hypothesis.layerTitle || hypothesis.title || "Выбранная область"}: это рабочая версия. Её нужно проверить фактами, прежде чем считать причиной.`
          )}</span>
        </li>
      </ul>
    </section>
  `;
}

function getConstraintDiagnosticIntro(average, answeredCount) {
  if (!answeredCount || !Number.isFinite(average)) {
    return "Пока мало ответов, поэтому вывод предварительный. Сначала нужно собрать несколько оценок и только потом выбирать, что проверять первым.";
  }

  if (average < 2) {
    return "По ответам видно: бизнес сильно зависит от ручного управления. Скорее всего, результат теряется сразу в нескольких местах, поэтому начинаем с самой заметной причины текущего запроса.";
  }

  if (average < 3) {
    return "По ответам видно: часть процессов уже есть, но несколько областей проседают. Сейчас важно понять, какая из них сильнее всего мешает текущему запросу.";
  }

  if (average < 4) {
    return "По ответам видно: у бизнеса есть рабочая основа, но отдельные области могут тормозить результат. Дальше выбираем, что проверить первым.";
  }

  return "По ответам видно: большинство оценённых областей выглядят сильными. Поэтому ищем не общую слабость, а конкретное место, где сейчас может застревать текущий запрос.";
}

function renderConstraintSelectionExplanation(hypothesis = {}, reasoning = {}) {
  const selectedLayerKey = hypothesis.layerKey || hypothesis.layer;
  const primary = reasoning?.primary?.layerKey === selectedLayerKey
    ? reasoning.primary
    : (reasoning?.shortlist || []).find((item) => item.layerKey === selectedLayerKey) || reasoning?.primary || {};
  const rankingReasons = primary.rankingReasons?.length
    ? primary.rankingReasons
    : hypothesis.rankingReasons || [];
  const alternatives = (reasoning?.alternatives || hypothesis.alternatives || []).slice(0, 3);
  const selectedLayerTitle = primary.layerTitle || hypothesis.layerTitle || hypothesis.title || "эта область";
  const readableReasons = rankingReasons.length
    ? rankingReasons.map(formatConstraintRankingReason)
    : [`Сейчас ${selectedLayerTitle} лучше других связывает текущий запрос, оценку области и возможное влияние на остальные изменения.`];

  return `
    <section class="card next-card">
      <h3>Почему начинаем с этой гипотезы</h3>
      <p>Сейчас есть предположение: область «${escapeHtml(selectedLayerTitle)}» сильнее всего влияет на текущую ситуацию. Если причина действительно здесь, работа с ней может помочь не только с этим запросом, но и с другими связанными изменениями.</p>
      <p>Почему так думаем: смотрим не на одну цифру, а на три вещи — оценку области, связь с твоим запросом и сигналы из диалога.</p>
      <div class="selection-breakdown">
        <div>
          <span>Оценка области</span>
          <strong>${escapeHtml(formatNullableScore(primary.maturityScore))}</strong>
        </div>
        <div>
          <span>Связь с запросом</span>
          <strong>${escapeHtml(formatSignalStrength(primary.requestRelevance))}</strong>
        </div>
        <div>
          <span>Сигналы из диалога</span>
          <strong>${escapeHtml(formatObservationCount(primary.observationCount))}</strong>
        </div>
      </div>
      ${Number(primary.observationCount || 0) ? "" : `<p class="hint-text">Сигналов из диалога пока мало. Значит, гипотезу стоит подтвердить следующим вопросом или короткой проверкой, а не принимать как готовый вывод.</p>`}
      <ul class="plain-list">
        ${readableReasons.map((reason) => `
          <li>${escapeHtml(reason)}</li>
        `).join("")}
      </ul>
      ${alternatives.length ? `
        <div class="comparison-list">
          <strong>Что было рядом, но не выбрано первым</strong>
          ${alternatives.map((item) => `
            <article>
              <b>${escapeHtml(item.layerTitle || item.layerKey)}</b>
              <span>${escapeHtml(item.whyAlternative || "Версия возможна, но сейчас объясняет кейс слабее выбранной гипотезы.")}</span>
            </article>
          `).join("")}
        </div>
      ` : ""}
    </section>
  `;
}

function formatConstraintRankingReason(reason = "") {
  const text = String(reason || "").trim();
  const maturity = text.match(/низкая оценка зрелости:\s*([0-9.]+\/5)/i);
  if (maturity) {
    return `Область оценена низко: ${maturity[1]}. Это может быть реальным тормозом, но всё равно требует проверки фактами.`;
  }

  if (/слой связан с текущим запросом/i.test(text)) {
    return "Есть связь с твоим текущим запросом: эта область может объяснять, почему ситуация не двигается так, как нужно.";
  }

  const observations = text.match(/есть сигналы из диалога:\s*(\d+)/i);
  if (observations) {
    return `В диалоге уже есть сигналы в эту сторону: ${observations[1]}. Это усиливает гипотезу.`;
  }

  if (/верхний|проходной слой/i.test(text)) {
    return "Если начать здесь, изменения могут повлиять и на другие области, которые зависят от этой части бизнеса.";
  }

  return text || "Эта причина требует дополнительной проверки фактами.";
}

function renderConstraintGrowthMap(maturity = {}, hypothesis = {}) {
  const scores = getMaturityScores(maturity);
  if (!scores.length) {
    return "";
  }

  return `
    <section class="card next-card">
      <h3>Точки роста по областям</h3>
      <p>Это не план внедрения всего сразу. Это карта, что нужно подтянуть в каждой области, чтобы понимать дальнейший маршрут после проверки главного ограничения.</p>
      <div class="growth-list">
        ${scores.map((item) => renderGrowthRow(item, hypothesis)).join("")}
      </div>
    </section>
  `;
}

function getMaturityScores(maturity = {}) {
  return (maturity.scores || []).map((item) => ({
    ...item,
    numericScore: Number(item.score)
  }));
}

function getAnsweredMaturityScores(maturity = {}) {
  return getMaturityScores(maturity)
    .filter((item) => item.status === "answered" && Number.isFinite(item.numericScore));
}

function renderGrowthRow(item, hypothesis = {}) {
  const selectedLayerKey = hypothesis.layerKey || hypothesis.layer;
  const isSelected = item.layerKey === selectedLayerKey;
  const scoreLabel = Number.isFinite(item.numericScore) ? `${item.numericScore}/5` : "нет оценки";

  return `
    <article class="growth-row ${isSelected ? "selected" : ""}">
      <div>
        <p class="eyebrow">${escapeHtml(isSelected ? "текущая гипотеза" : `класс ${item.classKey || ""}`)}</p>
        <strong>${escapeHtml(item.title || item.layerKey)}</strong>
      </div>
      <b>${escapeHtml(scoreLabel)}</b>
      <span>${escapeHtml(getGrowthAdvice(item))}</span>
    </article>
  `;
}

function getGrowthAdvice(item = {}) {
  if (!Number.isFinite(item.numericScore)) {
    return "Сначала оценить область, чтобы не строить выводы на пустом месте.";
  }

  const layerAdvice = {
    owner_context: "Согласовать цели, горизонт, роль собственника и правила ключевых решений.",
    external_environment: "Собрать регулярный срез рынка, спроса, каналов и внешних ограничений.",
    strategy: "Выбрать фокус: сегмент, преимущество, приоритеты и осознанный отказ от лишнего.",
    product_value_proposition: "Проверить боль клиента, ценность предложения, доказательства и причины отказов.",
    commercial: "Настроить качество входа: целевой сегмент, фильтрацию, приоритет и передачу заявок.",
    operating_model: "Показать путь заявки или заказа, найти очереди, ручные решения и точки срыва.",
    finance: "Связать выручку, маржу, расходы, кассу и конкретный участок потока, где теряются деньги.",
    people_organization: "Развести роли, нагрузку и компетенции; понять, где нужен человек, а где правило или процесс.",
    governance_risks: "Закрепить владельцев решений, ритм контроля, ответственность и работу с рисками.",
    technology: "Убрать ручные переносы, дубли и разрывы между инструментами, которые тормозят поток.",
    data_analytics: "Собрать минимальные метрики и единую версию правды по текущему запросу."
  };

  if (item.numericScore <= 2) {
    return layerAdvice[item.layerKey] || "Довести область до рабочего стандарта: правила, владелец, факты и регулярность.";
  }

  if (item.numericScore === 3) {
    return "Закрепить рабочий стандарт: сделать правила повторяемыми, измеримыми и независимыми от ручного контроля.";
  }

  return "Использовать как опору: масштабировать удачную практику и проверить, не упирается ли она в слабые области.";
}

function formatNullableScore(value) {
  const score = Number(value);
  return Number.isFinite(score) ? `${score}/5` : "нет оценки";
}

function formatSignalStrength(value) {
  const score = Number(value || 0);
  if (score >= 0.75) {
    return "сильная";
  }
  if (score >= 0.45) {
    return "средняя";
  }
  if (score > 0) {
    return "слабая";
  }
  return "неявная";
}

function formatObservationCount(value) {
  const count = Number(value || 0);
  if (!count) {
    return "пока нет";
  }
  return `${count}`;
}

function getConstraintMeaning(hypothesis = {}) {
  const layerKey = hypothesis.layerKey || hypothesis.layer;
  const rawType = hypothesis.constraint_type || hypothesis.constraintType || "";
  const byLayer = {
    owner_context: {
      label: "Проверяем рамку решений",
      description: "Смотрим, не конфликтуют ли цели, роль собственника и правила решений.",
      purpose: "Если рамка противоречивая, бизнес может терять результат даже при нормальных продажах, людях и процессах."
    },
    external_environment: {
      label: "Проверяем спрос и рынок",
      description: "Смотрим, хватает ли внешнего спроса и не изменилась ли среда, в которой работает бизнес.",
      purpose: "Это помогает не чинить внутренние процессы там, где сначала нужно адаптировать модель к рынку."
    },
    strategy: {
      label: "Проверяем фокус",
      description: "Смотрим, не распыляются ли ресурсы между сегментами, продуктами и направлениями.",
      purpose: "Если фокус размыт, локальные улучшения могут не складываться в рост."
    },
    product_value_proposition: {
      label: "Проверяем ценность продукта",
      description: "Смотрим, достаточно ли ясно клиент понимает, зачем покупать именно это решение.",
      purpose: "Это помогает отделить проблему спроса или продаж от проблемы самого предложения."
    },
    commercial: {
      label: "Проверяем качество входа",
      description: "Смотрим, приходит ли в бизнес подходящий спрос и есть ли правила фильтрации, приоритета и передачи заявок.",
      purpose: "Если входящий поток смешанный, команда может быть занята лидами, которые не должны доходить до продажи."
    },
    operating_model: {
      label: "Проверяем прохождение работы",
      description: "Смотрим, где заявки, заказы или задачи застревают в исполнении.",
      purpose: "Это помогает найти участок, где бизнес теряет сроки, качество или пропускную способность."
    },
    finance: {
      label: "Проверяем деньги и прибыль",
      description: "Смотрим, где деньги перестают превращаться в результат: выручка, маржа, расходы, касса, дебиторка или экономика сделки.",
      purpose: "Если версия верна, первый шаг не просто больше продавать, а понять, где деньги теряются после появления выручки."
    },
    people_organization: {
      label: "Проверяем ресурс команды",
      description: "Смотрим, хватает ли людей, компетенций, ролей и мощности, чтобы выдержать текущую модель.",
      purpose: "Это помогает отличить нехватку людей от слабых правил, процессов или приоритетов."
    },
    governance_risks: {
      label: "Проверяем управляемость",
      description: "Смотрим, не зависают ли решения, ответственность, контроль и ритм управления.",
      purpose: "Если управление не держит систему, задачи могут теряться даже при понятной стратегии и сильной команде."
    },
    technology: {
      label: "Проверяем инструменты",
      description: "Смотрим, не тормозят ли работу ручные операции, разрозненные сервисы и отсутствие автоматизации.",
      purpose: "Это помогает понять, проблема в логике работы или в инструментах, через которые она выполняется."
    },
    data_analytics: {
      label: "Проверяем видимость",
      description: "Смотрим, хватает ли данных, чтобы видеть реальную картину и принимать решения по фактам.",
      purpose: "Если видимости нет, бизнес может спорить о симптомах и не видеть настоящую причину."
    }
  };

  if (byLayer[layerKey]) {
    return byLayer[layerKey];
  }

  return {
    label: "Проверяем ограничение",
    description: rawType
      ? `Система относит эту версию к типу: ${rawType}. Теперь важно перевести это в конкретные факты и проверить на текущем запросе.`
      : "Смотрим, какая область сильнее всего объясняет текущий запрос.",
    purpose: "Это нужно, чтобы выбрать первый проверочный шаг и не лечить ближайший симптом вместо причины."
  };
}

function getHypothesisStrengthMeaning(confidenceValue) {
  const confidence = Number(confidenceValue || 0);

  if (confidence < 0.55) {
    return {
      label: "данных пока мало",
      description: "Это ранняя версия. Её можно использовать только как направление для вопросов и быстрой проверки."
    };
  }

  if (confidence < 0.75) {
    return {
      label: "версия для проверки",
      description: "Сигналов хватает, чтобы проверить эту версию одной из первых, но подтверждать её нужно фактами."
    };
  }

  return {
    label: "проверить первой",
    description: "Несколько сигналов сходятся в одну сторону, поэтому эту версию стоит проверить первой. Это всё ещё не диагноз."
  };
}

function renderNextStep() {
  const block = state.nextStep;

  if (block.loading) {
    return renderLoadingCard("Выбираю один следующий шаг...");
  }

  if (block.error) {
    return renderErrorCard(block.error, "Повторить", "/mini-app/next-step");
  }

  if (!block.data?.nextStep) {
    return `
      <section class="card next-card">
        <h3>Следующий шаг пока не выбран</h3>
        <p>Нужно либо построить гипотезу ограничения, либо собрать короткое резюме для консультации, чтобы не выдавать общий совет вместо действия.</p>
        <div class="actions">
          <button class="primary-button" data-navigate="/mini-app/constraint">Построить гипотезу</button>
          <button class="secondary-button" data-navigate="/mini-app/consultation">К консультации</button>
        </div>
      </section>
    `;
  }

  const nextStep = block.data.nextStep;
  const constraint = block.data.constraintHypothesis || nextStep.constraintHypothesis;
  const nextStepIsSaved = nextStep.status === "accepted";

  return `
    <section class="hero compact">
      <p>Следующий шаг</p>
      <h2>${escapeHtml(nextStep.title)}</h2>
      <p>Это не общий совет и не план на месяц. Это ближайшее действие, которое должно подтвердить гипотезу или начать снимать ограничение.</p>
      <div class="status-row">
        <span class="pill">один шаг</span>
        <span class="pill neutral">связан с гипотезой</span>
      </div>
    </section>

    <section class="card insight-card">
      <p class="eyebrow">Что сделать</p>
      <h3>${escapeHtml(nextStep.title)}</h3>
      <p>${escapeHtml(nextStep.description)}</p>
      <div class="divider"></div>
      <p><strong>Почему это первым:</strong> ${escapeHtml(nextStep.why_this_first || nextStep.whyThisFirst)}</p>
      <p class="hint-text">${nextStepIsSaved
        ? "Шаг сохранён в текущем кейсе и попадёт в резюме для разбора."
        : "Сохранение фиксирует этот шаг в текущем кейсе и учитывает его в рекомендациях и резюме для разбора."}</p>
      ${constraint ? `
        <div class="status-row">
          <span class="pill">гипотеза: ${escapeHtml(constraint.layerTitle || constraint.title || "ограничение")}</span>
          <span class="pill neutral">статус: ${escapeHtml(displayStatus(nextStep.status || "suggested"))}</span>
        </div>
      ` : ""}
      <div class="actions">
        <button
          class="primary-button"
          type="button"
          data-next-step-action="accept"
          data-next-step-id="${escapeAttribute(nextStep.id)}"
          ${block.actionSaving || nextStepIsSaved ? "disabled" : ""}
        >
          ${block.actionSaving === "accept" ? "Сохраняю..." : nextStepIsSaved ? "Шаг сохранён" : "Сохранить как следующий шаг"}
        </button>
        <button class="secondary-button" type="button" data-navigate="/mini-app/constraint">К гипотезе</button>
      </div>
    </section>
  `;
}

function renderCeoOperating() {
  const block = state.ceo;

  if (block.loading) {
    return renderLoadingCard("Собираю управленческую повестку...");
  }

  if (block.error) {
    return renderErrorCard(block.error, "Повторить", "/mini-app/ceo");
  }

  if (!block.data?.ceoBrief) {
    return renderLoadingCard("Готовлю CEO-контур...");
  }

  const brief = block.data.ceoBrief;
  const metrics = brief.metrics || {};
  const coverage = metrics.diagnosticCoverage || { answeredCount: 0, totalCount: 11, percent: 0 };

  return `
    <section class="hero compact">
      <p>CEO-контур AI-BOSS</p>
      <h2>Повестка управления кейсом</h2>
      <p>${escapeHtml(brief.summary)} ${escapeHtml(brief.posture)}</p>
      <div class="status-row">
        <span class="pill ${brief.mode === "active_ceo_loop" ? "success" : "neutral"}">готовность контура: ${escapeHtml(brief.operatingScore)}/${escapeHtml(brief.operatingScoreMax)}</span>
        <span class="pill neutral">режим: ${escapeHtml(displayCeoMode(brief.mode))}</span>
      </div>
    </section>

    <section class="card next-card">
      <h3>Что сейчас держит AI-BOSS</h3>
      <div class="ceo-metrics">
        ${renderCeoMetric("Профиль", metrics.profileReady ? "готов" : "нужно заполнить", metrics.profileReady)}
        ${renderCeoMetric("Диагностика", `${coverage.answeredCount || 0}/${coverage.totalCount || 11}`, Number(coverage.percent || 0) >= 100)}
        ${renderCeoMetric("Гипотеза", displayStatus(metrics.constraintStatus), metrics.constraintStatus === "confirmed")}
        ${renderCeoMetric("Шаг", displayStatus(metrics.nextStepStatus), ["accepted", "done"].includes(metrics.nextStepStatus))}
        ${renderCeoMetric("Инструменты", String(metrics.toolRecommendationsCount || 0), Number(metrics.toolRecommendationsCount || 0) > 0)}
        ${renderCeoMetric("Факты", String(metrics.documentsCount || metrics.observationsCount || 0), Number(metrics.documentsCount || metrics.observationsCount || 0) > 0)}
      </div>
    </section>

    <section class="card next-card">
      <h3>Повестка AI-BOSS</h3>
      <p>Это список того, что система должна вести сама: где подготовить данные, где предложить действие, а где вынести решение собственнику.</p>
      <div class="agenda-list">
        ${(brief.agenda || []).map(renderAgendaItem).join("")}
      </div>
    </section>

    <div class="grid two">
      <section class="card list-card">
        <h3>Решения собственника</h3>
        <p>Эти пункты нельзя тихо решить за собственника. AI-BOSS готовит варианты, но финальный выбор должен быть явным.</p>
        ${renderOwnerDecisionList(brief.ownerDecisions || [])}
      </section>
      <section class="card list-card">
        <h3>Контрольный цикл</h3>
        <p>${escapeHtml(brief.controlLoop?.rule || "")}</p>
        <div class="divider"></div>
        <p><strong>${escapeHtml(brief.controlLoop?.cadence || "цикл управления")}</strong></p>
        <p>${escapeHtml(brief.controlLoop?.nextReview || "")}</p>
        ${renderOpenLoops(brief.controlLoop?.openLoops || [])}
      </section>
    </div>

    <section class="card next-card">
      <h3>Ближайшее действие</h3>
      <p>CEO-контур становится реальным, когда у кейса есть одно действие в работе и понятный факт, с которым пользователь вернётся.</p>
      <div class="actions">
        <button class="primary-button" data-navigate="/mini-app/next-step">Открыть следующий шаг</button>
        <button class="secondary-button" data-navigate="/mini-app/constraint">К гипотезе</button>
        <button class="secondary-button" data-navigate="/mini-app/consultation">Собрать резюме</button>
      </div>
    </section>
  `;
}

function displayCeoMode(mode) {
  const map = {
    active_ceo_loop: "активный контур",
    building_ceo_loop: "сборка контура",
    setup_needed: "нужна настройка"
  };
  return map[mode] || mode || "не определён";
}

function renderCeoMetric(label, value, ready) {
  return `
    <div class="ceo-metric ${ready ? "ready" : ""}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value || "нет")}</strong>
    </div>
  `;
}

function renderAgendaItem(item) {
  return `
    <article class="agenda-item">
      <div>
        <p class="eyebrow">${escapeHtml(displayAgendaKind(item.kind))}</p>
        <h4>${escapeHtml(item.title)}</h4>
        <p>${escapeHtml(item.text)}</p>
      </div>
      ${item.route ? `<button class="secondary-button compact-button" data-navigate="${escapeAttribute(item.route)}">${escapeHtml(item.cta || "Открыть")}</button>` : ""}
    </article>
  `;
}

function displayAgendaKind(kind) {
  const map = {
    owner_decision: "решение собственника",
    system_action: "действие AI-BOSS",
    action: "первое действие",
    control: "контроль",
    evidence: "факты",
    artifact: "артефакт"
  };
  return map[kind] || kind || "повестка";
}

function renderOwnerDecisionList(decisions = []) {
  if (!decisions.length) {
    return `<p>Ключевые решения пока не выделены. Сначала нужен профиль, диагностика или гипотеза ограничения.</p>`;
  }

  return `
    <ul class="plain-list decision-list">
      ${decisions.map((item) => `
        <li>
          <strong>${escapeHtml(item.title)}</strong>
          <span>${escapeHtml(item.reason)}</span>
          <em>${escapeHtml(item.owner)} · ${escapeHtml(displayOwnerDecisionStatus(item.status))}</em>
        </li>
      `).join("")}
    </ul>
  `;
}

function displayOwnerDecisionStatus(status) {
  const map = {
    needs_owner: "нужно решение",
    in_progress: "в работе",
    needs_decision: "нужно выбрать",
    needs_action: "нужно действие",
    system_action: "готовит AI-BOSS",
    needs_evidence: "нужен факт"
  };
  return map[status] || status || "";
}

function renderOpenLoops(openLoops = []) {
  if (!openLoops.length) {
    return `<p class="hint-text">Открытых петель нет: можно переходить к следующему циклу роста или проверки.</p>`;
  }

  return `
    <div class="status-row">
      ${openLoops.slice(0, 6).map((item) => `<span class="pill neutral">${escapeHtml(item)}</span>`).join("")}
    </div>
  `;
}

function renderBusinessAssembly() {
  const block = state.assembly;

  if (block.loading) {
    return renderLoadingCard("Собираю архитектуру бизнеса...");
  }

  if (block.error) {
    return renderErrorCard(block.error, "Повторить", "/mini-app/assembly");
  }

  if (!block.data?.assembly) {
    return renderLoadingCard("Готовлю маршрут по 11 слоям...");
  }

  const assembly = block.data.assembly;
  const progress = assembly.architectureProgress || assembly.artifactProgress || { confirmed: 0, ready: 0, total: 0, percent: 0 };

  return `
    <section class="hero compact">
      <p>Архитектура бизнеса</p>
      <h2>Карта бизнеса по 11 слоям</h2>
      <p>${escapeHtml(assembly.summary)} Это тот же подход, что в web-кабинете: слой → домен → поддомен → свой инструмент, артефакт или подтверждённый факт.</p>
      ${renderAssemblyProgress(progress)}
      <div class="actions">
        <button class="secondary-button" data-navigate="/mini-app/documents">Открыть документы</button>
        <button class="secondary-button" data-navigate="/mini-app/tools">Инструменты</button>
      </div>
    </section>

    ${renderAssemblyNextRequest(assembly.nextRequest, block)}

    <section class="card next-card">
      <h3>Архитектура бизнеса</h3>
      <p>Здесь видно, какие части бизнеса уже собраны документами и фактами, а какие ещё пустые. Слой показывает общий уровень, но работа всегда идёт ниже — по доменам и поддоменам.</p>
      <div class="assembly-list">
        ${(assembly.layers || []).map((layer) => renderAssemblyLayer(layer, block)).join("")}
      </div>
    </section>
  `;
}

function renderAssemblyProgress(progress = {}) {
  const ready = Number(progress.confirmed || progress.ready || 0);
  const total = Number(progress.total || 0);
  const percent = Number(progress.percent || 0);
  const review = Number(progress.review || 0);
  const draft = Number(progress.draft || 0);

  return `
    <div class="progress-block hero-progress">
      <div class="progress-label">
        <span>Поддомены карты</span>
        <strong>${escapeHtml(ready)}/${escapeHtml(total)}</strong>
      </div>
      <div class="progress progress-single" aria-label="Архитектура бизнеса: подтверждено ${escapeAttribute(ready)}/${escapeAttribute(total)} поддоменов">
        <div class="progress-bar"><span style="width: ${Math.max(0, Math.min(100, percent))}%"></span></div>
      </div>
      <p class="progress-caption">Шкала показывает, сколько поддоменов подтверждено своим инструментом, артефактом или фактом. ${review || draft ? `Ещё нужно проверить или дописать: ${escapeHtml(review + draft)}.` : ""}</p>
    </div>
  `;
}

function renderAssemblyNextRequest(nextRequest, block) {
  if (!nextRequest) {
    return "";
  }

  const layerKey = nextRequest.layer?.layerKey || "";
  const artifactId = nextRequest.artifact?.id || "";

  return `
    <section class="card insight-card">
      <p class="eyebrow">${nextRequest.status === "complete" ? "сборка завершена" : "следующий участок карты"}</p>
      <h3>${escapeHtml(nextRequest.title)}</h3>
      <p>${escapeHtml(nextRequest.text)}</p>
      ${nextRequest.architectureItem ? `
        <div class="status-row">
          <span class="pill neutral">${escapeHtml(nextRequest.architectureItem.domain)}</span>
          <span class="pill neutral">${escapeHtml(nextRequest.architectureItem.subdomain)}</span>
          <span class="pill neutral">${escapeHtml(nextRequest.architectureItem.label)}</span>
        </div>
        ${nextRequest.architectureItem.expectedResult ? `<p><strong>Что должно получиться:</strong> ${escapeHtml(nextRequest.architectureItem.expectedResult)}</p>` : ""}
      ` : ""}
      ${nextRequest.artifact?.why ? `<p><strong>Зачем:</strong> ${escapeHtml(nextRequest.artifact.why)}</p>` : ""}
      <div class="actions">
        ${artifactId ? `
          <button
            class="primary-button"
            type="button"
            data-assembly-draft="${escapeAttribute(artifactId)}"
            data-assembly-layer="${escapeAttribute(layerKey)}"
            ${block.creatingArtifactId === artifactId ? "disabled" : ""}
          >
            ${block.creatingArtifactId === artifactId ? "Создаю..." : "Создать черновик"}
          </button>
        ` : ""}
        <button class="secondary-button" type="button" data-navigate="${escapeAttribute(nextRequest.route || "/mini-app/documents")}">
          ${nextRequest.status === "complete" ? "Вернуться в кабинет" : nextRequest.status === "needs_subdomain" ? "Открыть инструменты" : "Добавить документ"}
        </button>
      </div>
      ${block.message ? `<p class="hint-text">${escapeHtml(block.message)}</p>` : ""}
    </section>
  `;
}

function renderAssemblyLayer(layer, block) {
  const progress = layer.architectureProgress || layer.architecture?.coverage || null;
  return `
    <article class="assembly-layer">
      <div class="layer-head">
        <div>
          <p class="eyebrow">Шаг ${escapeHtml(layer.order)} · класс ${escapeHtml(layer.classKey)}</p>
          <h4>${escapeHtml(layer.title)}</h4>
        </div>
        <span class="score-badge ${layer.status === "ready" ? "filled" : ""}">${escapeHtml(displayAssemblyStatus(layer.status))}</span>
      </div>
      <p>${escapeHtml(layer.role || layer.shortDescription)}</p>
      <div class="status-row">
        <span class="pill neutral">фактов: ${escapeHtml(layer.observationCount || 0)}</span>
        <span class="pill neutral">оценка: ${escapeHtml(layer.maturityScore ? `${layer.maturityScore}/5` : "не нужна для старта")}</span>
        ${layer.architecture ? `<span class="pill neutral">доменов: ${escapeHtml(layer.architecture.domainCount || 0)}</span>` : ""}
        ${layer.architecture ? `<span class="pill neutral">поддоменов: ${escapeHtml(layer.architecture.subdomainCount || 0)}</span>` : ""}
        ${progress ? `<span class="pill neutral">подтверждено: ${escapeHtml(progress.confirmed || 0)}/${escapeHtml(progress.total || 0)}</span>` : ""}
        ${progress?.review ? `<span class="pill neutral">проверить: ${escapeHtml(progress.review)}</span>` : ""}
        ${progress?.draft ? `<span class="pill neutral">можно собрать: ${escapeHtml(progress.draft)}</span>` : ""}
      </div>
      ${renderAssemblyArchitecture(layer.architecture)}
      <div class="assembly-tools">
        <strong>Инструменты для слоя${Number(layer.toolCount || 0) ? `: ${escapeHtml(layer.toolCount)} в каталоге` : ""}</strong>
        ${layer.recommendedTools?.length ? `
          <div class="tool-grid compact-grid">
            ${layer.recommendedTools.map((tool) => renderToolTeaser(tool)).join("")}
          </div>
          <p class="hint-text">Показываю первые 3 ориентира. Полный список можно найти в каталоге инструментов.</p>
        ` : `<p class="hint-text">${escapeHtml(layer.toolGap || "Инструменты для слоя пока не найдены.")}</p>`}
      </div>
    </article>
  `;
}

function renderAssemblyArchitecture(architecture) {
  const domains = architecture?.domains || [];

  if (!domains.length) {
    return "";
  }

  return `
    <details class="assembly-architecture">
      <summary>Показать домены и поддомены слоя</summary>
      <div class="assembly-domain-list">
        ${domains.map((domain) => `
          <details class="assembly-domain">
            <summary>
              <span>${escapeHtml(domain.title)}</span>
              <small>${escapeHtml(domain.confirmed || 0)}/${escapeHtml(domain.subdomainCount || domain.subdomains?.length || 0)} подтверждено · ${escapeHtml(domain.percent || 0)}%</small>
            </summary>
            ${domain.description ? `<p>${escapeHtml(domain.description)}</p>` : ""}
            <div class="assembly-subdomain-list">
              ${(domain.subdomains || []).map((subdomain) => `
                <article class="assembly-subdomain ${escapeAttribute(subdomain.coverageStatus || "missing")}">
                  <div>
                    <strong>${escapeHtml(subdomain.title)}</strong>
                    <em>${escapeHtml(subdomain.coverageLabel || "нет данных")}</em>
                  </div>
                  ${subdomain.description ? `<span>${escapeHtml(subdomain.description)}</span>` : ""}
                  ${subdomain.recommendedTools?.length ? `<small>Инструмент: ${escapeHtml(subdomain.recommendedTools[0])}</small>` : ""}
                  ${renderAssemblyEvidence(subdomain)}
                </article>
              `).join("")}
            </div>
          </details>
        `).join("")}
      </div>
    </details>
  `;
}

function renderAssemblyEvidence(subdomain) {
  const evidence = subdomain.evidence || {};
  const entries = [
    ...(evidence.confirmedArtifacts || []),
    ...(evidence.incompleteArtifacts || []),
    ...(evidence.draftSources || [])
  ].slice(0, 2);

  if (!entries.length) {
    return "";
  }

  return `
    <div class="assembly-evidence">
      ${entries.map((entry) => `
        <small>
          <b>${escapeHtml(entry.title || "Источник")}</b>
          ${entry.quality?.label ? ` · ${escapeHtml(entry.quality.label)}` : ""}
        </small>
      `).join("")}
    </div>
  `;
}

function renderAssemblyArtifact(layer, artifact, block) {
  const match = artifact.match || {};
  const ready = match.status === "ready";

  return `
    <article class="assembly-artifact ${ready ? "ready" : ""}">
      <div>
        <strong>${escapeHtml(artifact.title)}</strong>
        <span>${escapeHtml(ready
          ? `Готово: ${match.title || "документ сохранён"}`
          : artifact.fillPrompt
        )}</span>
        <small>${escapeHtml(artifact.why)}</small>
      </div>
      <div class="actions">
        ${ready ? `
          <button class="secondary-button compact-button" type="button" data-navigate="/mini-app/documents">Открыть</button>
        ` : `
          <button
            class="secondary-button compact-button"
            type="button"
            data-assembly-draft="${escapeAttribute(artifact.id)}"
            data-assembly-layer="${escapeAttribute(layer.layerKey)}"
            ${block.creatingArtifactId === artifact.id ? "disabled" : ""}
          >
            ${block.creatingArtifactId === artifact.id ? "Создаю..." : "Создать черновик"}
          </button>
        `}
      </div>
    </article>
  `;
}

function displayAssemblyStatus(status) {
  const map = {
    ready: "собрано",
    in_progress: "в работе",
    missing: "нужно собрать"
  };
  return map[status] || status || "нужно собрать";
}

function renderTools() {
  const block = state.tools;

  if (block.loading) {
    return renderLoadingCard("Загружаю каталог инструментов...");
  }

  if (block.error) {
    return renderErrorCard(block.error, "Повторить", "/mini-app/tools");
  }

  const tools = block.catalog?.tools || [];
  const query = block.query.trim().toLowerCase();
  const filteredTools = query
    ? tools.filter((tool) => normalizeToolSearchText(tool).includes(query))
    : tools;
  const visibleTools = filteredTools.slice(0, 80);

  return `
    <section class="hero compact">
      <p>Инструменты</p>
      <h2>Каталог рабочих инструментов</h2>
      <p>В каталоге ${tools.length} инструментов из архитектурной карты. AI-BOSS использует их как ориентиры: подбирает подходящие по кейсу, но не подменяет ими живую диагностику.</p>
      <div class="actions">
        <button class="secondary-button" data-navigate="/mini-app/documents">Документы</button>
      </div>
    </section>

    <section class="card next-card">
      <h3>${query ? "Результаты поиска" : "Основные инструменты"}</h3>
      <form class="tool-search catalog-search" data-tool-search-form>
        <label>
          <span>Поиск по каталогу</span>
          <input name="toolSearch" value="${escapeAttribute(block.query)}" placeholder="Название, область, задача или результат" />
        </label>
        <div class="form-actions">
          <button class="primary-button compact-button" type="submit">Найти</button>
          <button class="secondary-button compact-button" type="button" data-tool-search-clear>Сброс</button>
        </div>
      </form>
      ${tools.length ? `
        <p>${query
          ? `Найдено: ${filteredTools.length}. Показано первые ${visibleTools.length}.`
          : `Показано первые ${visibleTools.length} из ${tools.length}. Уточни поиск, если нужен конкретный участок бизнеса.`
        }</p>
        <div class="tool-grid">
          ${visibleTools.map((tool) => renderToolTeaser(tool, tool.recommendation)).join("")}
        </div>
      ` : `
        <p>Каталог пока не загрузился. Повтори загрузку, чтобы подтянуть инструменты из архитектурной карты.</p>
        <div class="actions">
          <button class="secondary-button" data-tools-recalculate ${block.recommendedLoading ? "disabled" : ""}>Обновить каталог</button>
        </div>
      `}
    </section>
  `;
}

function renderToolCard() {
  const slug = state.currentRoute.params?.slug || "";
  const block = state.tools;

  if (block.loading) {
    return renderLoadingCard("Загружаю карточку инструмента...");
  }

  if (block.error) {
    return renderErrorCard(block.error, "Повторить", state.currentRoute.path);
  }

  const tools = block.catalog?.tools || [];
  const tool = tools.find((item) => item.slug === slug);

  if (!tool) {
    return renderErrorCard("Инструмент не найден в каталоге.", "К каталогу", "/mini-app/tools");
  }

  return `
    <section class="hero compact">
      <p>Инструмент</p>
      <h2>${escapeHtml(tool.title)}</h2>
      <p>${escapeHtml(tool.short_description)}</p>
    </section>

    <section class="card insight-card">
      <p class="eyebrow">Когда использовать</p>
      <h3>${escapeHtml(tool.title)}</h3>
      <p>${escapeHtml(tool.when_to_use)}</p>
      <div class="status-row">
        ${[tool.layer, tool.domain].filter(Boolean).map((tag) => `<span class="pill neutral">${escapeHtml(tag)}</span>`).join("")}
      </div>
      ${tool.result ? `<p><strong>Результат:</strong> ${escapeHtml(tool.result)}</p>` : ""}
      ${tool.recommendation ? `<p><strong>Почему рекомендован:</strong> ${escapeHtml(tool.recommendation.reason || "")}</p>` : ""}
      ${tool.templateUrl ? `
        <p><strong>Шаблон:</strong> можно открыть готовый внешний документ.</p>
      ` : `
        <p><strong>Шаблон:</strong> пока не подключён. Сейчас инструмент доступен как рекомендация и карточка; ссылку на готовый шаблон добавим в каталог отдельно.</p>
      `}
      <div class="actions">
        ${tool.templateUrl ? `
          <a class="primary-button" href="${escapeAttribute(tool.templateUrl)}" target="_blank" rel="noopener noreferrer">Открыть шаблон</a>
        ` : `
          <button class="primary-button" type="button" disabled>Шаблон скоро будет доступен</button>
        `}
        <button class="secondary-button" type="button" data-navigate="/mini-app/documents">Добавить заполненный документ</button>
      </div>
    </section>
  `;
}

function normalizeToolSearchText(tool) {
  return [
    tool.title,
    tool.short_description,
    tool.when_to_use,
    tool.result,
    tool.layer,
    tool.domain,
    ...(tool.layerKeys || tool.layer_keys || []),
    ...(tool.problemTypes || tool.problem_types || [])
  ].filter(Boolean).join(" ").toLowerCase();
}

function renderToolTeaser(tool, recommendation = null) {
  if (!tool) {
    return "";
  }

  return `
    <article class="tool-card">
      <p class="eyebrow">${recommendation ? `приоритет ${escapeHtml(recommendation.priority || "")}` : escapeHtml(tool.layer || "инструмент")}</p>
      <h4>${escapeHtml(tool.title)}</h4>
      <p>${escapeHtml(tool.short_description)}</p>
      ${recommendation?.reason ? `<small>${escapeHtml(recommendation.reason)}</small>` : ""}
      <div class="actions">
        <button class="secondary-button compact-button" data-navigate="/mini-app/tools/${escapeAttribute(tool.slug)}">Посмотреть</button>
      </div>
    </article>
  `;
}

function renderDocuments() {
  const block = state.documents;

  if (block.loading) {
    return renderLoadingCard("Загружаю документы кейса...");
  }

  if (block.error) {
    return renderErrorCard(block.error, "Повторить", "/mini-app/documents");
  }

  const documents = block.data?.documents || [];
  const artifacts = block.data?.artifacts || [];

  return `
    <section class="hero compact">
      <p>Документы</p>
      <h2>Документы и артефакты кейса</h2>
      <p>Здесь хранится всё, на что AI-BOSS должен опираться: ссылки, вставленные материалы, снимки анализа и черновики документов для сборки бизнеса.</p>
    </section>

    <form class="card form-card" data-document-form>
      <label>
        <span>Ссылка на документ</span>
        <input name="url" required placeholder="https://docs.google.com/..." />
      </label>
      <label>
        <span>Название</span>
        <input name="title" placeholder="Например, Карта воронки" />
      </label>
      <label>
        <span>Текст для анализа, если ссылка закрытая</span>
        <textarea name="analysisText" placeholder="Можно вставить ключевые выводы или содержимое документа. Если оставить пустым, я сохраню ссылку, но не смогу прочитать закрытый файл."></textarea>
      </label>
      <div class="form-actions">
        <button class="primary-button" type="submit" ${block.saving ? "disabled" : ""}>${block.saving ? "Сохраняю..." : "Сохранить документ"}</button>
      </div>
      ${block.message ? `<p class="hint-text">${escapeHtml(block.message)}</p>` : ""}
    </form>

    <section class="card next-card">
      <h3>Ссылки и загруженные материалы</h3>
      ${documents.length ? `<div class="document-list">${documents.map(renderDocumentCard).join("")}</div>` : `<p>Пока документов нет.</p>`}
    </section>

    <section class="card next-card">
      <h3>Черновики AI-BOSS</h3>
      ${artifacts.length ? `<div class="document-list">${artifacts.map(renderArtifactCard).join("")}</div>` : `<p>Пока черновиков нет. Их можно создать на экране сборки бизнеса.</p>`}
    </section>
  `;
}

function renderDocumentCard(document) {
  const snapshot = document.latestSnapshot;
  const analyzing = state.documents.analyzingId === document.id;

  return `
    <article class="document-card">
      <div>
        <p class="eyebrow">${escapeHtml(document.source_kind || "link")}</p>
        <h4>${escapeHtml(document.title || document.url)}</h4>
        <p>${escapeHtml(document.url)}</p>
        <div class="status-row">
          <span class="pill">${escapeHtml(displayStatus(document.status || "link_added"))}</span>
        </div>
      </div>
      ${snapshot ? `
        <div class="snapshot-box">
          <strong>Последний снимок</strong>
          <p>${escapeHtml(snapshot.summary)}</p>
          ${snapshot.extracted_observations?.length ? `<small>Наблюдений: ${snapshot.extracted_observations.length}</small>` : ""}
        </div>
      ` : ""}
      <label class="inline-analysis">
        <span>Текст/выводы для анализа</span>
        <textarea data-document-text="${escapeAttribute(document.id)}" placeholder="Вставь текст, если документ закрыт или ссылка требует доступа."></textarea>
      </label>
      <div class="actions">
        <button
          class="primary-button compact-button"
          type="button"
          data-document-analyze="${escapeAttribute(document.id)}"
          ${analyzing ? "disabled" : ""}
        >
          ${analyzing ? "Анализирую..." : "Анализировать"}
        </button>
      </div>
    </article>
  `;
}

function renderArtifactCard(artifact) {
  return `
    <article class="document-card">
      <div>
        <p class="eyebrow">${escapeHtml(displayArtifactKind(artifact.kind))}</p>
        <h4>${escapeHtml(artifact.title)}</h4>
        <p>${escapeHtml(artifact.summary || "Черновик создан AI-BOSS и хранится в кейсе.")}</p>
        <div class="status-row">
          <span class="pill success">сохранено</span>
        </div>
      </div>
      ${artifact.content ? `
        <div class="snapshot-box">
          <strong>Содержимое</strong>
          <pre>${escapeHtml(artifact.content)}</pre>
        </div>
      ` : ""}
    </article>
  `;
}

function displayArtifactKind(kind) {
  const map = {
    screening: "первичный разбор",
    diagnosis: "диагностика",
    action_wave: "план действий",
    snapshot: "черновик"
  };
  return map[kind] || kind || "артефакт";
}

function renderConsultation() {
  const block = state.consultation;

  if (block.loading) {
    return renderLoadingCard("Готовлю резюме кейса для консультации...");
  }

  if (block.error) {
    return renderErrorCard(block.error, "Повторить", "/mini-app/consultation");
  }

  const brief = block.data?.brief;
  const maturity = brief?.maturity_summary || {};
  const bookingConfigured = Boolean(block.data?.bookingUrlConfigured);

  return `
    <section class="hero compact">
      <p>Консультация</p>
      <h2>Разбор с экспертом</h2>
      <p>Это продолжение диагностики: собираем текущий кейс в короткое резюме, чтобы на консультации не начинать с нуля, а сразу проверить гипотезу и первый шаг.</p>
      <div class="actions">
        <button class="primary-button" data-consultation-generate ${block.generating ? "disabled" : ""}>
          ${block.generating ? "Формирую..." : "Сформировать резюме"}
        </button>
        <button class="secondary-button" data-consultation-copy ${!brief ? "disabled" : ""}>Скопировать резюме</button>
        <button class="secondary-button" data-consultation-request ${(!brief || !bookingConfigured || block.requestSaving) ? "disabled" : ""}>
          ${block.requestSaving ? "Готовлю..." : "Записаться"}
        </button>
      </div>
      ${block.message ? `<p class="hero-note">${escapeHtml(block.message)}</p>` : ""}
    </section>

    <section class="card insight-card">
      <p class="eyebrow">Что уже понятно</p>
      <h3>${escapeHtml(block.data?.statusNote || "Резюме собирается из текущего кейса")}</h3>
      <p>Уже есть первичная картина по компании. На консультации можно проверить гипотезу ограничения, уточнить первый управленческий шаг и собрать план дальнейших действий.</p>
      ${!bookingConfigured ? `<p class="hint-text">Ссылка на запись пока не настроена: добавьте ALEXANDER_BOOKING_URL в окружение. Резюме всё равно можно сформировать и скопировать.</p>` : ""}
    </section>

    ${brief ? `
      <section class="card consultation-brief">
        <p class="eyebrow">Резюме кейса</p>
        <h3>${escapeHtml(brief.title)}</h3>
        <p>${escapeHtml(brief.summary)}</p>
      </section>

      <div class="grid two">
        <section class="card">
          <h3>Текущий запрос</h3>
          <p>${escapeHtml(brief.current_request || "Запрос пока не сформулирован.")}</p>
        </section>
        <section class="card">
          <h3>Матрица зрелости</h3>
          <p>Заполнено областей: ${escapeHtml(maturity.completed_layers || 0)}. Средняя оценка: ${escapeHtml(maturity.avg_score || 0)}/5.</p>
          ${renderLayerChips("Слабые зоны", maturity.weak_layers)}
          ${renderLayerChips("Сильные зоны", maturity.strong_layers)}
        </section>
      </div>

      <div class="grid two">
        <section class="card">
          <h3>Гипотеза ограничения</h3>
          <p>${escapeHtml(brief.constraint_summary || "Гипотеза пока не сформирована.")}</p>
        </section>
        <section class="card">
          <h3>Следующий шаг</h3>
          <p>${escapeHtml(brief.next_step_summary || "Следующий шаг пока не выбран.")}</p>
        </section>
      </div>

      <section class="card list-card">
        <h3>Факты и сигналы</h3>
        ${renderBriefEvidence(brief.evidence || [])}
      </section>

      <section class="card list-card">
        <h3>Открытые вопросы</h3>
        ${renderBriefQuestions(brief.open_questions || [])}
      </section>
    ` : `
      <section class="card">
        <h3>Резюме ещё не сформировано</h3>
        <p>Нажми “Сформировать резюме”, и AI-BOSS соберёт текущий профиль, матрицу, гипотезу, следующий шаг, сигналы и вопросы в один короткий документ.</p>
      </section>
    `}
  `;
}

function renderLayerChips(title, layers = []) {
  if (!layers?.length) {
    return "";
  }

  return `
    <div class="status-row">
      <span class="pill neutral">${escapeHtml(title)}</span>
      ${layers.map((item) => `<span class="pill">${escapeHtml(item.title || item.layerKey)}: ${escapeHtml(item.score)}/5</span>`).join("")}
    </div>
  `;
}

function renderBriefEvidence(evidence = []) {
  if (!evidence.length) {
    return `<p>Пока недостаточно фактов и сигналов. Можно записаться уже сейчас, но экспресс-диагностика сделает разбор точнее.</p>`;
  }

  return `
    <div class="evidence-list">
      ${evidence.map((item) => `<em>${escapeHtml(item.text || item)}</em>`).join("")}
    </div>
  `;
}

function renderBriefQuestions(questions = []) {
  if (!questions.length) {
    return `<p>Открытые вопросы появятся после гипотезы ограничения, документов или следующего шага.</p>`;
  }

  return `<ul class="plain-list">${questions.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function renderBulletList(items = []) {
  const list = (items || []).filter(Boolean);
  if (!list.length) {
    return `<p>Пока недостаточно данных.</p>`;
  }

  return `<ul class="plain-list">${list.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function renderObservationList(observations = []) {
  if (!observations?.length) {
    return `<p>Пока нет сильных наблюдений из чата. Гипотеза держится слабее и требует проверки.</p>`;
  }

  return `
    <div class="evidence-list">
      ${observations.map((item) => `<em>${escapeHtml(item.statement || item.normalizedSignal || "Сигнал из диалога")}</em>`).join("")}
    </div>
  `;
}

function renderAlternativeList(alternatives = []) {
  if (!alternatives?.length) {
    return `<p>Альтернативы появятся, когда будет больше ответов и наблюдений.</p>`;
  }

  return `
    <ul class="plain-list">
      ${alternatives.map((item) => `
        <li>
          <strong>${escapeHtml(item.layerTitle || item.layerKey)}</strong>
          <span>${escapeHtml(item.whyAlternative || "")}</span>
        </li>
      `).join("")}
    </ul>
  `;
}

function renderPlaceholder(route) {
  return `
    <section class="hero">
      <p>${escapeHtml(route.eyebrow)}</p>
      <h2>${escapeHtml(route.title)}</h2>
      <p>${escapeHtml(route.description)}</p>
    </section>

    <div class="grid two">
      <section class="card placeholder">
        <h3>Экран пока не входит в текущий релиз</h3>
        <p>Сейчас реализованы профиль, экспресс-диагностика, матрица, гипотеза ограничения, следующий шаг, инструменты, документы и консультация.</p>
        <div class="status-row">
          <span class="pill">есть назад/главная</span>
          <span class="pill neutral">можно вернуться в чат</span>
        </div>
      </section>
      ${renderBootstrapCard()}
    </div>
  `;
}

function renderLoadingCard(text) {
  return `
    <section class="card">
      <h3>Загрузка</h3>
      <p>${escapeHtml(text)}</p>
      <div class="status-row">
        <span class="pill neutral">загрузка</span>
      </div>
    </section>
  `;
}

function renderErrorCard(error, actionLabel, routePath) {
  return `
    <section class="card">
      <h3>Что-то не загрузилось</h3>
      <p>${escapeHtml(error)}</p>
      <div class="actions">
        <button class="primary-button" data-reload-route="${escapeAttribute(routePath)}">${escapeHtml(actionLabel)}</button>
      </div>
    </section>
  `;
}

function renderRouteContent(route) {
  if (normalizePath(route.path) === "/mini-app") {
    return renderDashboard();
  }

  if (route.path === "/mini-app/onboarding") {
    return renderOnboarding();
  }

  if (route.path === "/mini-app/diagnostics/express") {
    return renderExpressDiagnostics();
  }

  if (route.path === "/mini-app/maturity") {
    return renderMaturity();
  }

  if (route.path === "/mini-app/constraint") {
    return renderConstraint();
  }

  if (route.path === "/mini-app/next-step") {
    return renderNextStep();
  }

  if (route.path === "/mini-app/ceo") {
    return renderCeoOperating();
  }

  if (route.path === "/mini-app/assembly") {
    return renderBusinessAssembly();
  }

  if (route.path === "/mini-app/tools") {
    return renderTools();
  }

  if (normalizePath(route.path).startsWith("/mini-app/tools/")) {
    return renderToolCard();
  }

  if (route.path === "/mini-app/documents") {
    return renderDocuments();
  }

  if (route.path === "/mini-app/consultation") {
    return renderConsultation();
  }

  return renderPlaceholder(route);
}

function render() {
  const route = state.currentRoute;
  const isRootRoute = normalizePath(route.path) === "/mini-app";

  appRoot.innerHTML = `
    <main class="mini-layout">
      <header class="topbar">
        ${isRootRoute
          ? `<span class="nav-placeholder" aria-hidden="true"></span>`
          : `<button class="nav-button" type="button" data-back aria-label="Назад">←</button>`}
        <div class="title-stack">
          <p class="eyebrow">${escapeHtml(route.eyebrow)}</p>
          <h1 class="screen-title">${escapeHtml(route.title)}</h1>
        </div>
        <button class="nav-button" type="button" data-navigate="/mini-app" aria-label="Главная">⌂</button>
      </header>

      ${state.bootstrap?.alphaMode ? `
        <section class="alpha-banner">
          Альфа-режим: мы бережно логируем события и качество гипотез, чтобы быстрее улучшать диагностику.
        </section>
      ` : ""}

      ${renderRouteContent(route)}

      <div class="footer-space"></div>
    </main>
  `;

  bindEvents();
}

function bindEvents() {
  appRoot.querySelectorAll("[data-link]").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      navigate(link.getAttribute("href"));
    });
  });

  appRoot.querySelectorAll("[data-navigate]").forEach((button) => {
    button.addEventListener("click", () => navigate(button.dataset.navigate));
  });

  appRoot.querySelectorAll("[data-reload-route]").forEach((button) => {
    button.addEventListener("click", () => loadRouteData({ force: true }));
  });

  appRoot.querySelectorAll("[data-answer-layer]").forEach((button) => {
    button.addEventListener("click", () => saveLayerScore(button.dataset.answerLayer, Number(button.dataset.answerScore)));
  });

  appRoot.querySelectorAll("[data-prefill-action]").forEach((button) => {
    button.addEventListener("click", () => applyPrefillAction(button.dataset.prefillLayer, button.dataset.prefillAction));
  });

  appRoot.querySelectorAll("[data-constraint-action]").forEach((button) => {
    button.addEventListener("click", () => applyConstraintAction(button.dataset.constraintId, button.dataset.constraintAction));
  });

  appRoot.querySelectorAll("[data-constraint-chat]").forEach((button) => {
    button.addEventListener("click", () => requestConstraintRejectionChat(button.dataset.constraintChat));
  });

  appRoot.querySelectorAll("[data-next-step-action]").forEach((button) => {
    button.addEventListener("click", () => updateNextStep(button.dataset.nextStepId, button.dataset.nextStepAction));
  });

  appRoot.querySelectorAll("[data-assembly-draft]").forEach((button) => {
    button.addEventListener("click", () => createAssemblyDraft(button.dataset.assemblyLayer, button.dataset.assemblyDraft));
  });

  appRoot.querySelectorAll("[data-tools-recalculate]").forEach((button) => {
    button.addEventListener("click", recalculateTools);
  });
  appRoot.querySelector("[data-tool-search-form]")?.addEventListener("submit", updateToolSearch);
  appRoot.querySelector("[data-tool-search-clear]")?.addEventListener("click", clearToolSearch);

  appRoot.querySelectorAll("[data-document-analyze]").forEach((button) => {
    button.addEventListener("click", () => analyzeDocument(button.dataset.documentAnalyze));
  });

  appRoot.querySelector("[data-consultation-generate]")?.addEventListener("click", generateConsultationBrief);
  appRoot.querySelector("[data-consultation-copy]")?.addEventListener("click", copyConsultationBrief);
  appRoot.querySelector("[data-consultation-request]")?.addEventListener("click", requestConsultation);

  appRoot.querySelector("[data-onboarding-form]")?.addEventListener("submit", saveOnboarding);
  appRoot.querySelector("[data-document-form]")?.addEventListener("submit", saveDocument);
  appRoot.querySelector("[data-back]")?.addEventListener("click", goBack);
}

function renderOption(value, label, selectedValue) {
  return `<option value="${escapeAttribute(value)}" ${value === selectedValue ? "selected" : ""}>${escapeHtml(label)}</option>`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}

async function loadBootstrap() {
  if (!telegram.initData) {
    state.loading = false;
    state.error = "Нет данных запуска Telegram. Открой кабинет внутри Telegram или передай параметры запуска для локальной проверки.";
    render();
    return;
  }

  try {
    state.bootstrap = await api.bootstrap();
  } catch (error) {
    state.error = errorMessage(error, "Не удалось загрузить bootstrap state.");
  } finally {
    state.loading = false;
    render();
    loadRouteData();
  }
}

async function loadRouteData({ force = false } = {}) {
  if (state.loading || state.error) {
    return;
  }

  const path = normalizePath(state.currentRoute.path);

  if (path === "/mini-app") {
    await loadCeoBrief({ force });
    await loadBusinessAssembly({ force });
  }

  if (path === "/mini-app/onboarding") {
    await loadOnboarding({ force });
  }

  if (path === "/mini-app/diagnostics/express") {
    await loadExpressDiagnostics({ force });
  }

  if (path === "/mini-app/maturity") {
    await loadMaturity({ force });
  }

  if (path === "/mini-app/constraint") {
    await loadConstraint({ force });
  }

  if (path === "/mini-app/next-step") {
    await loadNextStep({ force });
  }

  if (path === "/mini-app/ceo") {
    await loadCeoBrief({ force });
  }

  if (path === "/mini-app/assembly") {
    await loadBusinessAssembly({ force });
  }

  if (path === "/mini-app/tools" || path.startsWith("/mini-app/tools/")) {
    await loadTools({ force });
  }

  if (path === "/mini-app/documents") {
    await loadDocuments({ force });
  }

  if (path === "/mini-app/consultation") {
    await loadConsultationBrief({ force });
  }
}

async function loadOnboarding({ force = false } = {}) {
  if (state.onboarding.loading || (state.onboarding.data && !force)) {
    return;
  }

  state.onboarding.loading = true;
  state.onboarding.error = "";
  render();

  try {
    state.onboarding.data = await api.getOnboarding();
  } catch (error) {
    state.onboarding.error = errorMessage(error, "Не удалось загрузить профиль компании.");
  } finally {
    state.onboarding.loading = false;
    render();
  }
}

async function saveOnboarding(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const intent = event.submitter?.dataset?.onboardingIntent || "stay";
  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());

  state.onboarding.saving = true;
  state.onboarding.error = "";
  state.onboarding.message = "";
  render();

  try {
    const result = await api.saveOnboarding(payload);
    state.onboarding.data = {
      ...state.onboarding.data,
      company: result.company,
      companyProfile: result.companyProfile,
      problemContext: result.problemContext,
      values: payload
    };
    state.bootstrap = {
      ...state.bootstrap,
      company: result.company || state.bootstrap.company,
      companyProfile: result.companyProfile || state.bootstrap.companyProfile,
      onboardingStatus: result.onboardingStatus || state.bootstrap.onboardingStatus
    };
    state.ceo.data = null;
    state.assembly.data = null;
    state.onboarding.message = "Профиль сохранён.";
    if (intent === "diagnostics") {
      navigate("/mini-app/diagnostics/express");
    }
  } catch (error) {
    state.onboarding.error = errorMessage(error, "Не удалось сохранить профиль.");
  } finally {
    state.onboarding.saving = false;
    render();
  }
}

async function loadExpressDiagnostics({ force = false } = {}) {
  if (state.express.loading || (state.express.data && !force)) {
    return;
  }

  state.express.loading = true;
  state.express.error = "";
  render();

  try {
    const diagnostics = await api.getExpressDiagnostics();
    state.express.data = {
      ...diagnostics,
      prefillByLayer: {}
    };
    await loadDiagnosticPrefill();
  } catch (error) {
    state.express.error = errorMessage(error, "Не удалось загрузить экспресс-диагностику.");
  } finally {
    state.express.loading = false;
    render();
  }
}

async function loadDiagnosticPrefill() {
  state.express.prefillLoading = true;
  state.express.prefillError = "";

  try {
    const prefill = await api.getDiagnosticPrefill();
    state.express.data = {
      ...state.express.data,
      prefillByLayer: prefill.suggestionsByLayer || {},
      prefillObservations: prefill.observations || []
    };
  } catch (error) {
    state.express.prefillError = errorMessage(error, "Не удалось загрузить предположения системы.");
  } finally {
    state.express.prefillLoading = false;
  }
}

async function saveLayerScore(layerKey, score) {
  const suggestion = state.express.data?.prefillByLayer?.[layerKey];
  const officialAnswer = state.express.data?.answers?.[layerKey];

  if (suggestion && !officialAnswer) {
    return applyPrefillAction(layerKey, "correct", score);
  }

  return saveExpressAnswer(layerKey, score);
}

function decorateSavedExpressAnswer(answer) {
  return {
    id: answer.id,
    layerKey: answer.subject_key,
    score: answer.score,
    selectedDescription: answer.selected_description,
    source: answer.source,
    status: answer.status,
    confidence: answer.confidence
  };
}

function calculateOptimisticProgress(answers = {}, fallbackProgress = {}) {
  const totalCount = Number(fallbackProgress.totalCount || state.express.data?.layers?.length || 11);
  const answeredCount = Object.values(answers)
    .filter((answer) => Number.isFinite(Number(answer?.score)) && answer.status !== "rejected")
    .length;

  return {
    answeredCount,
    totalCount,
    percent: totalCount > 0 ? Math.round((answeredCount / totalCount) * 100) : 0
  };
}

function applyOptimisticExpressAnswer(layer, score) {
  const answers = {
    ...(state.express.data?.answers || {}),
    [layer.key]: {
      ...(state.express.data?.answers?.[layer.key] || {}),
      id: state.express.data?.answers?.[layer.key]?.id || `optimistic-${layer.key}`,
      layerKey: layer.key,
      score,
      selectedDescription: layer.levels?.[Number(score) - 1] || "",
      source: "user_explicit",
      status: "saving",
      confidence: 1
    }
  };

  state.express.data = {
    ...state.express.data,
    answers,
    progress: calculateOptimisticProgress(answers, state.express.data?.progress)
  };
}

function rollbackOptimisticExpressAnswer(layerKey, previousAnswer) {
  const answers = { ...(state.express.data?.answers || {}) };
  if (previousAnswer) {
    answers[layerKey] = previousAnswer;
  } else {
    delete answers[layerKey];
  }

  state.express.data = {
    ...state.express.data,
    answers,
    progress: calculateOptimisticProgress(answers, state.express.data?.progress)
  };
}

function removePrefillSuggestion(layerKey) {
  const prefillByLayer = { ...(state.express.data?.prefillByLayer || {}) };
  delete prefillByLayer[layerKey];
  state.express.data = {
    ...state.express.data,
    prefillByLayer
  };
}

function restorePrefillSuggestion(layerKey, suggestion) {
  if (!suggestion) {
    return;
  }

  state.express.data = {
    ...state.express.data,
    prefillByLayer: {
      ...(state.express.data?.prefillByLayer || {}),
      [layerKey]: suggestion
    }
  };
}

async function saveExpressAnswer(layerKey, score) {
  const layer = state.express.data?.layers?.find((item) => item.key === layerKey);
  if (!layer) {
    return;
  }

  const previousAnswer = state.express.data?.answers?.[layerKey] || null;
  state.express.savingLayerKey = layerKey;
  state.express.error = "";
  applyOptimisticExpressAnswer(layer, score);
  render();

  try {
    const result = await api.saveExpressAnswer({
      layerKey,
      score,
      selectedDescription: layer.levels?.[score - 1] || ""
    });

    state.express.data = {
      ...state.express.data,
      run: result.run,
      maturity: result.maturity,
      progress: {
        answeredCount: result.maturity.answeredCount,
        totalCount: result.maturity.totalCount,
        percent: result.maturity.progressPercent
      },
      answers: {
        ...(state.express.data.answers || {}),
        [result.answer.subject_key]: decorateSavedExpressAnswer(result.answer)
      }
    };
    state.maturity.data = null;
    state.ceo.data = null;
    state.assembly.data = null;
  } catch (error) {
    rollbackOptimisticExpressAnswer(layerKey, previousAnswer);
    state.express.error = errorMessage(error, "Не удалось сохранить ответ.");
  } finally {
    state.express.savingLayerKey = "";
    render();
  }
}

async function applyPrefillAction(layerKey, action, correctedScore = null) {
  const layer = state.express.data?.layers?.find((item) => item.key === layerKey);
  const suggestion = state.express.data?.prefillByLayer?.[layerKey];

  if (!layer || !suggestion) {
    return;
  }

  const score = action === "correct" ? correctedScore : suggestion.score;
  const previousAnswer = state.express.data?.answers?.[layerKey] || null;
  const previousSuggestion = suggestion;
  state.express.savingLayerKey = layerKey;
  state.express.error = "";
  if (action === "confirm" || action === "correct") {
    applyOptimisticExpressAnswer(layer, score);
  } else if (action === "reject") {
    removePrefillSuggestion(layerKey);
  }
  render();

  try {
    const result = await api.applyDiagnosticPrefillAction({
      action,
      answerId: suggestion.answerId,
      layerKey,
      score,
      selectedDescription: score ? layer.levels?.[Number(score) - 1] || "" : ""
    });

    const nextPrefill = { ...(state.express.data.prefillByLayer || {}) };
    delete nextPrefill[layerKey];

    const nextAnswers = { ...(state.express.data.answers || {}) };
    if (action === "confirm" || action === "correct") {
      nextAnswers[result.answer.subject_key] = decorateSavedExpressAnswer(result.answer);
    }

    state.express.data = {
      ...state.express.data,
      run: result.run,
      maturity: result.maturity,
      progress: {
        answeredCount: result.maturity.answeredCount,
        totalCount: result.maturity.totalCount,
        percent: result.maturity.progressPercent
      },
      answers: nextAnswers,
      prefillByLayer: nextPrefill
    };
    state.maturity.data = null;
    state.ceo.data = null;
    state.assembly.data = null;
  } catch (error) {
    if (action === "confirm" || action === "correct") {
      rollbackOptimisticExpressAnswer(layerKey, previousAnswer);
    } else if (action === "reject") {
      restorePrefillSuggestion(layerKey, previousSuggestion);
    }
    state.express.error = errorMessage(error, "Не удалось применить предположение.");
  } finally {
    state.express.savingLayerKey = "";
    render();
  }
}

async function loadMaturity({ force = false } = {}) {
  if (state.maturity.loading || (state.maturity.data && !force)) {
    return;
  }

  state.maturity.loading = true;
  state.maturity.error = "";
  render();

  try {
    state.maturity.data = await api.getMaturity();
  } catch (error) {
    state.maturity.error = errorMessage(error, "Не удалось загрузить матрицу зрелости.");
  } finally {
    state.maturity.loading = false;
    render();
  }
}

async function loadConstraint({ force = false } = {}) {
  if (state.constraint.loading || (state.constraint.data && !force)) {
    return;
  }

  state.constraint.loading = true;
  state.constraint.error = "";
  state.constraint.message = "";
  render();

  try {
    state.constraint.data = await api.reasonConstraint();
    state.nextStep.data = null;
    state.ceo.data = null;
  } catch (error) {
    state.constraint.error = errorMessage(error, "Не удалось построить гипотезу ограничения.");
  } finally {
    state.constraint.loading = false;
    render();
  }
}

async function applyConstraintAction(id, action) {
  if (!id || !action) {
    return;
  }

  state.constraint.actionSaving = action;
  state.constraint.error = "";
  state.constraint.message = "";
  render();

  try {
    const result = await api.applyConstraintAction({
      id,
      action
    });
    state.constraint.data = {
      ...(state.constraint.data || {}),
      constraintHypothesis: {
        ...(state.constraint.data?.constraintHypothesis || {}),
        ...(result.constraintHypothesis || {})
      }
    };
    state.nextStep.data = null;
    state.ceo.data = null;
  } catch (error) {
    state.constraint.error = errorMessage(error, "Не удалось обновить гипотезу.");
  } finally {
    state.constraint.actionSaving = "";
    render();
  }
}

async function requestConstraintRejectionChat(id) {
  if (!id) {
    return;
  }

  state.constraint.chatRequesting = true;
  state.constraint.error = "";
  state.constraint.message = "";
  render();

  try {
    const result = await api.requestConstraintRejectionChat({ id });
    state.constraint.data = {
      ...(state.constraint.data || {}),
      chatHandoff: result.chatHandoff || null
    };
    state.constraint.message = "Я отправил вопрос в Telegram. Ответь там одним сообщением — и я сохраню это как новый сигнал для пересборки гипотезы.";

    if (window.Telegram?.WebApp?.close) {
      window.setTimeout(() => window.Telegram.WebApp.close(), 450);
    }
  } catch (error) {
    state.constraint.error = errorMessage(error, "Не удалось отправить вопрос в чат.");
  } finally {
    state.constraint.chatRequesting = false;
    render();
  }
}

async function loadNextStep({ force = false } = {}) {
  if (state.nextStep.loading || (state.nextStep.data && !force)) {
    return;
  }

  state.nextStep.loading = true;
  state.nextStep.error = "";
  render();

  try {
    state.nextStep.data = await api.getNextStep();
  } catch (error) {
    state.nextStep.error = errorMessage(error, "Не удалось выбрать следующий шаг.");
  } finally {
    state.nextStep.loading = false;
    render();
  }
}

async function loadCeoBrief({ force = false } = {}) {
  if (state.ceo.loading || (state.ceo.data && !force)) {
    return;
  }

  state.ceo.loading = true;
  state.ceo.error = "";
  render();

  try {
    state.ceo.data = await api.getCeoBrief();
  } catch (error) {
    state.ceo.error = errorMessage(error, "Не удалось собрать CEO-контур.");
  } finally {
    state.ceo.loading = false;
    render();
  }
}

async function loadBusinessAssembly({ force = false } = {}) {
  if (state.assembly.loading || (state.assembly.data && !force)) {
    return;
  }

  state.assembly.loading = true;
  state.assembly.error = "";
  render();

  try {
    state.assembly.data = await api.getBusinessAssembly();
  } catch (error) {
    state.assembly.error = errorMessage(error, "Не удалось собрать маршрут сборки бизнеса.");
  } finally {
    state.assembly.loading = false;
    render();
  }
}

async function createAssemblyDraft(layerKey, artifactId) {
  if (!layerKey || !artifactId) {
    return;
  }

  state.assembly.creatingArtifactId = artifactId;
  state.assembly.error = "";
  state.assembly.message = "";
  render();

  try {
    const result = await api.createBusinessAssemblyDraft({ layerKey, artifactId });
    state.assembly.data = {
      assembly: result.assembly
    };
    state.documents.data = null;
    state.ceo.data = null;
    state.assembly.message = "Черновик создан и сохранён в документах кейса.";
  } catch (error) {
    state.assembly.error = errorMessage(error, "Не удалось создать черновик документа.");
  } finally {
    state.assembly.creatingArtifactId = "";
    render();
  }
}

async function updateNextStep(id, action) {
  if (!id || !action) {
    return;
  }

  state.nextStep.actionSaving = action;
  state.nextStep.error = "";
  render();

  try {
    const result = await api.updateNextStep({
      id,
      action
    });
    state.nextStep.data = {
      ...(state.nextStep.data || {}),
      nextStep: {
        ...(state.nextStep.data?.nextStep || {}),
        ...(result.nextStep || {})
      }
    };
    state.ceo.data = null;
  } catch (error) {
    state.nextStep.error = errorMessage(error, "Не удалось обновить следующий шаг.");
  } finally {
    state.nextStep.actionSaving = "";
    render();
  }
}

async function loadTools({ force = false } = {}) {
  if (state.tools.loading || (state.tools.catalog && !force)) {
    return;
  }

  state.tools.loading = true;
  state.tools.error = "";
  render();

  try {
    state.tools.catalog = await api.getTools();
  } catch (error) {
    state.tools.error = errorMessage(error, "Не удалось загрузить инструменты.");
  } finally {
    state.tools.loading = false;
    render();
  }
}

function updateToolSearch(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  state.tools.query = String(formData.get("toolSearch") || "").trim();
  render();
}

function clearToolSearch() {
  state.tools.query = "";
  render();
}

async function recalculateTools() {
  state.tools.recommendedLoading = true;
  state.tools.error = "";
  render();

  try {
    state.tools.recommended = await api.recalculateRecommendedTools();
    state.tools.catalog = null;
    await loadTools({ force: true });
    state.ceo.data = null;
  } catch (error) {
    state.tools.error = errorMessage(error, "Не удалось пересчитать инструменты.");
  } finally {
    state.tools.recommendedLoading = false;
    render();
  }
}

async function markToolOpened(toolId) {
  if (!toolId) {
    return;
  }

  state.tools.openingToolId = toolId;
  state.tools.error = "";
  render();

  try {
    await api.markToolOpened(toolId);
    state.tools.catalog = null;
    state.tools.recommended = null;
    await loadTools({ force: true });
    state.ceo.data = null;
  } catch (error) {
    state.tools.error = errorMessage(error, "Не удалось отметить инструмент.");
  } finally {
    state.tools.openingToolId = "";
    render();
  }
}

async function loadDocuments({ force = false } = {}) {
  if (state.documents.loading || (state.documents.data && !force)) {
    return;
  }

  state.documents.loading = true;
  state.documents.error = "";
  render();

  try {
    state.documents.data = await api.getDocuments();
  } catch (error) {
    state.documents.error = errorMessage(error, "Не удалось загрузить документы.");
  } finally {
    state.documents.loading = false;
    render();
  }
}

async function saveDocument(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());
  const analysisText = payload.analysisText || "";

  state.documents.saving = true;
  state.documents.error = "";
  state.documents.message = "";
  render();

  try {
    const result = await api.saveDocument(payload);
    if (analysisText.trim()) {
      const analyzed = await api.analyzeDocument(result.document.id, { text: analysisText });
      state.documents.message = analyzed.userMessage || "Документ сохранён и проанализирован.";
    } else {
      state.documents.message = "Ссылка сохранена. Для анализа закрытого документа вставь текст или ключевые выводы.";
    }
    form.reset();
    state.documents.data = null;
    state.ceo.data = null;
    state.assembly.data = null;
    await loadDocuments({ force: true });
  } catch (error) {
    state.documents.error = errorMessage(error, "Не удалось сохранить документ.");
  } finally {
    state.documents.saving = false;
    render();
  }
}

async function analyzeDocument(documentId) {
  if (!documentId) {
    return;
  }

  const textarea = Array.from(appRoot.querySelectorAll("[data-document-text]"))
    .find((item) => item.dataset.documentText === documentId);
  const text = textarea?.value || "";

  state.documents.analyzingId = documentId;
  state.documents.error = "";
  state.documents.message = "";
  render();

  try {
    const result = await api.analyzeDocument(documentId, { text });
    state.documents.message = result.userMessage || "Анализ завершён.";
    state.documents.data = null;
    state.ceo.data = null;
    state.assembly.data = null;
    await loadDocuments({ force: true });
  } catch (error) {
    state.documents.error = errorMessage(error, "Не удалось проанализировать документ.");
  } finally {
    state.documents.analyzingId = "";
    render();
  }
}

async function loadConsultationBrief({ force = false } = {}) {
  if (state.consultation.loading || (state.consultation.data && !force)) {
    return;
  }

  state.consultation.loading = true;
  state.consultation.error = "";
  render();

  try {
    state.consultation.data = await api.getConsultationBrief();
  } catch (error) {
    state.consultation.error = errorMessage(error, "Не удалось загрузить резюме консультации.");
  } finally {
    state.consultation.loading = false;
    render();
  }
}

async function generateConsultationBrief() {
  state.consultation.generating = true;
  state.consultation.error = "";
  state.consultation.message = "";
  render();

  try {
    state.consultation.data = await api.generateConsultationBrief();
    state.consultation.message = "Резюме сформировано из текущего кейса.";
    state.ceo.data = null;
  } catch (error) {
    state.consultation.error = errorMessage(error, "Не удалось сформировать резюме.");
  } finally {
    state.consultation.generating = false;
    render();
  }
}

function buildConsultationBriefText(brief) {
  if (!brief) {
    return "";
  }

  const maturity = brief.maturity_summary || {};
  const weakLayers = (maturity.weak_layers || [])
    .map((item) => `${item.title || item.layerKey}: ${item.score}/5`)
    .join("; ");
  const evidence = (brief.evidence || [])
    .map((item) => `- ${item.text || item}`)
    .join("\n");
  const questions = (brief.open_questions || [])
    .map((item) => `- ${item}`)
    .join("\n");

  return [
    brief.title,
    "",
    "Кратко:",
    brief.summary,
    "",
    "Текущий запрос:",
    brief.current_request,
    "",
    "Матрица зрелости:",
    `Средняя оценка: ${maturity.avg_score || 0}/5. Заполнено областей: ${maturity.completed_layers || 0}.`,
    weakLayers ? `Слабые зоны: ${weakLayers}` : "",
    "",
    "Гипотеза ограничения:",
    brief.constraint_summary,
    "",
    "Следующий шаг:",
    brief.next_step_summary,
    "",
    "Факты и сигналы:",
    evidence || "Пока недостаточно фактов.",
    "",
    "Открытые вопросы:",
    questions || "Пока не сформированы."
  ].filter((line) => line !== "").join("\n");
}

async function copyConsultationBrief() {
  const text = buildConsultationBriefText(state.consultation.data?.brief);
  if (!text) {
    return;
  }

  state.consultation.error = "";
  state.consultation.message = "";

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "readonly");
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
    state.consultation.message = "Резюме скопировано.";
  } catch {
    state.consultation.message = "Не получилось скопировать автоматически. Выдели текст резюме вручную.";
  } finally {
    render();
  }
}

async function requestConsultation() {
  state.consultation.requestSaving = true;
  state.consultation.error = "";
  state.consultation.message = "";
  render();

  try {
    const result = await api.requestConsultation();
    state.consultation.data = {
      ...(state.consultation.data || {}),
      brief: result.brief || state.consultation.data?.brief,
      bookingUrlConfigured: Boolean(result.bookingUrl)
    };
    state.consultation.message = result.userMessage || "Резюме подготовлено.";

    if (result.bookingUrl) {
      if (window.Telegram?.WebApp?.openLink) {
        window.Telegram.WebApp.openLink(result.bookingUrl);
      } else {
        window.open(result.bookingUrl, "_blank", "noopener,noreferrer");
      }
    }
  } catch (error) {
    state.consultation.error = errorMessage(error, "Не удалось подготовить запись.");
  } finally {
    state.consultation.requestSaving = false;
    render();
  }
}

render();
loadBootstrap();
