function normalizeText(value) {
  return String(value || "").trim();
}

function lowerText(value) {
  return normalizeText(value).toLowerCase();
}

function includesAny(text, patterns = []) {
  return patterns.some((pattern) => pattern.test(text));
}

function confidenceToDataLevel(value) {
  const normalized = normalizeText(value).toUpperCase();
  if (normalized === "HIGH") {
    return "high";
  }
  if (normalized === "MEDIUM") {
    return "medium";
  }
  return "low";
}

function uniqueNonEmpty(values = []) {
  return [...new Set(values.map((value) => normalizeText(value)).filter(Boolean))];
}

function collectContextText(context = {}, decision = {}) {
  const entryState = decision.entryState || context.entryState || {};
  return lowerText([
    context.userText,
    context.classification?.cleanText,
    context.intentIntegrity?.proposedSolution,
    context.intentIntegrity?.reason,
    context.dataSufficiency?.reason,
    context.referenceGate?.userFacingNote,
    decision.response?.whatIUnderstood,
    decision.response?.whyItMatters,
    decision.response?.nextStep,
    decision.response?.responseText,
    entryState.claimedProblem,
    entryState.claimedCause,
    entryState.selectedConstraint,
    entryState.nextBestStep,
    entryState.nextBestQuestion,
    ...(entryState.symptoms || []),
    ...((entryState.candidateConstraints || []).map((item) => item?.label))
  ].join(" "));
}

function inferBusinessStateMode(context = {}, decision = {}) {
  const text = collectContextText(context, decision);
  const integrityType = context.intentIntegrity?.integrityType || "";

  if (
    integrityType === "urgent_problem" ||
    includesAny(text, [
      /кассов[а-яё]+\s+разрыв/,
      /ден[её]г\s+хватит\s+на/,
      /деньги\s+заканч/,
      /не\s+чем\s+платить/,
      /зарплат[ау]\s+не\s+можем/,
      /кризис|паник|срочн|выжить/
    ])
  ) {
    return {
      mode: "crisis",
      confidence: "HIGH",
      reason: "Есть срочный риск денег, обязательств или управляемости; приоритет — сохранить время и варианты решений.",
      reasonCodes: uniqueNonEmpty([
        "urgent_problem_signal",
        "cash_or_obligation_risk",
        "cost_of_delay_high"
      ])
    };
  }

  if (
    includesAny(text, [
      /продать\s+бизнес/,
      /подготов.*к\s+продаж[еуы]/,
      /выход\s+из\s+бизнес/,
      /выйти\s+из\s+операцион/,
      /оценк[аи]\s+бизнес/,
      /покупател|инвестор|exit/
    ])
  ) {
    return {
      mode: "exit_preparation",
      confidence: "HIGH",
      reason: "Запрос связан с продажей, выходом собственника или повышением переносимости бизнеса.",
      reasonCodes: uniqueNonEmpty([
        "exit_or_owner_independence_request",
        "transferability_required",
        "strategic_horizon"
      ])
    };
  }

  if (
    integrityType === "strategic_intent" ||
    includesAny(text, [
      /нов[а-яё]+\s+ниш/,
      /нов[а-яё]+\s+рынок/,
      /нов[а-яё]+\s+сегмент/,
      /сменить\s+направлен/,
      /pivot|пивот/,
      /пересобрать\s+модель/,
      /нов[а-яё]+\s+стратег/
    ])
  ) {
    return {
      mode: "rebuild",
      confidence: "MEDIUM",
      reason: "Запрос похож на выбор или пересборку игры: сначала проверяется верхняя рамка, рынок и стратегический выбор.",
      reasonCodes: uniqueNonEmpty([
        "strategic_intent_or_new_market",
        "upper_frame_required",
        "business_model_rebuild"
      ])
    };
  }

  if (
    includesAny(text, [
      /рост|масштаб/,
      /выручк[а-яё]+\s+раст/,
      /лидов\s+много/,
      /заяв[а-яё]+\s+много/,
      /больше\s+клиент/,
      /не\s+выдерживает\s+рост/,
      /команд[а-яё]+\s+не\s+тян/
    ])
  ) {
    return {
      mode: "growth",
      confidence: "MEDIUM",
      reason: "Есть сигнал роста или потока, который начинает упираться в качество, мощность, экономику или управляемость.",
      reasonCodes: uniqueNonEmpty([
        "growth_or_high_flow_signal",
        "scaling_constraint_possible",
        "capacity_or_quality_risk"
      ])
    };
  }

  if (
    includesAny(text, [
      /хаос|пожар|ручн/,
      /роль|ответствен/,
      /процесс|регламент|операц/,
      /управляем|контрол|ритм/,
      /прибыл|марж|выручк|деньг/,
      /crm|дашборд|отч[её]т|данн/,
      /теря[ею]тся|завис|не\s+успева/
    ])
  ) {
    return {
      mode: "stabilization",
      confidence: "MEDIUM",
      reason: "Сигнал похож на восстановление контроля: роли, процесс, данные, управленческий ритм или передача ответственности.",
      reasonCodes: uniqueNonEmpty([
        "control_gap_signal",
        "process_or_role_or_data_inconsistency",
        "no_immediate_cash_crisis"
      ])
    };
  }

  return {
    mode: "unknown",
    confidence: "LOW",
    reason: "Бизнес-состояние пока не различено; нужен один факт о цели, срочности или текущем режиме компании.",
    reasonCodes: uniqueNonEmpty([
      "insufficient_context",
      "business_state_not_detected"
    ])
  };
}

function inferOperatingMode(context = {}, decision = {}) {
  const text = collectContextText(context, decision);
  const userText = lowerText([
    context.userText,
    context.classification?.cleanText
  ].join(" "));
  const entryMode = context.classification?.entryMode || "";
  const routeType = context.classification?.type || "";
  const integrityType = context.intentIntegrity?.integrityType || "";
  const action = decision.decision?.action || "";

  if (
    entryMode === "meta_role" ||
    includesAny(text, [
      /как\s+работа[её]т\s+метод/,
      /объясни\s+метод/,
      /что\s+такое/,
      /кто\s+ты/,
      /как\s+ты\s+анализиру/
    ])
  ) {
    return {
      mode: "methodology_expert",
      reason: "Пользователь спрашивает о смысле, роли, методологии или понятии.",
      reasonCodes: uniqueNonEmpty([
        "methodology_or_role_question",
        "no_live_case_required"
      ])
    };
  }

  if (
    includesAny(userText, [
      /кто\s+делает/,
      /кто\s+ответствен/,
      /статус/,
      /дедлайн|срок/,
      /уже\s+сделал/,
      /беру\s+в\s+работу/,
      /назначить|исполнител/
    ])
  ) {
    return {
      mode: "execution_coordinator",
      reason: "Запрос относится к исполнению, владельцу действия, статусу или контролю результата.",
      reasonCodes: uniqueNonEmpty([
        "execution_status_or_owner_question",
        "management_follow_up"
      ])
    };
  }

  if (
    includesAny(text, [
      /стратегическ[а-яё]+\s+ревиз/,
      /правильн[а-яё]+\s+игр/,
      /куда\s+движ/,
      /выбор\s+направлен/,
      /продать\s+бизнес/,
      /продаж[аеуы]\s+бизнес/,
      /бизнес.*продаж[аеуы]/,
      /выход\s+из\s+операц/,
      /переносим/
    ])
  ) {
    return {
      mode: "strategic_reviewer",
      reason: "Запрос требует проверки верхней рамки, направления, игры или переносимости бизнеса.",
      reasonCodes: uniqueNonEmpty([
        "strategic_frame_review_required",
        "upper_layer_decision"
      ])
    };
  }

  if (
    integrityType === "urgent_problem" ||
    integrityType === "strategic_intent" ||
    includesAny(text, [
      /какой\s+путь\s+выбрать/,
      /что\s+приоритет/,
      /риск/,
      /решени[ея]\s+собственник/,
      /цена\s+ошибк/,
      /необратим/
    ])
  ) {
    return {
      mode: "ceo_mode",
      reason: "Нужна управленческая развилка, оценка риска, приоритет или собственническое решение.",
      reasonCodes: uniqueNonEmpty([
        "management_fork_or_risk_decision",
        "owner_authority_likely_required"
      ])
    };
  }

  if (routeType === "free_text_problem" || action === "diagnose" || action === "clarify") {
    return {
      mode: "diagnostician",
      reason: "Пользователь принёс бизнес-сигнал; нужно отделить симптом от причины и выбрать следующий диагностический ход.",
      reasonCodes: uniqueNonEmpty([
        "live_business_signal",
        "cause_effect_separation_required",
        "one_next_diagnostic_move"
      ])
    };
  }

  if (
    entryMode === "tool_discovery" ||
    entryMode === "specific_tool_request" ||
    integrityType === "light_task" ||
    action === "answer"
  ) {
    return {
      mode: "advisor",
      reason: "Можно дать практичную рекомендацию, объяснение инструмента или один следующий ход без тяжёлого цикла.",
      reasonCodes: uniqueNonEmpty([
        "light_task_or_tool_request",
        "low_bureaucracy_mode"
      ])
    };
  }

  return {
    mode: "methodology_expert",
    reason: "По умолчанию безопаснее объяснить рамку и не запускать тяжёлый цикл без сигнала.",
    reasonCodes: uniqueNonEmpty([
      "default_safe_mode",
      "insufficient_live_business_signal"
    ])
  };
}

function inferTimeHorizon({ businessStateMode = "unknown", text = "", action = "" }) {
  if (
    businessStateMode === "crisis" ||
    includesAny(text, [/сегодня|завтра|недел|кассов|срочн|быстро|немедлен/])
  ) {
    return "immediate";
  }
  if (includesAny(text, [/нанять|внедрить|перестроить|структур|crm|автоматиз|регламент/])) {
    return "structural";
  }
  if (businessStateMode === "exit_preparation" || businessStateMode === "rebuild") {
    return "strategic";
  }
  if (action === "clarify") {
    return "immediate";
  }
  if (businessStateMode === "growth" || businessStateMode === "stabilization") {
    return "tactical";
  }
  return "immediate";
}

function inferConstraintOwner({ text = "", entryState = {} }) {
  const layerText = lowerText([
    entryState.selectedConstraint,
    ...((entryState.candidateConstraints || []).map((item) => item?.layer)),
    ...(entryState.businessLayers || []),
    text
  ].join(" "));

  if (/finance|финанс|прибыл|марж|касс|деньг/.test(layerText)) {
    return {
      owner: "собственник / финансы",
      executor: "тот, кто может собрать сделки, расходы, маржу и кассовые данные"
    };
  }
  if (/commercial|коммерц|продаж|лид|заяв|воронк|icp|клиент/.test(layerText)) {
    return {
      owner: "собственник / коммерческий владелец",
      executor: "тот, кто видит источники, квалификацию, статусы и исходы заявок"
    };
  }
  if (/operations|operating|операц|процесс|исполн|передач|срыв/.test(layerText)) {
    return {
      owner: "операционный владелец",
      executor: "тот, кто может восстановить путь задачи, заказа или заявки по этапам"
    };
  }
  if (/team|people|команд|роль|ответствен|нагруз/.test(layerText)) {
    return {
      owner: "собственник / руководитель функции",
      executor: "тот, кто может разложить реальные задачи по ролям и владельцам результата"
    };
  }
  if (/technology|data|аналит|данн|crm|отч[её]т/.test(layerText)) {
    return {
      owner: "владелец данных / операционный владелец",
      executor: "тот, кто может показать источник данных, отчёт или текущий инструмент"
    };
  }
  if (/owner_context|external_environment|strategy|стратег|рынок|собственник|сегмент/.test(layerText)) {
    return {
      owner: "собственник",
      executor: "AI-BOSS может подготовить варианты, но выбор остаётся за собственником"
    };
  }

  return {
    owner: "собственник / владелец зоны",
    executor: "тот, кто ближе всего к фактам по текущему потоку"
  };
}

function inferMetric({ text = "", entryState = {} }) {
  const haystack = lowerText([text, entryState.primaryFlow, entryState.constraintType].join(" "));

  if (/касс|прибыл|марж|деньг|finance|cash/.test(haystack)) {
    return "маржа, денежный эффект и причина потери денег по последним сделкам";
  }
  if (/лид|заяв|commercial|leads/.test(haystack)) {
    return "доля целевых заявок, скорость первого ответа, статус и исход по последним входящим";
  }
  if (/операц|процесс|delivery|operations/.test(haystack)) {
    return "место задержки, владелец этапа, срок и результат по последним случаям";
  }
  if (/роль|команд|team|people/.test(haystack)) {
    return "понятность владельца результата, нагрузка и место пересечения ролей";
  }
  if (/стратег|рынок|сегмент|strategy|demand/.test(haystack)) {
    return "ясность выбранного сегмента, ценности, отказов и критерия успеха";
  }
  return "факт, который подтверждает или ломает текущую рабочую гипотезу";
}

function horizonToDeadline(horizon) {
  const mapping = {
    immediate: "0-7 дней",
    tactical: "1-6 недель",
    structural: "1-6 месяцев",
    strategic: "6-24 месяца"
  };
  return mapping[horizon] || "0-7 дней";
}

function horizonToReviewMoment(horizon) {
  const mapping = {
    immediate: "после сбора первого среза фактов",
    tactical: "на ближайшем недельном управленческом разборе",
    structural: "на контрольной точке пилота или внедрения",
    strategic: "после проверки ключевой стратегической гипотезы"
  };
  return mapping[horizon] || "после первого проверочного шага";
}

function inferDecisionRights({ context = {}, businessStateMode = "unknown", operatingMode = "diagnostician", text = "" }) {
  const integrityType = context.intentIntegrity?.integrityType || "";
  const highRisk = businessStateMode === "crisis" ||
    integrityType === "strategic_intent" ||
    includesAny(text, [
      /нанять|уволить/,
      /изменить\s+процесс/,
      /финансов[а-яё]+\s+обязательств/,
      /публичн|репутац/,
      /необратим/,
      /автоматизировать|интеграц/,
      /продать\s+бизнес|инвестор/
    ]);

  if (highRisk) {
    return {
      autonomyLevel: "HIGH_CONFIRMATION_REQUIRED",
      requiresOwnerConfirmation: true,
      reason: "Решение может затронуть риск, деньги, людей, публичность, стратегический выбор или необратимое действие.",
      reasonCodes: uniqueNonEmpty([
        "owner_authority_required",
        "risk_or_irreversibility_possible"
      ])
    };
  }

  if (operatingMode === "execution_coordinator" || operatingMode === "advisor") {
    return {
      autonomyLevel: "MEDIUM",
      requiresOwnerConfirmation: false,
      reason: "Можно рекомендовать следующий шаг, инструмент или безопасную параллельную работу без необратимого действия.",
      reasonCodes: uniqueNonEmpty([
        "safe_recommendation_allowed",
        "no_irreversible_action_detected"
      ])
    };
  }

  return {
    autonomyLevel: "LOW",
    requiresOwnerConfirmation: false,
    reason: "Бот может строить гипотезы, отделять сигналы и предлагать проверку, но не должен сам менять систему.",
    reasonCodes: uniqueNonEmpty([
      "diagnostic_autonomy_only",
      "no_system_change_without_owner"
    ])
  };
}

function inferOwnerDecisionType({ context = {}, businessStateMode = "unknown", text = "" }) {
  const integrityType = context.intentIntegrity?.integrityType || "";

  if (/цен[ауы]|прайс|тариф|скидк|марж|pricing/.test(text)) {
    return "pricing";
  }
  if (/сегмент|ниша|рынок|icp|позиционир|кому\s+прода[её]м/.test(text) || integrityType === "strategic_intent") {
    return "segment";
  }
  if (businessStateMode === "crisis" || /риск|кассов|обязательств|кредит|долг|необратим/.test(text)) {
    return "risk";
  }
  if (/публичн|обещан|гаранти|оффер|заявлени|репутац/.test(text)) {
    return "public_promise";
  }
  if (/процесс|регламент|роль|ответствен|операц|crm|автоматиз|интеграц|назначить/.test(text)) {
    return "process_change";
  }

  return "none";
}

function buildModeSwitch({ context = {}, orchestration = {} }) {
  const from = context.orchestration?.operatingMode || orchestration.operatingMode || "";
  const to = orchestration.operatingMode || from;
  const occurred = Boolean(from && to && from !== to);

  return {
    occurred,
    from,
    to,
    reason: occurred
      ? "После ответа и guardrails изменился тип управленческой задачи."
      : ""
  };
}

function buildUserFacingSummary({ decision = {}, workingHypothesis = "", nextMove = "", orchestration = {} }) {
  if (orchestration.shouldAskOneQuestion) {
    return "Сейчас нужен один уточняющий факт, чтобы не принять инструмент или симптом за причину.";
  }

  if (workingHypothesis && nextMove) {
    return `Рабочая версия: ${workingHypothesis}. Следующий ход: ${nextMove}`;
  }

  return normalizeText(
    decision.response?.whatIUnderstood ||
    decision.response?.nextStep ||
    decision.response?.responseText ||
    "AI-BOSS зафиксировал управленческий ход и готовит следующий проверочный шаг."
  );
}

function buildInternalReasoningSummary({ orchestration = {}, workingHypothesis = "" }) {
  return [
    `business_state=${orchestration.businessStateMode || "unknown"}`,
    `operating_mode=${orchestration.operatingMode || "unknown"}`,
    `data_confidence=${orchestration.dataConfidence || "low"}`,
    `transition=${orchestration.transition || "unknown"}`,
    workingHypothesis ? `primary_hypothesis=${workingHypothesis}` : ""
  ].filter(Boolean).join("; ");
}

export class AIBossModeOrchestrator {
  orchestrate({ context = {}, decision = null, diagnosticQuality = null } = {}) {
    const businessState = inferBusinessStateMode(context, decision || {});
    const operating = inferOperatingMode(context, decision || {});
    const dataConfidence = confidenceToDataLevel(context.dataSufficiency?.confidenceLevel);
    const text = collectContextText(context, decision || {});
    const action = decision?.decision?.action || "";
    const timeHorizon = inferTimeHorizon({
      businessStateMode: businessState.mode,
      text,
      action
    });
    const decisionRights = inferDecisionRights({
      context,
      businessStateMode: businessState.mode,
      operatingMode: operating.mode,
      text
    });
    const ownerDecisionType = inferOwnerDecisionType({
      context,
      businessStateMode: businessState.mode,
      text
    });
    const shouldAskOneQuestion = Boolean(
      context.dataSufficiency?.shouldAskUser ||
      context.referenceGate?.shouldBlockDiagnosis ||
      context.intentIntegrity?.integrityType === "proposed_solution"
    );
    const canAnswerImmediately = Boolean(
      context.intentIntegrity?.integrityType === "light_task" ||
      context.dataSufficiency?.canMakeDecision ||
      action === "answer" ||
      action === "screen"
    );
    const needsDiagnosis = ["diagnostician", "ceo_mode", "strategic_reviewer"].includes(operating.mode) &&
      !context.dataSufficiency?.canMakeDecision;
    const needsExecutionContainer = Boolean(
      decision &&
      ["answer", "diagnose"].includes(action) &&
      !shouldAskOneQuestion &&
      operating.mode !== "methodology_expert"
    );

    return {
      businessStateMode: businessState.mode,
      businessStateConfidence: businessState.confidence,
      businessStateReason: businessState.reason,
      businessStateReasonCodes: businessState.reasonCodes || [],
      operatingMode: operating.mode,
      operatingModeReason: operating.reason,
      operatingModeReasonCodes: operating.reasonCodes || [],
      dataConfidence,
      diagnosticQuality: diagnosticQuality?.score10 ?? decision?.diagnosticQuality?.score10 ?? null,
      timeHorizon,
      shouldAskOneQuestion,
      canAnswerImmediately,
      needsDiagnosis,
      needsExecutionContainer,
      decisionRights,
      ownerDecisionRequired: Boolean(decisionRights.requiresOwnerConfirmation || ownerDecisionType !== "none"),
      ownerDecisionType,
      reasonCodes: uniqueNonEmpty([
        ...(businessState.reasonCodes || []),
        ...(operating.reasonCodes || []),
        ...(decisionRights.reasonCodes || [])
      ]),
      transition: needsExecutionContainer
        ? "diagnosis_to_execution"
        : shouldAskOneQuestion
          ? "ask_one_question"
          : canAnswerImmediately
            ? "answer_now"
            : "continue_diagnosis"
    };
  }

  buildExecutionContainer({ context = {}, decision = {}, orchestration = {} } = {}) {
    const entryState = decision.entryState || {};
    const text = collectContextText(context, decision);
    const ownership = inferConstraintOwner({ text, entryState });
    const timeHorizon = orchestration.timeHorizon || inferTimeHorizon({
      businessStateMode: orchestration.businessStateMode,
      text,
      action: decision.decision?.action
    });

    return {
      owner: ownership.owner,
      executor: ownership.executor,
      timeHorizon,
      deadline: horizonToDeadline(timeHorizon),
      inputData: normalizeText(decision.response?.nextStep || entryState.nextBestStep || entryState.nextBestQuestion),
      metric: inferMetric({ text, entryState }),
      successCriteria: "получен факт, который подтверждает, ослабляет или меняет рабочую гипотезу",
      failureCriteria: "факт не получен, данные противоречат версии или найдено более сильное объяснение",
      reviewMoment: horizonToReviewMoment(timeHorizon)
    };
  }

  buildDecisionObject({ context = {}, decision = {}, activeCase = null, company = null } = {}) {
    const orchestration = decision.orchestration || this.orchestrate({
      context,
      decision,
      diagnosticQuality: decision.diagnosticQuality
    });
    const entryState = decision.entryState || {};
    const nextMove = normalizeText(decision.response?.nextStep || entryState.nextBestStep || entryState.nextBestQuestion);
    const executionContainer = orchestration.needsExecutionContainer
      ? this.buildExecutionContainer({ context, decision, orchestration })
      : {
          owner: "",
          executor: "",
          timeHorizon: orchestration.timeHorizon || "immediate",
          deadline: "",
          inputData: "",
          metric: "",
          successCriteria: "",
          failureCriteria: "",
          reviewMoment: ""
        };

    const workingHypothesis = normalizeText(
      entryState.selectedConstraint ||
      decision.memory?.constraint ||
      entryState.candidateConstraints?.[0]?.label ||
      decision.response?.hypotheses?.[0] ||
      ""
    );

    return {
      schemaVersion: "decision_object_v1",
      companyId: company?.id || context.company?.id || "",
      caseId: activeCase?.id || context.activeCase?.id || "",
      businessStateMode: orchestration.businessStateMode,
      businessStateConfidence: orchestration.businessStateConfidence,
      businessStateReason: orchestration.businessStateReason,
      operatingMode: orchestration.operatingMode,
      operatingModeReason: orchestration.operatingModeReason,
      dataConfidence: orchestration.dataConfidence,
      diagnosticQuality: decision.diagnosticQuality?.score10 ?? orchestration.diagnosticQuality ?? null,
      hiddenEvaluation: {
        diagnosticQuality: decision.diagnosticQuality?.score10 ?? orchestration.diagnosticQuality ?? null,
        dataConfidence: orchestration.dataConfidence,
        businessStateConfidence: orchestration.businessStateConfidence
      },
      reasonCodes: orchestration.reasonCodes || [],
      reasonCodesByLayer: {
        businessState: orchestration.businessStateReasonCodes || [],
        operatingMode: orchestration.operatingModeReasonCodes || [],
        decisionRights: orchestration.decisionRights?.reasonCodes || []
      },
      decisionRights: orchestration.decisionRights,
      ownerDecisionRequired: Boolean(orchestration.ownerDecisionRequired),
      ownerDecisionType: orchestration.ownerDecisionType || "none",
      modeSwitch: buildModeSwitch({ context, orchestration }),
      transition: orchestration.transition,
      shouldAskOneQuestion: orchestration.shouldAskOneQuestion,
      needsExecutionContainer: orchestration.needsExecutionContainer,
      workingHypothesis,
      nextMove,
      executionContainer,
      userFacingSummary: buildUserFacingSummary({
        decision,
        workingHypothesis,
        nextMove,
        orchestration
      }),
      internalReasoningSummary: buildInternalReasoningSummary({
        orchestration,
        workingHypothesis
      }),
      evidence: {
        knownFacts: decision.guardrails?.knownFacts || [],
        observations: decision.guardrails?.observations || [],
        canNotAssert: decision.guardrails?.canNotAssert || []
      },
      reviewPolicy: {
        reopenIf: [
          "новые факты противоречат рабочей гипотезе",
          "результат проверки не подтверждает версию",
          "появилась более сильная гипотеза",
          "данные оказались ненадёжными"
        ]
      }
    };
  }
}
