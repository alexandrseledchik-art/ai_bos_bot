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

async function createService(cwd) {
  const filePath = path.join(cwd, "data", "execution-excellence-state.json");
  const artifactDir = path.join(cwd, "data", "execution-excellence-artifacts");

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
const { service } = await createService(cwd);
const result = await service.handleUserMessage({
  telegramChatId: "execution-excellence",
  text: "Выручка есть, а прибыль почти не остаётся. Маржа упала с 22% до 11% за 3 месяца.",
  userMeta: {
    firstName: "Александр",
    username: "execution_excellence"
  }
});

const decisionObject = result.decision?.decisionObject;
assert.ok(decisionObject, "decisionObject should be created for a serious diagnostic answer");
assert.equal(decisionObject.schemaVersion, "decision_object_v1");
assert.ok(Date.parse(decisionObject.createdAt), "createdAt should be an ISO date");
assert.equal(decisionObject.reviewStatus, "not_reviewed");
assert.deepEqual(decisionObject.improvementProposalIds, []);
assert.equal(decisionObject.outcome?.status, "unknown");
assert.equal(decisionObject.outcome?.resultSummary, "");
assert.equal(decisionObject.outcome?.learned, "");
assert.equal(decisionObject.transition, "diagnosis_to_execution");
assert.equal(decisionObject.needsExecutionContainer, true);
assert.equal(decisionObject.operatingMode, "diagnostician");
assert.ok(decisionObject.reasonCodes?.length, "decision reasonCodes are missing");
assert.ok(decisionObject.reasonCodesByLayer?.businessState?.length, "business state reason codes are missing");
assert.ok(decisionObject.reasonCodesByLayer?.operatingMode?.length, "operating mode reason codes are missing");
assert.equal(typeof decisionObject.ownerDecisionRequired, "boolean");
assert.ok(decisionObject.ownerDecisionType, "ownerDecisionType is missing");
assert.ok(decisionObject.modeSwitch, "modeSwitch object is missing");
assert.ok(decisionObject.userFacingSummary, "userFacingSummary is missing");
assert.ok(decisionObject.internalReasoningSummary, "internalReasoningSummary is missing");
assert.equal(typeof decisionObject.hiddenEvaluation?.diagnosticQuality, "number");
assert.ok(decisionObject.executionContainer?.owner, "execution owner is missing");
assert.ok(decisionObject.executionContainer?.executor, "execution executor is missing");
assert.ok(decisionObject.executionContainer?.timeHorizon, "execution time horizon is missing");
assert.ok(decisionObject.executionContainer?.deadline, "execution deadline is missing");
assert.ok(decisionObject.executionContainer?.metric, "execution metric is missing");
assert.ok(decisionObject.executionContainer?.reviewMoment, "execution review moment is missing");

console.log("Management execution excellence checks passed.");
