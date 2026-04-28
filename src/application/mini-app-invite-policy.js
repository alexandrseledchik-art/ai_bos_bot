const INVITE_SUPPRESSION_WINDOW_MS = 10 * 60 * 1000;

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
    return pickScreen(
      "dashboard",
      "orientation",
      "Пользователь спрашивает, как с системой работать; лучше показать рабочее пространство, а не только объяснять текстом."
    );
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
