import assert from "node:assert/strict";

import { CompanyAnalysisCore } from "../application/company-analysis-core.js";
import { createCompany, createCompanySource, emptyState } from "../domain/entities.js";

const roksLikeDiagnostic = `
Анализ глубокой диагностики компании РОКС ЛОГИСТИК.

Есть пять связанных системных разрывов.

Разрыв 1. Внешняя среда не прояснена.
Оценка 1.48, рынок и спрос 1.12. Нельзя уверенно выбирать стратегию роста, пока не понятно, где деньги, где маржа, какие клиенты нужны, чем компания отличается.

Разрыв 2. Стратегия не построена на проверенных предпосылках.
Стратегия 1.24. Слабые зоны: ценностное предложение, позиционирование, бизнес-модель, стратегические ограничения, стейкхолдеры, технологические приоритеты. Компания хочет расти, но ещё не выбрала точную модель роста.

Разрыв 3. Управленческие финансы не показывают путь к цели собственника.
Финансы 1.26. Слабые: бюджет, cash flow, оборотный капитал, юнит-экономика, KPI, анализ отклонений. Это связано с целью 1 млн в месяц на себя: цель есть, но нет финансовой модели, показывающей, какой бизнес должен быть.

Разрыв 4. Управленческий контур не держит компанию как систему.
Управление и риски 1.18. Слабые: Plan-Do-Review, KPI, план-факт, board pack, принятие решений, риск-менеджмент.

Разрыв 5. Данные и аналитика почти отсутствуют.
Данные 1.05. Нет единой управленческой картины для решений по фактам.

Компания уже умеет продавать и выполнять логистическую услугу, но пока слабо оформлены: выбор прибыльных сегментов, конкурентное отличие, продуктовая упаковка, управленческие финансы, операционные KPI, роли и результативность команды, регулярный управленческий цикл, единая аналитика.

Если выбрать не тот первый шаг, можно начать чинить симптомы: глубже настраивать CRM, нанимать продажника, писать регламенты, гнать выручку без маржи и cash flow.
`;

async function main() {
  const state = emptyState();
  const company = createCompany({
    name: "ООО РОКС ЛОГИСТИК",
    telegramChatId: "test-roks",
    industry: "Логистика, транспортная компания",
    description: "Экспедирование по РФ. 11 сотрудников. Выручка 85 млн, прогноз 120 млн.",
    ownerGoal: "На себя лично от 1 млн в месяц к концу года.",
    currentRequest: "Понять, как вырасти прибыльно и не разрушить операционку.",
    workspaceType: "consultant",
    userRole: "consultant",
    companySource: "test"
  });
  state.companies.push(company);
  state.companySources.push(createCompanySource({
    companyId: company.id,
    type: "document",
    title: "Глубокая диагностика РОКС",
    contentText: roksLikeDiagnostic,
    sourceOrigin: "test",
    aiSummary: "Глубокая диагностика по 11 слоям с низкими оценками A/B/C/D."
  }));

  const { analysis } = new CompanyAnalysisCore().analyze({ state, companyId: company.id });
  const constraint = analysis.probableConstraint;

  assert.equal(constraint.mode, "upper_frame");
  assert.match(constraint.title, /Условия игры/i);
  assert.match(constraint.explanation, /собственник/i);
  assert.match(constraint.explanation, /рын/i);
  assert.match(constraint.explanation, /финансы, операции, команда и данные/i);
  assert.notEqual(constraint.title, "Финансы");

  assert.ok((constraint.relatedLayers || []).some((item) => item.layer === "owner_context"));
  assert.ok((constraint.relatedLayers || []).some((item) => item.layer === "external_environment"));
  assert.ok((constraint.relatedLayers || []).some((item) => item.layer === "strategy"));

  assert.match(analysis.nextStep.title, /собственник-рынок|сегмент/i);
  assert.match(analysis.nextStep.why, /не начать чинить финансы/i);

  const parallelLayers = new Set((analysis.parallelActions || []).map((item) => item.layer));
  assert.equal(parallelLayers.has("finance"), true);
  assert.equal(parallelLayers.has("team"), true);
  assert.ok((analysis.rejectedHypotheses || []).some((item) => item.layer === "finance"));

  console.log("ROKS deep diagnostic logic checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
