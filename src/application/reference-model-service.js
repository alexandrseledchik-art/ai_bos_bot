import {
  getReferenceModelTemplate,
  normalizeReferenceLayerKey
} from "../domain/reference-models.js";

function normalizeText(value) {
  return String(value || "").trim();
}

function lowerText(value) {
  return normalizeText(value).toLowerCase();
}

function uniqueStrings(items = [], maxItems = 12) {
  return [...new Set(items.map((item) => normalizeText(item)).filter(Boolean))].slice(0, maxItems);
}

function collectText(context = {}) {
  const parts = [
    context.userText,
    context.classification?.cleanText,
    context.memorySummary?.goal,
    context.memorySummary?.constraint,
    context.memorySummary?.lastWave?.firstStep,
    context.company?.name,
    context.activeCase?.summary,
    ...(context.entryState?.knownFacts || []),
    ...(context.entryState?.symptoms || []),
    ...(context.observationPacket?.observations || []).map((item) => item?.evidence || item?.label)
  ];

  return lowerText(parts.join(" "));
}

function inferLayersFromText(text) {
  const layers = [];

  if (/касс|деньг|прибыл|марж|выручк|расход|затрат/.test(text)) {
    layers.push("finance");
  }
  if (/лид|заяв|продаж|воронк|клиент|конверс|сделк/.test(text)) {
    layers.push("commercial");
  }
  if (/продукт|ценност|оффер|покуп|отказ|возражен/.test(text)) {
    layers.push("product_value_proposition");
  }
  if (/стратег|фокус|ниш|рынок|сегмент|масштаб|направлен/.test(text)) {
    layers.push("strategy");
  }
  if (/процесс|исполн|срок|очеред|операц|маршрут|передач/.test(text)) {
    layers.push("operating_model");
  }
  if (/команд|люд|сотруд|роль|нанять|директор|не тян|перегруз/.test(text)) {
    layers.push("people_organization");
  }
  if (/решени|ответствен|контрол|ритм|хаос|управл|собственник/.test(text)) {
    layers.push("governance_risks");
  }
  if (/crm|систем|инструмент|автомат|ручн|интеграц|бот/.test(text)) {
    layers.push("technology");
  }
  if (/данн|цифр|отч[её]т|метрик|аналитик|дашборд|верси[яи]\s+правд/.test(text)) {
    layers.push("data_analytics");
  }
  if (/конкур|внешн|закон|регуляц|спрос|санкц|курс/.test(text)) {
    layers.push("external_environment");
  }
  if (/собственник|партн[её]р|выход\s+из\s+операц|вол[яи]|дивиденд/.test(text)) {
    layers.push("owner_context");
  }

  return layers;
}

function candidateLayersFromContext(context = {}) {
  const layers = [
    ...(context.intentIntegrity?.candidateLayers || []),
    ...(context.entryState?.businessLayers || []),
    ...(context.observationPacket?.observations || []).map((item) => item?.businessLayer || item?.layer),
    ...(context.graphPacket?.candidateStates || []).map((item) => item?.layer),
    ...(context.graphPacket?.candidateCauses || []).map((item) => item?.layer),
    ...inferLayersFromText(collectText(context))
  ].map(normalizeReferenceLayerKey);

  return uniqueStrings(layers.filter((layer) => getReferenceModelTemplate(layer)), 5);
}

function partKnown(part, evidenceText) {
  return (part.patterns || []).some((pattern) => pattern.test(evidenceText));
}

function evaluateLayerReference(layerKey, evidenceText) {
  const template = getReferenceModelTemplate(layerKey);
  if (!template) {
    return null;
  }

  const knownParts = [];
  const missingParts = [];

  for (const item of template.parts) {
    if (partKnown(item, evidenceText)) {
      knownParts.push({
        key: item.key,
        title: item.title
      });
    } else {
      missingParts.push({
        key: item.key,
        title: item.title,
        question: item.question
      });
    }
  }

  const knownCount = knownParts.length;
  const totalCount = template.parts.length;
  const referenceExists = knownCount >= Math.ceil(totalCount / 2);
  const minimumViable = knownCount >= 1;
  const firstMissing = missingParts[0];
  const status = referenceExists
    ? "ready"
    : minimumViable
      ? "minimum_viable"
      : "missing";

  return {
    layerKey: template.layerKey,
    layerTitle: template.layerTitle,
    classKey: template.classKey,
    purpose: template.purpose,
    status,
    referenceExists,
    minimumViable,
    knownParts,
    missingParts,
    minimumQuestion: firstMissing?.question || "",
    assumptions: minimumViable && !referenceExists
      ? ["Эталон пока частичный: часть рамки придётся считать рабочим предположением."]
      : [],
    consistencyStatus: "not_checked_in_mvp"
  };
}

function shouldBlockDiagnosis({ integrityType, primaryReference }) {
  if (!primaryReference || primaryReference.referenceExists) {
    return false;
  }

  if (integrityType === "urgent_problem") {
    return false;
  }

  return ["proposed_solution", "interpretation", "strategic_intent"].includes(integrityType);
}

export class ReferenceModelService {
  evaluate(context = {}) {
    const evidenceText = collectText(context);
    const candidateLayers = candidateLayersFromContext(context);

    if (!candidateLayers.length) {
      return {
        status: "no_layer",
        primaryLayer: "",
        candidateLayers: [],
        primaryReference: null,
        candidateReferences: [],
        shouldBlockDiagnosis: false,
        shouldAskForReference: false,
        minimumQuestion: "",
        userFacingNote: "Пока неясно, с каким участком бизнеса сравнивать реальность."
      };
    }

    const candidateReferences = candidateLayers
      .map((layerKey) => evaluateLayerReference(layerKey, evidenceText))
      .filter(Boolean);
    const primaryReference = candidateReferences[0] || null;
    const integrityType = context.intentIntegrity?.integrityType || "";
    const blockDiagnosis = shouldBlockDiagnosis({ integrityType, primaryReference });
    const shouldAskForReference = Boolean(primaryReference && primaryReference.status !== "ready");
    const minimumQuestion = primaryReference?.minimumQuestion || "";

    return {
      status: primaryReference?.status || "missing",
      primaryLayer: primaryReference?.layerKey || "",
      candidateLayers,
      primaryReference,
      candidateReferences,
      shouldBlockDiagnosis: blockDiagnosis,
      shouldAskForReference,
      minimumQuestion,
      userFacingNote: primaryReference
        ? `Перед выводом по области «${primaryReference.layerTitle}» нужно понимать эталон: ${primaryReference.purpose}`
        : "Перед выводом нужно понять, с чем сравниваем реальность."
    };
  }
}
