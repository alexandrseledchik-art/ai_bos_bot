import crypto from "node:crypto";

export const SYSTEM_LAYERS = [
  "strategy",
  "commercial",
  "operations",
  "finance",
  "people",
  "management"
];

export const ENTRY_PROMOTION_STATES = [
  "keep_in_entry",
  "ready_for_diagnostic_case",
  "ready_for_screening_case",
  "promoted"
];

export function createId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function nowIso() {
  return new Date().toISOString();
}

export function emptyEntryState() {
  return {
    routeType: "unknown",
    claimedProblem: "",
    claimedCause: "",
    knownFacts: [],
    symptoms: [],
    systemLayers: [],
    candidateConstraints: [],
    selectedConstraint: "",
    signalSufficiency: "weak",
    nextBestQuestion: "",
    nextBestStep: "",
    whyThisStep: "",
    promotionReadiness: "keep_in_entry",
    lastUpdatedAt: ""
  };
}

export function createEntryState(seed = {}) {
  return {
    ...emptyEntryState(),
    ...seed,
    lastUpdatedAt: nowIso()
  };
}

export function emptyState() {
  return {
    companies: [],
    cases: [],
    goals: [],
    symptoms: [],
    hypotheses: [],
    constraints: [],
    situations: [],
    actionWaves: [],
    toolRecommendations: [],
    artifacts: [],
    snapshots: [],
    threads: [],
    messages: []
  };
}

export function createCompany({ name, telegramChatId }) {
  const createdAt = nowIso();
  return {
    id: createId("company"),
    name,
    telegramChatId: String(telegramChatId),
    createdAt,
    updatedAt: createdAt
  };
}

export function createThread({ telegramChatId, companyId }) {
  const createdAt = nowIso();
  return {
    id: createId("thread"),
    telegramChatId: String(telegramChatId),
    companyId,
    activeCaseId: "",
    entryState: emptyEntryState(),
    createdAt,
    updatedAt: createdAt
  };
}

export function createCase({ companyId, kind, mode, summary }) {
  const createdAt = nowIso();
  return {
    id: createId("case"),
    companyId,
    kind,
    mode,
    summary,
    status: "active",
    createdAt,
    updatedAt: createdAt
  };
}

export function createMessage({ threadId, role, text }) {
  return {
    id: createId("msg"),
    threadId,
    role,
    text,
    createdAt: nowIso()
  };
}

export function createGoal({ caseId, statement, confidence = 0.6 }) {
  return {
    id: createId("goal"),
    caseId,
    statement,
    confidence,
    createdAt: nowIso()
  };
}

export function createSymptom({ caseId, statement, evidence = "" }) {
  return {
    id: createId("symptom"),
    caseId,
    statement,
    evidence,
    createdAt: nowIso()
  };
}

export function createHypothesis({ caseId, statement, basis = "", confidence = 0.5 }) {
  return {
    id: createId("hypothesis"),
    caseId,
    statement,
    basis,
    confidence,
    createdAt: nowIso()
  };
}

export function createConstraint({ caseId, statement, confidence = 0.5 }) {
  return {
    id: createId("constraint"),
    caseId,
    statement,
    confidence,
    createdAt: nowIso()
  };
}

export function createSituation({ caseId, summary, source = "conversation" }) {
  return {
    id: createId("situation"),
    caseId,
    summary,
    source,
    createdAt: nowIso()
  };
}

export function createActionWave({ caseId, firstStep, notNow, whyThisFirst }) {
  return {
    id: createId("wave"),
    caseId,
    firstStep,
    notNow,
    whyThisFirst,
    createdAt: nowIso()
  };
}

export function createToolRecommendation({ caseId, name, reason, usageMoment }) {
  return {
    id: createId("tool"),
    caseId,
    name,
    reason,
    usageMoment,
    createdAt: nowIso()
  };
}

export function createSnapshot({
  caseId,
  mode,
  action,
  signalSufficiency,
  understanding,
  knownFacts,
  observations,
  workingHypotheses
}) {
  return {
    id: createId("snapshot"),
    caseId,
    mode,
    action,
    signalSufficiency,
    understanding,
    knownFacts,
    observations,
    workingHypotheses,
    createdAt: nowIso()
  };
}

export function createArtifact({ caseId, kind, title, summary, path, content = "" }) {
  return {
    id: createId("artifact"),
    caseId,
    kind,
    title,
    summary,
    path,
    content,
    createdAt: nowIso()
  };
}
