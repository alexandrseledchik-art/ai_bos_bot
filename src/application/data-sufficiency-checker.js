function normalizeText(value) {
  return String(value || "").trim();
}

function lowerText(value) {
  return normalizeText(value).toLowerCase();
}

function uniqueBy(items = [], keyFn, maxItems = 12) {
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

function hasHardSignal(text) {
  const normalized = normalizeText(text);
  return /\d|%|₽|руб|млн|тыс|mrr|cac|ltv/i.test(normalized) ||
    /(выручк|марж|прибыл|расход|конверс|остат|обязательств|дебиторк).*(упал|просел|сниз|вырос|с\s+\S+\s+до\s+\S+)/i.test(normalized);
}

function isReliableFact(fact) {
  const sourceType = lowerText(fact?.sourceType);
  const confidence = Number(fact?.confidence || 0);
  return sourceType !== "ai_hypothesis" && confidence >= 0.5 && normalizeText(fact?.text).length >= 3;
}

function firstAvailableQuestion({ context = {}, referenceGate = {}, autonomousData = {} }) {
  const integrityType = context.intentIntegrity?.integrityType || "";
  if (["proposed_solution", "urgent_problem", "strategic_intent"].includes(integrityType)) {
    const intentQuestion = normalizeText(context.intentIntegrity?.minimumQuestion);
    if (intentQuestion) {
      return intentQuestion;
    }
  }

  return normalizeText(
    autonomousData.userQuestionIfNeeded ||
    context.intentIntegrity?.minimumQuestion ||
    referenceGate.minimumQuestion ||
    referenceGate.primaryReference?.minimumQuestion ||
    "Какой один факт сейчас лучше всего покажет, где реальность расходится с ожидаемым результатом?"
  );
}

function missingFactsFrom(referenceGate = {}, autonomousData = {}) {
  const fromCollector = Array.isArray(autonomousData.missingFacts) ? autonomousData.missingFacts : [];
  if (fromCollector.length) {
    return fromCollector;
  }

  return (referenceGate.primaryReference?.missingParts || []).map((item) => ({
    key: item.key,
    title: item.title,
    question: item.question
  }));
}

function inferSourceQuality(reliableFacts = []) {
  const sourceTypes = new Set(reliableFacts.map((item) => lowerText(item.sourceType)).filter(Boolean));
  if (sourceTypes.has("api_data") || sourceTypes.has("crm_data") || sourceTypes.has("financial_data")) {
    return "confirmed_data";
  }
  if (sourceTypes.has("document") || sourceTypes.has("table")) {
    return "documented";
  }
  if (sourceTypes.has("saved_business_model") || sourceTypes.has("mini_app") || sourceTypes.has("decision_history")) {
    return "saved_context";
  }
  if (sourceTypes.has("user_words")) {
    return "user_words";
  }
  return "weak";
}

export class DataSufficiencyChecker {
  check({ context = {}, referenceGate = {}, autonomousData = {} } = {}) {
    const integrityType = context.intentIntegrity?.integrityType || "";
    const reliableFacts = uniqueBy(
      (autonomousData.foundFacts || []).filter(isReliableFact),
      (item) => `${item.sourceType}:${lowerText(item.text)}`,
      10
    );
    const hardSignal = hasHardSignal([
      context.userText,
      ...((context.history || [])
        .filter((item) => item?.role === "user")
        .slice(-8)
        .map((item) => item?.text)),
      ...(reliableFacts || []).map((item) => item.text)
    ].join(" "));
    const missingFacts = missingFactsFrom(referenceGate, autonomousData);
    const minimumQuestion = firstAvailableQuestion({ context, referenceGate, autonomousData });
    const sourceQuality = inferSourceQuality(reliableFacts);
    const referenceReady = referenceGate.status === "ready";
    const referenceMinimum = referenceGate.status === "minimum_viable";

    if (integrityType === "light_task") {
      return {
        sufficiency: "enough_for_decision",
        confidenceLevel: "HIGH",
        uncertaintyLevel: "LOW",
        shouldAskUser: false,
        canBuildHypothesis: false,
        canMakeDecision: true,
        foundFactCount: reliableFacts.length,
        sourceQuality,
        missingFacts: [],
        minimumQuestion: "",
        searchedSources: autonomousData.sourceTypesChecked || [],
        searchedBeforeAsking: Boolean(autonomousData.searchedBeforeAsking),
        reason: "Запрос маленький и не требует сбора бизнес-данных."
      };
    }

    if (integrityType === "proposed_solution") {
      return {
        sufficiency: "insufficient",
        confidenceLevel: "LOW",
        uncertaintyLevel: "HIGH",
        shouldAskUser: true,
        canBuildHypothesis: false,
        canMakeDecision: false,
        foundFactCount: reliableFacts.length,
        sourceQuality,
        missingFacts,
        minimumQuestion,
        searchedSources: autonomousData.sourceTypesChecked || [],
        searchedBeforeAsking: Boolean(autonomousData.searchedBeforeAsking),
        reason: "Пользователь принёс готовое решение, но исходная проблема и критерий результата ещё не восстановлены."
      };
    }

    if (integrityType === "urgent_problem") {
      return {
        sufficiency: hardSignal || reliableFacts.length >= 1 ? "enough_for_hypothesis" : "insufficient",
        confidenceLevel: hardSignal || reliableFacts.length >= 1 ? "MEDIUM" : "LOW",
        uncertaintyLevel: hardSignal || reliableFacts.length >= 1 ? "MEDIUM" : "HIGH",
        shouldAskUser: true,
        canBuildHypothesis: true,
        canMakeDecision: false,
        foundFactCount: reliableFacts.length,
        sourceQuality,
        missingFacts,
        minimumQuestion,
        searchedSources: autonomousData.sourceTypesChecked || [],
        searchedBeforeAsking: Boolean(autonomousData.searchedBeforeAsking),
        reason: "Цена промедления высокая: можно действовать в режиме первичной финансовой безопасности, но ключевые цифры всё равно нужно добрать."
      };
    }

    if (referenceGate.shouldBlockDiagnosis) {
      return {
        sufficiency: "insufficient",
        confidenceLevel: "LOW",
        uncertaintyLevel: "HIGH",
        shouldAskUser: true,
        canBuildHypothesis: false,
        canMakeDecision: false,
        foundFactCount: reliableFacts.length,
        sourceQuality,
        missingFacts,
        minimumQuestion,
        searchedSources: autonomousData.sourceTypesChecked || [],
        searchedBeforeAsking: Boolean(autonomousData.searchedBeforeAsking),
        reason: "Перед диагностикой нужно собрать минимальную рамку сравнения по выбранной области."
      };
    }

    if (referenceReady && (hardSignal || reliableFacts.length >= 3)) {
      return {
        sufficiency: "enough_for_decision",
        confidenceLevel: sourceQuality === "user_words" ? "MEDIUM" : "HIGH",
        uncertaintyLevel: sourceQuality === "user_words" ? "MEDIUM" : "LOW",
        shouldAskUser: false,
        canBuildHypothesis: true,
        canMakeDecision: true,
        foundFactCount: reliableFacts.length,
        sourceQuality,
        missingFacts: [],
        minimumQuestion: "",
        searchedSources: autonomousData.sourceTypesChecked || [],
        searchedBeforeAsking: Boolean(autonomousData.searchedBeforeAsking),
        reason: "Есть рабочая рамка сравнения и достаточно фактов для управленческого следующего шага."
      };
    }

    if (referenceMinimum || hardSignal || reliableFacts.length >= 2) {
      return {
        sufficiency: "enough_for_hypothesis",
        confidenceLevel: "MEDIUM",
        uncertaintyLevel: "MEDIUM",
        shouldAskUser: Boolean(missingFacts.length && !hardSignal),
        canBuildHypothesis: true,
        canMakeDecision: false,
        foundFactCount: reliableFacts.length,
        sourceQuality,
        missingFacts,
        minimumQuestion: missingFacts.length ? minimumQuestion : "",
        searchedSources: autonomousData.sourceTypesChecked || [],
        searchedBeforeAsking: Boolean(autonomousData.searchedBeforeAsking),
        reason: "Фактов хватает на рабочую версию, но для решения нужен ещё один различающий факт."
      };
    }

    return {
      sufficiency: "insufficient",
      confidenceLevel: "LOW",
      uncertaintyLevel: "HIGH",
      shouldAskUser: true,
      canBuildHypothesis: false,
      canMakeDecision: false,
      foundFactCount: reliableFacts.length,
      sourceQuality,
      missingFacts,
      minimumQuestion,
      searchedSources: autonomousData.sourceTypesChecked || [],
      searchedBeforeAsking: Boolean(autonomousData.searchedBeforeAsking),
      reason: "В доступном контексте пока мало фактов, поэтому нужен один минимальный вопрос пользователю."
    };
  }
}
