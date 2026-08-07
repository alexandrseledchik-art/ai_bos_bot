import crypto from "node:crypto";

export const SYSTEM_LAYERS = [
  "strategy",
  "commercial",
  "operations",
  "finance",
  "people",
  "management"
];

export const BUSINESS_LAYER_CLASSES = ["A", "B", "C", "D"];

export const BUSINESS_LAYERS = [
  "owner_context",
  "external_environment",
  "strategy",
  "product",
  "commercial",
  "operations",
  "finance",
  "team",
  "governance",
  "technology",
  "data_analytics"
];

export const FLOW_TYPES = [
  "demand",
  "leads",
  "deals",
  "delivery",
  "cash",
  "decisions"
];

export const CONSTRAINT_TYPES = [
  "supply",
  "quality",
  "throughput",
  "capacity",
  "control",
  "visibility"
];

export const ENTRY_PROMOTION_STATES = [
  "keep_in_entry",
  "ready_for_diagnostic_case",
  "ready_for_screening_case",
  "promoted"
];

export const ENTRY_MODES = [
  "problem_first",
  "tool_discovery",
  "specific_tool_request",
  "meta_role",
  "small_talk",
  "url_only",
  "url_plus_problem",
  "unclear"
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
    entryMode: "unclear",
    claimedProblem: "",
    claimedCause: "",
    knownFacts: [],
    symptoms: [],
    observedSignals: [],
    systemLayers: [],
    businessLayers: [],
    layerClasses: [],
    flowTypes: [],
    primaryFlow: "",
    constraintType: "",
    crossClassCheck: {
      currentClass: "",
      hasCompetingExplanation: false,
      competingClass: "",
      whySelectedClass: ""
    },
    candidateConstraints: [],
    candidateStates: [],
    candidateCauses: [],
    selectedConstraint: "",
    graphTrace: [],
    discriminatingSignals: [],
    graphConfidence: 0,
    hypothesisConflicts: [],
    signalSufficiency: "weak",
    nextBestQuestion: "",
    nextBestStep: "",
    whyThisStep: "",
    promotionReadiness: "keep_in_entry",
    activeSkillRun: null,
    skillRunHistory: [],
    lastSkillSelection: null,
    lastSkillExecution: null,
    lastMiniAppInvite: null,
    pendingDecision: null,
    audienceProfile: null,
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
    companySources: [],
    layerAnalyses: [],
    toolResults: [],
    companyAnalyses: [],
    telegramContexts: [],
    cases: [],
    observations: [],
    goals: [],
    symptoms: [],
    hypotheses: [],
    constraints: [],
    situations: [],
    actionWaves: [],
    decisionCycles: [],
    decisionLocks: [],
    decisionJournalEntries: [],
    toolRecommendations: [],
    artifacts: [],
    snapshots: [],
    threads: [],
    messages: []
  };
}

export function createCompany({
  name,
  telegramChatId,
  industry = "",
  description = "",
  ownerGoal = "",
  currentRequest = "",
  workspaceType = "consultant",
  userRole = "consultant",
  status = "active",
  companySource = ""
}) {
  const createdAt = nowIso();
  return {
    id: createId("company"),
    name,
    telegramChatId: String(telegramChatId),
    industry,
    description,
    ownerGoal,
    currentRequest,
    workspaceType,
    userRole,
    status,
    analysisStatus: "not_analyzed",
    lastAnalysisId: "",
    companySource,
    createdAt,
    updatedAt: createdAt
  };
}

export function createCompanySource({
  companyId,
  externalId = "",
  type = "text",
  title = "",
  contentText = "",
  fileUrl = "",
  sourceOrigin = "manual",
  aiSummary = "",
  relatedLayers = [],
  sourceMeta = {},
  processingStatus = "processed"
}) {
  const createdAt = nowIso();
  return {
    id: createId("source"),
    companyId,
    externalId,
    type,
    title,
    contentText,
    fileUrl,
    sourceOrigin,
    createdAt,
    processedAt: processingStatus === "processed" ? createdAt : "",
    processingStatus,
    aiSummary,
    relatedLayers,
    sourceMeta,
    updatedAt: createdAt
  };
}

export function createLayerAnalysis({
  companyId,
  layerCode,
  layerName = "",
  facts = [],
  referenceModel = {},
  filledFields = {},
  missingFields = [],
  gaps = [],
  confidence = "LOW",
  conclusions = [],
  sourceIds = []
}) {
  return {
    id: createId("layer_analysis"),
    companyId,
    layerCode,
    layerName,
    facts,
    referenceModel,
    filledFields,
    missingFields,
    gaps,
    confidence,
    conclusions,
    sourceIds,
    updatedAt: nowIso()
  };
}

export function createToolResult({
  companyId,
  toolTemplateId,
  layerCode,
  filledData = {},
  missingData = [],
  confidence = "LOW",
  sourceIds = []
}) {
  return {
    id: createId("tool_result"),
    companyId,
    toolTemplateId,
    layerCode,
    filledData,
    missingData,
    confidence,
    sourceIds,
    updatedAt: nowIso()
  };
}

export function createCompanyAnalysis({
  companyId,
  summary = "",
  layerSummary = [],
  filledToolsSummary = [],
  missingData = [],
  keyProblemAreas = [],
  probableConstraint = null,
  reasoning = "",
  nextStep = null,
  parallelActions = [],
  rejectedHypotheses = [],
  diagnosticChain = [],
  deepDiagnostic = null,
  diagnosticQuality = null,
  confidence = "LOW",
  sourceIds = []
}) {
  return {
    id: createId("company_analysis"),
    companyId,
    summary,
    layerSummary,
    filledToolsSummary,
    missingData,
    keyProblemAreas,
    probableConstraint,
    reasoning,
    nextStep,
    parallelActions,
    rejectedHypotheses,
    diagnosticChain,
    deepDiagnostic,
    diagnosticQuality,
    confidence,
    sourceIds,
    createdAt: nowIso()
  };
}

export function createTelegramContext({ telegramUserId, telegramChatId, activeCompanyId = "" }) {
  return {
    telegramUserId: String(telegramUserId || telegramChatId || ""),
    telegramChatId: String(telegramChatId || telegramUserId || ""),
    activeCompanyId,
    lastMessageAt: nowIso()
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

export function createObservation({
  caseId,
  sourceId,
  statement,
  normalizedSignal = "",
  layer = "",
  layerClass = "",
  flowType = "",
  confidence = 0.6,
  evidence = []
}) {
  return {
    id: createId("observation"),
    caseId,
    sourceType: "chat",
    sourceId,
    statement,
    normalizedSignal,
    layer,
    layerClass,
    flowType,
    confidence,
    evidence,
    status: "active",
    createdAt: nowIso(),
    updatedAt: nowIso()
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

export function createDecisionCycle({ companyId, caseId, threadId }) {
  const createdAt = nowIso();
  return {
    id: createId("decision_cycle"),
    companyId,
    caseId,
    threadId,
    status: "active",
    startedAt: createdAt,
    closedAt: "",
    createdAt,
    updatedAt: createdAt
  };
}

export function createDecisionLock({
  cycleId,
  companyId,
  caseId,
  threadId,
  constraint,
  nextStep,
  whyThisFirst = "",
  expectedResult = "",
  reviewAt,
  reopenConditions = []
}) {
  const createdAt = nowIso();
  return {
    id: createId("decision_lock"),
    cycleId,
    companyId,
    caseId,
    threadId,
    constraint,
    nextStep,
    whyThisFirst,
    expectedResult: expectedResult || nextStep,
    reviewAt,
    reopenConditions,
    status: "active",
    awaitingResult: false,
    actualResult: "",
    releaseReason: "",
    releasedAt: "",
    completedAt: "",
    createdAt,
    updatedAt: createdAt
  };
}

export function createDecisionJournalEntry({
  cycleId,
  lockId = "",
  companyId,
  caseId,
  threadId,
  entryType,
  context = {},
  alternatives = [],
  selectionReason = "",
  expectedResult = "",
  actualResult = ""
}) {
  return {
    id: createId("decision_journal"),
    cycleId,
    lockId,
    companyId,
    caseId,
    threadId,
    entryType,
    context,
    alternatives,
    selectionReason,
    expectedResult,
    actualResult,
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
  workingHypotheses,
  graphSnapshot = null,
  decisionObject = null
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
    graphSnapshot,
    decisionObject,
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
