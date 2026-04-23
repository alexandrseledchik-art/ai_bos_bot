import { loadCausalGraph } from "../infrastructure/graph/load-graph.js";

const { nodes: CAUSAL_GRAPH_NODES, edges: CAUSAL_GRAPH_EDGES } = loadCausalGraph();
const nodeById = new Map(CAUSAL_GRAPH_NODES.map((item) => [item.id, item]));

function normalizeText(value) {
  return String(value || "").trim();
}

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function uniqueStrings(items, maxItems = 8) {
  return [...new Set(toArray(items).map((item) => normalizeText(item)).filter(Boolean))].slice(0, maxItems);
}

function scoreMapToRankedList(scoreMap, supportedByMap, limit = 5) {
  return [...scoreMap.entries()]
    .map(([id, score]) => {
      const node = nodeById.get(id);
      if (!node) {
        return null;
      }

      return {
        id,
        type: node.type,
        label: node.label,
        description: node.description,
        domains: node.domains,
        layer: node.layer,
        score: clamp(Number(score.toFixed(3))),
        supportedBy: [...(supportedByMap.get(id) || [])]
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}

function addSupport(targetMap, supportMap, edge, weight, sourceId) {
  targetMap.set(edge.to, (targetMap.get(edge.to) || 0) + weight);

  if (!supportMap.has(edge.to)) {
    supportMap.set(edge.to, new Set());
  }
  if (sourceId) {
    supportMap.get(edge.to).add(sourceId);
  }
}

function buildQuestionObject(question, separates, whyUseful, informationGain) {
  return {
    signal: question,
    question,
    separates,
    whyUseful,
    informationGain: clamp(informationGain)
  };
}

function layerPriority(layer) {
  const order = {
    strategy: 1,
    commercial: 0.92,
    finance: 0.9,
    operations: 0.76,
    management: 0.72,
    people: 0.68
  };

  return order[layer] || 0.65;
}

function isLeadFlowScenario(observedSignals, extracted) {
  const text = normalizeText(extracted?.claimedProblem || extracted?.observations?.[0]?.evidence || "");
  return observedSignals.includes("lead_overload") ||
    observedSignals.includes("slow_first_response") ||
    (/лид|заяв|входящ|продаж/.test(text) && /не усп|долго|ответ|очеред|перегруж|не хватает/.test(text));
}

function claimedCauseLooksLocal(extracted) {
  const claimedCause = normalizeText(extracted?.claimedCause).toLowerCase();
  return /не хватает|люд|продавц|перегруж|ответ|звон|sla|очеред|обработ/.test(claimedCause);
}

function questionLooksUpstream(question) {
  return /icp|сегмент|целев|приоритет|квалификац|канал|рынк|обещан|неразобран|стратег/i.test(question);
}

function questionLooksLocal(question) {
  return /sla|владелец|кто отвечает|кто должен|очеред|сколько.*минут|сколько.*час|срок|перв[ао]й\s+(звон|ответ|контакт|касани)|ownership/i.test(question);
}

function upstreamResolutionObserved(observedSignals, extracted) {
  const text = normalizeText(extracted?.claimedProblem || extracted?.observations?.map((item) => item?.evidence).join(" ") || "");
  return observedSignals.includes("mixed_inbound_confirmed") ||
    observedSignals.includes("qualification_missing_confirmed") ||
    observedSignals.includes("priority_rules_missing") ||
    observedSignals.includes("target_leads_confirmed") ||
    /icp|квалификац|предквалификац|приоритет|сегмент|всё подряд|смешан|неразобран|целев/i.test(text);
}

function buildQuestionCandidates({ candidateStates, candidateCauses, observedSignals, extracted }) {
  const leadFlowScenario = isLeadFlowScenario(observedSignals, extracted);
  const localClaimedCause = claimedCauseLooksLocal(extracted);
  const upstreamResolved = upstreamResolutionObserved(observedSignals, extracted);
  const candidates = [];

  const pushQuestion = (item, type, index, separates) => {
    const question = nodeById.get(item.id)?.relatedQuestions?.[0];
    if (!question) {
      return;
    }

    let priority = Number(item.score || 0) + layerPriority(item.layer) * 0.08;

    if (type === "cause") {
      priority += 0.08;
    }
    if (index === 0) {
      priority += 0.04;
    }
    if (leadFlowScenario && questionLooksUpstream(question)) {
      priority += upstreamResolved ? 0.06 : 0.24;
    }
    if (leadFlowScenario && localClaimedCause && (item.layer === "strategy" || item.layer === "commercial")) {
      priority += 0.14;
    }
    if (leadFlowScenario && questionLooksLocal(question)) {
      priority -= upstreamResolved ? 0.05 : 0.18;
    }

    candidates.push({
      question,
      type,
      layer: item.layer,
      nodeId: item.id,
      label: item.label,
      priority,
      separates,
      whyUseful:
        type === "cause"
          ? "Этот вопрос проверяет более верхний слой причины и не даёт слишком рано застрять в локальной версии."
          : "Этот вопрос отделяет ближайшие состояния системы и помогает не спутать перегруз с конструкцией."
    });
  };

  candidateStates.slice(0, 3).forEach((item, index) => {
    pushQuestion(
      item,
      "state",
      index,
      [item.label, candidateStates[index + 1]?.label || candidateCauses[0]?.label].filter(Boolean)
    );
  });

  candidateCauses.slice(0, 3).forEach((item, index) => {
    pushQuestion(
      item,
      "cause",
      index,
      [item.label, candidateCauses[index + 1]?.label || candidateStates[0]?.label].filter(Boolean)
    );
  });

  return candidates
    .sort((left, right) => right.priority - left.priority)
    .slice(0, 4)
    .map((item) =>
      buildQuestionObject(
        item.question,
        item.separates,
        item.whyUseful,
        item.priority
      )
    );
}

export function analyzeWithGraph({ extracted, entryState, memorySummary }) {
  const observedSignals = uniqueStrings([
    ...(extracted?.observedSignals || []),
    ...((entryState?.observedSignals || []).map((item) => normalizeText(item)))
  ], 12);

  const stateScores = new Map();
  const stateSupport = new Map();
  const causeScores = new Map();
  const causeSupport = new Map();
  const interventionScores = new Map();
  const interventionSupport = new Map();
  const graphTrace = [];

  for (const signalId of observedSignals) {
    const outgoing = CAUSAL_GRAPH_EDGES.filter((edge) => edge.from === signalId);
    for (const edge of outgoing) {
      const target = nodeById.get(edge.to);
      if (!target) {
        continue;
      }

      if (target.type === "state" || target.type === "cause") {
        addSupport(target.type === "state" ? stateScores : causeScores,
          target.type === "state" ? stateSupport : causeSupport,
          edge,
          edge.weight,
          signalId);
      }
    }
  }

  for (const [stateId, score] of stateScores.entries()) {
    const outgoing = CAUSAL_GRAPH_EDGES.filter((edge) => edge.from === stateId);
    for (const edge of outgoing) {
      const target = nodeById.get(edge.to);
      if (!target) {
        continue;
      }

      if (target.type === "cause") {
        addSupport(causeScores, causeSupport, edge, score * edge.weight, stateId);

        const supportedSignals = [...(stateSupport.get(stateId) || [])];
        for (const signalId of supportedSignals) {
          graphTrace.push({
            fromSignal: signalId,
            viaState: stateId,
            toCause: edge.to,
            weight: clamp(Number((score * edge.weight).toFixed(3)))
          });
        }
      }

      if (target.type === "intervention") {
        addSupport(interventionScores, interventionSupport, edge, score * edge.weight, stateId);
      }
    }
  }

  for (const [causeId, score] of causeScores.entries()) {
    const outgoing = CAUSAL_GRAPH_EDGES.filter((edge) => edge.from === causeId);
    for (const edge of outgoing) {
      const target = nodeById.get(edge.to);
      if (!target || target.type !== "intervention") {
        continue;
      }

      addSupport(interventionScores, interventionSupport, edge, score * edge.weight, causeId);
    }
  }

  const candidateStates = scoreMapToRankedList(stateScores, stateSupport, 5);
  const candidateCauses = scoreMapToRankedList(causeScores, causeSupport, 5);
  const candidateInterventions = scoreMapToRankedList(interventionScores, interventionSupport, 5).map((item) => ({
    ...item,
    whyUseful: `Полезно, если подтвердится версия "${candidateCauses[0]?.label || candidateStates[0]?.label || "основного ограничения"}".`
  }));

  const topState = candidateStates[0];
  const secondState = candidateStates[1];
  const topCause = candidateCauses[0];
  const secondCause = candidateCauses[1];
  const discriminatingSignals = buildQuestionCandidates({
    candidateStates,
    candidateCauses,
    observedSignals,
    extracted
  });

  const fallbackQuestion = candidateStates[0]
    ? nodeById.get(candidateStates[0].id)?.relatedQuestions?.[0]
    : "";

  const graphConfidence = clamp(
    observedSignals.length
      ? 0.42 + Math.min(observedSignals.length, 4) * 0.1 + (candidateStates[0]?.score || candidateCauses[0]?.score || 0) * 0.2
      : 0.24
  );

  const hypothesisConflicts = uniqueStrings([
    topState && secondState
      ? `Если подтвердится "${topState.label}", версия "${secondState.label}" ослабнет.`
      : "",
    topCause && secondCause
      ? `Если подтвердится "${topCause.label}", версия "${secondCause.label}" станет менее вероятной.`
      : "",
    extracted?.claimedCause && topCause
      ? `Пользовательская причина "${extracted.claimedCause}" пока не равна графовой версии "${topCause.label}".`
      : ""
  ], 4);

  return {
    observedSignals,
    observations: extracted?.observations || [],
    candidateStates,
    candidateCauses,
    candidateInterventions,
    discriminatingSignals: discriminatingSignals.slice(0, 3),
    graphConfidence,
    graphTrace: graphTrace.slice(0, 8),
    hypothesisConflicts,
    suggestedQuestion: discriminatingSignals[0]?.question || fallbackQuestion || "",
    memorySignals: uniqueStrings(memorySummary?.symptoms || [], 6)
  };
}
