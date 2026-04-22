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
        'Есть явный CTA: Book demo.'
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
  return String(value || "").toLowerCase();
}

function includesAll(reply, needles) {
  const haystack = normalizeText(reply);
  return needles.every((needle) => haystack.includes(normalizeText(needle)));
}

function includesAny(reply, needles) {
  const haystack = normalizeText(reply);
  return needles.some((needle) => haystack.includes(normalizeText(needle)));
}

function includesAnyForbidden(reply, needles) {
  const haystack = normalizeText(reply);
  return needles.some((needle) => haystack.includes(normalizeText(needle)));
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function loadCases(cwd) {
  const raw = await fs.readFile(path.join(cwd, "evals", "golden-cases.json"), "utf8");
  return JSON.parse(raw);
}

async function createService(cwd) {
  const filePath = path.join(cwd, "data", "eval-state.json");
  const artifactDir = path.join(cwd, "data", "eval-artifacts");

  await fs.rm(filePath, { force: true });
  await fs.rm(artifactDir, { recursive: true, force: true });

  const store = new FileMemoryStore({
    filePath,
    artifactDir
  });
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
    maxHistoryMessages: 6
  });
}

function printCaseResult(result) {
  const status = result.passed ? "PASS" : "FAIL";
  console.log(`${status} ${result.id}`);

  for (const issue of result.issues) {
    console.log(`  - ${issue}`);
  }
}

async function run() {
  const cwd = process.cwd();
  const cases = await loadCases(cwd);
  const service = await createService(cwd);
  const results = [];

  for (const testCase of cases) {
    const classification = classifyInput(testCase.input);
    const run = await service.handleUserMessage({
      telegramChatId: `eval-${testCase.id}`,
      text: testCase.input,
      userMeta: {
        username: `eval_${testCase.id}`
      }
    });

    const issues = [];

    if (classification.type !== testCase.expectedRoute) {
      issues.push(`route expected=${testCase.expectedRoute} actual=${classification.type}`);
    }

    if (run.decision.selectedMode !== testCase.expectedMode) {
      issues.push(
        `mode expected=${testCase.expectedMode} actual=${run.decision.selectedMode}`
      );
    }

    if (run.decision.decision.action !== testCase.expectedAction) {
      issues.push(
        `action expected=${testCase.expectedAction} actual=${run.decision.decision.action}`
      );
    }

    if (!includesAll(run.reply, testCase.mustContain || [])) {
      issues.push("reply missed one or more required phrases");
    }

    if ((testCase.mustContainAny || []).length && !includesAny(run.reply, testCase.mustContainAny || [])) {
      issues.push("reply missed any of the allowed target phrases");
    }

    if (includesAnyForbidden(run.reply, testCase.mustNotContain || [])) {
      issues.push("reply included a forbidden phrase");
    }

    const artifactExists = run.artifactPath ? await fileExists(run.artifactPath) : false;
    if (artifactExists !== Boolean(testCase.artifactExpected)) {
      issues.push(
        `artifact expected=${Boolean(testCase.artifactExpected)} actual=${artifactExists}`
      );
    }

    results.push({
      id: testCase.id,
      passed: issues.length === 0,
      issues
    });
  }

  console.log("");
  console.log("Business diagnostic evals");
  console.log("=========================");

  for (const result of results) {
    printCaseResult(result);
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
