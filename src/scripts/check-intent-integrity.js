import { classifyInput } from "../application/classify-input.js";
import { checkIntentIntegrity } from "../application/intent-integrity-checker.js";

const CASES = [
  {
    text: "Нам нужна CRM",
    expectedType: "proposed_solution",
    expectedDepth: "standard"
  },
  {
    text: "Лидов много, продаж мало",
    expectedType: "problem_or_symptom",
    expectedDepth: "standard"
  },
  {
    text: "Падает прибыль",
    expectedType: "problem_or_symptom",
    expectedDepth: "deep_ceo"
  },
  {
    text: "Команда не тянет",
    expectedType: "interpretation",
    expectedDepth: "deep_ceo"
  },
  {
    text: "Хочу выйти в новую нишу",
    expectedType: "strategic_intent",
    expectedDepth: "deep_ceo"
  },
  {
    text: "Кассовый разрыв через 2 недели",
    expectedType: "urgent_problem",
    expectedDepth: "deep_ceo"
  },
  {
    text: "Нужно нанять операционного директора",
    expectedType: "proposed_solution",
    expectedDepth: "deep_ceo"
  },
  {
    text: "Как лучше назвать этот документ?",
    expectedType: "light_task",
    expectedDepth: "light"
  },
  {
    text: "Мне нужен RACI для ролей",
    expectedType: "tool_request",
    expectedDepth: "standard"
  },
  {
    text: "Можешь помочь с заполнением BHAG?",
    expectedType: "tool_request",
    expectedDepth: "standard"
  },
  {
    text: "Разобраться. Я не понимаю как правильно заполнить файл с инструментом",
    expectedType: "tool_request",
    expectedDepth: "standard"
  }
];

function run() {
  const results = [];

  for (const testCase of CASES) {
    const classification = classifyInput(testCase.text);
    const integrity = checkIntentIntegrity({
      text: testCase.text,
      classification
    });
    const issues = [];

    if (integrity.integrityType !== testCase.expectedType) {
      issues.push(`type expected=${testCase.expectedType} actual=${integrity.integrityType}`);
    }
    if (integrity.interventionDepth !== testCase.expectedDepth) {
      issues.push(`depth expected=${testCase.expectedDepth} actual=${integrity.interventionDepth}`);
    }

    results.push({
      id: testCase.text,
      passed: issues.length === 0,
      issues,
      classification,
      integrity
    });
  }

  console.log("");
  console.log("Intent integrity checks");
  console.log("=======================");

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
