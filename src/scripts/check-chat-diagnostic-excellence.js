import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

import { ConversationService } from "../application/conversation-service.js";
import { ReasoningClient } from "../infrastructure/openai/reasoning-client.js";
import { FileMemoryStore } from "../infrastructure/storage/file-store.js";

class StubWebsiteScreener {
  async screen(url) {
    return {
      url,
      knownFacts: [`URL: ${url}`],
      observations: [],
      canNotAssert: ["По одному сайту нельзя доказать внутреннее ограничение бизнеса."],
      raw: {}
    };
  }
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function includesAny(text, phrases) {
  const haystack = normalizeText(text);
  return phrases.some((phrase) => haystack.includes(normalizeText(phrase)));
}

function assertDiagnosticQuality(run, minScore = 10) {
  assert.ok(run.decision?.diagnosticQuality, "chat diagnosticQuality is missing");
  assert.ok(
    run.decision.diagnosticQuality.score10 >= minScore,
    `chat diagnostic quality expected>=${minScore} actual=${run.decision.diagnosticQuality.score10}: ${run.decision.diagnosticQuality.missing.join("; ")}`
  );
}

async function createService(cwd) {
  const filePath = path.join(cwd, "data", "chat-diagnostic-excellence-state.json");
  const artifactDir = path.join(cwd, "data", "chat-diagnostic-excellence-artifacts");

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
    screener: new StubWebsiteScreener(),
    maxHistoryMessages: 8
  });
}

async function ask(service, id, text) {
  return service.handleUserMessage({
    telegramChatId: `chat-diagnostic-${id}`,
    text,
    userMeta: {
      firstName: "Александр",
      username: `chat_diag_${id}`
    }
  });
}

async function run() {
  const cwd = process.cwd();
  const service = await createService(cwd);

  const crm = await ask(service, "crm", "Нам нужна CRM");
  assertDiagnosticQuality(crm, 10);
  assert.equal(crm.intentIntegrity?.integrityType, "proposed_solution");
  assert.ok(/какую проблему|проблему.*решить|должно снять/i.test(crm.reply), "CRM reply should reframe solution into problem");
  assert.ok(!/внедр(и|ять)|настрой(те)?\s+crm/i.test(crm.reply), "CRM reply should not jump into implementation");

  const profit = await ask(
    service,
    "profit",
    "Выручка есть, а прибыль почти не остаётся. Маржа упала с 22% до 11% за 3 месяца."
  );
  assertDiagnosticQuality(profit, 10);
  assert.ok(
    includesAny(profit.reply, ["5-10 последним сделкам", "срез", "маржа", "кассовый эффект"]),
    "profit reply should suggest a concrete money slice"
  );
  assert.ok(!/проверь ограничение\s+["«]/i.test(profit.reply), "profit reply should not expose raw constraint wording");

  const leads = await ask(
    service,
    "leads",
    "Лидов много, продаж мало. Менеджеры говорят, что не успевают обрабатывать входящие."
  );
  assertDiagnosticQuality(leads, 10);
  assert.ok(
    includesAny(leads.reply, ["20 входящих", "целев", "квалификац", "обработки"]),
    "lead reply should separate demand/qualification from processing"
  );
  assert.ok(!/нанять|добрать менеджеров|добавить продавцов/i.test(leads.reply), "lead reply should not jump to hiring");

  const team = await ask(
    service,
    "team",
    "Команда не тянет: задачи висят, роли пересекаются, собственник постоянно тушит пожары."
  );
  assertDiagnosticQuality(team, 10);
  assert.ok(
    includesAny(team.reply, ["рол", "ответствен", "управлен", "решени"]),
    "team reply should diagnose roles/process/management instead of blaming people"
  );

  console.log("Chat diagnostic excellence checks passed.");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
