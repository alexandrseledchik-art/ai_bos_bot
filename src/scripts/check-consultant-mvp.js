import assert from "node:assert/strict";

import { ConversationService } from "../application/conversation-service.js";
import { emptyState } from "../domain/entities.js";

class InMemoryStore {
  constructor() {
    this.state = emptyState();
  }

  async update(mutator) {
    return mutator(this.state);
  }

  async saveArtifactDocument() {
    return "";
  }
}

class UnusedReasoner {
  async decide() {
    throw new Error("Reasoner should not be called for Consultant MVP Telegram commands.");
  }
}

class UnusedScreener {
  async screen() {
    throw new Error("Screener should not be called for Consultant MVP Telegram commands.");
  }
}

class FakeGoogleDrive {
  constructor() {
    this.enabled = true;
    this.rootFolderId = "root";
  }

  async listCompanyFiles(companyName) {
    assert.equal(companyName, "Альфа Балт Сервис");
    return {
      companyFolder: {
        id: "folder_1",
        name: "Альфа Балт Сервис"
      },
      files: [
        {
          id: "doc_1",
          name: "Итоги встречи",
          mimeType: "application/vnd.google-apps.document",
          webViewLink: "https://docs.google.com/document/d/doc_1",
          modifiedTime: "2026-05-05T10:00:00Z"
        }
      ]
    };
  }

  async readFileText(file) {
    assert.equal(file.id, "doc_1");
    return {
      readable: true,
      text: "Заявки теряются на стыке продаж и производства. Нет ответственного за передачу заявки.",
      reason: ""
    };
  }
}

async function main() {
  const store = new InMemoryStore();
  const service = new ConversationService({
    store,
    reasoner: new UnusedReasoner(),
    screener: new UnusedScreener(),
    googleDrive: new FakeGoogleDrive()
  });
  const userMeta = {
    telegramUserId: "42",
    username: "consultant"
  };

  const selected = await service.handleUserMessage({
    telegramChatId: "100",
    text: "/use Альфа Балт Сервис",
    userMeta
  });
  assert.equal(selected.consultantMode, true);
  assert.match(selected.reply, /Альфа Балт Сервис/);
  assert.match(selected.reply, /факты/i);

  const drive = await service.handleUserMessage({
    telegramChatId: "100",
    text: "/drive",
    userMeta
  });
  assert.equal(drive.consultantMode, true);
  assert.match(drive.reply, /Google Drive/);
  assert.match(drive.reply, /Сохранено источников: 1/);

  const fact = await service.handleUserMessage({
    telegramChatId: "100",
    text: "Добавь факт: заявки теряются между продажами и производством, менеджеры не фиксируют причины отказов",
    userMeta
  });
  assert.equal(fact.consultantMode, true);
  assert.match(fact.reply, /Добавил факт/);
  assert.match(fact.reply, /Коммерция|Операции|Данные/);

  const analyze = await service.handleUserMessage({
    telegramChatId: "100",
    text: "/analyze",
    userMeta
  });
  assert.equal(analyze.consultantMode, true);
  assert.ok(analyze.analysis?.probableConstraint?.title);
  assert.ok(analyze.analysis?.nextStep?.title);
  assert.match(analyze.reply, /Следующий шаг/);

  const status = await service.handleUserMessage({
    telegramChatId: "100",
    text: "Что сейчас главное по Альфа Балт Сервис?",
    userMeta
  });
  assert.equal(status.consultantMode, true);
  assert.match(status.reply, /главное ограничение/i);
  assert.match(status.reply, /Следующий шаг/);

  const commercialGaps = await service.handleUserMessage({
    telegramChatId: "100",
    text: "Какие пробелы по коммерции?",
    userMeta
  });
  assert.equal(commercialGaps.consultantMode, true);
  assert.match(commercialGaps.reply, /Коммерция/);
  assert.match(commercialGaps.reply, /пробел/i);

  const governance = await service.handleUserMessage({
    telegramChatId: "100",
    text: "Что мы уже поняли по управлению?",
    userMeta
  });
  assert.equal(governance.consultantMode, true);
  assert.match(governance.reply, /Управление/);
  assert.match(governance.reply, /Что понятно|Пока нет достаточных фактов/);

  assert.equal(store.state.companies.filter((company) => company.name === "Альфа Балт Сервис").length, 1);
  assert.equal(store.state.companySources.length, 2);
  assert.ok(store.state.companySources.some((source) => source.sourceOrigin === "google_drive"));
  assert.equal(store.state.companyAnalyses.length, 1);
  assert.equal(store.state.layerAnalyses.filter((item) => item.companyId === selected.company.id).length, 11);
  assert.equal(store.state.toolResults.filter((item) => item.companyId === selected.company.id).length, 11);
  assert.equal(store.state.telegramContexts[0].activeCompanyId, selected.company.id);

  console.log("Consultant MVP checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
