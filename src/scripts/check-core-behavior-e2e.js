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
assert.equal(profit.runtime?.audienceProfile?.primarySegment, null);
assert.equal(profit.decision?.decisionObject?.audienceProfile?.primarySegment, null);
assert.match(profit.reply, /напиши «фиксируем»/i);
assert.ok(profit.runtime?.managementCycle?.pendingDecision, "chat should persist a pending management decision");

const ambiguousYes = await service.handleUserMessage({
  telegramChatId: "core-behavior-e2e-profit",
  text: "да",
  userMeta: {
    firstName: "Александр",
    username: "core_e2e_profit"
  }
});
assert.match(ambiguousYes.reply, /напиши «фиксируем»/i);
assert.equal(ambiguousYes.managementCycle?.decisionLock || null, null);

const locked = await service.handleUserMessage({
  telegramChatId: "core-behavior-e2e-profit",
  text: "фиксируем",
  userMeta: {
    firstName: "Александр",
    username: "core_e2e_profit"
  }
});
assert.equal(locked.managementCycle?.decisionLock?.status, "active");
assert.match(locked.reply, /Зафиксировал управленческое решение/i);

const status = await service.handleUserMessage({
  telegramChatId: "core-behavior-e2e-profit",
  text: "статус решения",
  userMeta: {
    firstName: "Александр",
    username: "core_e2e_profit"
  }
});
assert.match(status.reply, /Сейчас зафиксировано/i);

const done = await service.handleUserMessage({
  telegramChatId: "core-behavior-e2e-profit",
  text: "готово",
  userMeta: {
    firstName: "Александр",
    username: "core_e2e_profit"
  }
});
assert.equal(done.managementCycle?.decisionLock?.awaitingResult, true);
assert.match(done.reply, /результат: …/i);

const completed = await service.handleUserMessage({
  telegramChatId: "core-behavior-e2e-profit",
  text: "результат: нашли два убыточных сегмента, валовая маржа выросла до 15%",
  userMeta: {
    firstName: "Александр",
    username: "core_e2e_profit"
  }
});
assert.equal(completed.managementCycle?.decisionLock?.status, "completed");
assert.match(completed.reply, /Цикл закрыт/i);

const state = await store.readState();
const snapshots = state.snapshots || [];
const latestSnapshot = snapshots[snapshots.length - 1];
assert.ok(latestSnapshot?.decisionObject, "snapshot should persist decisionObject");
assert.equal(latestSnapshot?.decisionObject?.skillSelection?.primarySkill, "business_diagnostic");
assert.equal(state.decisionCycles.length, 1);
assert.equal(state.decisionCycles[0].status, "completed");
assert.equal(state.decisionLocks.length, 1);
assert.equal(state.decisionLocks[0].actualResult, "нашли два убыточных сегмента, валовая маржа выросла до 15%");
assert.deepEqual(
  state.decisionJournalEntries.map((entry) => entry.entryType),
  ["decision_locked", "decision_completed"]
);

const projected = projectStateToRelationalRows(state);
const projectedSnapshot = projected.snapshots[projected.snapshots.length - 1];
assert.ok(projectedSnapshot?.graph_snapshot?.decisionObject, "projected snapshot should preserve decisionObject in graph_snapshot");
assert.equal(projectedSnapshot.graph_snapshot.decisionObject.schemaVersion, "decision_object_v1");
assert.equal(projectedSnapshot.graph_snapshot.decisionObject.reviewStatus, "not_reviewed");
assert.equal(projectedSnapshot.graph_snapshot.decisionObject.skillSelection.primarySkill, "business_diagnostic");

const segmented = await service.handleUserMessage({
  telegramChatId: "core-behavior-e2e-segment",
  text: "Я собственник среднего бизнеса. Бизнес вырос, но управляемость не успела: непонятно, кто за что отвечает и каким цифрам верить. Хочу понять, что чинить первым.",
  userMeta: {
    firstName: "Александр",
    username: "core_e2e_segment"
  }
});
assert.equal(segmented.runtime?.audienceProfile?.primarySegment?.id, "owner_medium_management_gap");
assert.equal(segmented.runtime?.audienceProfile?.entryChannel?.value, "telegram");

const originalReasoner = service.reasoner;
service.reasoner = {
  async decide(context) {
    const decision = await originalReasoner.decide(context);
    if (context.classification?.entryMode === "meta_role") {
      decision._responseOrigin = "model";
      decision.response.responseText = `Живой модельный ответ на: ${context.userText}`;
    }
    return decision;
  },
  composeReply(context) {
    return originalReasoner.composeReply(context);
  }
};

const beforeCapabilityQuestion = await store.readState();
const beforeBusinessCounts = {
  observations: beforeCapabilityQuestion.observations.length,
  situations: beforeCapabilityQuestion.situations.length,
  toolRecommendations: beforeCapabilityQuestion.toolRecommendations.length
};
const capabilityReply = await service.handleUserMessage({
  telegramChatId: "core-behavior-e2e-profit",
  text: "чем поможешь?",
  userMeta: {
    firstName: "Александр",
    username: "core_e2e_profit"
  }
});
assert.equal(capabilityReply.classification?.entryMode, "meta_role");
assert.equal(capabilityReply.decision?.skillSelection?.primarySkill, "concept_explanation");
assert.equal(capabilityReply.reply, "Живой модельный ответ на: чем поможешь?");

const afterCapabilityQuestion = await store.readState();
assert.deepEqual(
  {
    observations: afterCapabilityQuestion.observations.length,
    situations: afterCapabilityQuestion.situations.length,
    toolRecommendations: afterCapabilityQuestion.toolRecommendations.length
  },
  beforeBusinessCounts,
  "Capability questions must not add diagnostic memory to the active case."
);
service.reasoner = originalReasoner;

console.log("Core behavior end-to-end checks passed.");
