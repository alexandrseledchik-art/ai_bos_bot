import fs from "node:fs/promises";
import path from "node:path";

import { ConversationService } from "../application/conversation-service.js";
import { ReasoningClient } from "../infrastructure/openai/reasoning-client.js";
import { FileMemoryStore } from "../infrastructure/storage/file-store.js";

class StubScreener {
  async screen(url) {
    return {
      url,
      knownFacts: [`URL: ${url}`, "HTTP status: 200"],
      observations: ["На входе доступен только внешний контур сайта."],
      canNotAssert: ["По сайту нельзя определить внутреннее ограничение бизнеса."],
      raw: {}
    };
  }
}

function questionCount(text) {
  return (String(text || "").match(/\?/g) || []).length;
}

function hasInternalLeak(text) {
  return /skillExecution|evidenceGate|primarySkill|graphPacket|candidateConstraints|systemLayers/i.test(String(text || ""));
}

function asksUserForDiagnosis(text) {
  return /как вы думаете.{0,30}(?:причин|почему)|в ч[её]м причина\?|какая из (?:этих )?версий|выберите причин/i.test(String(text || ""));
}

async function createService(cwd) {
  const filePath = path.join(cwd, "data", "diagnostic-skill-pilot-eval-state.json");
  const artifactDir = path.join(cwd, "data", "diagnostic-skill-pilot-eval-artifacts");
  await fs.rm(filePath, { force: true });
  await fs.rm(artifactDir, { recursive: true, force: true });
  return new ConversationService({
    store: new FileMemoryStore({ filePath, artifactDir }),
    reasoner: new ReasoningClient({ apiKey: "", baseUrl: "", model: "", reasoningEffort: "medium" }),
    screener: new StubScreener(),
    maxHistoryMessages: 10,
    skillOrchestratorDiagnosticEnabled: true
  });
}

const cwd = process.cwd();
const cases = JSON.parse(await fs.readFile(path.join(cwd, "evals", "diagnostic-skill-pilot-cases.json"), "utf8"));
const service = await createService(cwd);
const results = [];

for (const testCase of cases) {
  const issues = [];
  const runs = [];
  for (const [index, text] of testCase.turns.entries()) {
    const run = await service.handleUserMessage({
      telegramChatId: `skill-pilot-${testCase.id}`,
      text,
      userMeta: { firstName: "Тест", username: `pilot_${testCase.id}` }
    });
    runs.push(run);
    if (hasInternalLeak(run.reply)) issues.push(`turn ${index + 1}: internal fields leaked`);
    if (questionCount(run.reply) > 1) issues.push(`turn ${index + 1}: more than one question`);
    if (asksUserForDiagnosis(run.reply)) issues.push(`turn ${index + 1}: asks user for diagnosis`);

    const execution = run.decision?.skillExecution;
    if (execution?.status === "waiting_for_user") {
      if (run.decision?.decision?.action !== "clarify") issues.push(`turn ${index + 1}: waiting state is not clarify`);
      if (run.decision?.memory?.constraint) issues.push(`turn ${index + 1}: constraint selected before evidence`);
      if (run.decision?.memory?.actionWave?.enabled) issues.push(`turn ${index + 1}: action wave started before evidence`);
      if (!run.reply.includes("?")) issues.push(`turn ${index + 1}: waiting state has no question`);
      if ((execution.hypothesisLayers || []).length < 2) issues.push(`turn ${index + 1}: hypotheses did not spread across layers`);
    }
  }

  const finalRun = runs.at(-1);
  const actualPrimary = finalRun.decision?.skillSelection?.primarySkill || "website_screening";
  const actualAction = finalRun.decision?.decision?.action || "screen";
  if (actualPrimary !== testCase.expectedPrimary) issues.push(`primary expected=${testCase.expectedPrimary} actual=${actualPrimary}`);
  if (actualAction !== testCase.expectedFinalAction) issues.push(`action expected=${testCase.expectedFinalAction} actual=${actualAction}`);
  const selectedConstraintLayer = finalRun.decision?.skillExecution?.selectedConstraintLayer || "";
  if (testCase.expectedConstraintLayers?.length && !testCase.expectedConstraintLayers.includes(selectedConstraintLayer)) {
    issues.push(`constraint layer expected=${testCase.expectedConstraintLayers.join("|")} actual=${selectedConstraintLayer || "none"}`);
  }
  if (testCase.forbidStaffingFrame && /не хватает (?:людей|менеджеров)|нехватк[а-я]* (?:людей|менеджеров)|нужно нанять/i.test(finalRun.reply)) {
    issues.push("unprompted staffing frame");
  }

  results.push({
    id: testCase.id,
    passed: issues.length === 0,
    issues,
    primary: actualPrimary,
    action: actualAction,
    constraintLayer: selectedConstraintLayer,
    status: finalRun.decision?.skillExecution?.status || "not_applicable"
  });
}

console.log("\nDiagnostic skill production-pilot evals");
console.log("=======================================");
for (const result of results) {
  console.log(`${result.passed ? "PASS" : "FAIL"} ${result.id} [${result.primary} / ${result.action} / ${result.status}]`);
  result.issues.forEach((issue) => console.log(`  - ${issue}`));
}
const passed = results.filter((item) => item.passed).length;
console.log(`\nScore: ${passed}/${results.length} (${((passed / results.length) * 100).toFixed(1)}%)`);
if (passed !== results.length) process.exitCode = 1;
