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

const metaHelp = await service.handleUserMessage({
  telegramChatId: "core-behavior-e2e-meta-help",
  text: "чем можешь помочь?",
  userMeta: {
    firstName: "Александр",
    username: "core_e2e_meta"
  }
});

assert.equal(metaHelp.classification?.entryMode, "meta_role");
assert.match(metaHelp.reply, /CEO-контур|управленческ/i);
assert.match(metaHelp.reply, /собственник|бизнес/i);
assert.doesNotMatch(metaHelp.reply, /Ты пока не приш[её]л|Коротко перечислить/i);

const profit = await service.handleUserMessage({
  telegramChatId: "core-behavior-e2e-profit",
  text: "Выручка есть, а прибыль почти не остаётся. Маржа упала с 22% до 11% за 3 месяца.",
  userMeta: {
    firstName: "Александр",
    username: "core_e2e_profit"
  }
});

assert.ok(profit.decision?.diagnosticQuality?.score10 >= 10);
assert.equal(profit.decision?.skillSelection?.shadowMode, true);
assert.equal(profit.decision?.skillSelection?.primarySkill, "business_diagnostic");
assert.equal(profit.decision?.decisionObject?.skillSelection?.primarySkill, "business_diagnostic");
assert.equal(profit.decision?.decisionObject?.businessStateMode, "stabilization");
assert.equal(profit.decision?.decisionObject?.operatingMode, "diagnostician");
assert.equal(profit.decision?.decisionObject?.transition, "diagnosis_to_execution");
assert.equal(profit.decision?.decisionObject?.schemaVersion, "decision_object_v1");
assert.ok(Date.parse(profit.decision?.decisionObject?.createdAt), "createdAt should be an ISO date");
assert.equal(profit.decision?.decisionObject?.reviewStatus, "not_reviewed");
assert.deepEqual(profit.decision?.decisionObject?.improvementProposalIds, []);
assert.equal(profit.decision?.decisionObject?.outcome?.status, "unknown");
assert.ok(profit.decision?.decisionObject?.reasonCodes?.length, "decision reasonCodes are missing");
assert.ok(profit.decision?.decisionObject?.userFacingSummary, "userFacingSummary is missing");
assert.ok(profit.decision?.decisionObject?.internalReasoningSummary, "internalReasoningSummary is missing");
assert.equal(typeof profit.decision?.decisionObject?.ownerDecisionRequired, "boolean");
assert.ok(profit.decision?.decisionObject?.ownerDecisionType, "ownerDecisionType is missing");
assert.ok(profit.decision?.decisionObject?.modeSwitch, "modeSwitch is missing");
assert.ok(profit.decision?.decisionObject?.workingHypothesis, "working hypothesis is missing");
assert.ok(profit.decision?.decisionObject?.nextMove, "next move is missing");
assert.ok(profit.decision?.decisionObject?.executionContainer?.owner, "execution owner is missing");

const state = await store.readState();
const snapshots = state.snapshots || [];
const latestSnapshot = snapshots[snapshots.length - 1];
assert.ok(latestSnapshot?.decisionObject, "snapshot should persist decisionObject");
assert.equal(latestSnapshot?.decisionObject?.skillSelection?.primarySkill, "business_diagnostic");

const projected = projectStateToRelationalRows(state);
const projectedSnapshot = projected.snapshots[projected.snapshots.length - 1];
assert.ok(projectedSnapshot?.graph_snapshot?.decisionObject, "projected snapshot should preserve decisionObject in graph_snapshot");
assert.equal(projectedSnapshot.graph_snapshot.decisionObject.schemaVersion, "decision_object_v1");
assert.equal(projectedSnapshot.graph_snapshot.decisionObject.reviewStatus, "not_reviewed");
assert.equal(projectedSnapshot.graph_snapshot.decisionObject.skillSelection.primarySkill, "business_diagnostic");

console.log("Core behavior end-to-end checks passed.");
