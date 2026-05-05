import assert from "node:assert/strict";

import { ConsultantWebService } from "../application/consultant-web-service.js";
import { emptyState } from "../domain/entities.js";

class InMemoryStore {
  constructor() {
    this.state = emptyState();
  }

  async readState() {
    return this.state;
  }

  async update(mutator) {
    return mutator(this.state);
  }
}

async function main() {
  const store = new InMemoryStore();
  const service = new ConsultantWebService({ store });

  const created = await service.createCompany({
    name: "Альфа Балт Сервис",
    industry: "Производство",
    description: "Компания принимает заявки и передаёт их в производство.",
    ownerGoal: "Построить управляемую систему продаж и исполнения.",
    currentRequest: "Заявки теряются между продажами и производством.",
    comment: "Собственник вручную контролирует стык продаж и производства."
  });

  assert.equal(created.company.name, "Альфа Балт Сервис");

  const source = await service.addSource(created.company.id, {
    type: "meeting_note",
    title: "Встреча",
    contentText: "Менеджеры не фиксируют причины отказов. Нет ответственного за передачу заявки."
  });
  assert.equal(source.source.sourceOrigin, "web");

  const analyzed = await service.analyzeCompany(created.company.id);
  assert.equal(analyzed.layerAnalyses.length, 11);
  assert.equal(analyzed.toolResults.length, 11);
  assert.ok(analyzed.analysis.nextStep.title);

  const detail = await service.getCompany(created.company.id);
  assert.equal(detail.sources.length, 2);
  assert.ok(detail.analysis.probableConstraint.title);

  const list = await service.listCompanies();
  assert.equal(list.companies.length, 1);
  assert.ok(list.companies[0].nextStep.title);

  console.log("Consultant Web checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
