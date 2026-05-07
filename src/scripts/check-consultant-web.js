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

class MockGoogleDrive {
  enabled = true;
  rootFolderId = "drive_root";

  async listCompanyFiles(companyName) {
    return {
      companyFolder: {
        id: "folder_1",
        name: companyName
      },
      files: [
        {
          id: "doc_1",
          name: "Встреча с собственником",
          mimeType: "application/vnd.google-apps.document",
          webViewLink: "https://drive.example/doc_1",
          modifiedTime: "2026-05-01T10:00:00.000Z"
        },
        {
          id: "pdf_1",
          name: "Скан договора.pdf",
          mimeType: "application/pdf",
          webViewLink: "https://drive.example/pdf_1",
          modifiedTime: "2026-05-01T11:00:00.000Z"
        }
      ]
    };
  }

  async readFileText(file) {
    if (file.id === "doc_1") {
      return {
        readable: true,
        text: "Собственник хочет понять, где заявки теряются и кто отвечает за передачу.",
        reason: ""
      };
    }

    return {
      readable: false,
      text: "",
      reason: "PDF пока сохраняется ссылкой."
    };
  }
}

async function main() {
  const store = new InMemoryStore();
  const service = new ConsultantWebService({
    store,
    googleDrive: new MockGoogleDrive()
  });

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
  assert.ok(analyzed.analysis.diagnosticQuality?.score10 >= 8);

  const detail = await service.getCompany(created.company.id);
  assert.equal(detail.sources.length, 2);
  assert.ok(detail.analysis.probableConstraint.title);

  const list = await service.listCompanies();
  assert.equal(list.companies.length, 1);
  assert.ok(list.companies[0].nextStep.title);

  const integrations = await service.getIntegrations(created.company.id);
  assert.equal(integrations.integrations.googleDrive.configured, true);
  assert.equal(integrations.integrations.googleDrive.sourceCount, 0);

  const driveSync = await service.syncGoogleDrive(created.company.id);
  assert.equal(driveSync.googleDrive.ok, true);
  assert.equal(driveSync.googleDrive.syncedCount, 2);
  assert.equal(driveSync.googleDrive.readableCount, 1);
  assert.equal(store.state.companySources.filter((item) => item.sourceOrigin === "google_drive").length, 2);

  const deleted = await service.deleteCompany(created.company.id);
  assert.equal(deleted.deletedCompany.id, created.company.id);
  assert.equal(store.state.companies.length, 0);
  assert.equal(store.state.companySources.length, 0);
  assert.equal(store.state.layerAnalyses.length, 0);
  assert.equal(store.state.toolResults.length, 0);
  assert.equal(store.state.companyAnalyses.length, 0);
  await assert.rejects(() => service.getCompany(created.company.id), /Company not found/);

  console.log("Consultant Web checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
