function normalize(value) {
  return String(value || "").trim();
}

function unique(items, keyFn, maxItems = Infinity) {
  const result = [];
  const seen = new Set();
  for (const item of items || []) {
    const key = keyFn(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
    if (result.length >= maxItems) break;
  }
  return result;
}

function normalizeHypothesis(item, source) {
  const label = normalize(item?.label);
  if (!label) return null;
  return {
    id: normalize(item?.id),
    label,
    layer: normalize(item?.layer || item?.domains?.[0] || "unknown").toLowerCase(),
    score: Math.max(0, Math.min(1, Number(item?.score ?? item?.confidence ?? 0.5))),
    source
  };
}

function spreadAcrossLayers(items, maxItems = 4) {
  const sorted = [...items].sort((left, right) => right.score - left.score);
  const selected = [];
  const layers = new Set();
  for (const item of sorted) {
    if (layers.has(item.layer)) continue;
    selected.push(item);
    layers.add(item.layer);
    if (selected.length >= maxItems) return selected;
  }
  for (const item of sorted) {
    if (selected.some((selectedItem) => selectedItem.label.toLowerCase() === item.label.toLowerCase())) continue;
    selected.push(item);
    if (selected.length >= maxItems) break;
  }
  return selected;
}

function questionLooksLikeObservableSignal(question) {
  const text = normalize(question).toLowerCase();
  if (!text || /как вы думаете|в ч[её]м причина|что является причиной|какая версия|выберите причину/.test(text)) return false;
  return /сколько|когда|где|кто|как часто|по последн|что происходит|что видно|есть ли|за какое время|какой процент|каким правилом/.test(text);
}

function questionCandidates(context) {
  const graphQuestions = (context.graphPacket?.discriminatingSignals || []).map((item) => ({
    question: normalize(item?.question),
    informationGain: Number(item?.informationGain ?? 0.5),
    source: "causal_graph"
  }));
  const additional = [
    { question: normalize(context.dataSufficiency?.minimumQuestion), informationGain: 0.8, source: "data_sufficiency" },
    { question: normalize(context.referenceGate?.minimumQuestion), informationGain: 0.7, source: "reference_gate" },
    { question: normalize(context.graphPacket?.suggestedQuestion), informationGain: 0.65, source: "causal_graph" }
  ];
  return unique(
    [...graphQuestions, ...additional]
      .filter((item) => item.question)
      .sort((left, right) => {
        const signalDifference = Number(questionLooksLikeObservableSignal(right.question)) - Number(questionLooksLikeObservableSignal(left.question));
        return signalDifference || right.informationGain - left.informationGain;
      }),
    (item) => item.question.toLowerCase(),
    5
  );
}

function hasQuantifiedBusinessSignal(text) {
  return /(?:\d[\d\s.,]*\s*(?:%|₽|руб|дн|день|час|мин|месяц|лид|заяв|сделк)|(?:марж|конверс|выруч|прибыл|продаж|срок).{0,35}\d)/i.test(normalize(text));
}

function fallbackObservableQuestion(context) {
  const text = normalize(context.userText).toLowerCase();
  if (/лид|заяв|продаж|конверс/.test(text)) {
    return "Возьмите последние 20 обращений: сколько из них соответствовали вашему целевому клиенту, сколько дошли до первого контакта и на каком шаге остановились остальные?";
  }
  if (/прибыл|марж|деньг|касс|выруч/.test(text)) {
    return "Какая одна цифра изменилась сильнее всего и за какой период: выручка, валовая маржа, постоянные расходы или остаток денег?";
  }
  if (/команд|собственник|операц|процесс|управл/.test(text)) {
    return "Назовите последний конкретный результат, который завис без вашего участия: где он остановился, кто должен был принять решение и сколько это заняло времени?";
  }
  return "Какой последний конкретный факт показывает эту проблему: что произошло, когда и как это повлияло на результат?";
}

function buildEvidenceGate(context, hypotheses) {
  const observedSignalsCount = (context.graphPacket?.observedSignals || []).filter(Boolean).length;
  const graphConfidence = Number(context.graphPacket?.graphConfidence ?? 0);
  const quantifiedSignal = hasQuantifiedBusinessSignal(context.userText);
  const sufficientByChecker = context.dataSufficiency?.canMakeDecision === true;
  const canSelectConstraint = Boolean(sufficientByChecker || (quantifiedSignal && hypotheses.length >= 2 && graphConfidence >= 0.45));
  const reasonCodes = [];
  if (sufficientByChecker) reasonCodes.push("data_sufficiency_allows_decision");
  if (quantifiedSignal) reasonCodes.push("quantified_business_signal");
  if (hypotheses.length < 2) reasonCodes.push("insufficient_competing_hypotheses");
  if (graphConfidence < 0.45) reasonCodes.push("low_graph_confidence");
  if (!canSelectConstraint) reasonCodes.push("one_more_observable_signal_required");
  return {
    observedSignalsCount,
    graphConfidence: Number(graphConfidence.toFixed(2)),
    quantifiedSignal,
    canSelectConstraint,
    reasonCodes
  };
}

function countQuestions(decision) {
  const text = normalize(decision?.response?.responseText || decision?.response?.nextStep);
  return (text.match(/\?/g) || []).length;
}

export class DiagnosticSkillPilot {
  build({ context = {}, selection = null } = {}) {
    if (selection?.primarySkill !== "business_diagnostic") return null;
    const hypotheses = spreadAcrossLayers([
      ...(context.graphPacket?.candidateStates || []).map((item) => normalizeHypothesis(item, "system_state")),
      ...(context.graphPacket?.candidateCauses || []).map((item) => normalizeHypothesis(item, "cause")),
      ...(context.entryState?.candidateConstraints || []).map((item) => normalizeHypothesis(item, "case_memory"))
    ].filter(Boolean));
    const questions = questionCandidates(context);
    const evidenceGate = buildEvidenceGate(context, hypotheses);
    const observableQuestion = questions.find((item) => questionLooksLikeObservableSignal(item.question));
    const requiredSignal = evidenceGate.canSelectConstraint
      ? ""
      : normalize(observableQuestion?.question || fallbackObservableQuestion(context));
    return {
      schemaVersion: "skill_execution_v1",
      enabled: true,
      shadowMode: false,
      route: "business_diagnostic_pilot",
      primarySkill: selection.primarySkill,
      supportingSkills: selection.supportingSkills || [],
      turnGoal: selection.turnGoal,
      completionCondition: selection.completionCondition,
      hypotheses,
      questionCandidates: questions,
      requiredSignal,
      evidenceGate,
      mustAskForSignal: !evidenceGate.canSelectConstraint,
      responsePolicy: {
        maxQuestions: 1,
        userProvidesFactsNotDiagnosis: true,
        allowConstraintSelection: evidenceGate.canSelectConstraint,
        allowNextStep: evidenceGate.canSelectConstraint
      },
      prohibitedActions: selection.prohibitedActions || []
    };
  }

  enforce({ packet = null, decision = null } = {}) {
    if (!packet?.enabled || !decision || !packet.mustAskForSignal) return decision;

    const selectedConstraint = normalize(decision.entryState?.selectedConstraint || decision.memory?.constraint);
    const actionWaveEnabled = decision.memory?.actionWave?.enabled === true;
    const prematureAnswer = decision.decision?.action === "answer";
    if (!selectedConstraint && !actionWaveEnabled && !prematureAnswer) {
      if (decision.response) decision.response.nextStep = packet.requiredSignal;
      if (decision.entryState) decision.entryState.nextBestQuestion = packet.requiredSignal;
      return decision;
    }

    const hypotheses = packet.hypotheses.slice(0, 2).map((item) => item.label).filter(Boolean);
    const fieldSummary = hypotheses.length
      ? `Пока вижу несколько рабочих версий: ${hypotheses.join("; ")}.`
      : "Пока есть несколько возможных объяснений из разных частей системы.";

    decision.decision = {
      ...(decision.decision || {}),
      action: "clarify",
      signalSufficiency: "partial",
      confidence: Math.min(Number(decision.decision?.confidence ?? 0.65), 0.69),
      rationale: "Для выбора ограничения нужен ещё один наблюдаемый факт."
    };
    decision.entryState = {
      ...(decision.entryState || {}),
      selectedConstraint: "",
      nextBestQuestion: packet.requiredSignal,
      promotionReadiness: "keep_in_entry"
    };
    decision.memory = {
      ...(decision.memory || {}),
      constraint: "",
      actionWave: {
        enabled: false,
        firstStep: "",
        notNow: "Не переходить к изменению системы до проверки конкурирующих версий.",
        whyThisFirst: ""
      }
    };
    decision.response = {
      ...(decision.response || {}),
      whatIUnderstood: "Симптом уже виден, но его ближайшее объяснение пока нельзя считать корнем.",
      hypotheses,
      whyItMatters: "Если выбрать причину раньше фактов, можно исправлять локальный сбой и пропустить ограничение выше.",
      nextStep: packet.requiredSignal,
      responseText: `Симптом уже виден, но его ближайшее объяснение пока нельзя считать корнем.\n\n${fieldSummary}\n\n${packet.requiredSignal}`
    };
    return decision;
  }

  assess({ packet = null, decision = null } = {}) {
    if (!packet?.enabled) return null;
    const violations = [];
    const questionCount = countQuestions(decision);
    const selectedConstraint = normalize(decision?.entryState?.selectedConstraint || decision?.memory?.constraint);
    const actionWaveEnabled = decision?.memory?.actionWave?.enabled === true;
    if (questionCount > packet.responsePolicy.maxQuestions) violations.push("more_than_one_question");
    if (!packet.responsePolicy.allowConstraintSelection && selectedConstraint) violations.push("premature_constraint_selection");
    if (!packet.responsePolicy.allowNextStep && actionWaveEnabled) violations.push("premature_action_wave");
    return {
      schemaVersion: "skill_execution_review_v1",
      enabled: true,
      route: packet.route,
      status: violations.length ? "needs_review" : packet.mustAskForSignal ? "waiting_for_user" : "completed",
      criterionMet: violations.length === 0,
      questionCount,
      evidenceGate: packet.evidenceGate,
      violations
    };
  }
}
