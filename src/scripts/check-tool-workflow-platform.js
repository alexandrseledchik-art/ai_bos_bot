import assert from "node:assert/strict";
import crypto from "node:crypto";

import { ToolWorkflowService } from "../application/tool-workflow-service.js";

function parseTable(pathname) {
  return pathname.match(/\/rest\/v1\/([^/?]+)/)?.[1] || "";
}

function matches(row, query) {
  return Object.entries(query || {}).every(([key, value]) => {
    if (["select", "limit", "order", "on_conflict"].includes(key)) return true;
    const raw = String(value);
    if (raw.startsWith("eq.")) return String(row[key] ?? "") === raw.slice(3);
    if (raw.startsWith("in.(")) return raw.slice(4, -1).split(",").includes(String(row[key] ?? ""));
    return true;
  });
}

class MemorySyncClient {
  constructor(tables) {
    this.enabled = true;
    this.tables = tables;
  }

  async request(pathname, { method = "GET", query = {}, body = {} } = {}) {
    const table = parseTable(pathname);
    const rows = this.tables[table] || (this.tables[table] = []);
    if (method === "GET") {
      let result = rows.filter((row) => matches(row, query));
      if (query.order) {
        const [key, direction] = query.order.split(".");
        result = result.sort((a, b) => direction === "desc"
          ? String(b[key] || "").localeCompare(String(a[key] || ""))
          : String(a[key] || "").localeCompare(String(b[key] || "")));
      }
      return query.limit ? result.slice(0, Number(query.limit)) : result;
    }
    if (method === "POST") {
      const keys = String(query.on_conflict || "").split(",").filter(Boolean);
      const index = keys.length ? rows.findIndex((row) => keys.every((key) => String(row[key]) === String(body[key]))) : -1;
      const value = { id: index >= 0 ? rows[index].id : crypto.randomUUID(), created_at: new Date().toISOString(), ...body, updated_at: new Date().toISOString() };
      if (index >= 0) rows[index] = { ...rows[index], ...value };
      else rows.push(value);
      return [index >= 0 ? rows[index] : value];
    }
    if (method === "PATCH") {
      const result = [];
      this.tables[table] = rows.map((row) => {
        if (!matches(row, query)) return row;
        const value = { ...row, ...body, updated_at: new Date().toISOString() };
        result.push(value);
        return value;
      });
      return result;
    }
    throw new Error(`Unsupported method ${method}`);
  }
}

const bootstrap = {
  appUser: { id: "user-1" },
  workspace: { id: "workspace-1" },
  company: { id: "company-1", name: "Тестовая компания" },
  activeCase: { id: "case-1" }
};

async function run() {
  const syncClient = new MemorySyncClient({
    tools: [{
      id: "tool-1",
      slug: "owner-map",
      title: "Карта целей собственника",
      short_description: "Фиксирует цель и роль собственника.",
      result: "Согласованная рамка решений",
      layer_keys: ["owner_context"],
      template_url: "https://docs.google.com/document/d/template123/edit",
      metadata: {
        questions: [
          { key: "goal", question: "Какова цель?" },
          { key: "role", question: "Какова роль собственника?" }
        ]
      }
    }, {
      id: "tool-2",
      slug: "owner-success-canvas",
      title: "Канва критериев успеха собственника (Owner Success Criteria Canvas — что для собственника означает «победа»)",
      short_description: "Фиксирует личные критерии успеха собственника.",
      result: "Критерии успеха и красные линии",
      layer_keys: ["owner_context"],
      metadata: {}
    }]
  });
  const googleDrive = {
    enabled: true,
    rootFolderId: "root",
    async findOrCreateFolder({ name }) { return { id: `folder-${name}` }; },
    async copyFile() { return { id: "copy-1", webViewLink: "https://docs.google.com/document/d/copy-1/edit" }; }
  };
  const service = new ToolWorkflowService({ syncClient, googleDrive });
  const started = await service.startTool({ bootstrap, toolId: "tool-1", mode: "chat" });
  assert.equal(started.instance.status, "waiting_for_user");
  assert.equal(started.questions.length, 2);

  const intro = await service.handleTelegramInput({
    bootstrap,
    text: `/start tool_${started.instance.telegram_start_token}`
  });
  assert.equal(intro.handled, true);
  assert.match(intro.reply, /Какова цель/);

  const second = await service.handleTelegramInput({ bootstrap, text: "3 млн чистой прибыли" });
  assert.match(second.reply, /Какова роль собственника/);
  const completed = await service.handleTelegramInput({ bootstrap, text: "Архитектор бизнеса" });
  assert.match(completed.reply, /заполнен/);

  const context = await service.getInstanceContext({ bootstrap, instanceId: started.instance.id });
  assert.equal(context.instance.status, "completed");
  assert.equal(context.answers.length, 2);
  assert.ok(context.latestSnapshot);
  assert.equal(syncClient.tables.observations.length, 2);

  const copied = await service.createPersonalCopy({ bootstrap, instanceId: started.instance.id });
  assert.equal(copied.document.copy_status, "created");
  assert.equal(copied.document.google_file_id, "copy-1");

  const nativeStarted = await service.startTool({ bootstrap, toolId: "tool-2", mode: "web" });
  assert.ok(nativeStarted.nativeWorkspace);
  assert.equal(nativeStarted.questions.length, 10);
  assert.equal(nativeStarted.instance.fill_mode, "document");

  const draft = await service.saveWebAnswers({
    bootstrap,
    instanceId: nativeStarted.instance.id,
    answers: { horizon: "5 лет", contradictions: "Рост может конфликтовать со свободой." }
  });
  assert.equal(draft.instance.status, "in_progress");
  assert.equal(draft.answers.length, 2);
  assert.ok(draft.instance.progress_percent > 0);
  await assert.rejects(
    service.saveWebAnswers({ bootstrap, instanceId: nativeStarted.instance.id, complete: true }),
    /Чтобы завершить инструмент, заполните/
  );

  const nativeCompleted = await service.saveWebAnswers({
    bootstrap,
    instanceId: nativeStarted.instance.id,
    complete: true,
    answers: {
      financial_success: "3 млн рублей чистой прибыли в месяц к 2030 году.",
      freedom_success: "Не более двух дней в неделю в роли архитектора.",
      legacy_success: "Методология, которая работает без моего постоянного участия.",
      relationships_success: "Сильная команда и время для семьи.",
      red_lines: "Не жертвовать здоровьем и репутацией.",
      top_priority: "Личная свобода",
      anchor_criteria: "3 млн прибыли\n2 дня в неделю\n80% решений без собственника",
      first_decision: "Пересмотреть личное участие в клиентской работе."
    }
  });
  assert.equal(nativeCompleted.instance.status, "completed");
  assert.equal(nativeCompleted.instance.progress_percent, 100);
  assert.equal(nativeCompleted.answers.length, 10);
  assert.match(nativeCompleted.latestSnapshot.summary, /Главный приоритет: Личная свобода/);
  assert.equal(syncClient.tables.observations.length, 12);

  console.log("Tool workflow platform checks passed.");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
