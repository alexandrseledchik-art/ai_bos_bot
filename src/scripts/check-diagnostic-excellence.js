import assert from "node:assert/strict";

import { CompanyAnalysisCore } from "../application/company-analysis-core.js";
import { createCompany, createCompanySource, emptyState } from "../domain/entities.js";

function runCase({ id, companyPayload, sourceText = "" }) {
  const state = emptyState();
  const company = createCompany({
    name: id,
    telegramChatId: `diagnostic-excellence-${id}`,
    workspaceType: "consultant",
    userRole: "consultant",
    companySource: "test",
    ...companyPayload
  });
  state.companies.push(company);

  if (sourceText) {
    state.companySources.push(createCompanySource({
      companyId: company.id,
      type: "text",
      title: "Диагностический контекст",
      contentText: sourceText,
      sourceOrigin: "test"
    }));
  }

  const { analysis } = new CompanyAnalysisCore().analyze({ state, companyId: company.id });
  return analysis;
}

function assertQuality(analysis, minScore = 10) {
  assert.ok(analysis.diagnosticQuality, "diagnosticQuality is missing");
  assert.ok(
    analysis.diagnosticQuality.score10 >= minScore,
    `diagnostic quality expected>=${minScore} actual=${analysis.diagnosticQuality.score10}: ${analysis.diagnosticQuality.missing.join("; ")}`
  );
}

function main() {
  const crm = runCase({
    id: "crm_is_solution_not_root",
    companyPayload: {
      currentRequest: "Нам нужна CRM"
    }
  });
  assert.equal(crm.probableConstraint.mode, "solution_first");
  assert.match(crm.probableConstraint.title, /проблему за запросом/i);
  assert.notEqual(crm.probableConstraint.title, "Технологии");
  assert.match(crm.nextStep.title, /5 последних ситуаций/i);
  assertQuality(crm);

  const leads = runCase({
    id: "many_leads_low_sales",
    companyPayload: {
      currentRequest: "Лидов много, продаж мало."
    }
  });
  assert.equal(leads.probableConstraint.mode, "layer_hypothesis");
  assert.equal(leads.probableConstraint.layer, "commercial");
  assert.ok((leads.probableConstraint.rejectedAlternatives || []).length >= 1);
  assert.match(leads.nextStep.title, /10 последних лидов/i);
  assertQuality(leads);

  const profit = runCase({
    id: "profit_down",
    companyPayload: {
      currentRequest: "Выручка растёт, прибыль падает, маржа снизилась с 22% до 11%."
    }
  });
  assert.equal(profit.probableConstraint.mode, "layer_hypothesis");
  assert.equal(profit.probableConstraint.layer, "finance");
  assert.match(profit.nextStep.title, /срез денег/i);
  assertQuality(profit);

  const roks = runCase({
    id: "roks_upper_frame",
    companyPayload: {
      industry: "Логистика",
      ownerGoal: "На себя 1 млн в месяц к концу года.",
      currentRequest: "Понять, как вырасти прибыльно и не разрушить операционку."
    },
    sourceText: [
      "Внешняя среда не прояснена: рынок, спрос и конкуренты слабо понятны.",
      "Стратегия не построена на проверенных предпосылках.",
      "Финансы слабые: cash flow, бюджет, маржа и юнит-экономика не собраны.",
      "Команда слабая: роли, ответственность и нагрузка не описаны.",
      "Операции нестабильны, данные и аналитика почти отсутствуют."
    ].join("\n")
  });
  assert.equal(roks.probableConstraint.mode, "upper_frame");
  assert.match(roks.probableConstraint.title, /собственник[а-я]*, рынок и стратегия/i);
  assert.ok((roks.parallelActions || []).some((item) => item.layer === "finance"));
  assert.ok((roks.parallelActions || []).some((item) => item.layer === "team"));
  assert.match(roks.nextStep.title, /цель собственника.*рыночн/i);
  assertQuality(roks);

  console.log("Diagnostic excellence checks passed.");
}

main();
