function normalizeText(value) {
  return String(value || "").trim();
}

function lowerText(value) {
  return normalizeText(value).toLowerCase();
}

function hasItems(value) {
  return Array.isArray(value) && value.length > 0;
}

function unique(items = []) {
  return [...new Set(items.map((item) => normalizeText(item)).filter(Boolean))];
}

function addCriterion(criteria, key, title, passed, explanation) {
  criteria.push({
    key,
    title,
    passed: Boolean(passed),
    score: passed ? 1 : 0,
    explanation
  });
}

function collectLayers(decision = {}, context = {}) {
  const entryState = decision.entryState || {};
  const graph = decision.graphAnalysis || context.graphPacket || {};
  return unique([
    ...(entryState.businessLayers || []),
    ...(entryState.systemLayers || []),
    ...((entryState.candidateConstraints || []).map((item) => item?.layer)),
    ...((entryState.candidateStates || []).map((item) => item?.layer)),
    ...((entryState.candidateCauses || []).map((item) => item?.layer)),
    ...((graph.candidateStates || []).map((item) => item?.layer)),
    ...((graph.candidateCauses || []).map((item) => item?.layer)),
    ...(context.referenceGate?.candidateLayers || []),
    ...(context.intentIntegrity?.candidateLayers || [])
  ]);
}

function collectHypotheses(decision = {}) {
  const entryState = decision.entryState || {};
  const graph = decision.graphAnalysis || {};
  return unique([
    ...((decision.response?.hypotheses || []).map((item) => normalizeText(item))),
    ...((entryState.candidateConstraints || []).map((item) => item?.label)),
    ...((entryState.candidateStates || []).map((item) => item?.label)),
    ...((entryState.candidateCauses || []).map((item) => item?.label)),
    ...((graph.candidateStates || []).map((item) => item?.label)),
    ...((graph.candidateCauses || []).map((item) => item?.label))
  ]);
}

function assessIntentIntegrity(context = {}) {
  const classification = context.classification || {};
  const integrity = context.intentIntegrity || {};
  return Boolean(
    integrity.integrityType ||
    classification.entryMode ||
    classification.type ||
    normalizeText(classification.cleanText || context.userText)
  );
}

function assessEvidenceDiscipline(decision = {}, context = {}) {
  const guardrails = decision.guardrails || {};
  const data = context.autonomousData || {};
  const sufficiency = context.dataSufficiency || {};
  return Boolean(
    hasItems(guardrails.knownFacts) ||
    hasItems(guardrails.observations) ||
    hasItems(guardrails.canNotAssert) ||
    data.searchedBeforeAsking ||
    hasItems(data.foundFacts) ||
    normalizeText(sufficiency.confidenceLevel || sufficiency.reason)
  );
}

function assessReferenceGate(context = {}) {
  const gate = context.referenceGate || {};
  return Boolean(gate.status && (gate.status === "no_layer" || gate.primaryLayer || hasItems(gate.candidateReferences)));
}

function assessUpperFrameProtection(decision = {}, context = {}) {
  const entryState = decision.entryState || {};
  const text = lowerText([
    context.userText,
    entryState.crossClassCheck?.whySelectedClass,
    entryState.crossClassCheck?.competingClass,
    ...(entryState.businessLayers || []),
    ...collectHypotheses(decision),
    decision.response?.whatIUnderstood,
    decision.response?.whyItMatters
  ].join(" "));

  if (context.intentIntegrity?.integrityType === "proposed_solution") {
    return true;
  }

  return Boolean(
    entryState.crossClassCheck?.currentClass ||
    entryState.crossClassCheck?.hasCompetingExplanation ||
    /owner_context|external_environment|strategy|собственник|рынок|стратег|верхн|слоем выше|условия игры|следств/.test(text)
  );
}

function assessCauseEffect(decision = {}) {
  const text = lowerText([
    decision.response?.whatIUnderstood,
    decision.response?.whyItMatters,
    decision.response?.nextStep,
    decision.response?.responseText,
    ...(decision.guardrails?.workingHypotheses || []),
    ...(decision.guardrails?.canNotAssert || [])
  ].join(" "));

  return /симптом|причин|следств|верси|гипотез|не доказывает|может быть/i.test(text);
}

function assessConfidence(decision = {}, context = {}) {
  const value = Number(decision.decision?.confidence ?? 0);
  const sufficiency = context.dataSufficiency || {};
  const text = lowerText([
    decision.guardrails?.confidenceNote,
    decision.response?.responseText,
    sufficiency.confidenceLevel,
    sufficiency.reason
  ].join(" "));

  return Boolean(value > 0 && (text || value < 0.9));
}

function assessOneNextMove(decision = {}) {
  const entryState = decision.entryState || {};
  const next = normalizeText(
    decision.response?.nextStep ||
    entryState.nextBestStep ||
    entryState.nextBestQuestion
  );
  const reply = lowerText(decision.response?.responseText);
  const hasNext = Boolean(next);
  const noAdvicePile = !/(во-первых|во вторых|во-вторых|первое[, ]+второе|1\.\s+.*2\.)/i.test(reply);
  return hasNext && noAdvicePile;
}

function assessParallelSafety(decision = {}, context = {}) {
  const text = lowerText([
    context.userText,
    decision.response?.responseText,
    decision.response?.nextStep,
    decision.memory?.actionWave?.firstStep,
    decision.memory?.actionWave?.whyThisFirst
  ].join(" "));

  const parallelIssue = /параллел|финансов.*менеджер|отчетност|отч[её]тност|можно\s+начинать|уже\s+сейчас/.test(text);
  if (!parallelIssue) {
    return true;
  }

  return /не подмен|не пут|корнев|главн|рабоч.*верси|стабилизац|параллел/i.test(text);
}

function assessHumanSurface(decision = {}) {
  const reply = normalizeText(decision.response?.responseText);
  if (!reply) {
    return false;
  }

  const leaksInternals = /entryState|graphPacket|candidateConstraints|referenceGate|dataSufficiency|diagnosticQuality/i.test(reply);
  const rawConstraintInstruction = /проверь ограничение\s+["«]/i.test(reply);
  const tooLong = reply.length > 1400;

  return !leaksInternals && !rawConstraintInstruction && !tooLong;
}

export function assessChatDiagnosticExcellence({ decision = {}, context = {} }) {
  const criteria = [];
  const layers = collectLayers(decision, context);
  const hypotheses = collectHypotheses(decision);
  const action = normalizeText(decision.decision?.action);
  const isLightTask = context.intentIntegrity?.integrityType === "light_task";
  const needsFullDiagnosticDiscipline = !isLightTask && action !== "screen";

  addCriterion(
    criteria,
    "intent_integrity",
    "Вход не принят на веру: проблема, симптом, интерпретация или готовое решение различены",
    assessIntentIntegrity(context),
    "10/10 диагност не начинает с ответа, пока не понял тип входа."
  );
  addCriterion(
    criteria,
    "evidence_discipline",
    "Факты, пробелы и версии отделены друг от друга",
    assessEvidenceDiscipline(decision, context),
    "Слабые данные снижают уверенность, но не отменяют дисциплину фактов."
  );
  addCriterion(
    criteria,
    "layer_orientation",
    "Диалог привязан к слоям бизнес-архитектуры",
    isLightTask || layers.length > 0,
    "Слои могут оставаться внутри, но диагност должен понимать, где находится сигнал."
  );
  addCriterion(
    criteria,
    "reference_gate",
    "Проверена точка сравнения перед выводом",
    isLightTask || assessReferenceGate(context),
    "Нельзя оценивать лиды без профиля целевого клиента, прибыль без экономики, команду без ролей."
  );
  addCriterion(
    criteria,
    "upper_frame_protection",
    "Проверена верхняя рамка и соседние объяснения",
    !needsFullDiagnosticDiscipline || assessUpperFrameProtection(decision, context),
    "Нижний симптом нельзя автоматически считать корнем, пока не проверена верхняя логика."
  );
  addCriterion(
    criteria,
    "alternative_hypotheses",
    "Система держит альтернативы, а не одну преждевременную версию",
    isLightTask || hypotheses.length >= 2 || context.intentIntegrity?.integrityType === "proposed_solution",
    "Сначала 2-3 версии, затем выбор основной или один вопрос, который их разделяет."
  );
  addCriterion(
    criteria,
    "cause_effect_separation",
    "Причина отделена от симптома и следствия",
    isLightTask || context.intentIntegrity?.integrityType === "proposed_solution" || assessCauseEffect(decision),
    "Пользователь может принести симптом, а не корень."
  );
  addCriterion(
    criteria,
    "confidence_calibration",
    "Уверенность откалибрована",
    assessConfidence(decision, context),
    "AI-BOSS должен понимать, где гипотеза, а где уже подтверждённый вывод."
  );
  addCriterion(
    criteria,
    "one_next_move",
    "Выбран один следующий ход",
    assessOneNextMove(decision),
    "Бот ведёт не списком советов, а одним проверочным шагом."
  );
  addCriterion(
    criteria,
    "parallel_safety",
    "Параллельные полезные действия не подменяют корневую гипотезу",
    assessParallelSafety(decision, context),
    "Финансы, роли и отчётность можно запускать параллельно, но это не всегда главный корень."
  );
  addCriterion(
    criteria,
    "human_surface",
    "Ответ звучит по-человечески и без внутренних технических полей",
    assessHumanSurface(decision),
    "Даже сильная логика должна быть понятна владельцу или консультанту в живом диалоге."
  );

  const passedCount = criteria.reduce((sum, item) => sum + item.score, 0);
  const score10 = Math.round((passedCount / criteria.length) * 10);
  const missing = criteria.filter((item) => !item.passed).map((item) => item.title);

  return {
    score10,
    targetScore10: 10,
    level: score10 >= 10
      ? "10/10 chat diagnostic behavior"
      : score10 >= 9
      ? "near-expert chat diagnostic behavior"
      : score10 >= 8
      ? "strong chat diagnostic behavior"
      : "needs chat diagnostic strengthening",
    criteria,
    missing,
    principle: "Low data reduces certainty, not diagnostic discipline."
  };
}
