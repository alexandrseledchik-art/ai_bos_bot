import {
  createActionWave,
  createArtifact,
  createCase,
  createCompany,
  createConstraint,
  createEntryState,
  createGoal,
  createHypothesis,
  createMessage,
  createObservation,
  createSituation,
  createSnapshot,
  createSymptom,
  createTelegramContext,
  createThread,
  createToolRecommendation,
  emptyEntryState,
  nowIso
} from "../domain/entities.js";
import { AIBossModeOrchestrator } from "./ai-boss-mode-orchestrator.js";
import { classifyInput } from "./classify-input.js";
import { checkIntentIntegrity } from "./intent-integrity-checker.js";
import { extractObservations } from "./observation-extractor.js";
import { analyzeWithGraph } from "./graph-reasoner.js";
import { applyGuardrails } from "./guardrails.js";
import { buildMiniAppInvite, createMiniAppInviteSnapshot } from "./mini-app-invite-policy.js";
import { AutonomousDataCollector } from "./autonomous-data-collector.js";
import { assessChatDiagnosticExcellence } from "./chat-diagnostic-excellence-assessor.js";
import { ConsultantTelegramMode } from "./consultant-telegram-mode.js";
import { DataSufficiencyChecker } from "./data-sufficiency-checker.js";
import { DiagnosticSkillPilot } from "./diagnostic-skill-pilot.js";
import { ReferenceModelService } from "./reference-model-service.js";
import { SkillOrchestrator } from "./skill-orchestrator.js";
import { SkillRunManager } from "./skill-run-manager.js";
import { TelegramDecisionCycleManager } from "./telegram-decision-cycle-manager.js";
import { buildAudienceProfile } from "../domain/audience-segmentation.js";

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function uniqueStrings(items, maxItems = 10) {
  return [...new Set((items || []).map((item) => String(item || "").trim()).filter(Boolean))].slice(0, maxItems);
}

function uniqueObjectsBy(items, keyFn, maxItems = 5) {
  const result = [];
  const seen = new Set();

  for (const item of items || []) {
    const key = keyFn(item);
    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(item);

    if (result.length >= maxItems) {
      break;
    }
  }

  return result;
}

function mergeCandidateConstraints(existing = [], incoming = []) {
  const result = [];
  const seen = new Set();

  for (const item of [...existing, ...incoming]) {
    const label = String(item?.label || "").trim();
    if (!label) {
      continue;
    }
    const key = label.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push({
      label,
      layer: String(item?.layer || "management").trim().toLowerCase(),
      confidence: Number(item?.confidence ?? 0.5),
      whyPossible: String(item?.whyPossible || "").trim(),
      whatWouldDisprove: String(item?.whatWouldDisprove || "").trim()
    });
  }

  return result.slice(0, 5);
}

function mergeRankedGraphItems(existing = [], incoming = [], maxItems = 5) {
  const merged = new Map();

  for (const item of [...existing, ...incoming]) {
    const id = String(item?.id || "").trim();
    if (!id) {
      continue;
    }

    const current = merged.get(id);
    const score = Number(item?.score ?? 0);
    if (!current || score >= Number(current.score ?? 0)) {
      merged.set(id, {
        id,
        label: String(item?.label || "").trim(),
        layer: String(item?.layer || "management").trim().toLowerCase(),
        domains: uniqueStrings(item?.domains || [], 6),
        score,
        supportedBy: uniqueStrings(item?.supportedBy || [], 6),
        whyUseful: String(item?.whyUseful || "").trim()
      });
    }
  }

  return [...merged.values()]
    .sort((left, right) => Number(right.score || 0) - Number(left.score || 0))
    .slice(0, maxItems);
}

function mergeDiscriminatingSignals(existing = [], incoming = [], maxItems = 4) {
  return uniqueObjectsBy(
    [...existing, ...incoming].map((item) => ({
      signal: String(item?.signal || "").trim(),
      question: String(item?.question || "").trim(),
      separates: uniqueStrings(item?.separates || [], 4),
      whyUseful: String(item?.whyUseful || "").trim(),
      informationGain: Number(item?.informationGain ?? 0)
    })),
    (item) => item.question,
    maxItems
  );
}

function mergeGraphTrace(existing = [], incoming = [], maxItems = 8) {
  return uniqueObjectsBy(
    [...existing, ...incoming].map((item) => ({
      fromSignal: String(item?.fromSignal || "").trim(),
      viaState: String(item?.viaState || "").trim(),
      toCause: String(item?.toCause || "").trim(),
      weight: Number(item?.weight ?? 0)
    })),
    (item) => `${item.fromSignal}:${item.viaState}:${item.toCause}`,
    maxItems
  );
}

function emptyCaseMemory() {
  return {
    goal: "",
    symptoms: [],
    hypotheses: [],
    constraint: "",
    lastWave: null
  };
}

function ensureThread(state, telegramChatId) {
  let thread = state.threads.find((item) => item.telegramChatId === String(telegramChatId));
  if (thread) {
    if (!thread.entryState || typeof thread.entryState !== "object") {
      thread.entryState = emptyEntryState();
    }
    return thread;
  }

  const company = createCompany({
    name: `Company ${telegramChatId}`,
    telegramChatId
  });
  state.companies.push(company);

  thread = createThread({
    telegramChatId,
    companyId: company.id
  });
  state.threads.push(thread);
  return thread;
}

function ensureCompany(state, thread, userMeta) {
  let company = state.companies.find((item) => item.id === thread.companyId);

  if (!company) {
    company = createCompany({
      name: userMeta.chatTitle || userMeta.username || `Company ${thread.telegramChatId}`,
      telegramChatId: thread.telegramChatId
    });
    state.companies.push(company);
    thread.companyId = company.id;
  }

  const candidateName = userMeta.chatTitle || userMeta.username || company.name;
  if (candidateName && company.name.startsWith("Company ")) {
    company.name = candidateName;
    company.updatedAt = nowIso();
  }

  return company;
}

function findTelegramContext(state, telegramChatId, telegramUserId = "") {
  const chatId = String(telegramChatId || "");
  const userId = String(telegramUserId || chatId);
  return (state.telegramContexts || []).find((item) =>
    String(item.telegramChatId || "") === chatId ||
    (userId && String(item.telegramUserId || "") === userId)
  ) || null;
}

function upsertTelegramContext(state, { telegramChatId, telegramUserId, activeCompanyId }) {
  state.telegramContexts = state.telegramContexts || [];
  let context = findTelegramContext(state, telegramChatId, telegramUserId);

  if (!context) {
    context = createTelegramContext({ telegramChatId, telegramUserId, activeCompanyId });
    state.telegramContexts.push(context);
    return context;
  }

  context.activeCompanyId = activeCompanyId || context.activeCompanyId || "";
  context.lastMessageAt = nowIso();
  return context;
}

function applyActiveCompanyContext(state, thread, telegramChatId, userMeta = {}) {
  const activeCompanyId = String(userMeta.activeCompanyId || userMeta.companyId || "").trim();
  if (!activeCompanyId) {
    return null;
  }

  const company = (state.companies || []).find((item) => item.id === activeCompanyId);
  if (!company) {
    return null;
  }

  const telegramUserId = userMeta.telegramUserId || userMeta.id || telegramChatId;
  upsertTelegramContext(state, {
    telegramChatId,
    telegramUserId,
    activeCompanyId: company.id
  });
  const previousCompanyId = thread.companyId;
  thread.companyId = company.id;
  if (previousCompanyId !== company.id) {
    thread.activeCaseId = "";
  }
  thread.updatedAt = nowIso();
  return company;
}

function lastAssistantAskedQuestion(history = []) {
  const lastAssistant = [...history].reverse().find((item) => item.role === "assistant");
  return Boolean(lastAssistant?.text && /\?\s*$/.test(String(lastAssistant.text).trim()));
}

function looksDiagnosticMetaFollowUp(text) {
  return /что\s+такое\s+icp|как\s+(определить|понять|собрать|описать)\s+icp|что\s+ты\s+имеешь\s+в\s+виду|почему|зачем|что\s+дальше|а\s+дальше|и\s+дальше|не\s+уверен|сомневаюсь/i.test(
    String(text || "").trim().toLowerCase()
  );
}

function hasToolFirstContext(thread) {
  return thread?.entryState?.entryMode === "tool_discovery" ||
    thread?.entryState?.entryMode === "specific_tool_request" ||
    thread?.entryState?.lastSkillSelection?.primarySkill === "tool_selection" ||
    thread?.entryState?.activeSkillRun?.skillId === "tool_selection";
}

function hasToolFirstHistory(history = []) {
  const lastAssistant = [...history].reverse().find((item) => item.role === "assistant");
  return /конкретн(?:ый|ого)\s+инструмент|матриц[аы]\s+ответственност|\braci\b|\bbhag\b|\bбхаг\b/i.test(
    String(lastAssistant?.text || "")
  );
}

function looksToolFirstFollowUp(classification, history) {
  const cleanText = String(classification.cleanText || "").trim().toLowerCase();
  const wordCount = Number(classification.wordCount || 0);

  if (!cleanText || /^\/start$|^(привет|здравствуй|здравствуйте|добрый день|добрый вечер)$/i.test(cleanText)) {
    return false;
  }

  if (
    /инструмент|шаблон|таблиц|матриц|файл|заполн|разобрат|как\s+правильно|bhag|бхаг|больш[а-яё\s-]+амбициозн[а-яё\s-]+цел|дерзк[а-яё\s-]+цел|raci|рас[иi]|роль|роли|ответствен|финальн[а-яё]*\s+владел|одновременн[а-яё]*\s+.*указан|кто\s+.*чем|как\s+.*связан/i.test(
      cleanText
    )
  ) {
    return true;
  }

  return lastAssistantAskedQuestion(history) && wordCount <= 5;
}

function parseStartCommand(text) {
  const match = String(text || "").trim().match(/^\/start(?:@\w+)?(?:\s+([a-z0-9_-]{1,64}))?$/i);
  if (!match) {
    return null;
  }

  const payload = String(match[1] || "").trim().toLowerCase();
  let entryChannel = "telegram";
  if (/book|kniga|reader/.test(payload)) entryChannel = "book";
  else if (/qr|kuar/.test(payload)) entryChannel = "qr";
  else if (/site|web|landing/.test(payload)) entryChannel = "website";
  else if (/consult/.test(payload)) entryChannel = "consultation";
  else if (/refer|recommend/.test(payload)) entryChannel = "referral";

  return {
    payload,
    entryChannel,
    channelPath: [...new Set([
      ...(entryChannel === "book"
        ? ["book", ...(/qr|kuar/.test(payload) ? ["qr"] : []), "web_cabinet"]
        : [entryChannel]),
      "telegram"
    ])]
  };
}

function looksStartCommand(text) {
  return Boolean(parseStartCommand(text));
}

function applyStartAttribution({ thread, company, userMeta = {}, startCommand, timestamp = nowIso() }) {
  if (!startCommand) {
    return null;
  }

  const previous = thread.entryState?.entryAttribution || null;
  const entryChannel = previous?.entryChannel || startCommand.entryChannel;
  const channelPath = [...new Set([
    ...(previous?.channelPath || []),
    ...(startCommand.channelPath || [])
  ])];
  const attribution = {
    sourcePayload: previous?.sourcePayload || startCommand.payload || "telegram",
    latestSourcePayload: startCommand.payload || "telegram",
    entryChannel,
    channelPath,
    firstStartedAt: previous?.firstStartedAt || timestamp,
    lastStartedAt: timestamp,
    startCount: Number(previous?.startCount || 0) + 1
  };
  const audienceProfile = buildAudienceProfile({
    userText: "",
    userMeta: {
      ...userMeta,
      entryChannel
    },
    company,
    previousProfile: thread.entryState?.audienceProfile || null
  });

  thread.entryState = {
    ...(thread.entryState || emptyEntryState()),
    entryAttribution: attribution,
    audienceProfile,
    lastUpdatedAt: timestamp
  };

  return attribution;
}

function buildPlatformWelcomeMessage(userMeta = {}, { returning = false, entryChannel = "telegram" } = {}) {
  const name = String(userMeta.firstName || userMeta.first_name || "").trim();
  const greeting = returning
    ? (name ? `${name}, с возвращением в AI-BOSS.` : "С возвращением в AI-BOSS.")
    : (name ? `${name}, добро пожаловать в AI-BOSS.` : "Добро пожаловать в AI-BOSS.");
  const accessLine = ["book", "qr"].includes(entryChannel)
    ? "Доступ к инструментам AI-BOSS открыт."
    : "";
  const startLine = returning
    ? "Можно продолжить предыдущий разговор или начать с новой ситуации."
    : "Чтобы начать, опишите одну ситуацию, которая сейчас больше всего мешает бизнесу.";

  return [
    ...(accessLine ? [accessLine, ""] : []),
    greeting,
    "",
    "AI-BOSS — управленческий помощник для собственника. Он помогает собрать картину бизнеса, отделить симптом от причины, найти главное ограничение и понять, что делать первым.",
    "",
    "Здесь, в Telegram, можно описывать ситуации, отправлять цифры, файлы и ссылки и продолжать работу с AI-BOSS в живом диалоге.",
    "",
    "На платформе доступны рабочие инструменты и сохранённые результаты. Перейти туда можно по кнопке под этим сообщением. Позже она всегда будет доступна как «Платформа AI-BOSS» в меню бота.",
    "",
    startLine
  ].join("\n");
}

function contextualizeClassification(classification, thread, history) {
  if (
    classification.type === "small_talk" ||
    classification.entryMode === "meta_role" ||
    classification.entryMode === "tool_discovery" ||
    classification.entryMode === "specific_tool_request"
  ) {
    return classification;
  }

  if ((hasToolFirstContext(thread) || hasToolFirstHistory(history)) && looksToolFirstFollowUp(classification, history)) {
    return {
      ...classification,
      type: "free_text_vague",
      entryMode: thread.entryState.entryMode,
      inferredToolFollowUp: true
    };
  }

  if (classification.type !== "free_text_vague" && classification.type !== "unknown") {
    return classification;
  }

  const hasDiagnosticContext =
    Boolean(thread?.entryState?.claimedProblem) &&
    ((thread?.entryState?.symptoms || []).length > 0 || (thread?.entryState?.candidateConstraints || []).length > 0);

  if (!hasDiagnosticContext) {
    return classification;
  }

  const cleanText = String(classification.cleanText || "").trim().toLowerCase();
  const looksFreshGreeting = /^\/start$|^(привет|здравствуй|здравствуйте|добрый день|добрый вечер)$/i.test(cleanText);
  if (looksFreshGreeting) {
    return classification;
  }

  if (looksDiagnosticMetaFollowUp(cleanText)) {
    return {
      ...classification,
      type: "free_text_problem",
      inferredFollowUp: true
    };
  }

  if (!lastAssistantAskedQuestion(history)) {
    return classification;
  }

  return {
    ...classification,
    type: "free_text_problem",
    inferredFollowUp: true
  };
}

function findCase(state, caseId) {
  if (!caseId) {
    return null;
  }

  const item = state.cases.find((entry) => entry.id === caseId && entry.status === "active");
  return item || null;
}

function selectRelevantCase(state, thread, classification) {
  if (classification.type === "small_talk" || classification.entryMode === "meta_role") {
    return null;
  }

  const activeCase = findCase(state, thread.activeCaseId);
  if (!activeCase) {
    return null;
  }

  if (classification.type === "url_only" || classification.type === "url_plus_problem") {
    return activeCase.kind === "preliminary_screening" ? activeCase : null;
  }

  return activeCase.kind === "diagnostic_case" ? activeCase : null;
}

function ensureCase(state, thread, kind, mode, summary) {
  const current = findCase(state, thread.activeCaseId);
  if (current && current.kind === kind) {
    return current;
  }

  const activeCase = createCase({
    companyId: thread.companyId,
    kind,
    mode,
    summary
  });
  state.cases.push(activeCase);
  thread.activeCaseId = activeCase.id;
  thread.updatedAt = nowIso();
  return activeCase;
}

function summarizeCaseMemory(state, caseId) {
  if (!caseId) {
    return emptyCaseMemory();
  }

  const lastGoal = [...state.goals].reverse().find((item) => item.caseId === caseId)?.statement || "";
  const symptoms = state.symptoms
    .filter((item) => item.caseId === caseId)
    .slice(-6)
    .map((item) => item.statement);
  const hypotheses = state.hypotheses
    .filter((item) => item.caseId === caseId)
    .slice(-6)
    .map((item) => item.statement);
  const constraint = [...state.constraints].reverse().find((item) => item.caseId === caseId)?.statement || "";
  const lastWave = [...state.actionWaves].reverse().find((item) => item.caseId === caseId);

  return {
    goal: lastGoal,
    symptoms,
    hypotheses,
    constraint,
    lastWave: lastWave
      ? {
          firstStep: lastWave.firstStep,
          notNow: lastWave.notNow,
          whyThisFirst: lastWave.whyThisFirst
        }
      : null
  };
}

function recentHistory(state, threadId, maxHistoryMessages) {
  return state.messages
    .filter((item) => item.threadId === threadId)
    .slice(-maxHistoryMessages)
    .map((item) => ({
      role: item.role,
      text: item.text,
      createdAt: item.createdAt
    }));
}

function pushUniqueEntity(collection, createFn, predicate) {
  if (!predicate()) {
    collection.push(createFn());
  }
}

function persistExtractedObservations({ state, activeCase, userMessage, extracted }) {
  if (!activeCase || !userMessage || !Array.isArray(extracted?.observations)) {
    return;
  }

  for (const observation of extracted.observations) {
    const statement = String(observation.label || observation.evidence || "").trim();
    const normalizedSignal = String(observation.signalId || "").trim();
    if (!statement || !normalizedSignal) {
      continue;
    }

    pushUniqueEntity(
      state.observations,
      () =>
        createObservation({
          caseId: activeCase.id,
          sourceId: userMessage.id,
          statement,
          normalizedSignal,
          layer: observation.businessLayer || observation.layer || "",
          confidence: 0.7,
          evidence: [
            {
              text: observation.evidence || userMessage.text,
              signalId: normalizedSignal,
              domains: observation.domains || []
            }
          ]
        }),
      () =>
        (state.observations || []).some(
          (item) =>
            item.caseId === activeCase.id &&
            item.sourceId === userMessage.id &&
            item.normalizedSignal === normalizedSignal
        )
    );
  }
}

function mergeEntryState(currentState, incomingState, routeType) {
  const current = currentState && typeof currentState === "object" ? currentState : emptyEntryState();
  const incoming = incomingState && typeof incomingState === "object" ? incomingState : {};
  const currentCrossClassCheck = current.crossClassCheck || {
    currentClass: current.higherLayerCheck?.currentClass || "",
    hasCompetingExplanation: Boolean(current.higherLayerCheck?.betterExplainedAbove),
    competingClass: current.higherLayerCheck?.highestUnrejectedClass || "",
    whySelectedClass: current.higherLayerCheck?.whyNotHigher || ""
  };
  const incomingCrossClassCheck = incoming.crossClassCheck || {
    currentClass: incoming.higherLayerCheck?.currentClass || "",
    hasCompetingExplanation: Boolean(incoming.higherLayerCheck?.betterExplainedAbove),
    competingClass: incoming.higherLayerCheck?.highestUnrejectedClass || "",
    whySelectedClass: incoming.higherLayerCheck?.whyNotHigher || ""
  };

  return createEntryState({
    routeType: routeType || incoming.routeType || current.routeType,
    entryMode: incoming.entryMode || current.entryMode || "unclear",
    claimedProblem: incoming.claimedProblem || current.claimedProblem,
    claimedCause: incoming.claimedCause || current.claimedCause,
    knownFacts: uniqueStrings([...(current.knownFacts || []), ...(incoming.knownFacts || [])], 8),
    symptoms: uniqueStrings([...(current.symptoms || []), ...(incoming.symptoms || [])], 10),
    observedSignals: uniqueStrings([...(current.observedSignals || []), ...(incoming.observedSignals || [])], 12),
    systemLayers: uniqueStrings([...(current.systemLayers || []), ...(incoming.systemLayers || [])], 6),
    businessLayers: uniqueStrings([...(current.businessLayers || []), ...(incoming.businessLayers || [])], 11),
    layerClasses: uniqueStrings([...(current.layerClasses || []), ...(incoming.layerClasses || [])], 4),
    flowTypes: uniqueStrings([...(current.flowTypes || []), ...(incoming.flowTypes || [])], 6),
    primaryFlow: incoming.primaryFlow || current.primaryFlow,
    constraintType: incoming.constraintType || current.constraintType,
    crossClassCheck: {
      currentClass: incomingCrossClassCheck.currentClass || currentCrossClassCheck.currentClass || "",
      hasCompetingExplanation:
        typeof incomingCrossClassCheck.hasCompetingExplanation === "boolean"
          ? incomingCrossClassCheck.hasCompetingExplanation
          : Boolean(currentCrossClassCheck.hasCompetingExplanation),
      competingClass: incomingCrossClassCheck.competingClass || currentCrossClassCheck.competingClass || "",
      whySelectedClass: incomingCrossClassCheck.whySelectedClass || currentCrossClassCheck.whySelectedClass || ""
    },
    candidateConstraints: mergeCandidateConstraints(current.candidateConstraints, incoming.candidateConstraints),
    candidateStates: mergeRankedGraphItems(current.candidateStates, incoming.candidateStates, 5),
    candidateCauses: mergeRankedGraphItems(current.candidateCauses, incoming.candidateCauses, 5),
    selectedConstraint: incoming.selectedConstraint || current.selectedConstraint,
    graphTrace: mergeGraphTrace(current.graphTrace, incoming.graphTrace, 8),
    discriminatingSignals: mergeDiscriminatingSignals(current.discriminatingSignals, incoming.discriminatingSignals, 4),
    graphConfidence: Math.max(Number(current.graphConfidence || 0), Number(incoming.graphConfidence || 0)),
    hypothesisConflicts: uniqueStrings([...(current.hypothesisConflicts || []), ...(incoming.hypothesisConflicts || [])], 6),
    signalSufficiency: incoming.signalSufficiency || current.signalSufficiency,
    nextBestQuestion: incoming.nextBestQuestion || current.nextBestQuestion,
    nextBestStep: incoming.nextBestStep || current.nextBestStep,
    whyThisStep: incoming.whyThisStep || current.whyThisStep,
    promotionReadiness: incoming.promotionReadiness || current.promotionReadiness,
    activeSkillRun: current.activeSkillRun || null,
    skillRunHistory: Array.isArray(current.skillRunHistory) ? current.skillRunHistory : [],
    lastSkillSelection: current.lastSkillSelection || null,
    lastSkillExecution: current.lastSkillExecution || null,
    lastMiniAppInvite: current.lastMiniAppInvite || null,
    pendingDecision: current.pendingDecision || null,
    entryAttribution: current.entryAttribution || null,
    audienceProfile: current.audienceProfile || null
  });
}

function shouldPromoteToDiagnosticCase(decision, activeCase, classification) {
  if (
    classification.type === "small_talk" ||
    classification.entryMode === "meta_role" ||
    classification.type === "url_only" ||
    classification.type === "url_plus_problem"
  ) {
    return false;
  }

  if (activeCase?.kind === "diagnostic_case") {
    return true;
  }

  return (
    decision.selectedMode === "diagnostic_mode" &&
    ((decision.entryState?.promotionReadiness === "ready_for_diagnostic_case" &&
      decision.decision.action !== "clarify") ||
      decision.decision.signalSufficiency === "enough" ||
      decision.decision.action === "answer" ||
      decision.decision.action === "diagnose")
  );
}

function buildPersistedMemory(decision) {
  const constraint = decision.memory.constraint || decision.entryState?.selectedConstraint || "";
  const firstStep = decision.memory.actionWave?.firstStep || decision.response?.nextStep || decision.entryState?.nextBestStep || "";
  const firstStepIsQuestion = /\?/.test(firstStep);
  const inferredExecutionWave =
    decision.decision?.action !== "clarify" &&
    decision.orchestration?.transition === "diagnosis_to_execution" &&
    Boolean(constraint) &&
    Boolean(firstStep);
  return {
    goal: decision.memory.goal || decision.entryState?.claimedProblem || "",
    symptoms: uniqueStrings([
      ...(decision.memory.symptoms || []),
      ...(decision.entryState?.symptoms || [])
    ], 8),
    hypotheses: uniqueStrings([
      ...(decision.memory.hypotheses || []),
      ...((decision.entryState?.candidateConstraints || []).map((item) => item.label))
    ], 5),
    constraint,
    situation: decision.memory.situation || "",
    actionWave: {
      enabled: Boolean((decision.memory.actionWave?.enabled || inferredExecutionWave) && !firstStepIsQuestion),
      firstStep,
      notNow: decision.memory.actionWave?.notNow || "",
      whyThisFirst: decision.memory.actionWave?.whyThisFirst || decision.response?.whyItMatters || decision.entryState?.whyThisStep || ""
    },
    toolRecommendations: decision.memory.toolRecommendations || [],
    artifact: decision.memory.artifact || {
      shouldSave: false,
      title: "",
      summary: "",
      kind: "snapshot"
    }
  };
}

function buildArtifactBody({ company, activeCase, decision, classification, userText, artifactId }) {
  const entryState = decision.entryState || emptyEntryState();
  const candidateConstraints = (entryState.candidateConstraints || []).map((item) => `- [${item.layer}] ${item.label}`);
  const candidateStates = (entryState.candidateStates || []).map((item) => `- [${item.layer}] ${item.label} (${item.score})`);
  const candidateCauses = (entryState.candidateCauses || []).map((item) => `- [${item.layer}] ${item.label} (${item.score})`);
  const discriminatingSignals = (entryState.discriminatingSignals || []).map(
    (item) => `- ${item.question} | separates: ${(item.separates || []).join(" vs ")}`
  );
  const sections = [
    `# ${decision.memory.artifact.title || "Diagnostic artifact"}`,
    "",
    `- Company: ${company.name}`,
    `- Case ID: ${activeCase.id}`,
    `- Mode: ${decision.selectedMode}`,
    `- Action: ${decision.decision.action}`,
    `- Input type: ${classification.type}`,
    `- Entry mode: ${classification.entryMode || entryState.entryMode || "unclear"}`,
    `- Artifact ID: ${artifactId}`,
    "",
    "## User input",
    userText,
    "",
    "## What user thinks is happening",
    `- Claimed problem: ${entryState.claimedProblem || "Not captured."}`,
    `- Claimed cause: ${entryState.claimedCause || "Not captured."}`,
    "",
    "## Symptoms",
    ...(entryState.symptoms.length > 0 ? entryState.symptoms.map((item) => `- ${item}`) : ["- No symptoms captured."]),
    "",
    "## Observed signals",
    ...(entryState.observedSignals.length > 0 ? entryState.observedSignals.map((item) => `- ${item}`) : ["- No observed signals captured."]),
    "",
    "## System layers in play",
    ...(entryState.systemLayers.length > 0 ? entryState.systemLayers.map((item) => `- ${item}`) : ["- No layers captured."]),
    "",
    "## Business layer map",
    ...(entryState.businessLayers?.length > 0 ? entryState.businessLayers.map((item) => `- ${item}`) : ["- No business layers captured."]),
    "",
    "## Layer classes in play",
    ...(entryState.layerClasses?.length > 0 ? entryState.layerClasses.map((item) => `- ${item}`) : ["- No layer classes captured."]),
    "",
    "## Flow type",
    `- Primary flow: ${entryState.primaryFlow || "Not selected."}`,
    ...(entryState.flowTypes?.length > 0 ? entryState.flowTypes.map((item) => `- Candidate flow: ${item}`) : ["- No candidate flow types captured."]),
    "",
    "## Constraint type",
    `- ${entryState.constraintType || "Not selected."}`,
    "",
    "## Cross-class check",
    `- Current class: ${entryState.crossClassCheck?.currentClass || "Not selected."}`,
    `- Competing explanation alive: ${entryState.crossClassCheck?.hasCompetingExplanation ? "yes" : "no"}`,
    `- Competing class: ${entryState.crossClassCheck?.competingClass || "Not selected."}`,
    `- Why selected class: ${entryState.crossClassCheck?.whySelectedClass || "Not captured."}`,
    "",
    "## Candidate constraints",
    ...(candidateConstraints.length > 0 ? candidateConstraints : ["- No candidate constraints captured."]),
    "",
    "## Candidate states",
    ...(candidateStates.length > 0 ? candidateStates : ["- No candidate states captured."]),
    "",
    "## Candidate causes",
    ...(candidateCauses.length > 0 ? candidateCauses : ["- No candidate causes captured."]),
    "",
    "## Selected constraint",
    decision.memory.constraint || entryState.selectedConstraint || "Not selected yet.",
    "",
    "## Discriminating signals",
    ...(discriminatingSignals.length > 0 ? discriminatingSignals : ["- No discriminating signals captured."]),
    "",
    "## Graph confidence",
    `- ${entryState.graphConfidence || 0}`,
    "",
    "## Understanding",
    decision.response.whatIUnderstood,
    "",
    "## Working hypotheses",
    ...decision.response.hypotheses.map((item) => `- ${item}`),
    "",
    "## Why it matters",
    decision.response.whyItMatters,
    "",
    "## Next step",
    decision.response.nextStep,
    "",
    "## Known facts",
    ...(decision.guardrails.knownFacts.length > 0
      ? decision.guardrails.knownFacts.map((item) => `- ${item}`)
      : ["- No confirmed facts captured."]),
    "",
    "## Observations",
    ...(decision.guardrails.observations.length > 0
      ? decision.guardrails.observations.map((item) => `- ${item}`)
      : ["- No explicit observations captured."]),
    "",
    "## Guardrail hypotheses",
    ...(decision.guardrails.workingHypotheses.length > 0
      ? decision.guardrails.workingHypotheses.map((item) => `- ${item}`)
      : ["- No additional hypotheses captured."]),
    "",
    "## Cannot assert yet",
    ...(decision.guardrails.canNotAssert.length > 0
      ? decision.guardrails.canNotAssert.map((item) => `- ${item}`)
      : ["- No explicit uncertainty list captured."]),
    ""
  ];

  if (decision.memory.actionWave.enabled) {
    sections.push(
      "## Action wave",
      `- First step: ${decision.memory.actionWave.firstStep}`,
      `- Not now: ${decision.memory.actionWave.notNow}`,
      `- Why this first: ${decision.memory.actionWave.whyThisFirst}`,
      ""
    );
  }

  if (decision.memory.toolRecommendations.length > 0) {
    sections.push(
      "## Tool recommendations",
      ...decision.memory.toolRecommendations.map(
        (item) => `- ${item.name}: ${item.reason} When: ${item.usageMoment}`
      ),
      ""
    );
  }

  return `${sections.join("\n")}\n`;
}

export class ConversationService {
  constructor({
    store,
    reasoner,
    screener,
    googleDrive = null,
    maxHistoryMessages = 12,
    skillOrchestratorDiagnosticEnabled = true
  }) {
    this.store = store;
    this.reasoner = reasoner;
    this.screener = screener;
    this.maxHistoryMessages = maxHistoryMessages;
    this.modeOrchestrator = new AIBossModeOrchestrator();
    this.skillOrchestrator = new SkillOrchestrator();
    this.skillRunManager = new SkillRunManager();
    this.telegramDecisionCycles = new TelegramDecisionCycleManager();
    this.diagnosticSkillPilot = new DiagnosticSkillPilot();
    this.skillOrchestratorDiagnosticEnabled = skillOrchestratorDiagnosticEnabled;
    this.consultantTelegramMode = new ConsultantTelegramMode({ googleDrive });
  }

  async recordTelegramExchange({ telegramChatId, userText = "", assistantText = "", userMeta = {} }) {
    return this.store.update(async (state) => {
      const thread = ensureThread(state, telegramChatId);
      const company = ensureCompany(state, thread, userMeta);
      const now = nowIso();
      const startCommand = parseStartCommand(userText);

      if (startCommand) {
        applyStartAttribution({ thread, company, userMeta, startCommand, timestamp: now });
      }

      if (userText) {
        state.messages.push(createMessage({
          threadId: thread.id,
          role: "user",
          text: userText
        }));
      }

      if (assistantText) {
        state.messages.push(createMessage({
          threadId: thread.id,
          role: "assistant",
          text: assistantText
        }));
      }

      thread.updatedAt = now;
      company.updatedAt = now;

      return {
        threadId: thread.id,
        companyId: company.id,
        recordedMessages: Number(Boolean(userText)) + Number(Boolean(assistantText))
      };
    });
  }

  async composeLiveReply({ telegramChatId, userText, userMeta = {}, eventType, facts = {}, draft = "" }) {
    const state = await this.store.readState();
    const thread = state.threads.find((item) => item.telegramChatId === String(telegramChatId));
    const history = thread ? recentHistory(state, thread.id, this.maxHistoryMessages) : [];
    return this.reasoner.composeReply({
      userText,
      userMeta,
      history,
      eventType,
      facts,
      draft
    });
  }

  async handleUserMessage({ telegramChatId, text, userMeta = {} }) {
    return this.store.update(async (state) => {
      const thread = ensureThread(state, telegramChatId);
      let company = ensureCompany(state, thread, userMeta);
      company = applyActiveCompanyContext(state, thread, telegramChatId, userMeta) || company;
      const startCommand = parseStartCommand(text);
      if (startCommand) {
        const startedAt = nowIso();
        const entryAttribution = applyStartAttribution({
          thread,
          company,
          userMeta,
          startCommand,
          timestamp: startedAt
        });
        const startRunState = this.skillRunManager.prepare({
          entryState: thread.entryState || emptyEntryState(),
          selection: {
            primarySkill: "onboarding_conversation",
            reasonCodes: ["start_or_onboarding"]
          },
          context: { userText: text, classification: { type: "unknown" } }
        }).state;
        thread.entryState = this.skillRunManager.applyToEntryState(
          thread.entryState || emptyEntryState(),
          startRunState
        );
        const returning = state.messages.some((message) => message.threadId === thread.id && message.role === "user" && !looksStartCommand(message.text));
        const reply = buildPlatformWelcomeMessage(userMeta, {
          returning,
          entryChannel: entryAttribution?.entryChannel || "telegram"
        });
        state.messages.push(
          createMessage({ threadId: thread.id, role: "user", text }),
          createMessage({ threadId: thread.id, role: "assistant", text: reply })
        );
        thread.entryState = {
          ...(thread.entryState || emptyEntryState()),
          lastUpdatedAt: startedAt
        };
        thread.updatedAt = thread.entryState.lastUpdatedAt;
        company.updatedAt = thread.entryState.lastUpdatedAt;
        return {
          reply,
          miniAppInvite: null,
          runtime: {
            threadId: thread.id,
            activeCompanyId: company.id,
            returning,
            chatFirst: true,
            entryAttribution
          }
        };
      }

      const initialClassification = classifyInput(text);
      if (initialClassification.type === "small_talk") {
        const history = recentHistory(state, thread.id, this.maxHistoryMessages);
        const managementCycle = this.telegramDecisionCycles.getContext({ state, thread });
        const skillSelection = this.skillOrchestrator.select({
          context: {
            userText: text,
            userMeta,
            history,
            classification: initialClassification,
            managementCycle
          }
        });
        const reply = await this.reasoner.composeReply({
          userText: text,
          userMeta,
          history,
          eventType: "natural_conversation",
          facts: {
            activeDecision: managementCycle.activeDecisionLock
              ? {
                  constraint: managementCycle.activeDecisionLock.constraint,
                  nextStep: managementCycle.activeDecisionLock.nextStep
                }
              : null
          }
        });
        state.messages.push(
          createMessage({ threadId: thread.id, role: "user", text }),
          createMessage({ threadId: thread.id, role: "assistant", text: reply })
        );
        thread.entryState.lastSkillSelection = skillSelection;
        thread.updatedAt = nowIso();
        company.updatedAt = thread.updatedAt;
        return {
          reply,
          classification: initialClassification,
          miniAppInvite: null,
          runtime: {
            threadId: thread.id,
            activeCompanyId: company.id,
            activeCaseId: thread.activeCaseId || "",
            chatFirst: true,
            smallTalk: true,
            skillSelection
          }
        };
      }

      const managementCommand = this.telegramDecisionCycles.handleCommand({
        state,
        thread,
        company,
        activeCase: findCase(state, thread.activeCaseId),
        text
      });
      if (managementCommand.handled) {
        const history = recentHistory(state, thread.id, this.maxHistoryMessages);
        const reply = await this.reasoner.composeReply({
          userText: text,
          userMeta,
          history,
          eventType: "management_command",
          facts: {
            decisionCycle: managementCommand.decisionCycle || null,
            decisionLock: managementCommand.decisionLock || null,
            pendingDecision: managementCommand.pendingDecision || null
          },
          draft: managementCommand.reply
        });
        state.messages.push(
          createMessage({ threadId: thread.id, role: "user", text }),
          createMessage({ threadId: thread.id, role: "assistant", text: reply })
        );
        thread.updatedAt = nowIso();
        company.updatedAt = thread.updatedAt;
        return {
          reply,
          miniAppInvite: null,
          managementCycle: {
            decisionCycle: managementCommand.decisionCycle || null,
            decisionLock: managementCommand.decisionLock || null,
            pendingDecision: managementCommand.pendingDecision || null
          },
          runtime: {
            threadId: thread.id,
            activeCompanyId: company.id,
            activeCaseId: thread.activeCaseId || "",
            chatFirst: true,
            managementCommand: true
          }
        };
      }

      const consultantResult = await this.consultantTelegramMode.handle({
        state,
        thread,
        telegramChatId: String(telegramChatId),
        text,
        userMeta
      });

      if (consultantResult.handled) {
        const history = recentHistory(state, thread.id, this.maxHistoryMessages);
        const reply = await this.reasoner.composeReply({
          userText: text,
          userMeta,
          history,
          eventType: "consultant_operation",
          facts: {
            company: consultantResult.company || company,
            source: consultantResult.source || null,
            analysis: consultantResult.analysis || null
          },
          draft: consultantResult.reply
        });
        const userMessage = createMessage({
          threadId: thread.id,
          role: "user",
          text
        });
        const assistantMessage = createMessage({
          threadId: thread.id,
          role: "assistant",
          text: reply
        });

        state.messages.push(userMessage);
        state.messages.push(assistantMessage);
        thread.updatedAt = nowIso();

        return {
          reply,
          consultantMode: true,
          company: consultantResult.company || company,
          source: consultantResult.source || null,
          analysis: consultantResult.analysis || null,
          miniAppInvite: null,
          runtime: {
            threadId: thread.id,
            activeCompanyId: consultantResult.company?.id || thread.companyId,
            chatFirst: true
          }
        };
      }

      const history = recentHistory(state, thread.id, this.maxHistoryMessages);
      const classification = contextualizeClassification(initialClassification, thread, history);
      const intentIntegrity = checkIntentIntegrity({
        text,
        classification,
        entryState: thread.entryState || emptyEntryState(),
        history
      });
      const currentCase = selectRelevantCase(state, thread, classification);
      const managementCycle = this.telegramDecisionCycles.getContext({ state, thread });
      const memorySummary = {
        ...summarizeCaseMemory(state, currentCase?.id || ""),
        managementCycle
      };
      const screening = [];

      for (const url of classification.urls) {
        screening.push(await this.screener.screen(url));
      }

      const context = {
        routeHint: classification.type,
        userText: text,
        userMeta,
        classification,
        intentIntegrity,
        screening,
        company: {
          id: company.id,
          name: company.name
        },
        activeCase: currentCase
          ? {
              id: currentCase.id,
              kind: currentCase.kind,
              mode: currentCase.mode
            }
          : null,
        memorySummary,
        managementCycle,
        entryState: thread.entryState || emptyEntryState(),
        history
      };

      const extracted = extractObservations({
        userText: text,
        classification,
        entryState: context.entryState,
        memorySummary: context.memorySummary
      });
      const graphPacket = analyzeWithGraph({
        extracted,
        entryState: context.entryState,
        memorySummary: context.memorySummary
      });
      const referenceGate = new ReferenceModelService().evaluate({
        ...context,
        observationPacket: extracted,
        graphPacket
      });
      const contextWithReasoningPackets = {
        ...context,
        observationPacket: extracted,
        graphPacket,
        referenceGate
      };
      const autonomousData = new AutonomousDataCollector().collect({
        state,
        context: contextWithReasoningPackets,
        thread,
        company,
        activeCase: currentCase,
        referenceGate
      });
      const dataSufficiency = new DataSufficiencyChecker().check({
        context: {
          ...contextWithReasoningPackets,
          autonomousData
        },
        referenceGate,
        autonomousData
      });
      context.observationPacket = extracted;
      context.graphPacket = graphPacket;
      context.referenceGate = referenceGate;
      context.autonomousData = autonomousData;
      context.dataSufficiency = dataSufficiency;
      context.orchestration = this.modeOrchestrator.orchestrate({ context });
      context.audienceProfile = buildAudienceProfile({
        userText: text,
        userMeta,
        company,
        orchestration: context.orchestration,
        previousProfile: thread.entryState?.audienceProfile || null
      });
      thread.entryState.audienceProfile = context.audienceProfile;
      context.entryState = thread.entryState;

      const preliminarySkillSelection = this.skillOrchestrator.select({
        context,
        decision: { orchestration: context.orchestration }
      });
      let skillRunPreparation = this.skillRunManager.prepare({
        entryState: thread.entryState || emptyEntryState(),
        selection: preliminarySkillSelection,
        context
      });
      context.skillSelection = skillRunPreparation.selection;
      context.skillRun = skillRunPreparation.run;
      context.skillRunTransition = skillRunPreparation.transition;
      if (this.skillOrchestratorDiagnosticEnabled) {
        try {
          context.skillExecution = this.diagnosticSkillPilot.build({
            context,
            selection: context.skillSelection
          });
        } catch (error) {
          context.skillExecution = {
            enabled: false,
            fallbackReason: normalizeText(error?.message || "diagnostic_skill_pilot_failed")
          };
        }
      }

      if (context.skillExecution?.evidenceGate?.canSelectConstraint) {
        context.dataSufficiency = {
          ...(context.dataSufficiency || {}),
          sufficiency: "enough_for_decision",
          canMakeDecision: true,
          shouldAskUser: false,
          minimumQuestion: "",
          reasonCodes: [
            ...(context.dataSufficiency?.reasonCodes || []),
            "accumulated_case_evidence_allows_working_hypothesis"
          ]
        };
        context.referenceGate = {
          ...(context.referenceGate || {}),
          status: context.referenceGate?.status === "ready" ? "ready" : "minimum_viable",
          shouldBlockDiagnosis: false,
          minimumQuestion: "",
          overriddenByAccumulatedEvidence: true
        };
        context.orchestration = this.modeOrchestrator.orchestrate({ context });
      }

      let decision = await this.reasoner.decide(context);
      decision = this.diagnosticSkillPilot.enforce({
        packet: context.skillExecution,
        decision,
        context
      });
      decision = applyGuardrails(decision, context);
      decision.diagnosticQuality = assessChatDiagnosticExcellence({ decision, context });
      decision.orchestration = this.modeOrchestrator.orchestrate({
        context,
        decision,
        diagnosticQuality: decision.diagnosticQuality
      });
      decision.audienceProfile = buildAudienceProfile({
        userText: text,
        userMeta,
        company,
        orchestration: decision.orchestration,
        previousProfile: context.audienceProfile
      });
      context.audienceProfile = decision.audienceProfile;
      thread.entryState.audienceProfile = decision.audienceProfile;
      decision.skillSelection = ["started", "continued"].includes(skillRunPreparation.transition)
        ? context.skillSelection
        : this.skillOrchestrator.select({ context, decision });
      if (
        skillRunPreparation.transition === "none" &&
        decision.skillSelection?.primarySkill === "business_diagnostic"
      ) {
        skillRunPreparation = this.skillRunManager.prepare({
          entryState: thread.entryState || emptyEntryState(),
          selection: decision.skillSelection,
          context
        });
        context.skillSelection = skillRunPreparation.selection;
        context.skillRun = skillRunPreparation.run;
        context.skillRunTransition = skillRunPreparation.transition;
        decision.skillSelection = skillRunPreparation.selection;
      }
      decision.skillExecution = this.diagnosticSkillPilot.assess({
        packet: context.skillExecution,
        decision
      });
      const skillRunState = this.skillRunManager.finalize({
        preparation: skillRunPreparation,
        packet: context.skillExecution,
        execution: decision.skillExecution,
        decision,
        context
      });

      const userMessage = createMessage({
        threadId: thread.id,
        role: "user",
        text
      });
      const assistantMessage = createMessage({
        threadId: thread.id,
        role: "assistant",
        text: decision.response.responseText
      });

      state.messages.push(userMessage);
      state.messages.push(assistantMessage);

      const isConversationalTurn = classification.type === "small_talk" || classification.entryMode === "meta_role";
      if (!isConversationalTurn) {
        thread.entryState = mergeEntryState(thread.entryState, decision.entryState, classification.type);
        thread.entryState.entryMode = classification.entryMode || thread.entryState.entryMode || "unclear";
      }
      thread.entryState.lastSkillSelection = decision.skillSelection || null;
      thread.entryState.lastSkillExecution = decision.skillExecution || null;
      thread.entryState = this.skillRunManager.applyToEntryState(thread.entryState, skillRunState);
      thread.updatedAt = nowIso();

      if (decision.memory.companyName && normalizeText(decision.memory.companyName) !== normalizeText(company.name)) {
        company.name = decision.memory.companyName;
        company.updatedAt = nowIso();
      }

      let activeCase = currentCase;
      let promotionApplied = false;
      let persistedMemory = null;

      if (classification.type === "url_only" || classification.type === "url_plus_problem") {
        activeCase = activeCase || ensureCase(
          state,
          thread,
          "preliminary_screening",
          "website_screening_mode",
          "Предварительный внешний скрининг."
        );
      } else if (shouldPromoteToDiagnosticCase(decision, activeCase, classification)) {
        activeCase = activeCase || ensureCase(
          state,
          thread,
          "diagnostic_case",
          "diagnostic_mode",
          "Активный диагностический кейс."
        );
        promotionApplied = true;
        thread.entryState.promotionReadiness = "promoted";
        thread.updatedAt = nowIso();
      }

      let artifactPath = "";

      if (activeCase) {
        persistExtractedObservations({ state, activeCase, userMessage, extracted });
        persistedMemory = buildPersistedMemory(decision);
        decision.decisionObject = this.modeOrchestrator.buildDecisionObject({
          context,
          decision,
          activeCase,
          company
        });

        activeCase.mode = decision.selectedMode;
        activeCase.summary = decision.response.whatIUnderstood;
        activeCase.updatedAt = nowIso();
        thread.activeCaseId = activeCase.id;

        if (persistedMemory.goal) {
          pushUniqueEntity(
            state.goals,
            () =>
              createGoal({
                caseId: activeCase.id,
                statement: persistedMemory.goal,
                confidence: decision.decision.confidence
              }),
            () =>
              state.goals.some(
                (item) =>
                  item.caseId === activeCase.id &&
                  normalizeText(item.statement) === normalizeText(persistedMemory.goal)
              )
          );
        }

        for (const symptom of persistedMemory.symptoms) {
          pushUniqueEntity(
            state.symptoms,
            () =>
              createSymptom({
                caseId: activeCase.id,
                statement: symptom,
                evidence: text
              }),
            () =>
              state.symptoms.some(
                (item) =>
                  item.caseId === activeCase.id &&
                  normalizeText(item.statement) === normalizeText(symptom)
              )
          );
        }

        for (const hypothesis of persistedMemory.hypotheses) {
          pushUniqueEntity(
            state.hypotheses,
            () =>
              createHypothesis({
                caseId: activeCase.id,
                statement: hypothesis,
                basis: decision.decision.rationale,
                confidence: decision.decision.confidence
              }),
            () =>
              state.hypotheses.some(
                (item) =>
                  item.caseId === activeCase.id &&
                  normalizeText(item.statement) === normalizeText(hypothesis)
              )
          );
        }

        if (persistedMemory.constraint) {
          pushUniqueEntity(
            state.constraints,
            () =>
              createConstraint({
                caseId: activeCase.id,
                statement: persistedMemory.constraint,
                confidence: decision.decision.confidence
              }),
            () =>
              state.constraints.some(
                (item) =>
                  item.caseId === activeCase.id &&
                  normalizeText(item.statement) === normalizeText(persistedMemory.constraint)
              )
          );
        }

        if (persistedMemory.situation) {
          state.situations.push(
            createSituation({
              caseId: activeCase.id,
              summary: persistedMemory.situation
            })
          );
        }

        if (persistedMemory.actionWave.enabled) {
          state.actionWaves.push(
            createActionWave({
              caseId: activeCase.id,
              firstStep: persistedMemory.actionWave.firstStep,
              notNow: persistedMemory.actionWave.notNow,
              whyThisFirst: persistedMemory.actionWave.whyThisFirst
            })
          );

          const proposalResult = this.telegramDecisionCycles.propose({
            state,
            thread,
            company,
            activeCase,
            constraint: persistedMemory.constraint || thread.entryState.selectedConstraint,
            nextStep: persistedMemory.actionWave.firstStep,
            whyThisFirst: persistedMemory.actionWave.whyThisFirst,
            alternatives: persistedMemory.hypotheses
          });
          if (proposalResult.created) {
            const alreadyOffersConfirmation = /(?:напиши|команда|слов[оа])?\s*[«\"]?(?:фиксируем|не\s+фиксируем)/i.test(
              decision.response.responseText
            );
            if (!alreadyOffersConfirmation) {
              const proposalPrompt = this.telegramDecisionCycles.buildProposalPrompt(proposalResult.proposal);
              const confirmation = decision._responseOrigin === "model"
                ? await this.reasoner.composeReply({
                    userText: text,
                    userMeta,
                    history,
                    eventType: "decision_proposal_confirmation",
                    facts: { pendingDecision: proposalResult.proposal },
                    draft: proposalPrompt
                  })
                : proposalPrompt;
              decision.response.responseText = `${decision.response.responseText.trim()}\n\n${confirmation}`;
              assistantMessage.text = decision.response.responseText;
            }
          }
        }

        for (const tool of persistedMemory.toolRecommendations) {
          pushUniqueEntity(
            state.toolRecommendations,
            () =>
              createToolRecommendation({
                caseId: activeCase.id,
                name: tool.name,
                reason: tool.reason,
                usageMoment: tool.usageMoment
              }),
            () =>
              state.toolRecommendations.some(
                (item) =>
                  item.caseId === activeCase.id &&
                  normalizeText(item.name) === normalizeText(tool.name)
              )
          );
        }

        state.snapshots.push(
          createSnapshot({
            caseId: activeCase.id,
            mode: decision.selectedMode,
            action: decision.decision.action,
            signalSufficiency: decision.decision.signalSufficiency,
            understanding: decision.response.whatIUnderstood,
            knownFacts: decision.guardrails.knownFacts,
            observations: decision.guardrails.observations,
            workingHypotheses: decision.guardrails.workingHypotheses,
            graphSnapshot: decision.graphAnalysis || graphPacket,
            decisionObject: decision.decisionObject
          })
        );

        if (persistedMemory.artifact.shouldSave) {
          const previewArtifact = createArtifact({
            caseId: activeCase.id,
            kind: persistedMemory.artifact.kind,
            title: persistedMemory.artifact.title || "Diagnostic artifact",
            summary: persistedMemory.artifact.summary || decision.response.whatIUnderstood,
            path: "",
            content: ""
          });
          previewArtifact.content = buildArtifactBody({
            company,
            activeCase,
            decision,
            classification,
            userText: text,
            artifactId: previewArtifact.id
          });
          try {
            artifactPath = await this.store.saveArtifactDocument({
              artifactId: previewArtifact.id,
              title: previewArtifact.title,
              body: previewArtifact.content
            });
          } catch {
            artifactPath = "";
          }
          previewArtifact.path = artifactPath;
          state.artifacts.push(previewArtifact);
        }
      }

      const runtime = {
        threadId: thread.id,
        activeCaseId: activeCase?.id || "",
        activeCaseKind: activeCase?.kind || "",
        promotionApplied,
        artifactSaved: Boolean(artifactPath),
        entryStateAfterMerge: thread.entryState,
        graphPacket,
        persistedMemory,
        decisionObject: decision.decisionObject || null,
        skillSelection: decision.skillSelection || null,
        skillExecution: decision.skillExecution || null,
        managementCycle: this.telegramDecisionCycles.getContext({ state, thread }),
        audienceProfile: decision.audienceProfile || context.audienceProfile || null,
        skillRun: thread.entryState.activeSkillRun || (
          ["started", "continued", "interrupted"].includes(skillRunPreparation.transition)
            ? skillRunState.skillRunHistory?.at(-1) || null
            : null
        ),
        skillRunTransition: skillRunPreparation.transition
      };
      const miniAppInvite = buildMiniAppInvite({
            classification,
            decision,
            runtime,
            activeCase,
            persistedMemory,
            entryState: thread.entryState
          });

      if (miniAppInvite) {
        const offeredAt = nowIso();
        thread.entryState = {
          ...thread.entryState,
          lastMiniAppInvite: createMiniAppInviteSnapshot(miniAppInvite, offeredAt),
          lastUpdatedAt: offeredAt
        };
        runtime.entryStateAfterMerge = thread.entryState;
      }

      return {
        reply: decision.response.responseText,
        decision,
        classification,
        intentIntegrity,
        referenceGate,
        autonomousData,
        dataSufficiency,
        miniAppInvite,
        artifactPath,
        runtime
      };
    });
  }
}
