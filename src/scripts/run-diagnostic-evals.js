import fs from "node:fs/promises";
import path from "node:path";

import { ConversationService } from "../application/conversation-service.js";
import { classifyInput } from "../application/classify-input.js";
import { ReasoningClient } from "../infrastructure/openai/reasoning-client.js";
import { FileMemoryStore } from "../infrastructure/storage/file-store.js";

class EvalWebsiteScreener {
  async screen(url) {
    return {
      url,
      knownFacts: [
        `URL: ${url}`,
        "HTTP status: 200",
        "Title: ACME Growth Studio",
        "H1: Growth system for B2B founders",
        "Meta description: Increase pipeline clarity and turn traffic into qualified demos.",
        "Предположительный тип сайта: B2B-сервис или SaaS"
      ],
      observations: [
        'Первый экран обещает: "Growth system for B2B founders".',
        "Есть явный CTA: Book demo."
      ],
      canNotAssert: [
        "Нельзя утверждать по сайту, что именно ломает экономику бизнеса.",
        "Нельзя делать выводы о качестве команды, оргструктуры и операционного контура без прямых данных."
      ],
      raw: {
        title: "ACME Growth Studio",
        headings: ["Growth system for B2B founders"],
        description: "Increase pipeline clarity and turn traffic into qualified demos.",
        ctas: ["Book demo"],
        siteType: "B2B-сервис или SaaS"
      }
    };
  }
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function includesAll(text, phrases = []) {
  const haystack = normalizeText(text);
  return phrases.every((phrase) => haystack.includes(normalizeText(phrase)));
}

function includesAny(text, phrases = []) {
  const haystack = normalizeText(text);
  return phrases.some((phrase) => haystack.includes(normalizeText(phrase)));
}

function countUniqueLayers(run) {
  const layers = new Set();
  for (const item of run.decision.entryState?.candidateConstraints || []) {
    if (item.layer) {
      layers.add(item.layer);
    }
  }
  for (const item of run.decision.graphAnalysis?.candidateStates || []) {
    if (item.layer) {
      layers.add(item.layer);
    }
  }
  for (const item of run.decision.graphAnalysis?.candidateCauses || []) {
    if (item.layer) {
      layers.add(item.layer);
    }
  }
  return layers.size;
}

function buildChecks() {
  return [];
}

function addCheck(checks, passed, issue) {
  checks.push({ passed, issue });
}

function finalizeMetric(checks) {
  if (!checks.length) {
    return {
      score: 1,
      issues: []
    };
  }

  const passedCount = checks.filter((item) => item.passed).length;
  return {
    score: Number((passedCount / checks.length).toFixed(2)),
    issues: checks.filter((item) => !item.passed).map((item) => item.issue)
  };
}

function compareSignalSufficiency(actual, expected) {
  const order = {
    weak: 1,
    partial: 2,
    enough: 3
  };
  return (order[actual] || 0) === (order[expected] || 0);
}

function extractSection(text, heading) {
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`${escapedHeading}\\n([\\s\\S]*?)(?:\\n## |$)`, "i");
  const match = text.match(regex);
  return match ? match[1].trim() : "";
}

function countBulletsInSection(text, heading) {
  const section = extractSection(text, heading);
  if (!section) {
    return 0;
  }

  return section
    .split(/\r?\n/)
    .filter((line) => line.trim().startsWith("-"))
    .length;
}

function scoreNextBestQuestion(run, spec = {}) {
  const checks = buildChecks();
  const question = run.decision.entryState?.nextBestQuestion || run.decision.response?.nextStep || "";
  const discriminatingSignals = run.decision.graphAnalysis?.discriminatingSignals || [];
  const candidateConstraints = run.decision.entryState?.candidateConstraints || [];

  if (spec.required !== false) {
    addCheck(checks, Boolean(question.trim()), "nextBestQuestion is empty");
  }
  if (spec.requireQuestionMark) {
    addCheck(checks, question.includes("?"), "nextBestQuestion is not phrased as a question");
  }
  if (spec.minDiscriminatingSignals) {
    addCheck(
      checks,
      discriminatingSignals.length >= spec.minDiscriminatingSignals,
      `discriminating signals expected>=${spec.minDiscriminatingSignals} actual=${discriminatingSignals.length}`
    );
  }
  if (spec.minCandidateConstraints) {
    addCheck(
      checks,
      candidateConstraints.length >= spec.minCandidateConstraints,
      `candidate constraints expected>=${spec.minCandidateConstraints} actual=${candidateConstraints.length}`
    );
  }
  if ((spec.mustContain || []).length) {
    addCheck(checks, includesAll(question, spec.mustContain), "nextBestQuestion missed required phrase(s)");
  }
  if ((spec.mustNotContain || []).length) {
    addCheck(checks, !includesAny(question, spec.mustNotContain), "nextBestQuestion included forbidden phrase");
  }

  return finalizeMetric(checks);
}

function scoreCauseDepth(run, spec = {}) {
  const checks = buildChecks();
  const entryState = run.decision.entryState || {};
  const graph = run.decision.graphAnalysis || {};
  const selectedConstraint = normalizeText(entryState.selectedConstraint);
  const claimedCause = normalizeText(entryState.claimedCause);
  const topConstraint = normalizeText(entryState.candidateConstraints?.[0]?.label);

  if (spec.requireClaimedCauseNotSelected && claimedCause) {
    addCheck(
      checks,
      selectedConstraint !== claimedCause && topConstraint !== claimedCause,
      "user-claimed cause collapsed into selected/top constraint"
    );
  }
  if (spec.minCandidateStates) {
    addCheck(
      checks,
      (graph.candidateStates || []).length >= spec.minCandidateStates,
      `candidate states expected>=${spec.minCandidateStates} actual=${(graph.candidateStates || []).length}`
    );
  }
  if (spec.minCandidateCauses) {
    addCheck(
      checks,
      (graph.candidateCauses || []).length >= spec.minCandidateCauses,
      `candidate causes expected>=${spec.minCandidateCauses} actual=${(graph.candidateCauses || []).length}`
    );
  }
  if (spec.minUniqueLayers) {
    const uniqueLayers = countUniqueLayers(run);
    addCheck(
      checks,
      uniqueLayers >= spec.minUniqueLayers,
      `unique layers expected>=${spec.minUniqueLayers} actual=${uniqueLayers}`
    );
  }
  if (spec.minGraphConfidence != null) {
    addCheck(
      checks,
      Number(graph.graphConfidence || 0) >= Number(spec.minGraphConfidence),
      `graph confidence expected>=${spec.minGraphConfidence} actual=${Number(graph.graphConfidence || 0).toFixed(2)}`
    );
  }
  if ((spec.requiredConstraintTerms || []).length) {
    const haystack = [
      entryState.selectedConstraint || "",
      ...(entryState.candidateConstraints || []).map((item) => item.label)
    ].join("\n");
    addCheck(checks, includesAll(haystack, spec.requiredConstraintTerms), "constraint layer missed required term(s)");
  }

  return finalizeMetric(checks);
}

function scoreUncertainty(run, spec = {}) {
  const checks = buildChecks();
  const responseHypotheses = run.decision.response?.hypotheses || [];
  const candidateConstraints = run.decision.entryState?.candidateConstraints || [];
  const conflicts = run.decision.graphAnalysis?.hypothesisConflicts || [];
  const replySurface = [run.reply, run.decision.response?.whatIUnderstood, run.decision.response?.whyItMatters].join("\n");

  if (spec.minResponseHypotheses) {
    addCheck(
      checks,
      responseHypotheses.length >= spec.minResponseHypotheses,
      `response hypotheses expected>=${spec.minResponseHypotheses} actual=${responseHypotheses.length}`
    );
  }
  if (spec.minAlternativeHypotheses) {
    addCheck(
      checks,
      candidateConstraints.length >= spec.minAlternativeHypotheses,
      `candidate constraints expected>=${spec.minAlternativeHypotheses} actual=${candidateConstraints.length}`
    );
  }
  if (spec.minConflicts != null) {
    addCheck(
      checks,
      conflicts.length >= spec.minConflicts,
      `hypothesis conflicts expected>=${spec.minConflicts} actual=${conflicts.length}`
    );
  }
  if ((spec.forbiddenCertaintyPhrases || []).length) {
    addCheck(
      checks,
      !includesAny(replySurface, spec.forbiddenCertaintyPhrases),
      "reply used premature certainty language"
    );
  }

  return finalizeMetric(checks);
}

function scoreAdviceDiscipline(run, spec = {}) {
  const checks = buildChecks();
  const replySurface = [run.reply, run.decision.response?.nextStep, run.decision.entryState?.nextBestStep].join("\n");
  const actionWaveEnabled = Boolean(run.runtime?.persistedMemory?.actionWave?.enabled);

  if (spec.expectedAction) {
    addCheck(
      checks,
      run.decision.decision?.action === spec.expectedAction,
      `action expected=${spec.expectedAction} actual=${run.decision.decision?.action}`
    );
  }
  if ((spec.forbiddenTerms || []).length) {
    addCheck(checks, !includesAny(replySurface, spec.forbiddenTerms), "reply included premature or forbidden advice");
  }
  if (spec.requireNoActionWave) {
    addCheck(checks, !actionWaveEnabled, "actionWave was enabled too early");
  }
  if (spec.requireActionWave) {
    addCheck(checks, actionWaveEnabled, "actionWave was not enabled");
  }
  if (spec.requireNoArtifact) {
    addCheck(checks, !run.artifactPath, "artifact was saved too early");
  }
  if (spec.requireArtifact) {
    addCheck(checks, Boolean(run.artifactPath), "artifact was expected but not saved");
  }

  return finalizeMetric(checks);
}

function scorePromotion(run, caseSpec, spec = {}, turnRuns = []) {
  const checks = buildChecks();

  if (typeof spec.expectPromotion === "boolean") {
    addCheck(
      checks,
      Boolean(run.runtime?.promotionApplied) === spec.expectPromotion,
      `promotion expected=${spec.expectPromotion} actual=${Boolean(run.runtime?.promotionApplied)}`
    );
  }
  if (typeof spec.expectedCaseKind === "string") {
    addCheck(
      checks,
      (run.runtime?.activeCaseKind || "") === spec.expectedCaseKind,
      `case kind expected=${spec.expectedCaseKind || "<empty>"} actual=${run.runtime?.activeCaseKind || "<empty>"}`
    );
  }
  if (spec.expectedReadiness) {
    addCheck(
      checks,
      (run.decision.entryState?.promotionReadiness || "") === spec.expectedReadiness,
      `promotion readiness expected=${spec.expectedReadiness} actual=${run.decision.entryState?.promotionReadiness || "<empty>"}`
    );
  }
  if (spec.expectEarlierTurnsWithoutPromotion && turnRuns.length > 1) {
    const previousTurnsStayedInEntry = turnRuns
      .slice(0, -1)
      .every((item) => !item.runtime?.promotionApplied && !item.runtime?.activeCaseKind);
    addCheck(checks, previousTurnsStayedInEntry, "earlier turns promoted too early");
  }

  return finalizeMetric(checks);
}

function scoreArtifact(run, artifactBody, spec = {}) {
  const checks = buildChecks();

  if (!spec.expectSaved) {
    addCheck(checks, !artifactBody, "artifact was saved when it should not exist");
    return finalizeMetric(checks);
  }

  addCheck(checks, Boolean(artifactBody), "artifact body is missing");
  if (!artifactBody) {
    return finalizeMetric(checks);
  }

  if ((spec.requiredSections || []).length) {
    addCheck(
      checks,
      spec.requiredSections.every((section) => artifactBody.includes(section)),
      "artifact missed one or more required sections"
    );
  }
  if ((spec.requiredTerms || []).length) {
    addCheck(checks, includesAll(artifactBody, spec.requiredTerms), "artifact missed required term(s)");
  }
  if (spec.minCandidateConstraintBullets) {
    addCheck(
      checks,
      countBulletsInSection(artifactBody, "## Candidate constraints") >= spec.minCandidateConstraintBullets,
      `candidate constraint bullets expected>=${spec.minCandidateConstraintBullets}`
    );
  }
  if (spec.minCandidateStateBullets) {
    addCheck(
      checks,
      countBulletsInSection(artifactBody, "## Candidate states") >= spec.minCandidateStateBullets,
      `candidate state bullets expected>=${spec.minCandidateStateBullets}`
    );
  }
  if (spec.minCandidateCauseBullets) {
    addCheck(
      checks,
      countBulletsInSection(artifactBody, "## Candidate causes") >= spec.minCandidateCauseBullets,
      `candidate cause bullets expected>=${spec.minCandidateCauseBullets}`
    );
  }

  return finalizeMetric(checks);
}

function printMetric(result, key) {
  const metric = result.metrics[key];
  console.log(`  ${key}: ${metric.score.toFixed(2)}`);
  for (const issue of metric.issues) {
    console.log(`    - ${issue}`);
  }
}

async function loadCases(cwd) {
  const raw = await fs.readFile(path.join(cwd, "evals", "diagnostic-quality-cases.json"), "utf8");
  return JSON.parse(raw);
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function createService(cwd) {
  const filePath = path.join(cwd, "data", "diagnostic-eval-state.json");
  const artifactDir = path.join(cwd, "data", "diagnostic-eval-artifacts");

  await fs.rm(filePath, { force: true });
  await fs.rm(artifactDir, { recursive: true, force: true });

  const store = new FileMemoryStore({ filePath, artifactDir });
  const reasoner = new ReasoningClient({
    apiKey: "",
    baseUrl: "",
    model: "",
    reasoningEffort: "medium"
  });

  return {
    store,
    service: new ConversationService({
      store,
      reasoner,
      screener: new EvalWebsiteScreener(),
      maxHistoryMessages: 6
    })
  };
}

async function runCase(testCase, service, store) {
  const chatId = `diagnostic-eval-${testCase.id}`;
  const turnRuns = [];

  for (const turn of testCase.turns) {
    turnRuns.push(
      await service.handleUserMessage({
        telegramChatId: chatId,
        text: turn,
        userMeta: {
          username: `diagnostic_${testCase.id}`
        }
      })
    );
  }

  const run = turnRuns[turnRuns.length - 1];
  const classification = classifyInput(testCase.turns[testCase.turns.length - 1]);
  const artifactBody = run.artifactPath && await fileExists(run.artifactPath)
    ? await fs.readFile(run.artifactPath, "utf8")
    : "";
  const state = await store.readState();
  const thread = state.threads.find((item) => item.telegramChatId === chatId);

  const issues = [];
  if (testCase.expectedRoute && classification.type !== testCase.expectedRoute) {
    issues.push(`route expected=${testCase.expectedRoute} actual=${classification.type}`);
  }
  if (testCase.expectedMode && run.decision.selectedMode !== testCase.expectedMode) {
    issues.push(`mode expected=${testCase.expectedMode} actual=${run.decision.selectedMode}`);
  }
  if (testCase.expectedAction && run.decision.decision.action !== testCase.expectedAction) {
    issues.push(`action expected=${testCase.expectedAction} actual=${run.decision.decision.action}`);
  }

  const metrics = {
    nextBestQuestion: scoreNextBestQuestion(run, testCase.metrics?.nextBestQuestion),
    causeDepth: scoreCauseDepth(run, testCase.metrics?.causeDepth),
    uncertainty: scoreUncertainty(run, testCase.metrics?.uncertainty),
    adviceDiscipline: scoreAdviceDiscipline(run, testCase.metrics?.adviceDiscipline),
    promotion: scorePromotion(run, testCase, testCase.metrics?.promotion, turnRuns),
    artifact: scoreArtifact(run, artifactBody, testCase.metrics?.artifact)
  };

  for (const metric of Object.values(metrics)) {
    issues.push(...metric.issues);
  }

  const overallScore = Number(
    (
      Object.values(metrics).reduce((sum, metric) => sum + metric.score, 0) /
      Object.values(metrics).length
    ).toFixed(2)
  );

  return {
    id: testCase.id,
    passed: issues.length === 0,
    overallScore,
    metrics,
    issues,
    debug: {
      reply: run.reply,
      nextBestQuestion: run.decision.entryState?.nextBestQuestion || "",
      selectedConstraint: run.decision.entryState?.selectedConstraint || "",
      threadPromotionReadiness: thread?.entryState?.promotionReadiness || "",
      artifactPath: run.artifactPath || ""
    }
  };
}

async function run() {
  const cwd = process.cwd();
  const cases = await loadCases(cwd);
  const { service, store } = await createService(cwd);
  const results = [];

  for (const testCase of cases) {
    results.push(await runCase(testCase, service, store));
  }

  console.log("");
  console.log("Diagnostic quality evals");
  console.log("========================");

  for (const result of results) {
    console.log(`${result.passed ? "PASS" : "FAIL"} ${result.id} overall=${result.overallScore.toFixed(2)}`);
    printMetric(result, "nextBestQuestion");
    printMetric(result, "causeDepth");
    printMetric(result, "uncertainty");
    printMetric(result, "adviceDiscipline");
    printMetric(result, "promotion");
    printMetric(result, "artifact");
  }

  const metricNames = ["nextBestQuestion", "causeDepth", "uncertainty", "adviceDiscipline", "promotion", "artifact"];
  const passed = results.filter((item) => item.passed).length;
  const averages = Object.fromEntries(
    metricNames.map((metricName) => [
      metricName,
      Number(
        (
          results.reduce((sum, item) => sum + item.metrics[metricName].score, 0) /
          results.length
        ).toFixed(2)
      )
    ])
  );

  console.log("");
  console.log("Averages");
  console.log("--------");
  for (const [metricName, average] of Object.entries(averages)) {
    console.log(`${metricName}: ${average.toFixed(2)}`);
  }

  console.log("");
  console.log(`Score: ${passed}/${results.length}`);

  if (passed !== results.length) {
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
