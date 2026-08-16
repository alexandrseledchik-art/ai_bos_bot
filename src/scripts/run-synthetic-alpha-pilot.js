import fs from "node:fs/promises";
import path from "node:path";

import { ConversationEvaluator } from "../application/conversation-evaluator.js";
import { ConversationService } from "../application/conversation-service.js";
import { loadConfig } from "../config.js";
import { ReasoningClient } from "../infrastructure/openai/reasoning-client.js";
import { FileMemoryStore } from "../infrastructure/storage/file-store.js";

class StubScreener {
  async screen(url) {
    return {
      url,
      knownFacts: [`URL: ${url}`, "HTTP status: 200"],
      observations: ["Доступен только внешний контур сайта."],
      canNotAssert: ["По сайту нельзя определить внутреннее ограничение бизнеса."],
      raw: {}
    };
  }
}

function normalize(value) {
  return String(value || "").trim();
}

function questionCount(value) {
  return (normalize(value).match(/\?/g) || []).length;
}

function hasInternalLeak(value) {
  return /entryState|graphPacket|knownFacts|workingHypotheses|candidateConstraints|primarySkill|skillExecution|Diagnostic Engine|Decision Engine/i.test(normalize(value));
}

function replyOpening(value) {
  return normalize(value).split(/\n+/)[0].replace(/\s+/g, " ").slice(0, 140);
}

function repeatedOpenings(results) {
  const counts = new Map();
  for (const result of results) {
    for (const opening of result.decisionReplyOpenings || []) {
      const key = opening.toLowerCase().replace(/\d+(?:[.,]\d+)?/g, "#");
      if (!key) continue;
      const current = counts.get(key) || { opening, count: 0 };
      current.count += 1;
      counts.set(key, current);
    }
  }
  return [...counts.values()]
    .filter((item) => item.count > 1)
    .sort((left, right) => right.count - left.count || left.opening.localeCompare(right.opening));
}

function detailFor(state, telegramChatId) {
  const thread = state.threads.find((item) => item.telegramChatId === telegramChatId);
  const activeCase = state.cases.find((item) => item.id === thread?.activeCaseId) || null;
  const caseId = activeCase?.id || "";
  return {
    thread,
    activeCase,
    messages: state.messages.filter((item) => item.threadId === thread?.id),
    observations: state.observations.filter((item) => item.caseId === caseId),
    goals: state.goals.filter((item) => item.caseId === caseId),
    symptoms: state.symptoms.filter((item) => item.caseId === caseId),
    hypotheses: state.hypotheses.filter((item) => item.caseId === caseId),
    constraints: state.constraints.filter((item) => item.caseId === caseId),
    situations: state.situations.filter((item) => item.caseId === caseId),
    actionWaves: state.actionWaves.filter((item) => item.caseId === caseId),
    snapshots: state.snapshots.filter((item) => item.caseId === caseId),
    miniAppEvalLogs: []
  };
}

function issueSummary(results) {
  const counts = new Map();
  for (const result of results) {
    for (const issue of result.issues) {
      counts.set(issue, Number(counts.get(issue) || 0) + 1);
    }
    for (const issue of result.evaluation?.issues || []) {
      const key = `evaluator:${issue.code}`;
      counts.set(key, Number(counts.get(key) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([issue, count]) => ({ issue, count }))
    .sort((left, right) => right.count - left.count || left.issue.localeCompare(right.issue));
}

function percent(value, total) {
  return total ? Number(((value / total) * 100).toFixed(1)) : 0;
}

function markdownReport(report) {
  const lines = [
    "# AI-BOSS synthetic alpha pilot",
    "",
    `Дата: ${report.generatedAt}`,
    `Режим reasoning: ${report.mode}`,
    `Модель: ${report.model}`,
    "",
    "## Итог",
    "",
    `- Участников: ${report.summary.participants}`,
    `- Создан диагностический кейс: ${report.summary.diagnosticCases}/${report.summary.participants}`,
    `- Получена рабочая гипотеза: ${report.summary.withHypothesis}/${report.summary.participants}`,
    `- Есть первый шаг: ${report.summary.withFirstStep}/${report.summary.participants}`,
    `- Целевых циклов закрыто результатом: ${report.summary.completedCycles}/${report.summary.targetCycles}`,
    `- Книжных маршрутов распознано: ${report.summary.bookRoutes}/${report.summary.expectedBookRoutes}`,
    `- Сегментов распознано: ${report.summary.qualifiedSegments}/${report.summary.expectedSegments}`,
    `- Средняя оценка evaluator: ${report.summary.averageEvaluationScore}`,
    `- Ответов с более чем одним вопросом: ${report.summary.multiQuestionReplies}`,
    `- Утечек внутренних полей: ${report.summary.internalLeaks}`,
    `- Повторяющихся начал содержательных ответов: ${report.summary.repeatedDecisionOpenings}`,
    "",
    "## Кейсы",
    ""
  ];

  for (const result of report.results) {
    lines.push(
      `### ${result.passed ? "PASS" : "FAIL"} — ${result.id}`,
      "",
      `- Канал: ${result.entryChannel}`,
      `- Сегмент: ${result.segmentId || "не квалифицирован"}`,
      `- Основной скилл: ${result.primarySkill || "не определён"}`,
      `- Факты / гипотезы / шаги: ${result.factCount} / ${result.hypothesisCount} / ${result.firstStepCount}`,
      `- Цикл: ${result.cycleStatus}`,
      `- Оценка: ${result.evaluation.score}/100`,
      ...(result.issues.length ? result.issues.map((issue) => `- Ошибка: ${issue}`) : ["- Ошибок контракта не найдено"]),
      ""
    );
  }

  lines.push("## Повторяющиеся сигналы", "");
  if (!report.repeatedIssues.length) {
    lines.push("- Повторяющихся проблем не найдено.");
  } else {
    report.repeatedIssues.forEach((item) => lines.push(`- ${item.issue}: ${item.count}`));
  }
  if (report.repeatedOpenings.length) {
    lines.push("", "## Повторяющиеся начала ответов", "");
    report.repeatedOpenings.forEach((item) => lines.push(`- ${item.count}× — ${item.opening}`));
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

const cwd = process.cwd();
const live = process.argv.includes("--live");
const caseFilter = process.argv.find((argument) => argument.startsWith("--case="))?.slice("--case=".length) || "";
const config = loadConfig();
if (live && !config.openaiApiKey) {
  throw new Error("OPENAI_API_KEY is required for --live synthetic pilot.");
}

const mode = live ? "live" : "heuristic";
const suffix = `${live ? "live" : "offline"}${caseFilter ? `-${caseFilter}` : ""}`;
const dataRoot = path.join(cwd, "data", `synthetic-alpha-pilot-${suffix}`);
const filePath = path.join(dataRoot, "state.json");
const artifactDir = path.join(dataRoot, "artifacts");
const reportJsonPath = path.join(dataRoot, "report.json");
const reportMarkdownPath = path.join(dataRoot, "report.md");
await fs.rm(dataRoot, { recursive: true, force: true });

const store = new FileMemoryStore({ filePath, artifactDir });
const reasoner = new ReasoningClient({
  apiKey: live ? config.openaiApiKey : "",
  baseUrl: config.openaiBaseUrl,
  model: config.reasoningModel,
  reasoningEffort: config.reasoningEffort
});
const service = new ConversationService({
  store,
  reasoner,
  screener: new StubScreener(),
  maxHistoryMessages: 12,
  skillOrchestratorDiagnosticEnabled: true
});
const evaluator = new ConversationEvaluator();
const allCases = JSON.parse(await fs.readFile(path.join(cwd, "evals", "synthetic-alpha-pilot-cases.json"), "utf8"));
const cases = caseFilter ? allCases.filter((testCase) => testCase.id === caseFilter) : allCases;
if (!cases.length) throw new Error(`Synthetic pilot case not found: ${caseFilter}`);
const results = [];

for (const [caseIndex, testCase] of cases.entries()) {
  const telegramChatId = `synthetic-${suffix}-${testCase.id}`;
  const userMeta = {
    firstName: testCase.firstName,
    username: `synthetic_${testCase.id}`
  };
  const runs = [];
  const issues = [];
  console.log(`[${caseIndex + 1}/${cases.length}] ${testCase.id}: start`);

  try {
    runs.push(await service.handleUserMessage({
      telegramChatId,
      text: `/start ${testCase.source}`,
      userMeta
    }));

    let pendingDecision = null;
    for (const turn of testCase.turns) {
      const run = await service.handleUserMessage({ telegramChatId, text: turn, userMeta });
      runs.push(run);
      pendingDecision = run.runtime?.managementCycle?.pendingDecision || null;
    }

    if (testCase.targetCycle && !pendingDecision) {
      for (const evidence of testCase.adaptiveTurns || []) {
        const adaptiveRun = await service.handleUserMessage({ telegramChatId, text: evidence, userMeta });
        runs.push(adaptiveRun);
        pendingDecision = adaptiveRun.runtime?.managementCycle?.pendingDecision || null;
        if (pendingDecision) break;
      }
    }

    if (testCase.targetCycle && testCase.rejectFirst && pendingDecision) {
      runs.push(await service.handleUserMessage({ telegramChatId, text: "не фиксируем", userMeta }));
      const retry = await service.handleUserMessage({
        telegramChatId,
        text: testCase.rejectionFeedback,
        userMeta
      });
      runs.push(retry);
      pendingDecision = retry.runtime?.managementCycle?.pendingDecision || null;
      for (const evidence of testCase.postRejectionTurns || []) {
        if (pendingDecision) break;
        const evidenceRetry = await service.handleUserMessage({ telegramChatId, text: evidence, userMeta });
        runs.push(evidenceRetry);
        pendingDecision = evidenceRetry.runtime?.managementCycle?.pendingDecision || null;
      }
    }

    if (testCase.targetCycle) {
      if (!pendingDecision) {
        issues.push("no_pending_decision_after_evidence");
      } else {
        runs.push(await service.handleUserMessage({ telegramChatId, text: "фиксируем", userMeta }));
        runs.push(await service.handleUserMessage({ telegramChatId, text: "готово", userMeta }));
        runs.push(await service.handleUserMessage({
          telegramChatId,
          text: `результат: ${testCase.result}`,
          userMeta
        }));
      }
    }
  } catch (error) {
    issues.push(`runtime_error:${normalize(error?.message).slice(0, 180)}`);
  }

  const state = await store.readState();
  const detail = detailFor(state, telegramChatId);
  const entryChannel = detail.thread?.entryState?.entryAttribution?.entryChannel || "unknown";
  const segmentId = detail.thread?.entryState?.audienceProfile?.primarySegment?.id || "";
  const primarySkill = [...runs].reverse().find((run) => run.decision?.skillSelection)?.decision?.skillSelection?.primarySkill || "";
  const cycle = state.decisionCycles.find((item) => item.threadId === detail.thread?.id) || null;
  const lock = state.decisionLocks.find((item) => item.threadId === detail.thread?.id) || null;
  const replies = runs.map((run) => normalize(run?.reply)).filter(Boolean);

  if (entryChannel !== testCase.expectedChannel) {
    issues.push(`channel_expected_${testCase.expectedChannel}_actual_${entryChannel}`);
  }
  if (testCase.expectedSegment && segmentId !== testCase.expectedSegment) {
    issues.push(`segment_expected_${testCase.expectedSegment}_actual_${segmentId || "none"}`);
  }
  if (testCase.expectedPrimary && primarySkill !== testCase.expectedPrimary) {
    issues.push(`skill_expected_${testCase.expectedPrimary}_actual_${primarySkill || "none"}`);
  }
  if (testCase.targetCycle && cycle?.status !== "completed") {
    issues.push(`cycle_expected_completed_actual_${cycle?.status || "none"}`);
  }

  const internalLeaks = replies.filter(hasInternalLeak).length;
  const multiQuestionReplies = replies.filter((reply) => questionCount(reply) > 1).length;
  if (internalLeaks) issues.push(`internal_leaks_${internalLeaks}`);
  if (multiQuestionReplies) issues.push(`multi_question_replies_${multiQuestionReplies}`);

  const evaluation = evaluator.evaluateConversation(detail);
  const result = {
    id: testCase.id,
    expectedChannel: testCase.expectedChannel,
    entryChannel,
    expectedSegment: testCase.expectedSegment || "",
    segmentId,
    expectedPrimary: testCase.expectedPrimary || "",
    primarySkill,
    targetCycle: Boolean(testCase.targetCycle),
    cycleStatus: cycle?.status || (testCase.targetCycle ? "not_created" : "not_required"),
    decisionStatus: lock?.status || "not_created",
    factCount: detail.observations.length,
    hypothesisCount: detail.hypotheses.length,
    firstStepCount: detail.actionWaves.length,
    artifactCount: state.artifacts.filter((item) => item.caseId === detail.activeCase?.id).length,
    internalLeaks,
    multiQuestionReplies,
    replyOpenings: replies.map(replyOpening),
    decisionReplyOpenings: runs.filter((run) => run.decision).map((run) => replyOpening(run.reply)),
    evaluation,
    issues,
    passed: issues.length === 0
  };
  results.push(result);
  console.log(`[${caseIndex + 1}/${cases.length}] ${testCase.id}: ${result.passed ? "PASS" : `FAIL ${issues.join(", ")}`}`);
}

const targetCycles = results.filter((item) => item.targetCycle).length;
const expectedBookRoutes = cases.filter((item) => item.expectedChannel === "book").length;
const expectedSegments = cases.filter((item) => item.expectedSegment).length;
const openingRepetitions = repeatedOpenings(results);
const summary = {
  participants: results.length,
  passed: results.filter((item) => item.passed).length,
  diagnosticCases: results.filter((item) => item.factCount > 0).length,
  withHypothesis: results.filter((item) => item.hypothesisCount > 0).length,
  withFirstStep: results.filter((item) => item.firstStepCount > 0).length,
  targetCycles,
  completedCycles: results.filter((item) => item.targetCycle && item.cycleStatus === "completed").length,
  expectedBookRoutes,
  bookRoutes: results.filter((item) => item.expectedChannel === "book" && item.entryChannel === "book").length,
  expectedSegments,
  qualifiedSegments: results.filter((item) => item.expectedSegment && item.segmentId === item.expectedSegment).length,
  averageEvaluationScore: Number((results.reduce((sum, item) => sum + item.evaluation.score, 0) / results.length).toFixed(1)),
  multiQuestionReplies: results.reduce((sum, item) => sum + item.multiQuestionReplies, 0),
  internalLeaks: results.reduce((sum, item) => sum + item.internalLeaks, 0),
  repeatedDecisionOpenings: openingRepetitions.reduce((sum, item) => sum + item.count - 1, 0),
  passRate: percent(results.filter((item) => item.passed).length, results.length),
  cycleCompletionRate: percent(results.filter((item) => item.targetCycle && item.cycleStatus === "completed").length, targetCycles)
};
const report = {
  generatedAt: new Date().toISOString(),
  mode,
  model: live ? config.reasoningModel : "heuristic",
  summary,
  repeatedIssues: issueSummary(results),
  repeatedOpenings: openingRepetitions,
  results
};

await fs.writeFile(reportJsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
await fs.writeFile(reportMarkdownPath, markdownReport(report), "utf8");

console.log("\nSynthetic alpha pilot summary");
console.log("=============================");
console.log(JSON.stringify(summary, null, 2));
console.log(`Report: ${reportMarkdownPath}`);

if (results.some((item) => item.issues.some((issue) => issue.startsWith("runtime_error:")))) {
  process.exitCode = 1;
}
