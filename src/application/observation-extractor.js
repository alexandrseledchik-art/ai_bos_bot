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

  if (/люд[а-я]*\s+не\s+хватает/i.test(normalized)) {
    return "не хватает людей";
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

  const claimedCause = detectClaimedCause(text) || normalizeText(entryState?.claimedCause);
  const normalizedObservations = uniqueBy(observations, (item) => item.signalId);
  const observedSignals = normalizedObservations.map((item) => item.signalId);

  return {
    observations: normalizedObservations,
    observedSignals,
    claimedProblem: normalizeText(entryState?.claimedProblem || classification.cleanText || text),
    claimedCause,
    memorySymptoms: Array.isArray(memorySummary?.symptoms) ? memorySummary.symptoms : []
  };
}
