import { CAUSAL_GRAPH_NODES } from "../domain/causal-graph.js";

function normalizeText(value) {
  return String(value || "").trim();
}

function uniqueBy(items, keyFn) {
  const result = [];
  const seen = new Set();

  for (const item of items || []) {
    const key = keyFn(item);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(item);
  }

  return result;
}

function isMetaFollowUpText(text) {
  return /что ты имеешь в виду|что именно ты имеешь в виду|в смысле|почему мы идем именно сюда|почему ид[её]м сюда|почему именно этот вопрос|почему|зачем|ок[, ]*а дальше|что дальше|и дальше|что потом|я не уверен|сомневаюсь|не думаю|не похоже/i.test(
    normalizeText(text).toLowerCase()
  );
}

function shouldCarryPreviousClaimedCause(text) {
  return isMetaFollowUpText(text);
}

function detectClaimedCause(text) {
  const normalized = normalizeText(text);
  const patterns = [
    /проблема в\s+([^,.!?]+)/i,
    /не хватает\s+([^,.!?]+)/i,
    /из-за\s+([^,.!?]+)/i,
    /потому что\s+([^,.!?]+)/i
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match?.[1]) {
      return normalizeText(match[1]);
    }
  }

  if (/не\s+справля|не\s+успева|перегруж|тонут/i.test(normalized)) {
    return "";
  }
  if (/люд[а-я]*\s+не\s+хватает/i.test(normalized)) {
    return "не хватает людей";
  }
  if (/продавц[а-я]*\s+не\s+хватает/i.test(normalized)) {
    return "не хватает продавцов";
  }
  if (/менеджер[а-я]*\s+не\s+хватает/i.test(normalized)) {
    return "не хватает менеджеров";
  }
  if (/лиды?\s+плох/i.test(normalized)) {
    return "лиды плохого качества";
  }
  if (/долго\s+отвеча/i.test(normalized)) {
    return "слишком долгий первый ответ";
  }

  return "";
}

function buildObservation(node, text) {
  return {
    signalId: node.id,
    type: node.type,
    label: node.label,
    layer: node.layer,
    domains: node.domains,
    evidence: text
  };
}

export function extractObservations({ userText, classification, entryState, memorySummary }) {
  const text = normalizeText(userText);
  const observations = [];

  for (const node of CAUSAL_GRAPH_NODES) {
    if (node.type !== "symptom") {
      continue;
    }

    if ((node.evidencePatterns || []).some((pattern) => pattern.test(text))) {
      observations.push(buildObservation(node, text));
    }
  }

  if (!observations.length && classification.type === "free_text_problem" && text) {
    observations.push({
      signalId: "user_problem_signal",
      type: "symptom",
      label: text,
      layer: "management",
      domains: ["general"],
      evidence: text
    });
  }

  const explicitClaimedCause = detectClaimedCause(text);
  const claimedCause = explicitClaimedCause || (
    shouldCarryPreviousClaimedCause(text)
      ? normalizeText(entryState?.claimedCause)
      : ""
  );
  const normalizedObservations = uniqueBy(observations, (item) => item.signalId);
  const observedSignals = normalizedObservations.map((item) => item.signalId);
  const currentClaimedProblem = normalizeText(classification.cleanText || text);
  const claimedProblem = classification.type === "free_text_problem" || classification.type === "url_plus_problem"
    ? currentClaimedProblem
    : normalizeText(entryState?.claimedProblem || currentClaimedProblem);

  return {
    observations: normalizedObservations,
    observedSignals,
    claimedProblem,
    claimedCause,
    memorySymptoms: Array.isArray(memorySummary?.symptoms) ? memorySummary.symptoms : []
  };
}
