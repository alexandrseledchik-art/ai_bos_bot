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
    error: ""
  },
  nextStep: {
    data: null,
    loading: false,
    actionSaving: "",
    error: ""
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
    accepted: "в работе",
    done: "готово",
    skipped: "пропущено",
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
        <span class="pill ${profileIsReady ? "" : "neutral"}">${profileIsReady ? "профиль заполнен" : "профиль пока не заполнен"}</span>
      </div>
    </section>
  `;
}

function renderDashboard() {
  const bootstrapExpressProgress = state.bootstrap?.dashboardSummary?.expressProgress?.percent ??
    state.bootstrap?.dashboardSummary?.diagnosticProgress?.express ??
    0;
  const expressProgress = state.express.data?.progress?.percent ?? bootstrapExpressProgress;
  const companyName = state.bootstrap?.company?.name || "Компания";
  const onboarding = state.bootstrap?.onboardingStatus ||
    state.bootstrap?.dashboardSummary?.onboardingStatus ||
    "draft";
  const profileActionLabel = onboarding === "completed" ? "Обновить профиль" : "Заполнить профиль";

  return `
    <section class="hero">
      <p>AI-BOSS</p>
      <h2>Кабинет управленческого кейса</h2>
      <p>${escapeHtml(companyName)}: здесь чат превращается в рабочий кейс. Мы фиксируем контекст, собираем сигналы, проверяем зрелость и выводим одну рабочую гипотезу ограничения.</p>
      <div class="actions">
        <button class="primary-button" data-navigate="/mini-app/onboarding">${profileActionLabel}</button>
        <button class="secondary-button" data-navigate="/mini-app/diagnostics/express">Пройти диагностику</button>
        <button class="secondary-button" data-navigate="/mini-app/maturity">Открыть матрицу</button>
        <button class="secondary-button" data-navigate="/mini-app/constraint">Найти ограничение</button>
        <button class="secondary-button" data-navigate="/mini-app/tools">Все инструменты</button>
        <button class="secondary-button" data-navigate="/mini-app/consultation">Разбор с Александром</button>
      </div>
    </section>

    <div class="grid two">
      ${renderBootstrapCard()}
      <section class="card">
        <h3>Экспресс-диагностика</h3>
        <p>Это не анкета ради оценки. Экспресс нужен, чтобы быстро увидеть, где бизнес теряет результат, и не перепутать слабую область с главным ограничением.</p>
        <div class="progress">
          <div class="progress-bar"><span style="width: ${Number(expressProgress)}%"></span></div>
          <strong>${Math.round(Number(expressProgress))}%</strong>
        </div>
        <div class="actions">
          <button class="secondary-button compact-button" data-navigate="/mini-app/next-step">Следующий шаг</button>
        </div>
      </section>
    </div>

    ${renderRecommendedToolsPanel()}

    <section class="card">
      <h3>Экраны</h3>
      <ul class="screen-list">
        ${ROUTES.filter((route) => route.path !== "/mini-app").map(routeLink).join("")}
        ${routeLink({ path: "/mini-app/tools/sample-tool", title: "Карточка инструмента" })}
      </ul>
    </section>
  `;
}

function renderRecommendedToolsPanel() {
  const block = state.tools;

  if (block.recommendedLoading) {
    return `
      <section class="card next-card">
        <h3>Рекомендованные инструменты</h3>
        <p>Подбираю 3 инструмента под текущий кейс...</p>
      </section>
    `;
  }

  const recommendations = block.recommended?.recommendations || [];
  if (!recommendations.length) {
    return `
      <section class="card next-card">
        <h3>Рекомендованные инструменты</h3>
        <p>После первых ответов и гипотезы ограничения здесь появятся 3 инструмента из каталога.</p>
      </section>
    `;
  }

  return `
    <section class="card next-card">
      <h3>Рекомендованные инструменты</h3>
      <div class="tool-grid">
        ${recommendations.slice(0, 3).map((item) => renderToolTeaser(item.tool, item)).join("")}
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

  return `
    <section class="hero compact">
      <p>Экспресс-диагностика</p>
      <h2>Соберём быстрый срез бизнеса</h2>
      <p>Выбирай описание, которое ближе всего к текущей реальности. Это не экзамен: ответы нужны, чтобы отличить симптом от причины и понять, куда копать первым.</p>
      <div class="progress hero-progress">
        <div class="progress-bar"><span style="width: ${Number(progress.percent)}%"></span></div>
        <strong>${Math.round(Number(progress.percent))}%</strong>
      </div>
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
        <button class="primary-button" data-navigate="/mini-app/maturity">Открыть матрицу</button>
      </div>
    </section>
  `;
}

function renderLayerCard(layer, answer, suggestion) {
  return `
    <section class="card layer-card" id="layer-${escapeAttribute(layer.key)}">
      <div class="layer-head">
        <div>
          <p class="eyebrow">Класс ${escapeHtml(layer.classKey)}</p>
          <h3>${escapeHtml(layer.title)}</h3>
        </div>
        <span class="score-badge ${answer?.score ? "filled" : ""}">
          ${answer?.score ? `${answer.score}/5` : "не оценено"}
        </span>
      </div>
      <p>${escapeHtml(layer.shortDescription)}</p>
      <p class="diagnostic-question">${escapeHtml(layer.diagnosticQuestion)}</p>
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
              <span>${escapeHtml(description)}</span>
            </button>
          `;
        }).join("")}
      </div>
    </section>
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
  const progress = maturity.progressPercent || 0;
  const averageScore = maturity.averageScore ?? "нет данных";

  return `
    <section class="hero compact">
      <p>Матрица зрелости</p>
      <h2>Срез зрелости по областям</h2>
      <p>Матрица показывает, какие области уже оценены и где может быть слабое место. Это не итог диагностики: главное ограничение проверяем отдельно по запросу, сигналам и связям между областями.</p>
      <div class="status-row">
        <span class="pill">заполнено: ${Math.round(Number(progress))}%</span>
        <span class="pill neutral">средняя оценка: ${escapeHtml(averageScore)}</span>
      </div>
    </section>

    <section class="card maturity-card">
      <h3>Ключевые области бизнеса</h3>
      <div class="maturity-grid">
        ${(maturity.scores || []).map(renderMaturityRow).join("")}
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
  const confidence = Math.round(Number(hypothesis.confidence || 0) * 100);
  const isLowConfidence = Number(hypothesis.confidence || 0) < 0.55;
  const statusText = hypothesis.status === "confirmed"
    ? "подтверждено пользователем"
    : hypothesis.status === "rejected"
      ? "отклонено"
      : "гипотеза";

  return `
    <section class="hero compact">
      <p>Гипотеза ограничения</p>
      <h2>${escapeHtml(hypothesis.layerTitle || hypothesis.title)}</h2>
      <p>Это не финальный диагноз. Система выбирает самый причинный кандидат по зрелости, запросу и наблюдениям, а затем предлагает, что проверить дальше.</p>
      <div class="status-row">
        <span class="pill">статус: ${escapeHtml(statusText)}</span>
        <span class="pill neutral">уверенность: ${confidence}%</span>
        <span class="pill neutral">класс ${escapeHtml(hypothesis.classKey || "")}</span>
      </div>
    </section>

    <section class="card insight-card">
      <p class="eyebrow">Рабочая версия</p>
      <h3>${escapeHtml(hypothesis.title)}</h3>
      <p>${escapeHtml(hypothesis.explanation)}</p>
      ${isLowConfidence ? `<p class="hint-text">Данных пока мало, поэтому это слабая гипотеза. Её нужно проверить, а не принимать как диагноз.</p>` : ""}
      <div class="status-row">
        <span class="pill">${escapeHtml(hypothesis.constraint_type || hypothesis.constraintType || "тип ограничения")}</span>
        <span class="pill neutral">${escapeHtml(hypothesis.confidenceLabel || "рабочая уверенность")}</span>
      </div>
      <div class="actions">
        <button
          class="primary-button"
          type="button"
          data-constraint-action="confirm"
          data-constraint-id="${escapeAttribute(hypothesis.id)}"
          ${block.actionSaving ? "disabled" : ""}
        >
          Подтвердить гипотезу
        </button>
        <button
          class="secondary-button"
          type="button"
          data-constraint-action="reject"
          data-constraint-id="${escapeAttribute(hypothesis.id)}"
          ${block.actionSaving ? "disabled" : ""}
        >
          Отклонить
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
          ${block.actionSaving ? "disabled" : ""}
        >
          Беру в работу
        </button>
        <button
          class="secondary-button"
          type="button"
          data-next-step-action="done"
          data-next-step-id="${escapeAttribute(nextStep.id)}"
          ${block.actionSaving ? "disabled" : ""}
        >
          Уже сделал
        </button>
        <button class="secondary-button" type="button" data-navigate="/mini-app/constraint">К гипотезе</button>
      </div>
    </section>
  `;
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
  const recommendations = block.recommended?.recommendations || [];
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
        <button class="primary-button" data-tools-recalculate ${block.recommendedLoading ? "disabled" : ""}>Пересчитать рекомендации</button>
        <button class="secondary-button" data-navigate="/mini-app/documents">Документы</button>
      </div>
    </section>

    <section class="card next-card">
      <h3>Рекомендованные для кейса</h3>
      ${recommendations.length ? `
        <div class="tool-grid">
          ${recommendations.map((item) => renderToolTeaser(item.tool, item)).join("")}
        </div>
      ` : `<p>Рекомендации появятся после расчёта по запросу, ограничению и следующему шагу.</p>`}
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

  return `
    <section class="hero compact">
      <p>Документы</p>
      <h2>Ссылки и снимки документов</h2>
      <p>Сейчас мы сохраняем ссылку и короткий структурированный снимок. Автоматический доступ к Google-документам и постоянная синхронизация будут позже.</p>
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
      <h3>Сохранённые документы</h3>
      ${documents.length ? `<div class="document-list">${documents.map(renderDocumentCard).join("")}</div>` : `<p>Пока документов нет.</p>`}
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
      <h2>Разбор с Александром Селедчиком</h2>
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
          <span class="pill neutral">кнопка AI-BOSS видна</span>
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
    <button class="floating-ai" type="button" data-ai aria-label="Спросить AI-BOSS">
      <span class="floating-ai-full">Спросить AI-BOSS</span>
      <span class="floating-ai-short">AI-BOSS</span>
    </button>
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

  appRoot.querySelectorAll("[data-next-step-action]").forEach((button) => {
    button.addEventListener("click", () => updateNextStep(button.dataset.nextStepId, button.dataset.nextStepAction));
  });

  appRoot.querySelector("[data-tools-recalculate]")?.addEventListener("click", recalculateTools);
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

  appRoot.querySelector("[data-ai]")?.addEventListener("click", openAiBossChat);
}

function openAiBossChat() {
  const webApp = window.Telegram?.WebApp;
  if (webApp?.close) {
    webApp.close();
    return;
  }

  window.alert("Открой этот кабинет внутри Telegram и нажми «Спросить AI-BOSS» — я верну тебя в чат, где можно задать вопрос по текущему экрану.");
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
    await loadRecommendedTools({ force });
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

  if (path === "/mini-app/tools" || path.startsWith("/mini-app/tools/")) {
    await loadTools({ force });
    await loadRecommendedTools({ force });
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

async function saveExpressAnswer(layerKey, score) {
  const layer = state.express.data?.layers?.find((item) => item.key === layerKey);
  if (!layer) {
    return;
  }

  state.express.savingLayerKey = layerKey;
  state.express.error = "";
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
        [result.answer.subject_key]: {
          id: result.answer.id,
          layerKey: result.answer.subject_key,
          score: result.answer.score,
          selectedDescription: result.answer.selected_description,
          source: result.answer.source,
          status: result.answer.status,
          confidence: result.answer.confidence
        }
      }
    };
    state.maturity.data = null;
  } catch (error) {
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
  state.express.savingLayerKey = layerKey;
  state.express.error = "";
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
      nextAnswers[result.answer.subject_key] = {
        id: result.answer.id,
        layerKey: result.answer.subject_key,
        score: result.answer.score,
        selectedDescription: result.answer.selected_description,
        source: result.answer.source,
        status: result.answer.status,
        confidence: result.answer.confidence
      };
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
  } catch (error) {
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
  render();

  try {
    state.constraint.data = await api.reasonConstraint();
    state.nextStep.data = null;
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
  } catch (error) {
    state.constraint.error = errorMessage(error, "Не удалось обновить гипотезу.");
  } finally {
    state.constraint.actionSaving = "";
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

async function loadRecommendedTools({ force = false } = {}) {
  if (state.tools.recommendedLoading || (state.tools.recommended && !force)) {
    return;
  }

  state.tools.recommendedLoading = true;
  render();

  try {
    state.tools.recommended = await api.getRecommendedTools();
  } catch {
    state.tools.recommended = { recommendations: [] };
  } finally {
    state.tools.recommendedLoading = false;
    render();
  }
}

async function recalculateTools() {
  state.tools.recommendedLoading = true;
  state.tools.error = "";
  render();

  try {
    state.tools.recommended = await api.recalculateRecommendedTools();
    state.tools.catalog = null;
    await loadTools({ force: true });
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
    await loadRecommendedTools({ force: true });
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
