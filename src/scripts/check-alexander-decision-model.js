import assert from "node:assert/strict";
import fs from "node:fs/promises";

import { assessAlexanderModelAlignment } from "../application/alexander-model-assessor.js";
import { classifyInput } from "../application/classify-input.js";
import { checkIntentIntegrity } from "../application/intent-integrity-checker.js";
import { buildReasoningPrompt } from "../application/prompt-builder.js";
import { SkillOrchestrator } from "../application/skill-orchestrator.js";
import {
  ALEXANDER_DECISION_MODEL_VERSION,
  ALEXANDER_DECISION_PRINCIPLES,
  selectAlexanderPlaybook
} from "../domain/alexander-decision-model.js";
import { emptyEntryState } from "../domain/entities.js";

const cases = JSON.parse(await fs.readFile(
  new URL("../../evals/alexander-decision-model-cases.json", import.meta.url),
  "utf8"
));
const orchestrator = new SkillOrchestrator();
const failures = [];

assert.equal(ALEXANDER_DECISION_MODEL_VERSION, "1.0.0");
assert.ok(ALEXANDER_DECISION_PRINCIPLES.length >= 10);
assert.equal(cases.length, 30);

const compliantReplies = {
  natural_dialogue: "Привет! Я на связи. Как ты?",
  entry_clarification: "Помогу собрать ситуацию без длинной анкеты. Какой результат в бизнесе вы хотите изменить сейчас?",
  book_navigation: "Книга помогает увидеть бизнес как систему. Какая ситуация привела вас к ней сейчас?",
  product_navigation: "Формат выбираем по нужному результату. Вам важнее общая картина или решение конкретной ситуации?",
  human_handoff: "Соберу короткий контекст для содержательной передачи Александру. Какой результат вы хотите получить от разговора?",
  tool_application: "Этот инструмент помогает закрепить ответственность. Для какого процесса вы хотите применить его первым?",
  crisis_stabilization: "Пока это рабочая версия: сначала нужно защитить ближайшие обязательства. На сколько дней сейчас хватает денег?",
  diagnostic_reasoning: "Пока вижу несколько версий, и ближайшая ещё не равна корню. Какой один факт лучше всего показывает место потери результата?",
  execution_closure: "Решение уже выбрано; теперь закрепим результат и момент проверки. Кто подтверждает итог выполнения?",
  concept_explanation: "Объясню простыми словами и свяжу с практикой. Какой пример будет ближе к вашей ситуации?",
  external_screening: "По внешнему материалу можно увидеть факты, но нельзя диагностировать внутренний бизнес. Что именно вы хотите проверить?"
};

for (const item of cases) {
  const classification = classifyInput(item.text);
  const context = {
    userText: item.text,
    classification,
    intentIntegrity: checkIntentIntegrity({ text: item.text, classification }),
    entryState: emptyEntryState(),
    inputKind: item.inputKind || "",
    activeTool: item.activeTool ? { id: "eval-tool" } : null,
    acceptedNextStep: item.acceptedNextStep ? { id: "eval-step" } : null,
    dataSufficiency: { shouldAskUser: true, canMakeDecision: false },
    orchestration: {
      operatingMode: item.operatingMode || "unknown",
      businessStateMode: item.businessStateMode || "unknown"
    }
  };
  const selection = orchestrator.select({
    context,
    decision: { decision: { action: "clarify", signalSufficiency: "weak" }, orchestration: context.orchestration }
  });
  context.skillSelection = selection;
  const playbook = selectAlexanderPlaybook(context);

  if (selection.primarySkill !== item.expectedPrimary) {
    failures.push(`${item.id}: primary expected=${item.expectedPrimary} actual=${selection.primarySkill}`);
  }
  if (playbook.id !== item.expectedPlaybook) {
    failures.push(`${item.id}: playbook expected=${item.expectedPlaybook} actual=${playbook.id}`);
  }

  const prompt = buildReasoningPrompt(context).system;
  if (!prompt.includes(`Alexander Decision Model v${ALEXANDER_DECISION_MODEL_VERSION}`) ||
      !prompt.includes(`Активный сценарий: ${playbook.id}`)) {
    failures.push(`${item.id}: prompt does not contain active Alexander model playbook`);
  }

  const alignment = assessAlexanderModelAlignment({
    context,
    decision: { response: { responseText: compliantReplies[playbook.id] } }
  });
  if (alignment.score < 85 || alignment.status !== "aligned") {
    failures.push(`${item.id}: compliant response alignment=${alignment.score}/${alignment.status}`);
  }
}

const unsafe = assessAlexanderModelAlignment({
  context: { userText: "Хочу поговорить с Александром", skillSelection: { primarySkill: "alexander_handoff" } },
  decision: { response: { responseText: "Я Александр. Переходите по ссылке." } }
});
assert.ok(unsafe.score < 65);
assert.ok(unsafe.issues.includes("impersonates_alexander"));

assert.equal(failures.length, 0, failures.join("\n"));
console.log(`Alexander Decision Model v${ALEXANDER_DECISION_MODEL_VERSION}: ${cases.length}/${cases.length} routes and alignment checks passed.`);
