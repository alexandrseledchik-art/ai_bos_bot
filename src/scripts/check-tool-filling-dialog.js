import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

import { ConversationService } from "../application/conversation-service.js";
import { ReasoningClient } from "../infrastructure/openai/reasoning-client.js";
import { FileMemoryStore } from "../infrastructure/storage/file-store.js";

class StubWebsiteScreener {
  async screen(url) {
    return {
      url,
      knownFacts: [`URL: ${url}`],
      observations: [],
      canNotAssert: [],
      raw: {}
    };
  }
}

function has(text, pattern) {
  return pattern.test(String(text || "").toLowerCase());
}

async function createService(cwd) {
  const filePath = path.join(cwd, "data", "tool-filling-dialog-state.json");
  const artifactDir = path.join(cwd, "data", "tool-filling-dialog-artifacts");

  await fs.rm(filePath, { force: true });
  await fs.rm(artifactDir, { recursive: true, force: true });

  return new ConversationService({
    store: new FileMemoryStore({ filePath, artifactDir }),
    reasoner: new ReasoningClient({
      apiKey: "",
      baseUrl: "",
      model: "",
      reasoningEffort: "medium"
    }),
    screener: new StubWebsiteScreener(),
    maxHistoryMessages: 8
  });
}

async function ask(service, text) {
  return service.handleUserMessage({
    telegramChatId: "tool-filling-bhag",
    text,
    userMeta: {
      firstName: "Александр",
      username: "tool_filling_bhag"
    }
  });
}

async function run() {
  const service = await createService(process.cwd());

  const first = await ask(service, "Можешь мне помочь с заполнением bhag?");
  assert.equal(first.classification.entryMode, "specific_tool_request");
  assert.ok(has(first.reply, /bhag|бхаг|дерзк|амбициозн/), "first reply should keep BHAG context");
  assert.ok(has(first.reply, /разобраться|заполнить|проверить/), "first reply should ask help format");
  assert.ok(!has(first.reply, /продаж|финанс|диагностик/i), "first reply should not switch into business diagnosis");

  const second = await ask(service, "Для упаковки консалтинга");
  assert.ok(has(second.reply, /упаковк[а-яё\s-]+консалтинг/), "second reply should keep consulting packaging contour");
  assert.ok(has(second.reply, /разобраться|заполнить|проверить/), "second reply should ask help format without losing tool mode");

  const third = await ask(service, "Разобраться. Я не понимаю как правильно заполнить файл с инструментом");
  assert.ok(has(third.reply, /bhag|бхаг|дерзк|амбициозн/), "third reply should not forget BHAG");
  assert.ok(has(third.reply, /горизонт|скачок|критер|результат/), "third reply should explain how to fill BHAG");
  assert.ok(!has(third.reply, /что\s+это\s+за\s+файл|что\s+за\s+файл|для\s+какой\s+задачи\s+он\s+нужен|или\s+что-то\s+другое/), "third reply should not ask what file/tool this is");

  console.log("Tool filling dialog checks passed.");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
