import { classifyInput } from "../application/classify-input.js";
import { checkIntentIntegrity } from "../application/intent-integrity-checker.js";
import { extractObservations } from "../application/observation-extractor.js";
import { analyzeWithGraph } from "../application/graph-reasoner.js";
import { ReferenceModelService } from "../application/reference-model-service.js";
import { emptyEntryState } from "../domain/entities.js";

const CASES = [
  {
    text: "Нам нужна CRM",
    expectedPrimaryLayer: "technology",
    expectBlock: true,
    expectedQuestionAny: ["переносятся вручную", "теряются между системами", "какие системы"]
  },
  {
    text: "Лидов много, продаж мало",
    expectedPrimaryLayer: "commercial",
    expectBlock: false,
    expectedQuestionAny: ["целевым клиентом", "качественную заявку", "откуда приходят"]
  },
  {
    text: "Падает прибыль",
    expectedPrimaryLayer: "finance",
    expectBlock: false,
    expectedQuestionAny: ["выручка", "маржа", "расходы", "кассовый"]
  },
  {
    text: "Команда не тянет",
    expectedPrimaryLayer: "people_organization",
    expectBlock: true,
    expectedQuestionAny: ["роли", "ответственность", "перегруз", "компетенций"]
  },
  {
    text: "Хочу выйти в новую нишу",
    expectedPrimaryLayer: "strategy",
    expectBlock: true,
    expectedQuestionAny: ["клиент должен выбрать", "выигрывает", "фокус", "метрике"]
  },
  {
    text: "Кассовый разрыв через 2 недели",
    expectedPrimaryLayer: "finance",
    expectBlock: false,
    expectedQuestionAny: ["выручка", "маржа", "расходы", "кассовый"]
  }
];

function includesAny(text, phrases) {
  const normalized = String(text || "").toLowerCase();
  return phrases.some((phrase) => normalized.includes(String(phrase).toLowerCase()));
}

function runCase(testCase) {
  const classification = classifyInput(testCase.text);
  const entryState = emptyEntryState();
  const intentIntegrity = checkIntentIntegrity({
    text: testCase.text,
    classification
  });
  const observationPacket = extractObservations({
    userText: testCase.text,
    classification,
    entryState,
    memorySummary: {}
  });
  const graphPacket = analyzeWithGraph({
    extracted: observationPacket,
    entryState,
    memorySummary: {}
  });
  const gate = new ReferenceModelService().evaluate({
    userText: testCase.text,
    classification,
    intentIntegrity,
    entryState,
    observationPacket,
    graphPacket,
    memorySummary: {}
  });
  const issues = [];

  if (gate.primaryLayer !== testCase.expectedPrimaryLayer) {
    issues.push(`primaryLayer expected=${testCase.expectedPrimaryLayer} actual=${gate.primaryLayer}`);
  }
  if (gate.shouldBlockDiagnosis !== testCase.expectBlock) {
    issues.push(`shouldBlockDiagnosis expected=${testCase.expectBlock} actual=${gate.shouldBlockDiagnosis}`);
  }
  if (!gate.minimumQuestion) {
    issues.push("minimumQuestion is empty");
  } else if (!includesAny(gate.minimumQuestion, testCase.expectedQuestionAny)) {
    issues.push(`minimumQuestion missed expected concepts: ${gate.minimumQuestion}`);
  }

  return {
    id: testCase.text,
    passed: issues.length === 0,
    issues,
    gate
  };
}

function run() {
  const results = CASES.map(runCase);

  console.log("");
  console.log("Reference model gate checks");
  console.log("===========================");

  for (const result of results) {
    console.log(`${result.passed ? "PASS" : "FAIL"} ${result.id}`);
    for (const issue of result.issues) {
      console.log(`  - ${issue}`);
    }
  }

  const passed = results.filter((item) => item.passed).length;
  console.log("");
  console.log(`Score: ${passed}/${results.length}`);

  if (passed !== results.length) {
    process.exitCode = 1;
  }
}

run();
