import assert from "node:assert/strict";

import { AIBossModeOrchestrator } from "../application/ai-boss-mode-orchestrator.js";
import { classifyInput } from "../application/classify-input.js";
import { checkIntentIntegrity } from "../application/intent-integrity-checker.js";
import { emptyEntryState } from "../domain/entities.js";

function buildContext(text) {
  const classification = classifyInput(text);
  const intentIntegrity = checkIntentIntegrity({
    text,
    classification,
    entryState: emptyEntryState(),
    history: []
  });

  return {
    userText: text,
    classification,
    intentIntegrity,
    entryState: emptyEntryState(),
    dataSufficiency: {
      confidenceLevel: "LOW",
      shouldAskUser: true,
      canMakeDecision: false
    },
    referenceGate: {
      status: "missing",
      shouldBlockDiagnosis: false
    }
  };
}

function checkMode(text, expectedMode, decision = null) {
  const orchestrator = new AIBossModeOrchestrator();
  const result = orchestrator.orchestrate({
    context: buildContext(text),
    decision
  });
  assert.equal(
    result.operatingMode,
    expectedMode,
    `operatingMode expected=${expectedMode} actual=${result.operatingMode} text=${text}`
  );
}

checkMode("Что такое ICP и зачем он нужен?", "methodology_expert");
checkMode("Выручка есть, а прибыль почти не остаётся. Маржа упала.", "diagnostician");
checkMode("Как лучше назвать этот документ?", "advisor");
checkMode("Кто отвечает за этот следующий шаг и какой статус?", "execution_coordinator");
checkMode("Какой путь выбрать: резать расходы или менять сегмент?", "ceo_mode");
checkMode("Готовим бизнес к продаже: как понять, что он переносим без собственника?", "strategic_reviewer");

console.log("Operating mode checks passed.");
