import assert from "node:assert/strict";

import { ConsultantWebService } from "../application/consultant-web-service.js";
import { emptyState } from "../domain/entities.js";
import { GoogleDriveClient } from "../infrastructure/google/google-drive-client.js";

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

class MockPublicGoogleLinkReader {
  async read(url) {
    if (url.includes("docs.google.com/document")) {
      return {
        supported: true,
        readable: true,
        id: "public_doc_1",
        kind: "document",
        sourceType: "document",
        title: "Google Docs",
        exportUrl: "https://docs.google.com/document/d/public_doc_1/export?format=txt",
        text: "Публичная заметка: собственник не понимает, какие заявки целевые, а какие перегружают производство.",
        reason: ""
      };
    }

    return {
      supported: false,
      readable: false,
      text: "",
      reason: ""
    };
  }
}

class FakeRootFolderGoogleDriveClient extends GoogleDriveClient {
  constructor() {
    super({
      serviceAccountEmail: "service@example.iam.gserviceaccount.com",
      privateKey: "unused",
      rootFolderId: "root_folder"
    });
  }

  async request(pathname, { query = {} } = {}) {
    if (pathname === "/files/root_folder") {
      return Response.json({
        id: "root_folder",
        name: "Селедчик консалтинг",
        mimeType: "application/vnd.google-apps.folder",
        webViewLink: "https://drive.example/root_folder"
      });
    }

    if (pathname === "/files" && String(query.q || "").includes("'root_folder' in parents")) {
      return Response.json({
        files: [
          {
            id: "vision_doc",
            name: "Видение и икигай",
            mimeType: "application/vnd.google-apps.document",
            webViewLink: "https://drive.example/vision_doc",
            modifiedTime: "2026-05-02T10:00:00.000Z"
          }
        ]
      });
    }

    throw new Error(`Unexpected fake Drive request: ${pathname}`);
  }
}

async function main() {
  const store = new InMemoryStore();
  const service = new ConsultantWebService({
    store,
    googleDrive: new MockGoogleDrive(),
    publicGoogleLinkReader: new MockPublicGoogleLinkReader()
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

  const publicGoogleSource = await service.addSource(created.company.id, {
    title: "Публичный Google Doc",
    fileUrl: "https://docs.google.com/document/d/public_doc_1/edit?usp=sharing"
  });
  assert.equal(publicGoogleSource.source.sourceOrigin, "google_link");
  assert.equal(publicGoogleSource.source.type, "document");
  assert.equal(publicGoogleSource.source.processingStatus, "processed");
  assert.match(publicGoogleSource.source.contentText, /Публичная заметка/);

  const visionSource = await service.addSource(created.company.id, {
    type: "document",
    title: "Видение и икигай",
    contentText: "Видение собственника: построить консультационный продукт, где икигай соединяет ценность для рынка, сильные стороны и устойчивую стратегию роста."
  });
  assert.ok(visionSource.source.relatedLayers.includes("owner_context"));
  assert.ok(visionSource.source.relatedLayers.includes("strategy"));

  const analyzed = await service.analyzeCompany(created.company.id);
  assert.equal(analyzed.layerAnalyses.length, 11);
  assert.equal(analyzed.toolResults.length, 11);
  assert.ok(analyzed.analysis.nextStep.title);
  assert.ok(analyzed.analysis.diagnosticQuality?.score10 >= 8);
  assert.ok(
    analyzed.layerAnalyses.some((layer) =>
      layer.layerCode === "owner_context" &&
      layer.sourceIds.includes(visionSource.source.id)
    )
  );

  const detail = await service.getCompany(created.company.id);
  assert.equal(detail.sources.length, 4);
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

  const rootDrive = new FakeRootFolderGoogleDriveClient();
  const rootFiles = await rootDrive.listCompanyFiles("Селедчик консалтинг");
  assert.equal(rootFiles.usedRootFolder, true);
  assert.equal(rootFiles.companyFolder.name, "Селедчик консалтинг");
  assert.equal(rootFiles.files[0].name, "Видение и икигай");

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
