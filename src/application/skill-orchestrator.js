import {
  AI_BOSS_SKILLS_V1,
  SKILL_ACTIVATION,
  getSkillContract
} from "../domain/skill-registry.js";

const ALWAYS_ON_SKILLS = AI_BOSS_SKILLS_V1
  .filter((item) => item.activation === SKILL_ACTIVATION.ALWAYS_ON)
  .map((item) => item.id);

const COMMUNICATION_SKILLS = new Set([
  "onboarding_conversation",
  "natural_conversation",
  "intent_clarification",
  "diagnostic_interview",
  "concept_explanation",
  "progress_navigation",
  "platform_support",
  "result_interpretation"
]);

function normalize(value) {
  return String(value || "").trim();
}

function lower(value) {
  return normalize(value).toLowerCase();
}

function includesAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

function unique(items, maxItems = Infinity) {
  return [...new Set((items || []).filter(Boolean))].slice(0, maxItems);
}

function inputKind(context = {}) {
  return lower(
    context.inputKind ||
    context.userMeta?.inputKind ||
    context.userMeta?.messageType ||
    context.channelInput?.type
  );
}

function screenId(context = {}) {
  return lower(context.screenId || context.interfaceContext?.screenId || context.userMeta?.screenId);
}

function activeTool(context = {}) {
  return context.activeTool || context.toolInstance || context.interfaceContext?.activeTool || null;
}

function activeResult(context = {}) {
  return context.activeResult || context.interfaceContext?.activeResult || context.resultObject || null;
}

function acceptedNextStep(context = {}) {
  return context.acceptedNextStep || context.interfaceContext?.acceptedNextStep || null;
}

function candidate(skillId, score, reasonCodes = [], details = {}) {
  const contract = getSkillContract(skillId);
  if (!contract) return null;
  return {
    skillId,
    score,
    reasonCodes: unique(reasonCodes),
    department: contract.department,
    activation: contract.activation,
    ...details
  };
}

function addCandidate(candidates, item) {
  if (!item) return;
  const current = candidates.get(item.skillId);
  if (!current) {
    candidates.set(item.skillId, item);
    return;
  }
  current.score = Math.max(current.score, item.score);
  current.reasonCodes = unique([...current.reasonCodes, ...item.reasonCodes]);
}

function buildPrimaryCandidates({ context, decision }) {
  const candidates = new Map();
  const classification = context.classification || {};
  const entryMode = classification.entryMode || "unclear";
  const routeType = classification.type || context.routeHint || "unknown";
  const integrityType = context.intentIntegrity?.integrityType || "unclear";
  const operatingMode = decision?.orchestration?.operatingMode || context.orchestration?.operatingMode || "unknown";
  const action = decision?.decision?.action || "";
  const text = lower([context.userText, classification.cleanText].filter(Boolean).join(" "));
  const currentScreen = screenId(context);
  const currentTool = activeTool(context);
  const result = activeResult(context);
  const kind = inputKind(context);

  if (/^\/start(?:\s|$)/i.test(text) || context.isOnboarding === true) {
    addCandidate(candidates, candidate("onboarding_conversation", 1, ["start_or_onboarding"]));
  }

  if (routeType === "small_talk" || entryMode === "small_talk") {
    addCandidate(candidates, candidate("natural_conversation", 0.99, ["natural_dialogue"]));
  }

  if (currentTool || context.toolContinuation === true) {
    addCandidate(candidates, candidate("tool_facilitation", 0.99, ["active_tool_work"]));
  }

  if (["document", "file", "attachment", "voice_document"].includes(kind) || context.documentSource) {
    addCandidate(candidates, candidate("document_analysis", 0.98, ["document_input"]));
  }

  if (routeType === "url_only" || routeType === "url_plus_problem" || classification.urls?.length) {
    addCandidate(candidates, candidate("website_screening", routeType === "url_only" ? 0.98 : 0.86, ["url_input"]));
    if (routeType === "url_plus_problem") {
      addCandidate(candidates, candidate("business_diagnostic", 0.9, ["url_with_business_problem"]));
    }
  }

  if (result || /maturity|constraint|diagnostic-result|result/.test(currentScreen)) {
    addCandidate(candidates, candidate("result_interpretation", 0.96, ["result_context"]));
  }

  if (currentScreen && includesAny(currentScreen, [/architecture/, /diagnostic/, /tools?/, /documents?/, /overview/, /app/])) {
    const explicitInterfaceQuestion = includesAny(text, [
      /куда\s+нажать/, /как\s+заполнить/, /что\s+на\s+экране/, /как\s+открыть/,
      /не\s+работает/, /не\s+листает/, /как\s+пользоваться/
    ]);
    addCandidate(candidates, candidate(
      "platform_support",
      explicitInterfaceQuestion ? 0.96 : 0.72,
      [explicitInterfaceQuestion ? "explicit_platform_help" : "platform_screen_context"]
    ));
  }

  if (acceptedNextStep(context) || operatingMode === "execution_coordinator") {
    addCandidate(candidates, candidate("execution_coordination", 0.95, ["accepted_action_or_execution_mode"]));
  }

  if (entryMode === "meta_role" || operatingMode === "methodology_expert") {
    addCandidate(candidates, candidate("concept_explanation", 0.97, ["methodology_or_role_question"]));
  }

  if (entryMode === "specific_tool_request" || entryMode === "tool_discovery" || integrityType === "tool_request") {
    addCandidate(candidates, candidate("tool_selection", 0.95, ["tool_first_request"]));
  }

  if (includesAny(text, [
    /архитектур[а-яё]*/, /собрать\s+бизнес/, /по\s+слоям/, /какой\s+слой/, /контур\s+собственника/,
    /домен|поддомен/, /двигаться\s+последовательно/
  ])) {
    addCandidate(candidates, candidate("architecture_navigation", 0.93, ["architecture_route_signal"]));
  }

  if (includesAny(text, [
    /пройти\s+диагностик/, /экспресс[\s-]*диагностик/, /базов[а-яё]+\s+диагностик/,
    /расширенн[а-яё]+\s+диагностик/, /оценить\s+зрелост/, /матриц[а-яё]+\s+зрелост/
  ])) {
    addCandidate(candidates, candidate("maturity_assessment", 0.95, ["maturity_assessment_request"]));
  }

  if (includesAny(text, [
    /главн[а-яё]+\s+ограничен/, /корнев[а-яё]+\s+причин/, /что\s+держит\s+результат/,
    /что\s+главное/, /выбрать\s+приоритет/
  ])) {
    addCandidate(candidates, candidate("constraint_prioritization", 0.91, ["constraint_or_priority_request"]));
  }

  if (includesAny(text, [
    /что\s+делать\s+перв/, /следующ[а-яё]+\s+шаг/, /с\s+чего\s+начать/,
    /что\s+делать\s+дальше/
  ]) && context.entryState?.candidateConstraints?.length) {
    addCandidate(candidates, candidate("next_step_selection", 0.9, ["next_step_request_with_hypothesis"]));
  }

  if (entryMode === "problem_first" || routeType === "free_text_problem" || operatingMode === "diagnostician" || action === "diagnose") {
    addCandidate(candidates, candidate("business_diagnostic", 0.92, ["live_business_problem"]));
  }

  if (integrityType === "proposed_solution" || integrityType === "interpretation") {
    addCandidate(candidates, candidate("business_diagnostic", 0.94, ["claim_requires_reframing"]));
  }

  if (entryMode === "unclear" || routeType === "unknown" || (classification.looksVague && candidates.size === 0)) {
    addCandidate(candidates, candidate("intent_clarification", 0.88, ["unclear_intent"]));
  }

  if (includesAny(text, [/как\s+мне\s+это\s+понять/, /объясни\s+результат/, /что\s+означает\s+оценк/])) {
    addCandidate(candidates, candidate("result_interpretation", 0.94, ["explicit_result_explanation"]));
  }

  if (candidates.size === 0) {
    addCandidate(candidates, candidate("intent_clarification", 0.62, ["safe_fallback"]));
  }

  return [...candidates.values()].sort((left, right) => right.score - left.score);
}

function chooseSupportingSkills(primarySkill, { context, decision }) {
  const dataSufficiency = context.dataSufficiency || {};
  const supporting = [];

  if (primarySkill === "business_diagnostic") {
    if (dataSufficiency.shouldAskUser !== false || decision?.decision?.action === "clarify") {
      supporting.push("diagnostic_interview");
    }
    if (decision?.decision?.signalSufficiency === "enough" || dataSufficiency.canMakeDecision) {
      supporting.push("constraint_prioritization");
    }
  }

  if (primarySkill === "constraint_prioritization") supporting.push("result_interpretation");
  if (primarySkill === "maturity_assessment") supporting.push("result_interpretation", "progress_navigation");
  if (primarySkill === "architecture_navigation") supporting.push("progress_navigation", "tool_selection");
  if (primarySkill === "tool_selection") supporting.push("concept_explanation", "progress_navigation");
  if (primarySkill === "tool_facilitation") supporting.push("concept_explanation", "artifact_builder", "progress_navigation");
  if (primarySkill === "document_analysis") supporting.push("artifact_builder");
  if (primarySkill === "website_screening") supporting.push("result_interpretation", "artifact_builder");
  if (primarySkill === "next_step_selection") supporting.push("artifact_builder");
  if (primarySkill === "execution_coordination") supporting.push("progress_navigation", "artifact_builder");
  if (primarySkill === "onboarding_conversation") supporting.push("concept_explanation");

  return unique(supporting.filter((skillId) => skillId !== primarySkill && !ALWAYS_ON_SKILLS.includes(skillId)), 3);
}

function chooseCommunicationSkill(primarySkill, supportingSkills, context) {
  if (COMMUNICATION_SKILLS.has(primarySkill)) return primarySkill;
  const preferred = supportingSkills.find((skillId) => COMMUNICATION_SKILLS.has(skillId));
  if (preferred) return preferred;
  if (primarySkill === "business_diagnostic") return "diagnostic_interview";
  if (screenId(context)) return "platform_support";
  return "progress_navigation";
}

function selectionGoal(primarySkill, context) {
  const goals = {
    onboarding_conversation: "Помочь пользователю понять роль AI-BOSS и начать первый полезный ход в Telegram.",
    natural_conversation: "Ответить живо и уместно, сохранив контекст разговора и не запуская бизнес-диагностику без бизнес-сигнала.",
    intent_clarification: "Понять практический результат, который нужен пользователю сейчас.",
    diagnostic_interview: "Получить один наблюдаемый сигнал, который уменьшает неопределённость.",
    concept_explanation: "Объяснить понятие или метод простым языком пользователя.",
    platform_support: "Помочь выполнить следующее действие на текущем экране.",
    business_diagnostic: "Расширить поле причин и выбрать следующий диагностический ход без преждевременного вывода.",
    architecture_navigation: "Определить текущую ветку архитектуры и следующий осмысленный участок сборки.",
    maturity_assessment: "Получить подтверждённую оценку выбранной глубины диагностики.",
    constraint_prioritization: "Выбрать одну рабочую гипотезу ограничения и назвать недостающие доказательства.",
    result_interpretation: "Объяснить результат, его границы и способ проверки.",
    next_step_selection: "Выбрать одно конкретное действие, которое проверяет гипотезу или открывает решение.",
    tool_selection: "Подобрать инструмент под требуемый рабочий результат.",
    tool_facilitation: "Продвинуть активный инструмент на один завершённый шаг.",
    document_analysis: "Извлечь из документа факты, сигналы и открытые вопросы.",
    website_screening: "Разделить внешние факты о сайте, наблюдения и то, чего по URL утверждать нельзя.",
    execution_coordination: "Закрепить принятое действие ответственностью, результатом и моментом проверки."
  };
  return goals[primarySkill] || `Получить законченный результат скилла ${primarySkill} для запроса: ${normalize(context.userText)}`;
}

function prohibitedActions(primarySkill) {
  const common = ["не выдавать гипотезу за подтверждённый факт"];
  const bySkill = {
    business_diagnostic: ["не принимать заявленную пользователем причину без проверки", "не давать длинный план до выбора ограничения"],
    diagnostic_interview: ["не спрашивать у пользователя готовый диагноз", "не задавать больше одного вопроса за ход"],
    website_screening: ["не диагностировать внутренние контуры бизнеса по одному сайту"],
    tool_selection: ["не выдавать инструмент вместо понимания требуемого результата"],
    tool_facilitation: ["не придумывать ответы за пользователя"],
    maturity_assessment: ["не считать минимальный балл главным ограничением"],
    constraint_prioritization: ["не выбирать ограничение только по минимальной оценке"],
    document_analysis: ["не считать документ автоматически подтверждённой истиной"],
    execution_coordination: ["не назначать людей без подтверждённых полномочий"]
  };
  return unique([...common, ...(bySkill[primarySkill] || [])]);
}

export class SkillOrchestrator {
  select({ context = {}, decision = null } = {}) {
    const shortlist = buildPrimaryCandidates({ context, decision });
    const primary = shortlist[0];
    const primarySkill = primary?.skillId || "intent_clarification";
    const supportingSkills = chooseSupportingSkills(primarySkill, { context, decision });
    const communicationSkill = chooseCommunicationSkill(primarySkill, supportingSkills, context);
    const contract = getSkillContract(primarySkill);

    return {
      schemaVersion: "skill_selection_v1",
      shadowMode: true,
      selectedAt: new Date().toISOString(),
      primarySkill,
      supportingSkills,
      alwaysOnSkills: [...ALWAYS_ON_SKILLS],
      communicationSkill,
      turnGoal: selectionGoal(primarySkill, context),
      completionCondition: contract?.completionCriteria?.[0] || "Получен законченный результат текущего хода.",
      prohibitedActions: prohibitedActions(primarySkill),
      shortlist: shortlist.slice(0, 5).map((item) => ({
        skillId: item.skillId,
        score: Number(item.score.toFixed(2)),
        reasonCodes: item.reasonCodes
      })),
      reasonCodes: primary?.reasonCodes || ["safe_fallback"],
      selectorConfidence: Number(Math.max(0.5, Math.min(0.99, primary?.score || 0.5)).toFixed(2))
    };
  }
}
