import { ENTRY_PROMOTION_STATES, SYSTEM_LAYERS, emptyEntryState } from "../domain/entities.js";

function ensureArray(value, maxItems = 6) {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(value.map((item) => String(item || "").trim()).filter(Boolean))].slice(0, maxItems);
}

function ensureString(value, fallback = "") {
  return String(value || fallback).trim();
}

function clampConfidence(value, fallback = 0.55) {
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    return fallback;
  }
  return Math.max(0, Math.min(1, parsed));
}

function trimSentence(value) {
  return ensureString(value).replace(/[.?!…]+$/u, "");
}

function ensureSentence(value) {
  const normalized = ensureString(value);
  if (!normalized) {
    return "";
  }

  return /[.?!…:]$/u.test(normalized) ? normalized : `${normalized}.`;
}

function normalizeLayer(value, fallback = "management") {
  const normalized = ensureString(value, fallback).toLowerCase();
  return SYSTEM_LAYERS.includes(normalized) ? normalized : fallback;
}

function normalizeCandidateConstraints(value, maxItems = 5) {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set();
  const result = [];

  for (const item of value) {
    const label = ensureString(item?.label);
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
      layer: normalizeLayer(item?.layer),
      confidence: clampConfidence(item?.confidence, 0.45),
      whyPossible: ensureString(item?.whyPossible, "Эта версия пока выглядит правдоподобной гипотезой."),
      whatWouldDisprove: ensureString(
        item?.whatWouldDisprove,
        "Нужен вопрос или факт, который отделит эту версию от остальных."
      )
    });

    if (result.length >= maxItems) {
      break;
    }
  }

  return result;
}

function normalizeGraphRankedItems(value, maxItems = 5) {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set();
  const result = [];

  for (const item of value) {
    const id = ensureString(item?.id);
    const label = ensureString(item?.label);
    if (!id || !label || seen.has(id)) {
      continue;
    }

    seen.add(id);
    result.push({
      id,
      label,
      layer: normalizeLayer(item?.layer),
      domains: ensureArray(item?.domains, 6),
      score: clampConfidence(item?.score, 0.45),
      supportedBy: ensureArray(item?.supportedBy, 6),
      whyUseful: ensureString(item?.whyUseful)
    });

    if (result.length >= maxItems) {
      break;
    }
  }

  return result;
}

function normalizeDiscriminatingSignals(value, maxItems = 4) {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set();
  const result = [];

  for (const item of value) {
    const question = ensureString(item?.question);
    if (!question || seen.has(question)) {
      continue;
    }

    seen.add(question);
    result.push({
      signal: ensureString(item?.signal, question),
      question,
      separates: ensureArray(item?.separates, 4),
      whyUseful: ensureString(item?.whyUseful, "Этот сигнал лучше всего отделяет ближайшие конкурирующие версии."),
      informationGain: clampConfidence(item?.informationGain, 0.55)
    });

    if (result.length >= maxItems) {
      break;
    }
  }

  return result;
}

function normalizeGraphTrace(value, maxItems = 8) {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set();
  const result = [];

  for (const item of value) {
    const fromSignal = ensureString(item?.fromSignal);
    const viaState = ensureString(item?.viaState);
    const toCause = ensureString(item?.toCause);
    const key = `${fromSignal}:${viaState}:${toCause}`;

    if (!fromSignal || !viaState || !toCause || seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push({
      fromSignal,
      viaState,
      toCause,
      weight: clampConfidence(item?.weight, 0.45)
    });

    if (result.length >= maxItems) {
      break;
    }
  }

  return result;
}

function joinParagraphs(parts) {
  return parts
    .map((item) => ensureString(item))
    .filter(Boolean)
    .join("\n\n");
}

function humanizeConstraintLabel(value) {
  const normalized = trimSentence(value);
  if (!normalized) {
    return "";
  }

  return normalized.charAt(0).toLowerCase() + normalized.slice(1);
}

function stripVisibleTemplateLabels(text) {
  return ensureString(text)
    .replace(/^что я понял:\s*/i, "")
    .replace(/^гипотезы:\s*/i, "")
    .replace(/^почему это важно:\s*/i, "")
    .replace(/^следующий шаг:\s*/i, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function looksMechanicalResponse(text) {
  const normalized = ensureString(text).toLowerCase();
  if (!normalized) {
    return true;
  }

  const patterns = [
    /^что я понял:/i,
    /^гипотезы:/i,
    /^почему это важно:/i,
    /^следующий шаг:/i,
    /сейчас вижу две рабочие версии/i,
    /сейчас вижу рабочую версию/i
  ];

  return patterns.some((pattern) => pattern.test(normalized));
}

function buildWebsiteSurfaceResponse(response) {
  return joinParagraphs([
    `${ensureSentence(response.whatIUnderstood)} ${ensureSentence(response.whyItMatters)}`,
    ensureString(response.nextStep)
  ]);
}

function buildVagueSurfaceResponse(response) {
  return joinParagraphs([
    `${ensureSentence(response.whatIUnderstood)} ${ensureSentence(response.whyItMatters)}`,
    ensureString(response.nextStep)
  ]);
}

function buildDiagnosticClarifySurfaceResponse(response, entryState, context) {
  const claimedCause = ensureString(entryState.claimedCause);
  const constraints = Array.isArray(entryState.candidateConstraints) ? entryState.candidateConstraints.slice(0, 5) : [];
  const strongestAlternative = humanizeConstraintLabel(constraints[0]?.label);
  const secondAlternative = humanizeConstraintLabel(constraints[1]?.label);

  if (userLikelyClaimedCause(context, entryState) && claimedCause) {
    const alternatives = [strongestAlternative, secondAlternative].filter(Boolean);
    const alternativesLine = alternatives.length >= 2
      ? `Здесь легко перепутать это с тем, что ${alternatives[0]} или что ${alternatives[1]}.`
      : ensureSentence(response.whyItMatters);

    return joinParagraphs([
      `Я бы пока не фиксировал причину в том, что ${claimedCause}. Это пока версия пользователя, а не доказанное ограничение системы. ${ensureSentence(response.whyItMatters)}`,
      alternativesLine,
      ensureString(response.nextStep)
    ]);
  }

  if (strongestAlternative && secondAlternative) {
    return joinParagraphs([
      `${ensureSentence(response.whatIUnderstood)} Пока сильнее всего выглядят версии, что ${strongestAlternative} или что ${secondAlternative}.`,
      `${ensureSentence(response.whyItMatters)} ${ensureString(response.nextStep)}`
    ]);
  }

  return joinParagraphs([
    ensureSentence(response.whatIUnderstood),
    `${ensureSentence(response.whyItMatters)} ${ensureString(response.nextStep)}`
  ]);
}

function buildAnswerSurfaceResponse(response, entryState) {
  const selectedConstraint = humanizeConstraintLabel(entryState.selectedConstraint);
  const firstParagraph = selectedConstraint
    ? `${ensureSentence(response.whatIUnderstood)} Похоже, сейчас главный рычаг в том, что ${selectedConstraint}.`
    : ensureSentence(response.whatIUnderstood);

  return joinParagraphs([
    firstParagraph,
    `${ensureSentence(response.whyItMatters)} ${ensureString(response.nextStep)}`
  ]);
}

function buildSurfaceResponse(decision, context) {
  const response = decision.response || {};
  const entryState = decision.entryState || emptyEntryState();
  const routeType = context.classification.type;
  const action = ensureString(decision.decision?.action);
  const visibleResponse = stripVisibleTemplateLabels(response.responseText);

  if (visibleResponse && !looksMechanicalResponse(visibleResponse)) {
    return visibleResponse;
  }

  if (decision.selectedMode === "website_screening_mode") {
    return buildWebsiteSurfaceResponse(response);
  }

  if (action === "answer" || action === "diagnose") {
    return buildAnswerSurfaceResponse(response, entryState);
  }

  if (routeType === "free_text_problem") {
    return buildDiagnosticClarifySurfaceResponse(response, entryState, context);
  }

  return buildVagueSurfaceResponse(response);
}

function inferGenericConstraints(context) {
  const text = ensureString(context.userText).toLowerCase();
  const constraints = [];

  if (/заяв|лид/.test(text) && /не усп|люд|ответ|очеред|обработ/.test(text)) {
    constraints.push(
      {
        label: "Поток перегружен нецелевыми или слабо квалифицированными лидами",
        layer: "commercial",
        confidence: 0.58,
        whyPossible: "Большой входящий поток может создавать ложное ощущение нехватки людей, если значимая доля лидов не проходит по ICP.",
        whatWouldDisprove: "Если окажется, что почти все последние лиды были целевыми и достойными быстрого ответа."
      },
      {
        label: "Нет маршрутизации и отдельной роли первого ответа на входящие",
        layer: "management",
        confidence: 0.57,
        whyPossible: "Даже хорошие лиды теряются, когда первый ответ лежит в общей очереди без владельца и SLA.",
        whatWouldDisprove: "Если входящие уже распределяются по роли, SLA соблюдается, а очередь всё равно растёт."
      },
      {
        label: "Реально не хватает мощности на первичную обработку входящего потока",
        layer: "people",
        confidence: 0.54,
        whyPossible: "Если лиды целевые и поток уже организован, то ограничение действительно может быть в capacity команды.",
        whatWouldDisprove: "Если значимая часть перегруза уходит после квалификации или смены маршрутизации."
      }
    );
  } else if (/продаж|сделк|воронк/.test(text)) {
    constraints.push(
      {
        label: "Нет системной модели продаж и понятных стадий воронки",
        layer: "operations",
        confidence: 0.56,
        whyPossible: "Когда стадии и критерии перехода не описаны, симптомы расползаются по сделкам, команде и управлению.",
        whatWouldDisprove: "Если стадии, владельцы и критерии переходов уже описаны и реально используются."
      },
      {
        label: "Проблема сидит в качестве входа, а не в дожиме",
        layer: "commercial",
        confidence: 0.5,
        whyPossible: "Слабый ICP или квалификация могут делать продажи плохими при внешне нормальном объёме входящего потока.",
        whatWouldDisprove: "Если большинство входящих лидов целевые и проходят по ICP."
      }
    );
  } else if (/прибыл|марж|касс|деньг/.test(text)) {
    constraints.push(
      {
        label: "Экономика ломается в unit economics, а не в объёме продаж",
        layer: "finance",
        confidence: 0.57,
        whyPossible: "Падение прибыли часто связано с качеством спроса, скидками, себестоимостью или CAC, а не только с объёмом.",
        whatWouldDisprove: "Если unit economics по каналам и продуктам уже прозрачны и не показывают утечки."
      },
      {
        label: "Коммерческий вход даёт выручку, но не ту маржу, на которой бизнес должен расти",
        layer: "commercial",
        confidence: 0.49,
        whyPossible: "Бизнес может расти по выручке, но упираться в низкое качество спроса или слабое предложение.",
        whatWouldDisprove: "Если прибыльность по сегментам стабильна и причина явно в операционных расходах."
      }
    );
  } else {
    constraints.push(
      {
        label: "Пользователь видит локальную боль, но системное ограничение лежит уровнем выше",
        layer: "management",
        confidence: 0.48,
        whyPossible: "На входе пока больше жалоба, чем системная картина, поэтому ближайшее объяснение может оказаться ложным.",
        whatWouldDisprove: "Если одна и та же причина уже подтверждена несколькими независимыми фактами."
      },
      {
        label: "Ограничение находится в слое, который пока не назван прямо",
        layer: "operations",
        confidence: 0.44,
        whyPossible: "Симптом часто проявляется в одном контуре, а держится на другом.",
        whatWouldDisprove: "Если текущий симптом уже объясняет несколько других симптомов без противоречий."
      }
    );
  }

  return constraints;
}

function normalizeEntryState(rawEntryState, context, decision) {
  const fallback = emptyEntryState();
  const entryState = rawEntryState && typeof rawEntryState === "object" ? structuredClone(rawEntryState) : {};
  const routeType = context.classification.type;
  const screen = context.screening?.[0];
  const inferredConstraints = inferGenericConstraints(context);

  entryState.claimedProblem = ensureString(
    entryState.claimedProblem,
    routeType === "url_only" ? "Понять внешний контур сайта." : context.classification.cleanText
  );
  entryState.claimedCause = ensureString(entryState.claimedCause);
  entryState.knownFacts = ensureArray(entryState.knownFacts, 8);
  entryState.symptoms = ensureArray(entryState.symptoms, 10);
  entryState.observedSignals = ensureArray(entryState.observedSignals, 12);
  if (!entryState.symptoms.length && routeType !== "url_only") {
    entryState.symptoms = ensureArray([context.classification.cleanText], 10);
  }
  if (!entryState.observedSignals.length) {
    entryState.observedSignals = ensureArray(context.graphPacket?.observedSignals, 12);
  }
  entryState.systemLayers = ensureArray(entryState.systemLayers, 6)
    .map((item) => normalizeLayer(item))
    .filter((item, index, items) => items.indexOf(item) === index);
  entryState.candidateConstraints = normalizeCandidateConstraints(entryState.candidateConstraints, 5);
  entryState.candidateStates = normalizeGraphRankedItems(entryState.candidateStates, 5);
  entryState.candidateCauses = normalizeGraphRankedItems(entryState.candidateCauses, 5);
  if (entryState.candidateConstraints.length < 2 && routeType !== "url_only" && routeType !== "url_plus_problem") {
    entryState.candidateConstraints = normalizeCandidateConstraints(
      [...entryState.candidateConstraints, ...inferredConstraints],
      5
    );
  }
  if (!entryState.candidateStates.length) {
    entryState.candidateStates = normalizeGraphRankedItems(context.graphPacket?.candidateStates, 5);
  }
  if (!entryState.candidateCauses.length) {
    entryState.candidateCauses = normalizeGraphRankedItems(context.graphPacket?.candidateCauses, 5);
  }
  entryState.selectedConstraint = ensureString(entryState.selectedConstraint);
  entryState.graphTrace = normalizeGraphTrace(entryState.graphTrace, 8);
  entryState.discriminatingSignals = normalizeDiscriminatingSignals(entryState.discriminatingSignals, 4);
  entryState.graphConfidence = clampConfidence(
    entryState.graphConfidence,
    clampConfidence(context.graphPacket?.graphConfidence, 0.3)
  );
  entryState.hypothesisConflicts = ensureArray(entryState.hypothesisConflicts, 6);
  if (!entryState.graphTrace.length) {
    entryState.graphTrace = normalizeGraphTrace(context.graphPacket?.graphTrace, 8);
  }
  if (!entryState.discriminatingSignals.length) {
    entryState.discriminatingSignals = normalizeDiscriminatingSignals(context.graphPacket?.discriminatingSignals, 4);
  }
  if (!entryState.hypothesisConflicts.length) {
    entryState.hypothesisConflicts = ensureArray(context.graphPacket?.hypothesisConflicts, 6);
  }
  entryState.signalSufficiency = ensureString(
    entryState.signalSufficiency,
    ensureString(decision.decision?.signalSufficiency, fallback.signalSufficiency)
  );
  entryState.nextBestQuestion = ensureString(entryState.nextBestQuestion);
  if (!entryState.nextBestQuestion) {
    entryState.nextBestQuestion = ensureString(
      context.graphPacket?.suggestedQuestion,
      entryState.discriminatingSignals[0]?.question
    );
  }
  entryState.nextBestStep = ensureString(entryState.nextBestStep, decision.response?.nextStep);
  entryState.whyThisStep = ensureString(
    entryState.whyThisStep,
    "Следующий шаг должен лучше разделить конкурирующие ограничения, а не подтвердить ближайшее объяснение."
  );
  entryState.promotionReadiness = ensureString(
    entryState.promotionReadiness,
    entryState.signalSufficiency === "enough" ? "ready_for_diagnostic_case" : fallback.promotionReadiness
  );

  if (!ENTRY_PROMOTION_STATES.includes(entryState.promotionReadiness)) {
    entryState.promotionReadiness = fallback.promotionReadiness;
  }

  if (screen) {
    entryState.knownFacts = ensureArray([...screen.knownFacts, ...entryState.knownFacts], 8);
    entryState.systemLayers = ensureArray(["commercial", "operations", ...entryState.systemLayers], 6);
    entryState.candidateConstraints = normalizeCandidateConstraints(
      [
        ...entryState.candidateConstraints,
        {
          label: "Сайт не доносит ценность и не переводит посетителя в следующий шаг",
          layer: "commercial",
          confidence: 0.62,
          whyPossible: "Во внешнем контуре уже видно обещание и CTA, а проблема может быть в силе оффера или конверсии.",
          whatWouldDisprove: "Если внешний скрининг показывает сильный оффер и конверсия ломается уже после сайта."
        }
      ],
      5
    );
    entryState.promotionReadiness = "ready_for_screening_case";
    entryState.nextBestQuestion = ensureString(
      entryState.nextBestQuestion,
      "Будем разбирать этот сайт как продукт/воронку или пойдём в диагностику бизнеса за ним?"
    );
  }

  return entryState;
}

function normalizeGraphAnalysis(rawGraphAnalysis, context, decision) {
  const graphAnalysis = rawGraphAnalysis && typeof rawGraphAnalysis === "object"
    ? structuredClone(rawGraphAnalysis)
    : {};
  const fallback = context.graphPacket || {};

  graphAnalysis.observedSignals = ensureArray(graphAnalysis.observedSignals, 12);
  if (!graphAnalysis.observedSignals.length) {
    graphAnalysis.observedSignals = ensureArray(fallback.observedSignals, 12);
  }
  graphAnalysis.candidateStates = normalizeGraphRankedItems(graphAnalysis.candidateStates, 5);
  if (!graphAnalysis.candidateStates.length) {
    graphAnalysis.candidateStates = normalizeGraphRankedItems(fallback.candidateStates, 5);
  }
  graphAnalysis.candidateCauses = normalizeGraphRankedItems(graphAnalysis.candidateCauses, 5);
  if (!graphAnalysis.candidateCauses.length) {
    graphAnalysis.candidateCauses = normalizeGraphRankedItems(fallback.candidateCauses, 5);
  }
  graphAnalysis.candidateInterventions = normalizeGraphRankedItems(graphAnalysis.candidateInterventions, 5);
  if (!graphAnalysis.candidateInterventions.length) {
    graphAnalysis.candidateInterventions = normalizeGraphRankedItems(fallback.candidateInterventions, 5);
  }
  graphAnalysis.discriminatingSignals = normalizeDiscriminatingSignals(graphAnalysis.discriminatingSignals, 4);
  if (!graphAnalysis.discriminatingSignals.length) {
    graphAnalysis.discriminatingSignals = normalizeDiscriminatingSignals(fallback.discriminatingSignals, 4);
  }
  graphAnalysis.graphTrace = normalizeGraphTrace(graphAnalysis.graphTrace, 8);
  if (!graphAnalysis.graphTrace.length) {
    graphAnalysis.graphTrace = normalizeGraphTrace(fallback.graphTrace, 8);
  }
  graphAnalysis.graphConfidence = clampConfidence(
    graphAnalysis.graphConfidence,
    clampConfidence(fallback.graphConfidence, 0.3)
  );
  graphAnalysis.hypothesisConflicts = ensureArray(graphAnalysis.hypothesisConflicts, 6);
  if (!graphAnalysis.hypothesisConflicts.length) {
    graphAnalysis.hypothesisConflicts = ensureArray(fallback.hypothesisConflicts, 6);
  }

  return graphAnalysis;
}

function userLikelyClaimedCause(context, entryState) {
  const claimedCause = ensureString(entryState.claimedCause).toLowerCase();
  if (!claimedCause) {
    return false;
  }

  const text = ensureString(context.userText).toLowerCase();
  return text.includes(claimedCause) || /не хватает|проблема в|из-за|потому что/.test(text);
}

export function applyGuardrails(rawDecision, context) {
  const decision = rawDecision && typeof rawDecision === "object" ? structuredClone(rawDecision) : {};
  const routeType = context.classification.type;
  const screen = context.screening?.[0];
  const routeModeMap = {
    url_only: "website_screening_mode",
    free_text_vague: "clarification_mode",
    free_text_problem: "diagnostic_mode"
  };

  decision.selectedMode = routeModeMap[routeType] || decision.selectedMode || "clarification_mode";
  if (routeType === "url_plus_problem" && decision.selectedMode === "diagnostic_mode") {
    decision.selectedMode = "website_screening_mode";
  }

  decision.decision = decision.decision || {};
  decision.decision.confidence = clampConfidence(decision.decision.confidence, 0.58);
  decision.decision.action = ensureString(decision.decision.action, "clarify");
  decision.decision.signalSufficiency = ensureString(decision.decision.signalSufficiency, "partial");
  decision.decision.rationale = ensureString(
    decision.decision.rationale,
    "Следующий шаг выбран по объему сигнала и типу входа."
  );

  decision.response = decision.response || {};
  decision.response.whatIUnderstood = ensureString(
    decision.response.whatIUnderstood,
    "Пока сигнал неполный, но направление запроса уже понятно."
  );
  decision.response.hypotheses = ensureArray(decision.response.hypotheses, 2);
  if (decision.response.hypotheses.length === 0) {
    decision.response.hypotheses = ["Нужно сузить запрос до главного ограничения."];
  }
  decision.response.whyItMatters = ensureString(
    decision.response.whyItMatters,
    "Без фокуса легко перепутать симптом и системное ограничение."
  );
  decision.response.nextStep = ensureString(
    decision.response.nextStep,
    "Скажи, где сейчас болит сильнее всего: прибыль, рост или управляемость?"
  );

  decision.guardrails = decision.guardrails || {};
  decision.guardrails.knownFacts = ensureArray(decision.guardrails.knownFacts, 8);
  decision.guardrails.observations = ensureArray(decision.guardrails.observations, 8);
  decision.guardrails.workingHypotheses = ensureArray(decision.guardrails.workingHypotheses, 8);
  decision.guardrails.canNotAssert = ensureArray(decision.guardrails.canNotAssert, 8);
  decision.guardrails.confidenceNote = ensureString(
    decision.guardrails.confidenceNote,
    "Часть выводов пока остаётся рабочими гипотезами."
  );

  if (screen) {
    decision.guardrails.knownFacts = ensureArray([
      ...screen.knownFacts,
      ...decision.guardrails.knownFacts
    ], 8);
    decision.guardrails.observations = ensureArray([
      ...screen.observations,
      ...decision.guardrails.observations
    ], 8);
    decision.guardrails.canNotAssert = ensureArray([
      "По одному сайту нельзя надежно судить о прибыли, кассе, команде и оргструктуре.",
      ...screen.canNotAssert,
      ...decision.guardrails.canNotAssert
    ], 8);
  }

  decision.graphAnalysis = normalizeGraphAnalysis(decision.graphAnalysis, context, decision);
  decision.entryState = normalizeEntryState(decision.entryState, context, decision);
  if (decision.graphAnalysis.observedSignals.length && !decision.entryState.observedSignals.length) {
    decision.entryState.observedSignals = decision.graphAnalysis.observedSignals;
  }
  if (decision.graphAnalysis.candidateStates.length && !decision.entryState.candidateStates.length) {
    decision.entryState.candidateStates = decision.graphAnalysis.candidateStates;
  }
  if (decision.graphAnalysis.candidateCauses.length && !decision.entryState.candidateCauses.length) {
    decision.entryState.candidateCauses = decision.graphAnalysis.candidateCauses;
  }
  if (decision.graphAnalysis.discriminatingSignals.length && !decision.entryState.discriminatingSignals.length) {
    decision.entryState.discriminatingSignals = decision.graphAnalysis.discriminatingSignals;
  }
  if (decision.graphAnalysis.graphTrace.length && !decision.entryState.graphTrace.length) {
    decision.entryState.graphTrace = decision.graphAnalysis.graphTrace;
  }
  if (decision.graphAnalysis.hypothesisConflicts.length && !decision.entryState.hypothesisConflicts.length) {
    decision.entryState.hypothesisConflicts = decision.graphAnalysis.hypothesisConflicts;
  }
  decision.entryState.graphConfidence = Math.max(
    Number(decision.entryState.graphConfidence || 0),
    Number(decision.graphAnalysis.graphConfidence || 0)
  );
  decision.entryState.signalSufficiency = decision.decision.signalSufficiency;

  if (routeType === "url_only" || routeType === "url_plus_problem") {
    decision.selectedMode = "website_screening_mode";
    decision.decision.action = "screen";
    decision.memory = decision.memory || {};
    decision.memory.caseKind = "preliminary_screening";
    decision.entryState.promotionReadiness = "ready_for_screening_case";
  }

  if (routeType === "free_text_vague" && decision.decision.signalSufficiency === "enough") {
    decision.decision.signalSufficiency = "partial";
    decision.decision.action = "clarify";
    decision.entryState.signalSufficiency = "partial";
    decision.entryState.promotionReadiness = "keep_in_entry";
  }

  if (
    routeType === "free_text_problem" &&
    userLikelyClaimedCause(context, decision.entryState) &&
    decision.entryState.candidateConstraints.length >= 2 &&
    decision.decision.signalSufficiency !== "enough"
  ) {
    const claimed = decision.entryState.claimedCause.toLowerCase();
    const selected = decision.entryState.selectedConstraint.toLowerCase();
    if (selected && (selected === claimed || selected.includes(claimed) || claimed.includes(selected))) {
      decision.decision.action = "clarify";
      decision.entryState.selectedConstraint = "";
      decision.entryState.promotionReadiness = "keep_in_entry";
      decision.response.whyItMatters = ensureString(
        decision.response.whyItMatters,
        "Если принять пользовательскую причину за факт, можно усилить симптом и не дойти до настоящего ограничения."
      );
      decision.response.nextStep = ensureString(
        decision.entryState.nextBestQuestion,
        decision.response.nextStep
      );
    }
  }

  decision.memory = decision.memory || {};
  decision.memory.companyName = ensureString(decision.memory.companyName);
  decision.memory.caseKind = ensureString(
    decision.memory.caseKind,
    decision.selectedMode === "website_screening_mode" ? "preliminary_screening" : "diagnostic_case"
  );
  decision.memory.goal = ensureString(decision.memory.goal);
  decision.memory.symptoms = ensureArray(decision.memory.symptoms, 8);
  decision.memory.hypotheses = ensureArray(decision.memory.hypotheses, 5);
  decision.memory.constraint = ensureString(decision.memory.constraint, decision.entryState.selectedConstraint);
  decision.memory.situation = ensureString(decision.memory.situation);
  decision.memory.actionWave = decision.memory.actionWave || {};
  decision.memory.actionWave.enabled = Boolean(decision.memory.actionWave.enabled);
  decision.memory.actionWave.firstStep = ensureString(decision.memory.actionWave.firstStep, decision.entryState.nextBestStep);
  decision.memory.actionWave.notNow = ensureString(decision.memory.actionWave.notNow);
  decision.memory.actionWave.whyThisFirst = ensureString(
    decision.memory.actionWave.whyThisFirst,
    decision.entryState.whyThisStep
  );
  decision.memory.toolRecommendations = Array.isArray(decision.memory.toolRecommendations)
    ? decision.memory.toolRecommendations
        .slice(0, 3)
        .map((item) => ({
          name: ensureString(item?.name),
          reason: ensureString(item?.reason),
          usageMoment: ensureString(item?.usageMoment)
        }))
        .filter((item) => item.name && item.reason && item.usageMoment)
    : [];
  decision.memory.artifact = decision.memory.artifact || {};
  decision.memory.artifact.shouldSave = Boolean(decision.memory.artifact.shouldSave);
  decision.memory.artifact.title = ensureString(decision.memory.artifact.title);
  decision.memory.artifact.summary = ensureString(decision.memory.artifact.summary);
  decision.memory.artifact.kind = ensureString(
    decision.memory.artifact.kind,
    decision.selectedMode === "website_screening_mode" ? "screening" : "snapshot"
  );

  if (decision.selectedMode === "website_screening_mode") {
    decision.memory.caseKind = "preliminary_screening";
    if (!decision.memory.artifact.title && screen?.url) {
      decision.memory.artifact.title = `External screening: ${screen.url}`;
    }
    if (!decision.memory.artifact.summary) {
      decision.memory.artifact.summary = decision.response.whatIUnderstood;
    }
  }

  if (!decision.memory.goal) {
    decision.memory.goal = decision.entryState.claimedProblem;
  }
  if (!decision.memory.symptoms.length) {
    decision.memory.symptoms = decision.entryState.symptoms.slice(0, 8);
  }
  if (!decision.memory.hypotheses.length) {
    decision.memory.hypotheses = decision.entryState.candidateConstraints.map((item) => item.label).slice(0, 5);
  }
  if (decision.entryState.nextBestStep && !decision.memory.actionWave.firstStep) {
    decision.memory.actionWave.firstStep = decision.entryState.nextBestStep;
  }
  if (
    decision.entryState.whyThisStep &&
    !decision.memory.actionWave.whyThisFirst
  ) {
    decision.memory.actionWave.whyThisFirst = decision.entryState.whyThisStep;
  }

  if (
    !decision.memory.artifact.shouldSave &&
    (decision.selectedMode === "website_screening_mode" ||
      decision.entryState.promotionReadiness === "ready_for_diagnostic_case" ||
      decision.entryState.promotionReadiness === "promoted")
  ) {
    decision.memory.artifact.shouldSave = true;
  }

  if (
    decision.entryState.promotionReadiness === "keep_in_entry" &&
    decision.selectedMode !== "website_screening_mode"
  ) {
    decision.memory.artifact.shouldSave = false;
  }

  decision.guardrails.workingHypotheses = ensureArray([
    ...decision.guardrails.workingHypotheses,
    ...decision.entryState.candidateConstraints.map((item) => item.label),
    ...decision.graphAnalysis.candidateStates.map((item) => item.label),
    ...decision.graphAnalysis.candidateCauses.map((item) => item.label)
  ], 8);

  if (
    decision.entryState.candidateConstraints.length >= 2 &&
    decision.decision.action === "answer" &&
    decision.entryState.promotionReadiness === "keep_in_entry"
  ) {
    decision.decision.action = "clarify";
    decision.response.nextStep = ensureString(decision.entryState.nextBestQuestion, decision.response.nextStep);
  }

  decision.response.responseText = buildSurfaceResponse(decision, context);

  return decision;
}
