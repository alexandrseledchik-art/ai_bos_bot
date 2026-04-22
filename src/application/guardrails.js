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

function composeResponseText(response) {
  const whatIUnderstood = ensureString(response.whatIUnderstood);
  const hypotheses = ensureArray(response.hypotheses, 2).map(trimSentence).filter(Boolean);
  const whyItMatters = ensureString(response.whyItMatters);
  const nextStep = ensureString(response.nextStep);
  const hypothesisLead = hypotheses.length > 1 ? "Сейчас вижу две рабочие версии" : "Сейчас вижу рабочую версию";
  const nextStepLine = /[?]$/.test(nextStep) || /^первый шаг:/i.test(nextStep)
    ? nextStep
    : `Следующий шаг: ${nextStep}`;

  return [
    whatIUnderstood,
    `${hypothesisLead}: ${hypotheses.join("; ")}.`,
    whyItMatters,
    nextStepLine
  ]
    .filter(Boolean)
    .join("\n\n");
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
  if (!entryState.symptoms.length && routeType !== "url_only") {
    entryState.symptoms = ensureArray([context.classification.cleanText], 10);
  }
  entryState.systemLayers = ensureArray(entryState.systemLayers, 6)
    .map((item) => normalizeLayer(item))
    .filter((item, index, items) => items.indexOf(item) === index);
  entryState.candidateConstraints = normalizeCandidateConstraints(entryState.candidateConstraints, 5);
  if (entryState.candidateConstraints.length < 2 && routeType !== "url_only" && routeType !== "url_plus_problem") {
    entryState.candidateConstraints = normalizeCandidateConstraints(
      [...entryState.candidateConstraints, ...inferredConstraints],
      5
    );
  }
  entryState.selectedConstraint = ensureString(entryState.selectedConstraint);
  entryState.signalSufficiency = ensureString(
    entryState.signalSufficiency,
    ensureString(decision.decision?.signalSufficiency, fallback.signalSufficiency)
  );
  entryState.nextBestQuestion = ensureString(entryState.nextBestQuestion);
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

  decision.entryState = normalizeEntryState(decision.entryState, context, decision);
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
    ...decision.entryState.candidateConstraints.map((item) => item.label)
  ], 8);

  if (
    decision.entryState.candidateConstraints.length >= 2 &&
    decision.decision.action === "answer" &&
    decision.entryState.promotionReadiness === "keep_in_entry"
  ) {
    decision.decision.action = "clarify";
    decision.response.nextStep = ensureString(decision.entryState.nextBestQuestion, decision.response.nextStep);
  }

  decision.response.responseText = ensureString(
    decision.response.responseText,
    composeResponseText(decision.response)
  );

  return decision;
}
