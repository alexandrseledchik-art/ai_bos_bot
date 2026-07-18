import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

import { ConversationService } from "../application/conversation-service.js";
import { SkillRunManager } from "../application/skill-run-manager.js";
import { emptyEntryState } from "../domain/entities.js";
import { ReasoningClient } from "../infrastructure/openai/reasoning-client.js";
import { FileMemoryStore } from "../infrastructure/storage/file-store.js";

function selection(primarySkill, reasonCodes = []) {
  return {
    schemaVersion: "skill_selection_v1",
    primarySkill,
    supportingSkills: [],
    communicationSkill: "diagnostic_interview",
    turnGoal: "Найти рабочую гипотезу ограничения.",
    completionCondition: "Выбран вывод или один разделяющий вопрос.",
    reasonCodes,
    selectorConfidence: 0.9
  };
}

const manager = new SkillRunManager();
const initial = manager.prepare({
  entryState: emptyEntryState(),
  selection: selection("business_diagnostic", ["live_business_problem"]),
  context: { userText: "Продажи просели" }
});
assert.equal(initial.transition, "started");
assert.equal(initial.run.status, "active");

let runState = manager.finalize({
  preparation: initial,
  packet: {
    hypotheses: [
      { label: "Смешанный входящий поток", layer: "commercial", score: 0.8, source: "cause" },
      { label: "Слабая ценность", layer: "product", score: 0.6, source: "cause" }
    ],
    requiredSignal: "Сколько обращений были целевыми?"
  },
  execution: { status: "waiting_for_user" },
  decision: { entryState: { nextBestQuestion: "Сколько обращений были целевыми?" }, memory: {} },
  context: { userText: "Продажи просели", observationPacket: { observedSignals: ["низкие продажи"] } }
});
assert.equal(runState.activeSkillRun.status, "waiting_for_user");
const runId = runState.activeSkillRun.runId;

const continued = manager.prepare({
  entryState: { ...emptyEntryState(), ...runState },
  selection: selection("intent_clarification", ["unclear_intent"]),
  context: { userText: "6 из 20" }
});
assert.equal(continued.transition, "continued");
assert.equal(continued.selection.primarySkill, "business_diagnostic");
assert.equal(continued.run.runId, runId);

runState = manager.finalize({
  preparation: continued,
  packet: { hypotheses: [{ label: "Смешанный входящий поток", layer: "commercial", score: 0.8, source: "cause" }] },
  execution: { status: "completed" },
  decision: {
    entryState: { selectedConstraint: "Смешанный входящий поток" },
    memory: { constraint: "Смешанный входящий поток" }
  },
  context: { userText: "6 из 20 были целевыми", observationPacket: { observedSignals: ["6 из 20 целевые"] } }
});
assert.equal(runState.activeSkillRun, null);
assert.equal(runState.skillRunHistory.at(-1).status, "completed");
assert.equal(runState.skillRunHistory.at(-1).handoff.skillId, "next_step_selection");

const secondRun = manager.prepare({
  entryState: { ...emptyEntryState(), ...runState },
  selection: selection("business_diagnostic", ["live_business_problem"]),
  context: { userText: "Кассовый разрыв" }
});
const interrupted = manager.prepare({
  entryState: { ...emptyEntryState(), ...secondRun.state },
  selection: selection("tool_selection", ["tool_first_request"]),
  context: { userText: "Вместо этого дай финансовый шаблон", classification: { type: "free_text_problem" } }
});
assert.equal(interrupted.transition, "interrupted");
assert.equal(interrupted.state.activeSkillRun, null);
assert.equal(interrupted.state.skillRunHistory.at(-1).status, "interrupted");

const thirdRun = manager.prepare({
  entryState: emptyEntryState(),
  selection: selection("business_diagnostic", ["live_business_problem"]),
  context: { userText: "Клиенты не возвращаются" }
});
const detour = manager.prepare({
  entryState: { ...emptyEntryState(), ...thirdRun.state },
  selection: selection("concept_explanation", ["methodology_or_role_question"]),
  context: { userText: "Что такое удержание?" }
});
assert.equal(detour.transition, "detour");
assert.equal(detour.state.activeSkillRun.runId, thirdRun.run.runId);
assert.equal(detour.state.activeSkillRun.status, "active");

class StubScreener {
  async screen(url) {
    return { url, knownFacts: [], observations: [], canNotAssert: [], raw: {} };
  }
}

const cwd = process.cwd();
const filePath = path.join(cwd, "data", "persistent-skill-run-check-state.json");
const artifactDir = path.join(cwd, "data", "persistent-skill-run-check-artifacts");
await fs.rm(filePath, { force: true });
await fs.rm(artifactDir, { recursive: true, force: true });
const store = new FileMemoryStore({ filePath, artifactDir });
const service = new ConversationService({
  store,
  reasoner: new ReasoningClient({ apiKey: "", baseUrl: "", model: "", reasoningEffort: "medium" }),
  screener: new StubScreener(),
  maxHistoryMessages: 10,
  skillOrchestratorDiagnosticEnabled: true
});

const first = await service.handleUserMessage({
  telegramChatId: "persistent-run-e2e",
  text: "Продажи слабые: лидов много, команда не успевает обрабатывать",
  userMeta: { firstName: "Тест" }
});
assert.equal(first.runtime.skillRunTransition, "started");
assert.equal(first.runtime.skillRun.status, "waiting_for_user");
const e2eRunId = first.runtime.skillRun.runId;

const second = await service.handleUserMessage({
  telegramChatId: "persistent-run-e2e",
  text: "Из последних 20 обращений только 6 были целевыми, до первого контакта дошли 5",
  userMeta: { firstName: "Тест" }
});
assert.equal(second.runtime.skillRunTransition, "continued");
assert.equal(second.runtime.skillRun.runId, e2eRunId);
assert.equal(second.runtime.skillRun.status, "completed");
assert.equal(second.runtime.skillRun.turnCount, 2);
assert.equal(second.runtime.skillRun.handoff.skillId, "next_step_selection");

const persisted = await store.readState();
const thread = persisted.threads.find((item) => item.telegramChatId === "persistent-run-e2e");
assert.equal(thread.entryState.activeSkillRun, null);
assert.equal(thread.entryState.skillRunHistory.at(-1).runId, e2eRunId);
assert.equal(thread.entryState.skillRunHistory.at(-1).status, "completed");

const waitingBeforeRestart = await service.handleUserMessage({
  telegramChatId: "persistent-run-restart",
  text: "Кассовый разрыв повторяется, хотя продажи идут",
  userMeta: { firstName: "Тест" }
});
assert.equal(waitingBeforeRestart.runtime.skillRun.status, "waiting_for_user");
await service.handleUserMessage({
  telegramChatId: "persistent-run-restart",
  text: "/start",
  userMeta: { firstName: "Тест" }
});
const persistedAfterRestart = await store.readState();
const restartedThread = persistedAfterRestart.threads.find((item) => item.telegramChatId === "persistent-run-restart");
assert.equal(restartedThread.entryState.activeSkillRun, null);
assert.equal(restartedThread.entryState.skillRunHistory.at(-1).status, "interrupted");
assert.equal(restartedThread.entryState.skillRunHistory.at(-1).interruption.nextSkill, "onboarding_conversation");

await fs.rm(filePath, { force: true });
await fs.rm(artifactDir, { recursive: true, force: true });

console.log("Persistent skill run checks passed: start, continuation, detour, interruption, completion, handoff and storage.");
