import { createId, nowIso } from "../domain/entities.js";

const RUN_SCHEMA = "skill_run_v1";
const HISTORY_LIMIT = 12;
const SIGNAL_LIMIT = 24;
const HYPOTHESIS_LIMIT = 12;
const QUESTION_LIMIT = 12;

const HARD_SWITCH_SKILLS = new Set([
  "onboarding_conversation",
  "architecture_navigation",
  "maturity_assessment",
  "tool_selection",
  "tool_facilitation",
  "website_screening",
  "platform_support",
  "next_step_selection",
  "execution_coordination"
]);

const SOFT_DETOUR_SKILLS = new Set([
  "concept_explanation",
  "document_analysis",
  "progress_navigation",
  "result_interpretation"
]);

function normalize(value) {
  return String(value || "").trim();
}

function uniqueStrings(items, maxItems = Infinity) {
  return [...new Set((items || []).map(normalize).filter(Boolean))].slice(-maxItems);
}

function uniqueObjects(items, keyFn, maxItems = Infinity) {
  const seen = new Set();
  const result = [];
  for (const item of [...(items || [])].reverse()) {
    const key = keyFn(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.unshift(item);
    if (result.length >= maxItems) break;
  }
  return result;
}

function cloneRun(run) {
  if (!run || typeof run !== "object") return null;
  return JSON.parse(JSON.stringify(run));
}

function isOpen(run) {
  return Boolean(run && ["active", "waiting_for_user"].includes(run.status));
}

function isExplicitSwitch(selection, context) {
  if (!selection?.primarySkill || !HARD_SWITCH_SKILLS.has(selection.primarySkill)) return false;
  const routeType = context.classification?.type || "";
  if (["url_only", "url_plus_problem"].includes(routeType)) return true;
  return (selection.reasonCodes || []).some((reason) => [
    "start_or_onboarding",
    "architecture_route_signal",
    "maturity_assessment_request",
    "tool_first_request",
    "active_tool_work",
    "explicit_platform_help",
    "accepted_action_or_execution_mode",
    "next_step_request_with_hypothesis"
  ].includes(reason));
}

function createDiagnosticRun(selection, context) {
  const createdAt = nowIso();
  return {
    schemaVersion: RUN_SCHEMA,
    runId: createId("skill_run"),
    skillId: "business_diagnostic",
    status: "active",
    goal: selection.turnGoal,
    completionCondition: selection.completionCondition,
    startedAt: createdAt,
    updatedAt: createdAt,
    completedAt: "",
    interruptedAt: "",
    turnCount: 0,
    continuationCount: 0,
    reasonCodes: uniqueStrings(selection.reasonCodes || [], 8),
    signals: [],
    hypotheses: [],
    askedQuestions: [],
    selectedConstraint: "",
    lastUserMessage: normalize(context.userText),
    lastOutcome: "started",
    detours: [],
    handoff: null,
    interruption: null
  };
}

function selectionForContinuation(selection, run) {
  return {
    ...selection,
    primarySkill: run.skillId,
    communicationSkill: "diagnostic_interview",
    turnGoal: run.goal || selection.turnGoal,
    completionCondition: run.completionCondition || selection.completionCondition,
    reasonCodes: uniqueStrings([...(selection.reasonCodes || []), "active_skill_run_continuation"], 8),
    selectorConfidence: Math.max(Number(selection.selectorConfidence || 0), 0.96),
    activeSkillRun: {
      runId: run.runId,
      skillId: run.skillId,
      status: run.status,
      turnCount: run.turnCount
    }
  };
}

function normalizeState(entryState = {}) {
  return {
    activeSkillRun: cloneRun(entryState.activeSkillRun),
    skillRunHistory: Array.isArray(entryState.skillRunHistory)
      ? entryState.skillRunHistory.map(cloneRun).filter(Boolean).slice(-HISTORY_LIMIT)
      : []
  };
}

function archiveRun(state, run) {
  const history = state.skillRunHistory.filter((item) => item.runId !== run.runId);
  history.push(cloneRun(run));
  state.skillRunHistory = history.slice(-HISTORY_LIMIT);
}

function hypothesisSnapshot(packet) {
  return (packet?.hypotheses || []).map((item) => ({
    label: normalize(item?.label),
    layer: normalize(item?.layer),
    score: Number(item?.score || 0),
    source: normalize(item?.source)
  })).filter((item) => item.label);
}

function signalSnapshot(context) {
  const observations = uniqueStrings([
    ...(context.observationPacket?.observedSignals || []),
    ...(context.graphPacket?.observedSignals || [])
  ], 8);
  return {
    message: normalize(context.userText),
    observations,
    at: nowIso()
  };
}

function completionHandoff(run, decision) {
  const constraint = normalize(decision?.entryState?.selectedConstraint || decision?.memory?.constraint);
  return {
    skillId: constraint ? "next_step_selection" : "constraint_prioritization",
    status: "ready",
    reason: constraint
      ? "Рабочая гипотеза ограничения выбрана; нужно закрепить один проверяемый следующий шаг."
      : "Диагностическое поле собрано; нужно выбрать наиболее причинную гипотезу ограничения.",
    preparedAt: nowIso()
  };
}

export class SkillRunManager {
  prepare({ entryState = {}, selection = null, context = {} } = {}) {
    const state = normalizeState(entryState);
    const active = state.activeSkillRun;
    const primarySkill = selection?.primarySkill || "";

    if (isOpen(active)) {
      if (isExplicitSwitch(selection, context)) {
        active.status = "interrupted";
        active.interruptedAt = nowIso();
        active.updatedAt = active.interruptedAt;
        active.lastOutcome = "interrupted_by_user_switch";
        active.interruption = {
          nextSkill: primarySkill,
          userMessage: normalize(context.userText),
          reasonCodes: uniqueStrings(selection.reasonCodes || [], 6)
        };
        archiveRun(state, active);
        state.activeSkillRun = null;
        return { state, selection, run: null, transition: "interrupted" };
      }

      if (SOFT_DETOUR_SKILLS.has(primarySkill)) {
        active.updatedAt = nowIso();
        active.detours = uniqueObjects([
          ...(active.detours || []),
          { skillId: primarySkill, message: normalize(context.userText), at: active.updatedAt }
        ], (item) => `${item.skillId}:${item.message}`, 8);
        state.activeSkillRun = active;
        return { state, selection, run: active, transition: "detour" };
      }

      active.continuationCount = Number(active.continuationCount || 0) + 1;
      active.updatedAt = nowIso();
      state.activeSkillRun = active;
      return {
        state,
        selection: selectionForContinuation(selection, active),
        run: active,
        transition: "continued"
      };
    }

    if (primarySkill !== "business_diagnostic") {
      return { state, selection, run: null, transition: "none" };
    }

    const run = createDiagnosticRun(selection, context);
    state.activeSkillRun = run;
    return {
      state,
      selection: {
        ...selection,
        activeSkillRun: { runId: run.runId, skillId: run.skillId, status: run.status, turnCount: 0 }
      },
      run,
      transition: "started"
    };
  }

  finalize({ preparation = null, packet = null, execution = null, decision = null, context = {} } = {}) {
    const state = preparation?.state || normalizeState(context.entryState || {});
    const run = cloneRun(preparation?.run);
    if (!run || preparation?.transition === "detour") return state;

    run.turnCount = Number(run.turnCount || 0) + 1;
    run.updatedAt = nowIso();
    run.lastUserMessage = normalize(context.userText);
    run.signals = uniqueObjects([
      ...(run.signals || []),
      signalSnapshot(context)
    ], (item) => `${item.message}:${(item.observations || []).join("|")}`, SIGNAL_LIMIT);
    run.hypotheses = uniqueObjects([
      ...(run.hypotheses || []),
      ...hypothesisSnapshot(packet)
    ], (item) => `${item.layer}:${item.label}`.toLowerCase(), HYPOTHESIS_LIMIT);
    run.askedQuestions = uniqueStrings([
      ...(run.askedQuestions || []),
      packet?.requiredSignal,
      decision?.entryState?.nextBestQuestion
    ], QUESTION_LIMIT);
    run.selectedConstraint = normalize(decision?.entryState?.selectedConstraint || decision?.memory?.constraint);

    if (execution?.status === "completed") {
      run.status = "completed";
      run.completedAt = run.updatedAt;
      run.lastOutcome = "completion_criterion_met";
      run.handoff = completionHandoff(run, decision);
      archiveRun(state, run);
      state.activeSkillRun = null;
      return state;
    }

    run.status = execution?.status === "waiting_for_user" ? "waiting_for_user" : "active";
    run.lastOutcome = execution?.status || "active";
    state.activeSkillRun = run;
    return state;
  }

  applyToEntryState(entryState = {}, state = {}) {
    return {
      ...entryState,
      activeSkillRun: state.activeSkillRun || null,
      skillRunHistory: Array.isArray(state.skillRunHistory) ? state.skillRunHistory.slice(-HISTORY_LIMIT) : []
    };
  }
}
