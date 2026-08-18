import assert from "node:assert/strict";
import fs from "node:fs/promises";

import { classifyInput } from "../application/classify-input.js";
import { checkIntentIntegrity } from "../application/intent-integrity-checker.js";
import { SkillOrchestrator } from "../application/skill-orchestrator.js";
import { emptyEntryState } from "../domain/entities.js";
import { getSkillContract } from "../domain/skill-registry.js";

const cases = JSON.parse(await fs.readFile(new URL("../../evals/skill-selection-cases.json", import.meta.url), "utf8"));
const orchestrator = new SkillOrchestrator();
let passed = 0;
const failures = [];

for (const item of cases) {
  const classification = classifyInput(item.text);
  const entryState = emptyEntryState();
  if (item.candidateConstraint) {
    entryState.candidateConstraints = [{ label: item.candidateConstraint, confidence: 0.6 }];
  }
  const context = {
    userText: item.text,
    classification,
    intentIntegrity: checkIntentIntegrity({ text: item.text, classification }),
    entryState,
    inputKind: item.inputKind || "",
    screenId: item.screenId || "",
    activeTool: item.activeTool ? { id: "eval-tool" } : null,
    toolContinuation: Boolean(item.toolContinuation),
    activeResult: item.activeResult ? { id: "eval-result" } : null,
    acceptedNextStep: item.acceptedNextStep ? { id: "eval-next-step" } : null,
    documentSource: item.documentSource ? { id: "eval-document" } : null,
    dataSufficiency: { shouldAskUser: true, canMakeDecision: false }
  };
  const decision = {
    decision: { action: "clarify", signalSufficiency: "weak" },
    orchestration: { operatingMode: item.operatingMode || "unknown" }
  };
  const selection = orchestrator.select({ context, decision });

  assert.equal(selection.shadowMode, true, `${item.id}: shadow mode is required`);
  assert.ok(getSkillContract(selection.primarySkill), `${item.id}: unknown primary skill`);
  assert.ok(selection.supportingSkills.length <= 3, `${item.id}: too many supporting skills`);
  assert.ok(selection.alwaysOnSkills.includes("skill_orchestration"), `${item.id}: skill orchestration must be always on`);
  assert.ok(selection.alwaysOnSkills.includes("confidence_control"), `${item.id}: confidence control must be always on`);
  assert.ok(getSkillContract(selection.communicationSkill), `${item.id}: unknown communication skill`);
  assert.equal(new Set([selection.primarySkill, ...selection.supportingSkills]).size, 1 + selection.supportingSkills.length, `${item.id}: duplicate skills`);

  if (selection.primarySkill === item.expectedPrimary) {
    passed += 1;
  } else {
    failures.push(`${item.id}: expected ${item.expectedPrimary}, got ${selection.primarySkill}`);
  }
}

const accuracy = passed / cases.length;
assert.ok(accuracy >= 0.85, `Skill selection accuracy ${(accuracy * 100).toFixed(1)}% is below 85%:\n${failures.join("\n")}`);

console.log(`Skill selection evals passed: ${passed}/${cases.length} (${(accuracy * 100).toFixed(1)}%).`);
if (failures.length) console.log(`Non-blocking mismatches:\n${failures.join("\n")}`);
