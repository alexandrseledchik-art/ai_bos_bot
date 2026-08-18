import assert from "node:assert/strict";
import { DiagnosticSkillPilot } from "../application/diagnostic-skill-pilot.js";

const pilot = new DiagnosticSkillPilot();
const selection = {
  primarySkill: "business_diagnostic",
  supportingSkills: ["diagnostic_interview"],
  turnGoal: "Получить один различающий факт.",
  completionCondition: "Получен наблюдаемый сигнал.",
  prohibitedActions: ["не спрашивать у пользователя готовый диагноз"]
};

function diagnosticContext(overrides = {}) {
  return {
    userText: "Продажи просели, лидов много, команда не успевает обрабатывать.",
    graphPacket: {
      observedSignals: ["много лидов", "низкие продажи"],
      graphConfidence: 0.61,
      candidateStates: [
        { id: "raw_flow", label: "Смешанный входящий поток", layer: "commercial", score: 0.78 },
        { id: "slow_response", label: "Не держится первый контакт", layer: "operating_model", score: 0.72 },
        { id: "capacity", label: "Не хватает мощности обработки", layer: "people_organization", score: 0.58 }
      ],
      candidateCauses: [
        { id: "weak_icp", label: "Целевой клиент не переведён в правила", layer: "strategy", score: 0.7 }
      ],
      discriminatingSignals: [
        {
          question: "По последним 20 обращениям сколько были целевыми и сколько дошли до первого контакта?",
          informationGain: 0.9
        },
        {
          question: "Как вы думаете, в чём причина перегруза?",
          informationGain: 0.95
        }
      ]
    },
    entryState: { candidateConstraints: [] },
    dataSufficiency: { canMakeDecision: false, minimumQuestion: "" },
    referenceGate: {},
    ...overrides
  };
}

const weakPacket = pilot.build({ context: diagnosticContext(), selection });
assert.equal(weakPacket.enabled, true);
assert.equal(weakPacket.mustAskForSignal, true);
assert.equal(weakPacket.responsePolicy.allowConstraintSelection, false);
assert.equal(weakPacket.responsePolicy.allowNextStep, false);
assert.match(weakPacket.requiredSignal, /последн(?:им|ие) 20/i);
assert.equal(new Set(weakPacket.hypotheses.map((item) => item.layer)).size >= 3, true);

const prematureDecision = {
  decision: { action: "answer", signalSufficiency: "enough", confidence: 0.9 },
  entryState: { selectedConstraint: "Не хватает людей", promotionReadiness: "ready_for_diagnostic_case" },
  memory: { constraint: "Не хватает людей", actionWave: { enabled: true, firstStep: "Нанять менеджера" } },
  response: { responseText: "Нужно нанять менеджера.", nextStep: "Нанять менеджера." }
};
const enforced = pilot.enforce({ packet: weakPacket, decision: prematureDecision });
assert.equal(enforced.decision.action, "clarify");
assert.equal(enforced.entryState.selectedConstraint, "");
assert.equal(enforced.memory.constraint, "");
assert.equal(enforced.memory.actionWave.enabled, false);
assert.match(enforced.response.responseText, /последн(?:им|ие) 20 обращен/i);
assert.doesNotMatch(enforced.response.responseText, /нанять менеджера/i);
assert.equal(pilot.assess({ packet: weakPacket, decision: enforced }).criterionMet, true);

const quantifiedPacket = pilot.build({
  context: diagnosticContext({
    userText: "За 2 месяца маржа снизилась с 32% до 18%.",
    graphPacket: {
      ...diagnosticContext().graphPacket,
      graphConfidence: 0.72
    }
  }),
  selection
});
assert.equal(quantifiedPacket.evidenceGate.quantifiedSignal, true);
assert.equal(quantifiedPacket.responsePolicy.allowConstraintSelection, true);
assert.equal(quantifiedPacket.responsePolicy.allowNextStep, true);

const checkerReadyPacket = pilot.build({
  context: diagnosticContext({ dataSufficiency: { canMakeDecision: true } }),
  selection
});
assert.equal(checkerReadyPacket.evidenceGate.canSelectConstraint, true);

const historyReadyContext = diagnosticContext({
  userText: "Право на возврат заказа существует только устно и им не пользуются.",
  history: [
    { role: "user", text: "Из 18 заказов 7 передали без полного ТЗ, 5 ушли позже срока." },
    { role: "assistant", text: "Где ломается передача?" }
  ]
});
const historyReadyPacket = pilot.build({ context: historyReadyContext, selection });
assert.equal(historyReadyPacket.evidenceGate.quantifiedSignal, true);
assert.equal(historyReadyPacket.evidenceGate.canSelectConstraint, true);

const lingeringClarification = {
  decision: { action: "clarify", signalSufficiency: "partial", confidence: 0.62 },
  entryState: { selectedConstraint: "", promotionReadiness: "keep_in_entry" },
  memory: { constraint: "", actionWave: { enabled: false } },
  response: { responseText: "Где закреплено это право?", nextStep: "Где закреплено это право?" }
};
const promoted = pilot.enforce({
  packet: historyReadyPacket,
  decision: lingeringClarification,
  context: historyReadyContext
});
assert.equal(promoted.decision.action, "answer");
assert.equal(promoted.decision.signalSufficiency, "enough");
assert.ok(promoted.entryState.selectedConstraint);
assert.equal(promoted.memory.actionWave.enabled, true);
assert.match(promoted.response.responseText, /рабочая гипотеза/i);
assert.match(promoted.response.responseText, /фиксируем/i);

assert.equal(pilot.build({
  context: diagnosticContext(),
  selection: { ...selection, primarySkill: "tool_selection" }
}), null);

console.log("Diagnostic skill pilot checks passed: evidence gate, cross-layer spread, observable question and enforcement.");
