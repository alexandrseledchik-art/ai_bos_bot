const INVITE_SUPPRESSION_WINDOW_MS = 10 * 60 * 1000;
const CHAT_FIRST_MODE = true;

export const MINI_APP_CABINET_SCREENS = {
  dashboard: {
    screenId: "dashboard",
    route: "/mini-app",
    label: "Открыть Кабинет AI-BOSS",
    title: "Кабинет AI-BOSS",
    purpose: "Показать рабочее пространство кейса: профиль, диагностику, гипотезу, следующий шаг и инструменты."
  },
  onboarding: {
    screenId: "onboarding",
    route: "/mini-app/onboarding",
    label: "Заполнить профиль",
    title: "Входной профиль",
    purpose: "Зафиксировать минимальный контекст компании, чтобы ответы не трактовались в вакууме."
  },
  diagnostics: {
    screenId: "diagnostics",
    route: "/mini-app/diagnostics/express",
    label: "Пройти диагностику",
    title: "Экспресс-диагностика",
    purpose: "Быстро собрать срез по ключевым областям бизнеса и отделить слабую область от главного ограничения."
  },
  constraint: {
    screenId: "constraint",
    route: "/mini-app/constraint",
    label: "Посмотреть гипотезу",
    title: "Гипотеза ограничения",
    purpose: "Показать рабочую версию главного ограничения, доказательства, альтернативы и что проверить дальше."
  },
  nextStep: {
    screenId: "nextStep",
    route: "/mini-app/next-step",
    label: "Открыть следующий шаг",
    title: "Следующий шаг",
    purpose: "Зафиксировать ближайшее действие, которое проверяет гипотезу или начинает снимать ограничение."
  },
  ceo: {
    screenId: "ceo",
    route: "/mini-app/ceo",
    label: "Открыть CEO-контур",
    title: "CEO-контур",
    purpose: "Показать управленческую повестку кейса: решения собственника, действия AI-BOSS и открытые петли контроля."
  },
  assembly: {
    screenId: "assembly",
    route: "/mini-app/assembly",
    label: "Открыть сборку бизнеса",
    title: "Сборка бизнеса",
    purpose: "Последовательно собрать бизнес по 11 слоям через документы, факты, инструменты и решения."
  },
  tools: {
    screenId: "tools",
    route: "/mini-app/tools",
    label: "Открыть инструменты",
    title: "Инструменты",
    purpose: "Подобрать рабочие инструменты под текущий кейс, не подменяя ими диагностику."
  },
  documents: {
    screenId: "documents",
    route: "/mini-app/documents",
    label: "Добавить документ",
    title: "Документы",
    purpose: "Сохранить ссылку или материал, который поможет проверить факты и не потерять контекст."
  },
  consultation: {
    screenId: "consultation",
    route: "/mini-app/consultation",
    label: "Подготовить разбор",
    title: "Разбор с экспертом",
    purpose: "Собрать краткое резюме кейса, чтобы консультация началась не с нуля."
  }
};

function isFreshDuplicateInvite(entryState, candidate, now = new Date()) {
  const lastInvite = entryState?.lastMiniAppInvite;
  if (!lastInvite || lastInvite.route !== candidate.route || !lastInvite.offeredAt) {
    return false;
  }

  const offeredAt = Date.parse(lastInvite.offeredAt);
  const currentTime = now instanceof Date ? now.getTime() : Date.parse(now);
  if (!Number.isFinite(offeredAt) || !Number.isFinite(currentTime)) {
    return false;
  }

  return currentTime - offeredAt >= 0 && currentTime - offeredAt < INVITE_SUPPRESSION_WINDOW_MS;
}

function hasDocumentUrl(urls = []) {
  return urls.some((url) =>
    /docs\.google|drive\.google|notion\.|airtable\.|dropbox\.|miro\.|figma\.|\.pdf\b|\.docx?\b|\.xlsx?\b|\.csv\b/i.test(
      String(url || "")
    )
  );
}

function pickScreen(screenId, stage, reason) {
  const screen = MINI_APP_CABINET_SCREENS[screenId];
  if (!screen) {
    return null;
  }

  return {
    screenId: screen.screenId,
    route: screen.route,
    label: screen.label,
    title: screen.title,
    stage,
    reason,
    purpose: screen.purpose
  };
}

function isCeoLayerQuestion(classification = {}) {
  const text = String(classification.cleanText || "").toLowerCase();
  return /александр|селедчик|консалтинг|ceo|co-ceo|управляющ|контур|11\s+сло|слоям|слоях|упаковк|наш\s+проект|этот\s+проект/.test(text);
}

function isCabinetOrientationRequest(classification = {}) {
  const text = String(classification.cleanText || "").toLowerCase();
  return /кабинет|mini\s?app|мини-?апп|приложени|как\s+пользоваться|как\s+работать\s+с\s+кабинет|открой|покажи/.test(text);
}

function isBusinessAssemblyRequest(classification = {}) {
  const text = String(classification.cleanText || "").toLowerCase();
  return /собрать\s+бизнес|сборк[а-яё\s]+бизнес|собира[а-яё\s]+систем|по\s+11\s+сло|слой\s+за\s+сло|инструмент[а-яё\s]+по\s+сло|документ[а-яё\s]+по\s+сло/.test(text);
}

function selectInviteCandidate({
  classification = {},
  decision = {},
  runtime = {},
  activeCase = null,
  persistedMemory = null
} = {}) {
  const entryMode = classification.entryMode || "unclear";
  const signalSufficiency = decision.decision?.signalSufficiency || "";
  const hasConstraint = Boolean(persistedMemory?.constraint || decision.entryState?.selectedConstraint);
  const hasActionStep = Boolean(
    persistedMemory?.actionWave?.enabled &&
    persistedMemory?.actionWave?.firstStep
  );
  const hasToolRecommendation = Boolean(
    classification.hasToolDiscoveryIntent ||
    classification.hasSpecificToolIntent ||
    persistedMemory?.toolRecommendations?.length
  );
  const hasDiagnosticCase = runtime.activeCaseKind === "diagnostic_case" || activeCase?.kind === "diagnostic_case";

  if (entryMode === "meta_role") {
    if (isBusinessAssemblyRequest(classification)) {
      return pickScreen(
        "assembly",
        "business_assembly",
        "Пользователь хочет собрать бизнес как систему по слоям, инструментам и документам; лучше открыть маршрут сборки бизнеса."
      );
    }

    if (isCeoLayerQuestion(classification)) {
      return pickScreen(
        "ceo",
        "ceo_orientation",
        "Пользователь спрашивает о роли AI-BOSS как управляющего контура; лучше открыть экран с повесткой, решениями и действиями."
      );
    }

    if (isCabinetOrientationRequest(classification)) {
      return pickScreen(
        "dashboard",
        "orientation",
        "Пользователь спрашивает, как работать с кабинетом; лучше показать рабочее пространство."
      );
    }

    return null;
  }

  if (hasDocumentUrl(classification.urls || [])) {
    return pickScreen(
      "documents",
      "document",
      "Пользователь прислал документ или рабочую ссылку; её полезнее сохранить в кейсе."
    );
  }

  if (hasToolRecommendation) {
    return pickScreen(
      "tools",
      "tool_request",
      "Пользователь просит инструмент или система уже видит инструментальный следующий шаг."
    );
  }

  if (hasActionStep) {
    return pickScreen(
      "nextStep",
      "next_step",
      "Уже появился ближайший проверочный шаг; его лучше зафиксировать в Кабинете."
    );
  }

  if (hasConstraint || signalSufficiency === "enough") {
    return pickScreen(
      "constraint",
      "constraint_hypothesis",
      "Сигналов достаточно для рабочей версии ограничения; Кабинет покажет её вместе с альтернативами и проверкой."
    );
  }

  if (hasDiagnosticCase || runtime.promotionApplied || entryMode === "problem_first") {
    return pickScreen(
      "diagnostics",
      "diagnostics",
      "Появился бизнес-запрос; экспресс-срез поможет не спутать симптом с главным ограничением."
    );
  }

  if (entryMode === "unclear" && decision.decision?.action === "clarify") {
    return pickScreen(
      "onboarding",
      "profile",
      "Контекста пока мало; входной профиль поможет точнее читать следующие ответы."
    );
  }

  if (classification.urls?.length) {
    return pickScreen(
      "dashboard",
      "screening",
      "Пользователь прислал ссылку; Кабинет пригодится как место, где сохраняется текущий кейс."
    );
  }

  return null;
}

export function buildMiniAppInvite(context = {}) {
  if (CHAT_FIRST_MODE && !context.forceMiniAppInvite) {
    return null;
  }

  const candidate = selectInviteCandidate(context);
  if (!candidate) {
    return null;
  }

  if (isFreshDuplicateInvite(context.entryState, candidate, context.now)) {
    return null;
  }

  return candidate;
}

export function createMiniAppInviteSnapshot(invite, offeredAt) {
  if (!invite) {
    return null;
  }

  return {
    screenId: invite.screenId,
    route: invite.route,
    stage: invite.stage,
    offeredAt
  };
}
