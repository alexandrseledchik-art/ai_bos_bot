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

function checkMode(text, expectedMode) {
  const orchestrator = new AIBossModeOrchestrator();
  const result = orchestrator.orchestrate({ context: buildContext(text) });
  assert.equal(
    result.businessStateMode,
    expectedMode,
    `businessStateMode expected=${expectedMode} actual=${result.businessStateMode} text=${text}`
  );
}

checkMode("Кассовый разрыв через 2 недели, денег может не хватить на обязательства.", "crisis");
checkMode("У нас хаос в ролях, заявки теряются между продажами и производством.", "stabilization");
checkMode("Лидов много, выручка растёт, но команда не выдерживает рост.", "growth");
checkMode("Хочу подготовить бизнес к продаже и выйти из операционки.", "exit_preparation");
checkMode("Хочу выйти в новую нишу и проверить новый рынок.", "rebuild");

console.log("Business state mode checks passed.");
