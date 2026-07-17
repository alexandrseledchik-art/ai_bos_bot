import assert from "node:assert/strict";
import {
  AI_BOSS_SKILLS_V1,
  SKILL_ACTIVATION,
  SKILL_DEPARTMENTS,
  getSkillContract,
  listSkillsByDepartment,
  validateSkillRegistry
} from "../domain/skill-registry.js";

const validation = validateSkillRegistry();
assert.equal(validation.valid, true, validation.errors.join("\n"));
assert.ok(AI_BOSS_SKILLS_V1.length >= 15, "Skill organization should cover the complete operating contour.");

const orchestrator = getSkillContract("skill_orchestration");
assert.ok(orchestrator, "Skill orchestrator must exist.");
assert.equal(orchestrator.activation, SKILL_ACTIVATION.ALWAYS_ON);

const alwaysOnIds = AI_BOSS_SKILLS_V1
  .filter((item) => item.activation === SKILL_ACTIVATION.ALWAYS_ON)
  .map((item) => item.id);
assert.ok(alwaysOnIds.includes("company_memory"));
assert.ok(alwaysOnIds.includes("observation_capture"));
assert.ok(alwaysOnIds.includes("confidence_control"));
assert.ok(alwaysOnIds.includes("communication_quality_control"));

assert.ok(listSkillsByDepartment(SKILL_DEPARTMENTS.COMMUNICATION).length >= 5);
assert.ok(listSkillsByDepartment(SKILL_DEPARTMENTS.DIAGNOSTICS).length >= 3);
assert.ok(listSkillsByDepartment(SKILL_DEPARTMENTS.EXECUTION).length >= 3);

const diagnostic = getSkillContract("business_diagnostic");
assert.ok(diagnostic.nextSkillCandidates.includes("diagnostic_interview"));
assert.ok(diagnostic.currentImplementation.includes("src/application/graph-reasoner.js"));

const facilitation = getSkillContract("tool_facilitation");
assert.ok(facilitation.artifactTypes.includes("tool_snapshot"));
assert.ok(facilitation.memoryUpdates.includes("observations"));

console.log(`Skill Architecture v1 OK: ${AI_BOSS_SKILLS_V1.length} contracts validated.`);
