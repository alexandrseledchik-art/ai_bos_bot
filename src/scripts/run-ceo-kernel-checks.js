import fs from "node:fs/promises";
import path from "node:path";

import { ConversationService } from "../application/conversation-service.js";
import { ReasoningClient } from "../infrastructure/openai/reasoning-client.js";
import { FileMemoryStore } from "../infrastructure/storage/file-store.js";

class EvalWebsiteScreener {
  async screen(url) {
    return {
      url,
      knownFacts: [`URL: ${url}`],
      observations: [],
      canNotAssert: ["Внешний скрининг не раскрывает внутренние процессы без данных."],
      raw: {}
    };
  }
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function includesAny(text, phrases = []) {
  const haystack = normalizeText(text);
  return phrases.some((phrase) => haystack.includes(normalizeText(phrase)));
}

function includesAll(text, phrases = []) {
  const haystack = normalizeText(text);
  return phrases.every((phrase) => haystack.includes(normalizeText(phrase)));
}

function paragraphCount(text) {
  return String(text || "")
    .split(/\n\s*\n/)
    .map((item) => item.trim())
    .filter(Boolean)
    .length;
}

function addIssue(issues, passed, issue) {
  if (!passed) {
    issues.push(issue);
  }
}

function responseIssues(reply, checks = {}) {
  const issues = [];

  if ((checks.mustContain || []).length) {
    addIssue(issues, includesAll(reply, checks.mustContain), "response missed required phrase(s)");
  }
  if ((checks.mustContainAny || []).length) {
    addIssue(issues, includesAny(reply, checks.mustContainAny), "response missed any allowed phrase");
  }
  if ((checks.mustNotContain || []).length) {
    addIssue(issues, !includesAny(reply, checks.mustNotContain), "response included forbidden phrase");
  }
  if (checks.requireQuestion) {
    addIssue(issues, String(reply || "").includes("?"), "response expected a question");
  }
  if (checks.maxParagraphs != null) {
    addIssue(
      issues,
      paragraphCount(reply) <= Number(checks.maxParagraphs),
      `response too many paragraphs expected<=${checks.maxParagraphs} actual=${paragraphCount(reply)}`
    );
  }
  if (checks.maxChars != null) {
    addIssue(
      issues,
      String(reply || "").length <= Number(checks.maxChars),
      `response too long expected<=${checks.maxChars} actual=${String(reply || "").length}`
    );
  }

  addIssue(issues, !/entryState|graphPacket|candidateConstraints|referenceGate|dataSufficiency|autonomousData/i.test(reply), "internal field leaked");

  return issues;
}

async function createService(cwd) {
  const filePath = path.join(cwd, "data", "ceo-kernel-eval-state.json");
  const artifactDir = path.join(cwd, "data", "ceo-kernel-eval-artifacts");

  await fs.rm(filePath, { force: true });
  await fs.rm(artifactDir, { recursive: true, force: true });

  const store = new FileMemoryStore({ filePath, artifactDir });
  const reasoner = new ReasoningClient({
    apiKey: "",
    baseUrl: "",
    model: "",
    reasoningEffort: "medium"
  });

  return new ConversationService({
    store,
    reasoner,
    screener: new EvalWebsiteScreener(),
    maxHistoryMessages: 8
  });
}

async function loadCases(cwd) {
  const raw = await fs.readFile(path.join(cwd, "evals", "ceo-kernel-cases.json"), "utf8");
  return JSON.parse(raw);
}

function checkExpected(run, expected = {}) {
  const issues = [];
  const reply = run.reply || "";

  if (expected.intentIntegrity?.type) {
    addIssue(
      issues,
      run.intentIntegrity?.integrityType === expected.intentIntegrity.type,
      `intentIntegrity.type expected=${expected.intentIntegrity.type} actual=${run.intentIntegrity?.integrityType}`
    );
  }

  if (typeof expected.intentIntegrity?.mustReframe === "boolean") {
    addIssue(
      issues,
      Boolean(run.intentIntegrity?.mustReframe) === expected.intentIntegrity.mustReframe,
      `intentIntegrity.mustReframe expected=${expected.intentIntegrity.mustReframe} actual=${run.intentIntegrity?.mustReframe}`
    );
  }

  if (expected.interventionDepth?.mode) {
    addIssue(
      issues,
      run.intentIntegrity?.interventionDepth === expected.interventionDepth.mode,
      `interventionDepth expected=${expected.interventionDepth.mode} actual=${run.intentIntegrity?.interventionDepth}`
    );
  }

  if (expected.referenceGate?.mustTrigger) {
    const actualLayers = run.referenceGate?.candidateLayers || [];
    const expectedLayers = expected.referenceGate.candidateLayers || [];
    addIssue(issues, actualLayers.length > 0, "referenceGate did not trigger any candidate layer");
    if (expectedLayers.length) {
      addIssue(
        issues,
        expectedLayers.some((item) => actualLayers.includes(item)),
        `referenceGate candidate layer mismatch expectedAny=${expectedLayers.join(",")} actual=${actualLayers.join(",")}`
      );
    }
  }

  if (expected.dataBehavior?.mustSearchExistingContextFirst) {
    addIssue(
      issues,
      Boolean(run.autonomousData?.searchedBeforeAsking),
      "autonomousData did not search context before asking"
    );
  }

  if (expected.hypothesisBehavior?.minHypotheses != null) {
    const hypotheses = [
      ...(run.decision?.response?.hypotheses || []),
      ...((run.decision?.entryState?.candidateConstraints || []).map((item) => item.label))
    ].filter(Boolean);
    addIssue(
      issues,
      hypotheses.length >= Number(expected.hypothesisBehavior.minHypotheses),
      `hypotheses expected>=${expected.hypothesisBehavior.minHypotheses} actual=${hypotheses.length}`
    );
  }

  if ((expected.hypothesisBehavior?.mustNotJumpTo || []).length) {
    const visibleThinking = [
      reply,
      run.decision?.response?.nextStep,
      ...((run.decision?.entryState?.candidateConstraints || []).map((item) => item.label))
    ].join(" ");
    addIssue(
      issues,
      !includesAny(visibleThinking, expected.hypothesisBehavior.mustNotJumpTo),
      "hypothesis jumped to forbidden fix"
    );
  }

  if (expected.nextStep?.mustBeOne) {
    addIssue(
      issues,
      Boolean(run.decision?.response?.nextStep || run.decision?.entryState?.nextBestStep),
      "nextStep is empty"
    );
  }

  if ((expected.nextStep?.mustContainAny || []).length) {
    const nextText = [
      run.decision?.response?.nextStep,
      run.decision?.entryState?.nextBestStep,
      reply
    ].join(" ");
    addIssue(
      issues,
      includesAny(nextText, expected.nextStep.mustContainAny),
      "nextStep missed expected concept"
    );
  }

  if ((expected.escalation?.reasonAny || []).length) {
    const text = [
      reply,
      run.intentIntegrity?.reason,
      run.dataSufficiency?.reason,
      run.decision?.decision?.rationale
    ].join(" ");
    addIssue(
      issues,
      expected.escalation.mustEscalateToOwner ? includesAny(text, ["собственник", "решение", "риск", "обязательств", "стратег"]) : true,
      "expected owner-level escalation language"
    );
  }

  issues.push(...responseIssues(reply, expected.responseChecks || {}));

  return issues;
}

async function runCase(testCase, service) {
  const chatId = `ceo-kernel-${testCase.id}`;
  let lastRun = null;

  for (const turn of testCase.turns || []) {
    lastRun = await service.handleUserMessage({
      telegramChatId: chatId,
      text: turn,
      userMeta: {
        firstName: "Александр",
        username: `ceo_${testCase.id}`
      }
    });
  }

  const issues = checkExpected(lastRun, testCase.expected || {});

  return {
    id: testCase.id,
    passed: issues.length === 0,
    issues
  };
}

async function run() {
  const cwd = process.cwd();
  const cases = await loadCases(cwd);
  const service = await createService(cwd);
  const results = [];

  console.log("");
  console.log("CEO kernel checks");
  console.log("=================");

  for (const testCase of cases) {
    const result = await runCase(testCase, service);
    results.push(result);
    console.log(`${result.passed ? "PASS" : "FAIL"} ${result.id}`);
    for (const issue of result.issues) {
      console.log(`  - ${issue}`);
    }
  }

  const passed = results.filter((item) => item.passed).length;
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
