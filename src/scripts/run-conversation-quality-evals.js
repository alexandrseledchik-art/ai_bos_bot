import fs from "node:fs/promises";
import path from "node:path";

import { ConversationService } from "../application/conversation-service.js";
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

function paragraphCount(text) {
  return String(text || "")
    .split(/\n\s*\n/)
    .map((item) => item.trim())
    .filter(Boolean)
    .length;
}

function openingFingerprint(text) {
  const firstSentence = String(text || "")
    .trim()
    .split(/[.!?…]\s|\n/)[0] || "";

  return normalizeText(firstSentence)
    .replace(/[«»"']/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 42);
}

function hasVisibleTemplateLabels(text) {
  return /(^|\n)\s*(что я понял|гипотезы|почему это важно|следующий шаг)\s*:/i.test(String(text || ""));
}

function hasInternalLeak(text) {
  return /knownFacts|workingHypotheses|entryState|graphPacket|systemLayers|candidateConstraints|graphAnalysis/i.test(
    String(text || "")
  );
}

function hasUnexplainedEnglishTerm(text) {
  const normalized = String(text || "");
  const suspiciousTerms = [
    "delivery",
    "cash",
    "routing",
    "handoff",
    "owner",
    "scorecard",
    "lead scoring",
    "business architect",
    "tool navigator",
    "strategic sparring partner",
    "operator/implementation partner"
  ];

  return suspiciousTerms.some((term) => new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(normalized));
}

function addIssue(issues, passed, issue) {
  if (!passed) {
    issues.push(issue);
  }
}

async function createService(cwd) {
  const filePath = path.join(cwd, "data", "conversation-quality-eval-state.json");
  const artifactDir = path.join(cwd, "data", "conversation-quality-eval-artifacts");

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
  const raw = await fs.readFile(path.join(cwd, "evals", "conversation-quality-cases.json"), "utf8");
  return JSON.parse(raw);
}

function checkTurn(run, check = {}, index) {
  const issues = [];
  const reply = run.reply || "";

  addIssue(issues, !hasVisibleTemplateLabels(reply), `turn ${index}: visible template labels leaked`);
  addIssue(issues, !hasInternalLeak(reply), `turn ${index}: internal structure leaked`);

  if (check.forbidUnexplainedEnglishTerms !== false) {
    addIssue(issues, !hasUnexplainedEnglishTerm(reply), `turn ${index}: unexplained English term leaked`);
  }

  if ((check.mustContain || []).length) {
    addIssue(issues, includesAll(reply, check.mustContain), `turn ${index}: missed required phrase(s)`);
  }

  if ((check.mustContainAny || []).length) {
    addIssue(issues, includesAny(reply, check.mustContainAny), `turn ${index}: missed any allowed target phrase`);
  }

  if ((check.mustNotContain || []).length) {
    addIssue(issues, !includesAny(reply, check.mustNotContain), `turn ${index}: included forbidden phrase`);
  }

  if (check.requireQuestion) {
    addIssue(issues, reply.includes("?"), `turn ${index}: expected a question`);
  }

  if (check.maxParagraphs != null) {
    addIssue(
      issues,
      paragraphCount(reply) <= Number(check.maxParagraphs),
      `turn ${index}: too many paragraphs expected<=${check.maxParagraphs} actual=${paragraphCount(reply)}`
    );
  }

  if (check.maxChars != null) {
    addIssue(
      issues,
      reply.length <= Number(check.maxChars),
      `turn ${index}: reply too long expected<=${check.maxChars} actual=${reply.length}`
    );
  }

  return issues;
}

function checkConversation(runs, checks = {}) {
  const issues = [];
  const fingerprints = runs.map((run) => openingFingerprint(run.reply)).filter(Boolean);
  const counts = new Map();

  for (const fingerprint of fingerprints) {
    counts.set(fingerprint, (counts.get(fingerprint) || 0) + 1);
  }

  if (checks.minUniqueOpeners != null) {
    addIssue(
      issues,
      counts.size >= Number(checks.minUniqueOpeners),
      `conversation: unique openers expected>=${checks.minUniqueOpeners} actual=${counts.size}`
    );
  }

  if (checks.maxSameOpeningCount != null) {
    const maxCount = Math.max(0, ...counts.values());
    addIssue(
      issues,
      maxCount <= Number(checks.maxSameOpeningCount),
      `conversation: repeated opener count expected<=${checks.maxSameOpeningCount} actual=${maxCount}`
    );
  }

  return issues;
}

async function runCase(testCase, service) {
  const chatId = `conversation-quality-${testCase.id}`;
  const runs = [];
  const issues = [];

  for (const [index, input] of testCase.turns.entries()) {
    const run = await service.handleUserMessage({
      telegramChatId: chatId,
      text: input,
      userMeta: {
        firstName: "Александр",
        username: `quality_${testCase.id}`
      }
    });
    runs.push(run);
    issues.push(...checkTurn(run, testCase.turnChecks?.[index] || {}, index + 1));
  }

  const finalRun = runs[runs.length - 1];

  if (testCase.expectedEntryMode) {
    addIssue(
      issues,
      finalRun.classification.entryMode === testCase.expectedEntryMode,
      `entryMode expected=${testCase.expectedEntryMode} actual=${finalRun.classification.entryMode}`
    );
  }

  if (testCase.expectedAction) {
    addIssue(
      issues,
      finalRun.decision.decision.action === testCase.expectedAction,
      `action expected=${testCase.expectedAction} actual=${finalRun.decision.decision.action}`
    );
  }

  issues.push(...checkConversation(runs, testCase.conversationChecks || {}));

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

  for (const testCase of cases) {
    results.push(await runCase(testCase, service));
  }

  console.log("");
  console.log("Conversation quality evals");
  console.log("==========================");

  for (const result of results) {
    console.log(`${result.passed ? "PASS" : "FAIL"} ${result.id}`);
    for (const issue of result.issues) {
      console.log(`  - ${issue}`);
    }
  }

  const passed = results.filter((item) => item.passed).length;
  const total = results.length;

  console.log("");
  console.log(`Score: ${passed}/${total}`);

  if (passed !== total) {
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
