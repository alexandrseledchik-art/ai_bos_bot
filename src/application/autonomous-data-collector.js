function normalizeText(value) {
  return String(value || "").trim();
}

function lowerText(value) {
  return normalizeText(value).toLowerCase();
}

function uniqueBy(items, keyFn, maxItems = 12) {
  const result = [];
  const seen = new Set();

  for (const item of items || []) {
    const key = keyFn(item);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(item);

    if (result.length >= maxItems) {
      break;
    }
  }

  return result;
}

function includesUsefulText(value) {
  return normalizeText(value).length >= 3;
}

function pushFact(facts, { text, sourceType, sourceName, confidence = 0.55, metadata = {} }) {
  const cleanText = normalizeText(text);
  if (!includesUsefulText(cleanText)) {
    return;
  }

  facts.push({
    text: cleanText,
    sourceType,
    sourceName,
    confidence,
    metadata
  });
}

function factsFromArray(items = [], mapper) {
  const facts = [];
  for (const item of items || []) {
    const fact = mapper(item);
    if (fact) {
      facts.push(fact);
    }
  }
  return facts;
}

function sourcePriority(sourceType) {
  const priorities = {
    api_data: 1,
    financial_data: 1,
    crm_data: 1,
    document: 2,
    table: 2,
    decision_history: 3,
    saved_business_model: 3,
    mini_app: 3,
    public_source: 4,
    market_news: 5,
    user_words: 6,
    ai_hypothesis: 7
  };

  return priorities[sourceType] || 6;
}

function sortByEvidencePriority(facts = []) {
  return facts.slice().sort((left, right) => {
    const priorityDiff = sourcePriority(left.sourceType) - sourcePriority(right.sourceType);
    if (priorityDiff !== 0) {
      return priorityDiff;
    }
    return Number(right.confidence || 0) - Number(left.confidence || 0);
  });
}

function matchesMissingPart(factText, missingPart) {
  const text = lowerText(factText);
  const key = lowerText(missingPart?.key);
  const title = lowerText(missingPart?.title);

  if (!text || (!key && !title)) {
    return false;
  }

  const tokens = [
    ...key.split(/[_\s-]+/),
    ...title.split(/\s+/)
  ].filter((item) => item.length >= 4);

  return tokens.some((token) => text.includes(token));
}

function belongsToActiveScope(item = {}, { activeCaseId = "", companyId = "" } = {}) {
  const itemCaseId = normalizeText(item.caseId || item.case_id);
  const itemCompanyId = normalizeText(item.companyId || item.company_id);
  if (activeCaseId && itemCaseId) return itemCaseId === activeCaseId;
  if (companyId && itemCompanyId) return itemCompanyId === companyId;
  return false;
}

function collectFactsFromState({ state = {}, context = {}, thread, company, activeCase }) {
  const facts = [];
  const activeCaseId = activeCase?.id || context.activeCase?.id || thread?.activeCaseId || "";
  const companyId = company?.id || context.company?.id || "";

  pushFact(facts, {
    text: company?.name || context.company?.name,
    sourceType: "saved_business_model",
    sourceName: "company.name",
    confidence: 0.6
  });

  pushFact(facts, {
    text: activeCase?.summary || context.activeCase?.summary,
    sourceType: "decision_history",
    sourceName: "active_case.summary",
    confidence: 0.55
  });

  for (const item of context.entryState?.knownFacts || []) {
    pushFact(facts, {
      text: item,
      sourceType: "decision_history",
      sourceName: "entryState.knownFacts",
      confidence: 0.58
    });
  }

  for (const item of context.entryState?.symptoms || []) {
    pushFact(facts, {
      text: item,
      sourceType: "user_words",
      sourceName: "entryState.symptoms",
      confidence: 0.52
    });
  }

  for (const item of context.memorySummary?.symptoms || []) {
    pushFact(facts, {
      text: item,
      sourceType: "decision_history",
      sourceName: "memorySummary.symptoms",
      confidence: 0.55
    });
  }

  pushFact(facts, {
    text: context.memorySummary?.goal,
    sourceType: "decision_history",
    sourceName: "memorySummary.goal",
    confidence: 0.58
  });

  pushFact(facts, {
    text: context.memorySummary?.constraint,
    sourceType: "decision_history",
    sourceName: "memorySummary.constraint",
    confidence: 0.5
  });

  for (const message of context.history || []) {
    pushFact(facts, {
      text: message.text,
      sourceType: "user_words",
      sourceName: `history.${message.role}`,
      confidence: message.role === "user" ? 0.5 : 0.38
    });
  }

  pushFact(facts, {
    text: context.userText,
    sourceType: "user_words",
    sourceName: "current_message",
    confidence: 0.52
  });

  const scope = { activeCaseId, companyId };
  const observations = (state.observations || []).filter((item) => belongsToActiveScope(item, scope));
  for (const observation of observations) {
    pushFact(facts, {
      text: observation.statement || observation.normalizedSignal || observation.normalized_signal,
      sourceType: "decision_history",
      sourceName: "observations",
      confidence: Number(observation.confidence || 0.6),
      metadata: { id: observation.id }
    });
  }

  for (const observation of context.observationPacket?.observations || []) {
    pushFact(facts, {
      text: observation.evidence || observation.label,
      sourceType: "user_words",
      sourceName: "observationPacket",
      confidence: 0.55,
      metadata: { signalId: observation.signalId }
    });
  }

  const goals = (state.goals || []).filter((item) => belongsToActiveScope(item, scope));
  for (const goal of goals) {
    pushFact(facts, {
      text: goal.statement,
      sourceType: "decision_history",
      sourceName: "goals",
      confidence: Number(goal.confidence || 0.58),
      metadata: { id: goal.id }
    });
  }

  const symptoms = (state.symptoms || []).filter((item) => belongsToActiveScope(item, scope));
  for (const symptom of symptoms) {
    pushFact(facts, {
      text: symptom.statement,
      sourceType: "decision_history",
      sourceName: "symptoms",
      confidence: 0.52,
      metadata: { id: symptom.id }
    });
  }

  const hypotheses = (state.hypotheses || []).filter((item) => belongsToActiveScope(item, scope));
  for (const hypothesis of hypotheses) {
    pushFact(facts, {
      text: hypothesis.statement,
      sourceType: "ai_hypothesis",
      sourceName: "hypotheses",
      confidence: Number(hypothesis.confidence || 0.45),
      metadata: { id: hypothesis.id }
    });
  }

  const constraints = (state.constraints || []).filter((item) => belongsToActiveScope(item, scope));
  for (const constraint of constraints) {
    pushFact(facts, {
      text: constraint.statement,
      sourceType: "ai_hypothesis",
      sourceName: "constraints",
      confidence: Number(constraint.confidence || 0.45),
      metadata: { id: constraint.id }
    });
  }

  const companyProfiles = (state.companyProfiles || state.company_profiles || []).filter(
    (item) => belongsToActiveScope(item, scope)
  );
  for (const profile of companyProfiles) {
    for (const fact of factsFromArray(
      [
        profile.company_name,
        profile.industry,
        profile.company_size,
        profile.revenue_range,
        profile.owner_role,
        profile.current_request
      ],
      (text) => ({
        text,
        sourceType: "saved_business_model",
        sourceName: "company_profiles",
        confidence: 0.65
      })
    )) {
      pushFact(facts, fact);
    }
  }

  const problemContexts = (state.problemContexts || state.problem_contexts || []).filter(
    (item) => belongsToActiveScope(item, scope)
  );
  for (const problem of problemContexts) {
    pushFact(facts, {
      text: problem.request_text || problem.summary,
      sourceType: "mini_app",
      sourceName: "problem_contexts",
      confidence: 0.62,
      metadata: { id: problem.id }
    });
  }

  const diagnosticAnswers = (state.diagnosticAnswers || state.diagnostic_answers || [])
    .filter((item) => belongsToActiveScope(item, scope));
  for (const answer of diagnosticAnswers) {
    if (answer.status && !["confirmed", "corrected", "user_confirmed_inference"].includes(answer.status)) {
      continue;
    }
    pushFact(facts, {
      text: [answer.subject_key, answer.score ? `${answer.score}/5` : "", answer.selected_description].filter(Boolean).join(": "),
      sourceType: "mini_app",
      sourceName: "diagnostic_answers",
      confidence: Number(answer.confidence || 0.7),
      metadata: { id: answer.id }
    });
  }

  const documents = [
    ...(state.documentSnapshots || state.document_snapshots || []),
    ...(state.documentSources || state.document_sources || [])
  ].filter((item) => belongsToActiveScope(item, scope));
  for (const document of documents) {
    pushFact(facts, {
      text: document.summary || document.title || document.url,
      sourceType: "document",
      sourceName: "documents",
      confidence: 0.68,
      metadata: { id: document.id }
    });
  }

  return uniqueBy(sortByEvidencePriority(facts), (item) => `${item.sourceType}:${lowerText(item.text)}`, 20);
}

export class AutonomousDataCollector {
  collect({ state = {}, context = {}, thread = null, company = null, activeCase = null, referenceGate = null } = {}) {
    const missingParts = referenceGate?.primaryReference?.missingParts || [];
    const allFacts = collectFactsFromState({ state, context, thread, company, activeCase });
    const foundFacts = [];
    const stillMissingParts = [];

    for (const part of missingParts) {
      const matchingFact = allFacts.find((fact) => matchesMissingPart(fact.text, part));
      if (matchingFact) {
        foundFacts.push({
          ...matchingFact,
          matchedMissingPart: {
            key: part.key,
            title: part.title
          }
        });
      } else {
        stillMissingParts.push(part);
      }
    }

    const usefulFacts = foundFacts.length ? foundFacts : allFacts.slice(0, 5);
    const firstMissing = stillMissingParts[0] || missingParts[0] || null;

    return {
      foundFacts: uniqueBy(usefulFacts, (item) => `${item.sourceType}:${lowerText(item.text)}`, 8),
      sourceTypesChecked: [
        "decision_history",
        "saved_business_model",
        "mini_app",
        "document",
        "user_words"
      ],
      unavailableSources: [
        "crm_data",
        "financial_data",
        "open_sources",
        "market_news"
      ],
      confidence: usefulFacts.length
        ? Math.max(...usefulFacts.map((item) => Number(item.confidence || 0.4)))
        : 0,
      missingFacts: stillMissingParts.map((item) => ({
        key: item.key,
        title: item.title,
        question: item.question
      })),
      userQuestionIfNeeded: firstMissing?.question || referenceGate?.minimumQuestion || "",
      searchedBeforeAsking: true
    };
  }
}
