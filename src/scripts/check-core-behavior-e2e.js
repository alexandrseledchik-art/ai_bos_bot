import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

import { ConversationService } from "../application/conversation-service.js";
import { ReasoningClient } from "../infrastructure/openai/reasoning-client.js";
import { FileMemoryStore } from "../infrastructure/storage/file-store.js";
import { projectStateToRelationalRows } from "../infrastructure/storage/state-projector.js";

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

async function createService(cwd) {
  const filePath = path.join(cwd, "data", "core-behavior-e2e-state.json");
  const artifactDir = path.join(cwd, "data", "core-behavior-e2e-artifacts");

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
      screener: new StubWebsiteScreener(),
      maxHistoryMessages: 8
    })
  };
}

const cwd = process.cwd();
const { service, store } = await createService(cwd);

const crm = await service.handleUserMessage({
  telegramChatId: "core-behavior-e2e-crm",
  text: "Нам нужна CRM",
  userMeta: {
    firstName: "Александр",
    username: "core_e2e_crm"
  }
});

assert.equal(crm.decision?.orchestration?.transition, "ask_one_question");
assert.equal(crm.decision?.orchestration?.shouldAskOneQuestion, true);
assert.equal(crm.intentIntegrity?.integrityType, "proposed_solution");

const profit = await service.handleUserMessage({
  telegramChatId: "core-behavior-e2e-profit",
  text: "Выручка есть, а прибыль почти не остаётся. Маржа упала с 22% до 11% за 3 месяца.",
  userMeta: {
    firstName: "Александр",
    username: "core_e2e_profit"
  }
});

assert.ok(profit.decision?.diagnosticQuality?.score10 >= 10);
assert.equal(profit.decision?.decisionObject?.businessStateMode, "stabilization");
assert.equal(profit.decision?.decisionObject?.operatingMode, "diagnostician");
assert.equal(profit.decision?.decisionObject?.transition, "diagnosis_to_execution");
assert.ok(profit.decision?.decisionObject?.workingHypothesis, "working hypothesis is missing");
assert.ok(profit.decision?.decisionObject?.nextMove, "next move is missing");
assert.ok(profit.decision?.decisionObject?.executionContainer?.owner, "execution owner is missing");

const state = await store.readState();
const snapshots = state.snapshots || [];
const latestSnapshot = snapshots[snapshots.length - 1];
assert.ok(latestSnapshot?.decisionObject, "snapshot should persist decisionObject");

const projected = projectStateToRelationalRows(state);
const projectedSnapshot = projected.snapshots[projected.snapshots.length - 1];
assert.ok(projectedSnapshot?.graph_snapshot?.decisionObject, "projected snapshot should preserve decisionObject in graph_snapshot");

console.log("Core behavior end-to-end checks passed.");
