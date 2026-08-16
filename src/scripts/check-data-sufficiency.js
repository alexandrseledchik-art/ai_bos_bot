import { classifyInput } from "../application/classify-input.js";
import { checkIntentIntegrity } from "../application/intent-integrity-checker.js";
import { extractObservations } from "../application/observation-extractor.js";
import { analyzeWithGraph } from "../application/graph-reasoner.js";
import { ReferenceModelService } from "../application/reference-model-service.js";
import { AutonomousDataCollector } from "../application/autonomous-data-collector.js";
import { DataSufficiencyChecker } from "../application/data-sufficiency-checker.js";
import { createCompany, createThread, emptyEntryState, emptyState } from "../domain/entities.js";

const CASES = [
  {
    id: "crm_solution_first",
    text: "Нам нужна CRM",
    expectedSufficiency: "insufficient",
    expectAsk: true,
    expectedQuestionAny: ["какую проблему", "что сейчас теряется", "зависает"]
  },
  {
    id: "light_task",
    text: "Как лучше назвать этот документ?",
    expectedSufficiency: "enough_for_decision",
    expectAsk: false
  },
  {
    id: "cash_gap",
    text: "Кассовый разрыв через 2 недели",
    expectedSufficiencyAny: ["insufficient", "enough_for_hypothesis"],
    expectAsk: true,
    expectedQuestionAny: ["остаток", "обязательства", "поступления", "срок"]
  },
  {
    id: "known_finance_context",
    text: "Падает прибыль",
    stateFacts: [
      "Выручка за месяц 1 млн рублей",
      "Маржа 35%",
      "Основные расходы: ФОТ и реклама",
      "Кассовый остаток 400 тысяч рублей"
    ],
    expectedSufficiency: "enough_for_decision",
    expectAsk: false
  },
  {
    id: "team_interpretation",
    text: "Команда не тянет",
    expectedSufficiency: "insufficient",
    expectAsk: true,
    expectedQuestionAny: ["участке", "задержка", "очередь", "роли", "ответственность"]
  }
];

function includesAny(text, phrases = []) {
  const normalized = String(text || "").toLowerCase();
  return phrases.some((phrase) => normalized.includes(String(phrase).toLowerCase()));
}

function buildContext(testCase) {
  const classification = classifyInput(testCase.text);
  const entryState = emptyEntryState();
  const state = emptyState();
  const company = createCompany({ name: "Eval Company", telegramChatId: "data-sufficiency" });
  const thread = createThread({ telegramChatId: "data-sufficiency", companyId: company.id });

  state.companies.push(company);
  state.threads.push(thread);
  thread.entryState = {
    ...thread.entryState,
    knownFacts: testCase.stateFacts || []
  };

  const intentIntegrity = checkIntentIntegrity({ text: testCase.text, classification });
  const baseContext = {
    routeHint: classification.type,
    userText: testCase.text,
    classification,
    intentIntegrity,
    company: {
      id: company.id,
      name: company.name
    },
    activeCase: null,
    memorySummary: {},
    entryState: thread.entryState,
    history: []
  };
  const observationPacket = extractObservations({
    userText: testCase.text,
    classification,
    entryState: thread.entryState,
    memorySummary: {}
  });
  const graphPacket = analyzeWithGraph({
    extracted: observationPacket,
    entryState: thread.entryState,
    memorySummary: {}
  });
  const referenceGate = new ReferenceModelService().evaluate({
    ...baseContext,
    observationPacket,
    graphPacket
  });
  const context = {
    ...baseContext,
    observationPacket,
    graphPacket,
    referenceGate
  };
  const autonomousData = new AutonomousDataCollector().collect({
    state,
    context,
    thread,
    company,
    activeCase: null,
    referenceGate
  });
  const dataSufficiency = new DataSufficiencyChecker().check({
    context: {
      ...context,
      autonomousData
    },
    referenceGate,
    autonomousData
  });

  return {
    autonomousData,
    dataSufficiency,
    referenceGate,
    intentIntegrity
  };
}

function runCase(testCase) {
  const { autonomousData, dataSufficiency } = buildContext(testCase);
  const issues = [];
  const expectedList = testCase.expectedSufficiencyAny || [testCase.expectedSufficiency];

  if (!expectedList.includes(dataSufficiency.sufficiency)) {
    issues.push(`sufficiency expected=${expectedList.join("|")} actual=${dataSufficiency.sufficiency}`);
  }
  if (dataSufficiency.shouldAskUser !== testCase.expectAsk) {
    issues.push(`shouldAskUser expected=${testCase.expectAsk} actual=${dataSufficiency.shouldAskUser}`);
  }
  if (!autonomousData.searchedBeforeAsking) {
    issues.push("autonomousData did not mark searchedBeforeAsking");
  }
  if (!Array.isArray(autonomousData.sourceTypesChecked) || autonomousData.sourceTypesChecked.length === 0) {
    issues.push("sourceTypesChecked is empty");
  }
  if ((testCase.expectedQuestionAny || []).length && !includesAny(dataSufficiency.minimumQuestion, testCase.expectedQuestionAny)) {
    issues.push(`minimumQuestion missed expected concepts: ${dataSufficiency.minimumQuestion}`);
  }

  return {
    id: testCase.id,
    passed: issues.length === 0,
    issues,
    dataSufficiency
  };
}

function run() {
  const results = CASES.map(runCase);

  const isolationState = emptyState();
  const isolatedCompany = createCompany({ name: "Isolated", telegramChatId: "isolated" });
  const isolatedThread = createThread({ telegramChatId: "isolated", companyId: isolatedCompany.id });
  isolationState.companies.push(isolatedCompany);
  isolationState.threads.push(isolatedThread);
  isolationState.observations.push({
    id: "foreign_observation",
    caseId: "foreign_case",
    statement: "Чужой бизнес: заказы передаются без полного ТЗ",
    confidence: 0.9
  });
  isolationState.documentSnapshots = [{
    id: "foreign_document",
    companyId: "foreign_company",
    title: "Чужой документ"
  }];
  const isolationData = new AutonomousDataCollector().collect({
    state: isolationState,
    context: {
      userText: "Клиенты не возвращаются",
      company: { id: isolatedCompany.id, name: isolatedCompany.name },
      entryState: isolatedThread.entryState,
      history: []
    },
    thread: isolatedThread,
    company: isolatedCompany,
    activeCase: null,
    referenceGate: { primaryReference: { missingParts: [] } }
  });
  const leakedForeignFact = isolationData.foundFacts.some((fact) => /Чужой бизнес|Чужой документ/i.test(fact.text));
  if (leakedForeignFact) {
    throw new Error("Autonomous data collector leaked facts from another company or case.");
  }

  console.log("");
  console.log("Data sufficiency checks");
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
