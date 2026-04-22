import {
  createActionWave,
  createArtifact,
  createCase,
  createCompany,
  createConstraint,
  createEntryState,
  createGoal,
  createHypothesis,
  createMessage,
  createSituation,
  createSnapshot,
  createSymptom,
  createThread,
  createToolRecommendation,
  emptyEntryState,
  nowIso
} from "../domain/entities.js";
import { classifyInput } from "./classify-input.js";
import { extractObservations } from "./observation-extractor.js";
import { analyzeWithGraph } from "./graph-reasoner.js";
import { applyGuardrails } from "./guardrails.js";

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function uniqueStrings(items, maxItems = 10) {
  return [...new Set((items || []).map((item) => String(item || "").trim()).filter(Boolean))].slice(0, maxItems);
}

function uniqueObjectsBy(items, keyFn, maxItems = 5) {
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

function mergeCandidateConstraints(existing = [], incoming = []) {
  const result = [];
  const seen = new Set();

  for (const item of [...existing, ...incoming]) {
    const label = String(item?.label || "").trim();
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
      layer: String(item?.layer || "management").trim().toLowerCase(),
      confidence: Number(item?.confidence ?? 0.5),
      whyPossible: String(item?.whyPossible || "").trim(),
      whatWouldDisprove: String(item?.whatWouldDisprove || "").trim()
    });
  }

  return result.slice(0, 5);
}

function mergeRankedGraphItems(existing = [], incoming = [], maxItems = 5) {
  const merged = new Map();

  for (const item of [...existing, ...incoming]) {
    const id = String(item?.id || "").trim();
    if (!id) {
      continue;
    }

    const current = merged.get(id);
    const score = Number(item?.score ?? 0);
    if (!current || score >= Number(current.score ?? 0)) {
      merged.set(id, {
        id,
        label: String(item?.label || "").trim(),
        layer: String(item?.layer || "management").trim().toLowerCase(),
        domains: uniqueStrings(item?.domains || [], 6),
        score,
        supportedBy: uniqueStrings(item?.supportedBy || [], 6),
        whyUseful: String(item?.whyUseful || "").trim()
      });
    }
  }

  return [...merged.values()]
    .sort((left, right) => Number(right.score || 0) - Number(left.score || 0))
    .slice(0, maxItems);
}

function mergeDiscriminatingSignals(existing = [], incoming = [], maxItems = 4) {
  return uniqueObjectsBy(
    [...existing, ...incoming].map((item) => ({
      signal: String(item?.signal || "").trim(),
      question: String(item?.question || "").trim(),
      separates: uniqueStrings(item?.separates || [], 4),
      whyUseful: String(item?.whyUseful || "").trim(),
      informationGain: Number(item?.informationGain ?? 0)
    })),
    (item) => item.question,
    maxItems
  );
}

function mergeGraphTrace(existing = [], incoming = [], maxItems = 8) {
  return uniqueObjectsBy(
    [...existing, ...incoming].map((item) => ({
      fromSignal: String(item?.fromSignal || "").trim(),
      viaState: String(item?.viaState || "").trim(),
      toCause: String(item?.toCause || "").trim(),
      weight: Number(item?.weight ?? 0)
    })),
    (item) => `${item.fromSignal}:${item.viaState}:${item.toCause}`,
    maxItems
  );
}

function emptyCaseMemory() {
  return {
    goal: "",
    symptoms: [],
    hypotheses: [],
    constraint: "",
    lastWave: null
  };
}

function ensureThread(state, telegramChatId) {
  let thread = state.threads.find((item) => item.telegramChatId === String(telegramChatId));
  if (thread) {
    if (!thread.entryState || typeof thread.entryState !== "object") {
      thread.entryState = emptyEntryState();
    }
    return thread;
  }

  const company = createCompany({
    name: `Company ${telegramChatId}`,
    telegramChatId
  });
  state.companies.push(company);

  thread = createThread({
    telegramChatId,
    companyId: company.id
  });
  state.threads.push(thread);
  return thread;
}

function ensureCompany(state, thread, userMeta) {
  let company = state.companies.find((item) => item.id === thread.companyId);

  if (!company) {
    company = createCompany({
      name: userMeta.chatTitle || userMeta.username || `Company ${thread.telegramChatId}`,
      telegramChatId: thread.telegramChatId
    });
    state.companies.push(company);
    thread.companyId = company.id;
  }

  const candidateName = userMeta.chatTitle || userMeta.username || company.name;
  if (candidateName && company.name.startsWith("Company ")) {
    company.name = candidateName;
    company.updatedAt = nowIso();
  }

  return company;
}

function findCase(state, caseId) {
  if (!caseId) {
    return null;
  }

  const item = state.cases.find((entry) => entry.id === caseId && entry.status === "active");
  return item || null;
}

function selectRelevantCase(state, thread, classification) {
  const activeCase = findCase(state, thread.activeCaseId);
  if (!activeCase) {
    return null;
  }

  if (classification.type === "url_only" || classification.type === "url_plus_problem") {
    return activeCase.kind === "preliminary_screening" ? activeCase : null;
  }

  return activeCase.kind === "diagnostic_case" ? activeCase : null;
}

function ensureCase(state, thread, kind, mode, summary) {
  const current = findCase(state, thread.activeCaseId);
  if (current && current.kind === kind) {
    return current;
  }

  const activeCase = createCase({
    companyId: thread.companyId,
    kind,
    mode,
    summary
  });
  state.cases.push(activeCase);
  thread.activeCaseId = activeCase.id;
  thread.updatedAt = nowIso();
  return activeCase;
}

function summarizeCaseMemory(state, caseId) {
  if (!caseId) {
    return emptyCaseMemory();
  }

  const lastGoal = [...state.goals].reverse().find((item) => item.caseId === caseId)?.statement || "";
  const symptoms = state.symptoms
    .filter((item) => item.caseId === caseId)
    .slice(-6)
    .map((item) => item.statement);
  const hypotheses = state.hypotheses
    .filter((item) => item.caseId === caseId)
    .slice(-6)
    .map((item) => item.statement);
  const constraint = [...state.constraints].reverse().find((item) => item.caseId === caseId)?.statement || "";
  const lastWave = [...state.actionWaves].reverse().find((item) => item.caseId === caseId);

  return {
    goal: lastGoal,
    symptoms,
    hypotheses,
    constraint,
    lastWave: lastWave
      ? {
          firstStep: lastWave.firstStep,
          notNow: lastWave.notNow,
          whyThisFirst: lastWave.whyThisFirst
        }
      : null
  };
}

function recentHistory(state, threadId, maxHistoryMessages) {
  return state.messages
    .filter((item) => item.threadId === threadId)
    .slice(-maxHistoryMessages)
    .map((item) => ({
      role: item.role,
      text: item.text,
      createdAt: item.createdAt
    }));
}

function pushUniqueEntity(collection, createFn, predicate) {
  if (!predicate()) {
    collection.push(createFn());
  }
}

function mergeEntryState(currentState, incomingState, routeType) {
  const current = currentState && typeof currentState === "object" ? currentState : emptyEntryState();
  const incoming = incomingState && typeof incomingState === "object" ? incomingState : {};

  return createEntryState({
    routeType: routeType || incoming.routeType || current.routeType,
    claimedProblem: incoming.claimedProblem || current.claimedProblem,
    claimedCause: incoming.claimedCause || current.claimedCause,
    knownFacts: uniqueStrings([...(current.knownFacts || []), ...(incoming.knownFacts || [])], 8),
    symptoms: uniqueStrings([...(current.symptoms || []), ...(incoming.symptoms || [])], 10),
    observedSignals: uniqueStrings([...(current.observedSignals || []), ...(incoming.observedSignals || [])], 12),
    systemLayers: uniqueStrings([...(current.systemLayers || []), ...(incoming.systemLayers || [])], 6),
    candidateConstraints: mergeCandidateConstraints(current.candidateConstraints, incoming.candidateConstraints),
    candidateStates: mergeRankedGraphItems(current.candidateStates, incoming.candidateStates, 5),
    candidateCauses: mergeRankedGraphItems(current.candidateCauses, incoming.candidateCauses, 5),
    selectedConstraint: incoming.selectedConstraint || current.selectedConstraint,
    graphTrace: mergeGraphTrace(current.graphTrace, incoming.graphTrace, 8),
    discriminatingSignals: mergeDiscriminatingSignals(current.discriminatingSignals, incoming.discriminatingSignals, 4),
    graphConfidence: Math.max(Number(current.graphConfidence || 0), Number(incoming.graphConfidence || 0)),
    hypothesisConflicts: uniqueStrings([...(current.hypothesisConflicts || []), ...(incoming.hypothesisConflicts || [])], 6),
    signalSufficiency: incoming.signalSufficiency || current.signalSufficiency,
    nextBestQuestion: incoming.nextBestQuestion || current.nextBestQuestion,
    nextBestStep: incoming.nextBestStep || current.nextBestStep,
    whyThisStep: incoming.whyThisStep || current.whyThisStep,
    promotionReadiness: incoming.promotionReadiness || current.promotionReadiness
  });
}

function shouldPromoteToDiagnosticCase(decision, activeCase, classification) {
  if (classification.type === "url_only" || classification.type === "url_plus_problem") {
    return false;
  }

  if (activeCase?.kind === "diagnostic_case") {
    return true;
  }

  return (
    decision.selectedMode === "diagnostic_mode" &&
    (decision.entryState?.promotionReadiness === "ready_for_diagnostic_case" ||
      decision.decision.signalSufficiency === "enough" ||
      decision.decision.action === "answer" ||
      decision.decision.action === "diagnose")
  );
}

function buildPersistedMemory(decision) {
  return {
    goal: decision.memory.goal || decision.entryState?.claimedProblem || "",
    symptoms: uniqueStrings([
      ...(decision.memory.symptoms || []),
      ...(decision.entryState?.symptoms || [])
    ], 8),
    hypotheses: uniqueStrings([
      ...(decision.memory.hypotheses || []),
      ...((decision.entryState?.candidateConstraints || []).map((item) => item.label))
    ], 5),
    constraint: decision.memory.constraint || decision.entryState?.selectedConstraint || "",
    situation: decision.memory.situation || "",
    actionWave: {
      enabled: Boolean(decision.memory.actionWave?.enabled),
      firstStep: decision.memory.actionWave?.firstStep || decision.entryState?.nextBestStep || "",
      notNow: decision.memory.actionWave?.notNow || "",
      whyThisFirst: decision.memory.actionWave?.whyThisFirst || decision.entryState?.whyThisStep || ""
    },
    toolRecommendations: decision.memory.toolRecommendations || [],
    artifact: decision.memory.artifact || {
      shouldSave: false,
      title: "",
      summary: "",
      kind: "snapshot"
    }
  };
}

function buildArtifactBody({ company, activeCase, decision, classification, userText, artifactId }) {
  const entryState = decision.entryState || emptyEntryState();
  const candidateConstraints = (entryState.candidateConstraints || []).map((item) => `- [${item.layer}] ${item.label}`);
  const candidateStates = (entryState.candidateStates || []).map((item) => `- [${item.layer}] ${item.label} (${item.score})`);
  const candidateCauses = (entryState.candidateCauses || []).map((item) => `- [${item.layer}] ${item.label} (${item.score})`);
  const discriminatingSignals = (entryState.discriminatingSignals || []).map(
    (item) => `- ${item.question} | separates: ${(item.separates || []).join(" vs ")}`
  );
  const sections = [
    `# ${decision.memory.artifact.title || "Diagnostic artifact"}`,
    "",
    `- Company: ${company.name}`,
    `- Case ID: ${activeCase.id}`,
    `- Mode: ${decision.selectedMode}`,
    `- Action: ${decision.decision.action}`,
    `- Input type: ${classification.type}`,
    `- Artifact ID: ${artifactId}`,
    "",
    "## User input",
    userText,
    "",
    "## What user thinks is happening",
    `- Claimed problem: ${entryState.claimedProblem || "Not captured."}`,
    `- Claimed cause: ${entryState.claimedCause || "Not captured."}`,
    "",
    "## Symptoms",
    ...(entryState.symptoms.length > 0 ? entryState.symptoms.map((item) => `- ${item}`) : ["- No symptoms captured."]),
    "",
    "## Observed signals",
    ...(entryState.observedSignals.length > 0 ? entryState.observedSignals.map((item) => `- ${item}`) : ["- No observed signals captured."]),
    "",
    "## System layers in play",
    ...(entryState.systemLayers.length > 0 ? entryState.systemLayers.map((item) => `- ${item}`) : ["- No layers captured."]),
    "",
    "## Candidate constraints",
    ...(candidateConstraints.length > 0 ? candidateConstraints : ["- No candidate constraints captured."]),
    "",
    "## Candidate states",
    ...(candidateStates.length > 0 ? candidateStates : ["- No candidate states captured."]),
    "",
    "## Candidate causes",
    ...(candidateCauses.length > 0 ? candidateCauses : ["- No candidate causes captured."]),
    "",
    "## Selected constraint",
    decision.memory.constraint || entryState.selectedConstraint || "Not selected yet.",
    "",
    "## Discriminating signals",
    ...(discriminatingSignals.length > 0 ? discriminatingSignals : ["- No discriminating signals captured."]),
    "",
    "## Graph confidence",
    `- ${entryState.graphConfidence || 0}`,
    "",
    "## Understanding",
    decision.response.whatIUnderstood,
    "",
    "## Working hypotheses",
    ...decision.response.hypotheses.map((item) => `- ${item}`),
    "",
    "## Why it matters",
    decision.response.whyItMatters,
    "",
    "## Next step",
    decision.response.nextStep,
    "",
    "## Known facts",
    ...(decision.guardrails.knownFacts.length > 0
      ? decision.guardrails.knownFacts.map((item) => `- ${item}`)
      : ["- No confirmed facts captured."]),
    "",
    "## Observations",
    ...(decision.guardrails.observations.length > 0
      ? decision.guardrails.observations.map((item) => `- ${item}`)
      : ["- No explicit observations captured."]),
    "",
    "## Guardrail hypotheses",
    ...(decision.guardrails.workingHypotheses.length > 0
      ? decision.guardrails.workingHypotheses.map((item) => `- ${item}`)
      : ["- No additional hypotheses captured."]),
    "",
    "## Cannot assert yet",
    ...(decision.guardrails.canNotAssert.length > 0
      ? decision.guardrails.canNotAssert.map((item) => `- ${item}`)
      : ["- No explicit uncertainty list captured."]),
    ""
  ];

  if (decision.memory.actionWave.enabled) {
    sections.push(
      "## Action wave",
      `- First step: ${decision.memory.actionWave.firstStep}`,
      `- Not now: ${decision.memory.actionWave.notNow}`,
      `- Why this first: ${decision.memory.actionWave.whyThisFirst}`,
      ""
    );
  }

  if (decision.memory.toolRecommendations.length > 0) {
    sections.push(
      "## Tool recommendations",
      ...decision.memory.toolRecommendations.map(
        (item) => `- ${item.name}: ${item.reason} When: ${item.usageMoment}`
      ),
      ""
    );
  }

  return `${sections.join("\n")}\n`;
}

export class ConversationService {
  constructor({ store, reasoner, screener, maxHistoryMessages = 12 }) {
    this.store = store;
    this.reasoner = reasoner;
    this.screener = screener;
    this.maxHistoryMessages = maxHistoryMessages;
  }

  async handleUserMessage({ telegramChatId, text, userMeta = {} }) {
    const classification = classifyInput(text);
    const screening = [];

    for (const url of classification.urls) {
      screening.push(await this.screener.screen(url));
    }

    return this.store.update(async (state) => {
      const thread = ensureThread(state, telegramChatId);
      const company = ensureCompany(state, thread, userMeta);
      const currentCase = selectRelevantCase(state, thread, classification);

      const context = {
        routeHint: classification.type,
        userText: text,
        classification,
        screening,
        company: {
          id: company.id,
          name: company.name
        },
        activeCase: currentCase
          ? {
              id: currentCase.id,
              kind: currentCase.kind,
              mode: currentCase.mode
            }
          : null,
        memorySummary: summarizeCaseMemory(state, currentCase?.id || ""),
        entryState: thread.entryState || emptyEntryState(),
        history: recentHistory(state, thread.id, this.maxHistoryMessages)
      };

      const extracted = extractObservations({
        userText: text,
        classification,
        entryState: context.entryState,
        memorySummary: context.memorySummary
      });
      const graphPacket = analyzeWithGraph({
        extracted,
        entryState: context.entryState,
        memorySummary: context.memorySummary
      });
      context.observationPacket = extracted;
      context.graphPacket = graphPacket;

      let decision = await this.reasoner.decide(context);
      decision = applyGuardrails(decision, context);

      state.messages.push(
        createMessage({
          threadId: thread.id,
          role: "user",
          text
        })
      );

      state.messages.push(
        createMessage({
          threadId: thread.id,
          role: "assistant",
          text: decision.response.responseText
        })
      );

      thread.entryState = mergeEntryState(thread.entryState, decision.entryState, classification.type);
      thread.updatedAt = nowIso();

      if (decision.memory.companyName && normalizeText(decision.memory.companyName) !== normalizeText(company.name)) {
        company.name = decision.memory.companyName;
        company.updatedAt = nowIso();
      }

      let activeCase = currentCase;

      if (classification.type === "url_only" || classification.type === "url_plus_problem") {
        activeCase = activeCase || ensureCase(
          state,
          thread,
          "preliminary_screening",
          "website_screening_mode",
          "Предварительный внешний скрининг."
        );
      } else if (shouldPromoteToDiagnosticCase(decision, activeCase, classification)) {
        activeCase = activeCase || ensureCase(
          state,
          thread,
          "diagnostic_case",
          "diagnostic_mode",
          "Активный диагностический кейс."
        );
        thread.entryState.promotionReadiness = "promoted";
        thread.updatedAt = nowIso();
      }

      let artifactPath = "";

      if (activeCase) {
        const persistedMemory = buildPersistedMemory(decision);

        activeCase.mode = decision.selectedMode;
        activeCase.summary = decision.response.whatIUnderstood;
        activeCase.updatedAt = nowIso();
        thread.activeCaseId = activeCase.id;

        if (persistedMemory.goal) {
          pushUniqueEntity(
            state.goals,
            () =>
              createGoal({
                caseId: activeCase.id,
                statement: persistedMemory.goal,
                confidence: decision.decision.confidence
              }),
            () =>
              state.goals.some(
                (item) =>
                  item.caseId === activeCase.id &&
                  normalizeText(item.statement) === normalizeText(persistedMemory.goal)
              )
          );
        }

        for (const symptom of persistedMemory.symptoms) {
          pushUniqueEntity(
            state.symptoms,
            () =>
              createSymptom({
                caseId: activeCase.id,
                statement: symptom,
                evidence: text
              }),
            () =>
              state.symptoms.some(
                (item) =>
                  item.caseId === activeCase.id &&
                  normalizeText(item.statement) === normalizeText(symptom)
              )
          );
        }

        for (const hypothesis of persistedMemory.hypotheses) {
          pushUniqueEntity(
            state.hypotheses,
            () =>
              createHypothesis({
                caseId: activeCase.id,
                statement: hypothesis,
                basis: decision.decision.rationale,
                confidence: decision.decision.confidence
              }),
            () =>
              state.hypotheses.some(
                (item) =>
                  item.caseId === activeCase.id &&
                  normalizeText(item.statement) === normalizeText(hypothesis)
              )
          );
        }

        if (persistedMemory.constraint) {
          pushUniqueEntity(
            state.constraints,
            () =>
              createConstraint({
                caseId: activeCase.id,
                statement: persistedMemory.constraint,
                confidence: decision.decision.confidence
              }),
            () =>
              state.constraints.some(
                (item) =>
                  item.caseId === activeCase.id &&
                  normalizeText(item.statement) === normalizeText(persistedMemory.constraint)
              )
          );
        }

        if (persistedMemory.situation) {
          state.situations.push(
            createSituation({
              caseId: activeCase.id,
              summary: persistedMemory.situation
            })
          );
        }

        if (persistedMemory.actionWave.enabled) {
          state.actionWaves.push(
            createActionWave({
              caseId: activeCase.id,
              firstStep: persistedMemory.actionWave.firstStep,
              notNow: persistedMemory.actionWave.notNow,
              whyThisFirst: persistedMemory.actionWave.whyThisFirst
            })
          );
        }

        for (const tool of persistedMemory.toolRecommendations) {
          pushUniqueEntity(
            state.toolRecommendations,
            () =>
              createToolRecommendation({
                caseId: activeCase.id,
                name: tool.name,
                reason: tool.reason,
                usageMoment: tool.usageMoment
              }),
            () =>
              state.toolRecommendations.some(
                (item) =>
                  item.caseId === activeCase.id &&
                  normalizeText(item.name) === normalizeText(tool.name)
              )
          );
        }

        state.snapshots.push(
          createSnapshot({
            caseId: activeCase.id,
            mode: decision.selectedMode,
            action: decision.decision.action,
            signalSufficiency: decision.decision.signalSufficiency,
            understanding: decision.response.whatIUnderstood,
            knownFacts: decision.guardrails.knownFacts,
            observations: decision.guardrails.observations,
            workingHypotheses: decision.guardrails.workingHypotheses,
            graphSnapshot: decision.graphAnalysis || graphPacket
          })
        );

        if (persistedMemory.artifact.shouldSave) {
          const previewArtifact = createArtifact({
            caseId: activeCase.id,
            kind: persistedMemory.artifact.kind,
            title: persistedMemory.artifact.title || "Diagnostic artifact",
            summary: persistedMemory.artifact.summary || decision.response.whatIUnderstood,
            path: "",
            content: ""
          });
          previewArtifact.content = buildArtifactBody({
            company,
            activeCase,
            decision,
            classification,
            userText: text,
            artifactId: previewArtifact.id
          });
          try {
            artifactPath = await this.store.saveArtifactDocument({
              artifactId: previewArtifact.id,
              title: previewArtifact.title,
              body: previewArtifact.content
            });
          } catch {
            artifactPath = "";
          }
          previewArtifact.path = artifactPath;
          state.artifacts.push(previewArtifact);
        }
      }

      return {
        reply: decision.response.responseText,
        decision,
        classification,
        artifactPath
      };
    });
  }
}
