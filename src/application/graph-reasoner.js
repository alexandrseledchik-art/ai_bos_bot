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
  const persistentLeadSignals = new Set([
    "lead_overload",
    "slow_first_response",
    "team_overload_reported",
    "qualification_stage_exists",
    "qualification_stage_overloaded",
    "mixed_inbound_confirmed",
    "qualification_missing_confirmed",
    "priority_rules_missing",
    "qualification_rules_consistent",
    "conversion_uniform_across_team",
    "strategic_icp_doubt",
    "target_leads_confirmed",
    "warm_inbound_demand"
  ]);

  return observedSignals.some((item) => persistentLeadSignals.has(item)) ||
    (/лид|заяв|входящ|продаж/.test(text) && /не усп|долго|ответ|очеред|перегруж|не хватает/.test(text));
}

function claimedCauseLooksLocal(extracted) {
  const claimedCause = normalizeText(extracted?.claimedCause).toLowerCase();
  return /не хватает|люд|продавц|перегруж|не справля|ответ|звон|sla|очеред|обработ/.test(claimedCause);
}

function questionLooksUpstream(question) {
  return /icp|сегмент|целев|приоритет|квалификац|канал|рынк|обещан|неразобран|стратег/i.test(question);
}

function questionLooksLocal(question) {
  return /sla|владелец|кто отвечает|кто должен|очеред|сколько.*минут|сколько.*час|срок|перв[ао]й\s+(звон|ответ|контакт|касани)|ownership/i.test(question);
}

function questionAssumesQualificationMissing(question) {
  return /есть\s+ли\s+до\s+продавца\s+этап\s+квалификац|до\s+продавца\s+вообще\s+есть\s+слой|без\s+отдельной\s+квалификац|этап\s+квалификац.*отсеивает/i.test(
    question
  );
}

function hasTargetFlowConfirmed(observedSignals, extracted) {
  const text = normalizeText(extracted?.claimedProblem || extracted?.observations?.map((item) => item?.evidence).join(" ") || "");
  return observedSignals.includes("target_leads_confirmed") ||
    /почти\s+все\s+целев|все\s+лиды?\s+целев|в\s+основном\s+целев/i.test(text);
}

function qualificationLayerExists(observedSignals, extracted) {
  const text = normalizeText(extracted?.claimedProblem || extracted?.observations?.map((item) => item?.evidence).join(" ") || "");
  return observedSignals.includes("qualification_stage_exists") ||
    /есть\s+менеджер.*квалификац|есть\s+этап.*квалификац|на\s+этапе\s+квалификац|квалификац[ияи].*есть/i.test(text);
}

function qualificationLayerOverloaded(observedSignals, extracted) {
  const text = normalizeText(extracted?.claimedProblem || extracted?.observations?.map((item) => item?.evidence).join(" ") || "");
  return observedSignals.includes("qualification_stage_overloaded") ||
    /квалификац[ияи].*зашива|квалификац[ияи].*перегруж|менеджер.*квалификац.*зашива/i.test(text);
}

function rulesConsistentAcrossTeam(observedSignals, extracted) {
  const text = normalizeText(extracted?.claimedProblem || extracted?.observations?.map((item) => item?.evidence).join(" ") || "");
  return observedSignals.includes("qualification_rules_consistent") ||
    /одни\s+и\s+те\s+же\s+правил|по\s+одн(?:им|ой)\s+и\s+тем\s+же\s+правил|правил[а-я]*\s+у\s+всех\s+одинаков|у\s+всех\s+одинаков[а-я]*\s+правил/i.test(text);
}

function conversionLooksUniformAcrossTeam(observedSignals, extracted) {
  const text = normalizeText(extracted?.claimedProblem || extracted?.observations?.map((item) => item?.evidence).join(" ") || "");
  return observedSignals.includes("conversion_uniform_across_team") ||
    /конверси[яиюе].*у\s+всех.*одинаков|у\s+всех.*конверси[яиюе].*одинаков|конверси[яиюе].*плюс-минус\s+одинаков|плюс-минус\s+одинаков[а-я]*\s+конверси/i.test(text);
}

function strategicIcpDoubtObserved(observedSignals, extracted) {
  const text = normalizeText(extracted?.claimedProblem || extracted?.observations?.map((item) => item?.evidence).join(" ") || "");
  return observedSignals.includes("strategic_icp_doubt") ||
    /неправильн[а-я]*\s+.*icp|неверн[а-я]*\s+.*icp|ошиб[а-я]*\s+.*icp|неправильн[а-я]*\s+сегментац|неверн[а-я]*\s+сегментац|jtbd|job\s+to\s+be\s+done|утп/i.test(text);
}

function hasUpstreamLeadNoiseSignals(observedSignals, extracted) {
  const text = normalizeText(extracted?.claimedProblem || extracted?.observations?.map((item) => item?.evidence).join(" ") || "");
  return observedSignals.includes("mixed_inbound_confirmed") ||
    observedSignals.includes("qualification_missing_confirmed") ||
    observedSignals.includes("priority_rules_missing") ||
    /всё\s+подряд|смешан|неразобран|квалификац|предквалификац|приоритет/i.test(text);
}

function pureStaffingHypothesisAllowed(observedSignals, extracted) {
  return hasTargetFlowConfirmed(observedSignals, extracted) && !hasUpstreamLeadNoiseSignals(observedSignals, extracted);
}

function isStaffingNode(nodeId) {
  return nodeId === "capacity_model_missing" || nodeId === "staffing_not_tied_to_lead_load";
}

function upstreamResolutionObserved(observedSignals, extracted) {
  const text = normalizeText(extracted?.claimedProblem || extracted?.observations?.map((item) => item?.evidence).join(" ") || "");
  return observedSignals.includes("mixed_inbound_confirmed") ||
    observedSignals.includes("qualification_missing_confirmed") ||
    observedSignals.includes("priority_rules_missing") ||
    observedSignals.includes("qualification_rules_consistent") ||
    observedSignals.includes("conversion_uniform_across_team") ||
    observedSignals.includes("strategic_icp_doubt") ||
    observedSignals.includes("target_leads_confirmed") ||
    /icp|квалификац|предквалификац|приоритет|сегмент|всё подряд|смешан|неразобран|целев/i.test(text);
}

function needsStrategicSplit(observedSignals, extracted) {
  const qualificationPresent = qualificationLayerExists(observedSignals, extracted);
  const qualificationOverloaded = qualificationLayerOverloaded(observedSignals, extracted) ||
    observedSignals.includes("team_overload_reported");
  const rulesAligned = rulesConsistentAcrossTeam(observedSignals, extracted);
  const conversionAligned = conversionLooksUniformAcrossTeam(observedSignals, extracted);

  return strategicIcpDoubtObserved(observedSignals, extracted) ||
    (rulesAligned && conversionAligned) ||
    (qualificationPresent && qualificationOverloaded && rulesAligned);
}

function buildQuestionCandidates({ candidateStates, candidateCauses, observedSignals, extracted }) {
  const leadFlowScenario = isLeadFlowScenario(observedSignals, extracted);
  const localClaimedCause = claimedCauseLooksLocal(extracted);
  const upstreamResolved = upstreamResolutionObserved(observedSignals, extracted);
  const staffingAllowed = pureStaffingHypothesisAllowed(observedSignals, extracted);
  const qualificationExists = qualificationLayerExists(observedSignals, extracted);
  const strategicSplit = needsStrategicSplit(observedSignals, extracted);
  const candidates = [];

  if (leadFlowScenario && strategicSplit) {
    candidates.push({
      question:
        "Тогда я бы уже держал две верхние версии: сегментация и ICP изначально выбраны слишком широко, или сегмент в целом верный, но не доведён до рекламы, квалификации, приоритета и передачи дальше. Что у вас ближе?",
      type: "cause",
      layer: "strategy",
      nodeId: "strategic_split",
      label: "Стратегическая развилка между качеством ICP и его operationalization",
      priority: 1.28,
      separates: [
        "Сегментация и ICP выбраны слишком широко",
        "ICP в целом верный, но не доведён до правил маркетинга, квалификации и handoff"
      ],
      whyUseful: "Этот вопрос отделяет ошибку в самой стратегической рамке от ошибки перевода стратегии в коммерческий поток."
    });
  }

  const pushQuestion = (item, type, index, separates) => {
    const question = nodeById.get(item.id)?.relatedQuestions?.[0];
    if (!question) {
      return;
    }
    if (leadFlowScenario && !staffingAllowed && isStaffingNode(item.id)) {
      return;
    }
    if (qualificationExists && questionAssumesQualificationMissing(question)) {
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
    if (leadFlowScenario && qualificationExists && /целев|приоритет|размеченн|вручную|квалификац/i.test(question)) {
      priority += 0.16;
    }
    if (leadFlowScenario && strategicSplit && item.layer === "strategy") {
      priority += 0.22;
    }
    if (leadFlowScenario && strategicSplit && item.layer === "operations") {
      priority -= 0.08;
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

  const leadFlowScenario = isLeadFlowScenario(observedSignals, extracted);
  const qualificationExists = qualificationLayerExists(observedSignals, extracted);
  const qualificationOverloaded = qualificationLayerOverloaded(observedSignals, extracted);
  const sameRules = rulesConsistentAcrossTeam(observedSignals, extracted);
  const sameConversion = conversionLooksUniformAcrossTeam(observedSignals, extracted);
  const strategicDoubt = strategicIcpDoubtObserved(observedSignals, extracted);

  if (leadFlowScenario && !pureStaffingHypothesisAllowed(observedSignals, extracted)) {
    if (stateScores.has("capacity_model_missing")) {
      stateScores.set("capacity_model_missing", stateScores.get("capacity_model_missing") * 0.42);
    }
    if (causeScores.has("staffing_not_tied_to_lead_load")) {
      causeScores.set("staffing_not_tied_to_lead_load", causeScores.get("staffing_not_tied_to_lead_load") * 0.3);
    }
  }

  if (qualificationExists && stateScores.has("no_prequalification_layer")) {
    stateScores.set("no_prequalification_layer", stateScores.get("no_prequalification_layer") * 0.12);
  }
  if (qualificationExists && stateScores.has("weak_lead_qualification")) {
    stateScores.set("weak_lead_qualification", stateScores.get("weak_lead_qualification") * 1.18);
  }
  if (qualificationExists && stateScores.has("sales_processing_non_sales_work")) {
    stateScores.set("sales_processing_non_sales_work", stateScores.get("sales_processing_non_sales_work") * 1.22);
  }
  if (qualificationExists && stateScores.has("uniform_sla_for_mixed_leads")) {
    stateScores.set("uniform_sla_for_mixed_leads", stateScores.get("uniform_sla_for_mixed_leads") * 1.14);
  }
  if (qualificationExists && causeScores.has("icp_defined_but_not_operationalized")) {
    causeScores.set("icp_defined_but_not_operationalized", causeScores.get("icp_defined_but_not_operationalized") * 1.16);
  }
  if (qualificationOverloaded && stateScores.has("sales_processing_non_sales_work")) {
    stateScores.set("sales_processing_non_sales_work", stateScores.get("sales_processing_non_sales_work") * 1.2);
  }
  if (qualificationOverloaded && stateScores.has("weak_lead_qualification")) {
    stateScores.set("weak_lead_qualification", stateScores.get("weak_lead_qualification") * 1.1);
  }
  if (sameRules && causeScores.has("traffic_not_aligned_with_icp")) {
    causeScores.set("traffic_not_aligned_with_icp", causeScores.get("traffic_not_aligned_with_icp") * 1.22);
  }
  if (sameRules && causeScores.has("gtm_not_synced_with_sales_capacity")) {
    causeScores.set("gtm_not_synced_with_sales_capacity", causeScores.get("gtm_not_synced_with_sales_capacity") * 1.18);
  }
  if (sameRules && causeScores.has("rule_exists_but_execution_loop_missing")) {
    causeScores.set("rule_exists_but_execution_loop_missing", causeScores.get("rule_exists_but_execution_loop_missing") * 1.08);
  }
  if (sameConversion && causeScores.has("traffic_not_aligned_with_icp")) {
    causeScores.set("traffic_not_aligned_with_icp", causeScores.get("traffic_not_aligned_with_icp") * 1.28);
  }
  if (sameConversion && causeScores.has("icp_not_defined")) {
    causeScores.set("icp_not_defined", causeScores.get("icp_not_defined") * 1.18);
  }
  if (sameConversion && causeScores.has("staffing_not_tied_to_lead_load")) {
    causeScores.set("staffing_not_tied_to_lead_load", causeScores.get("staffing_not_tied_to_lead_load") * 0.68);
  }
  if (strategicDoubt && causeScores.has("icp_not_defined")) {
    causeScores.set("icp_not_defined", causeScores.get("icp_not_defined") * 1.35);
  }
  if (strategicDoubt && causeScores.has("traffic_not_aligned_with_icp")) {
    causeScores.set("traffic_not_aligned_with_icp", causeScores.get("traffic_not_aligned_with_icp") * 1.28);
  }
  if (strategicDoubt && causeScores.has("gtm_not_synced_with_sales_capacity")) {
    causeScores.set("gtm_not_synced_with_sales_capacity", causeScores.get("gtm_not_synced_with_sales_capacity") * 1.2);
  }
  if (strategicDoubt && causeScores.has("icp_defined_but_not_operationalized")) {
    causeScores.set("icp_defined_but_not_operationalized", causeScores.get("icp_defined_but_not_operationalized") * 1.16);
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
