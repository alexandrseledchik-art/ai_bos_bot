import assert from "node:assert/strict";

import {
  buildGoogleSheetCsvExportUrl,
  parseCsv,
  csvRowsToObjects
} from "../infrastructure/google/google-sheet-csv-tools-reader.js";
import { ToolsCatalogSyncService, mapGoogleSheetToolRow } from "../application/tools-catalog-sync-service.js";

class FakeSyncClient {
  constructor() {
    this.enabled = true;
    this.calls = [];
  }

  async request(pathname, options = {}) {
    this.calls.push({ pathname, options });
    return (Array.isArray(options.body) ? options.body : [options.body]).map((row, index) => ({
      id: `tool_${index + 1}`,
      slug: row.slug,
      title: row.title,
      source: row.source,
      updated_at: "2026-05-16T00:00:00.000Z"
    }));
  }
}

const SAMPLE_CSV = `"Слой","Домен","Поддоммен","Инструмент / Методология","Описание","Когда применять","Результат","Ссылка на инструмент","Статус","Связь","Порядок по архитектуре","Поддомен по архитектуре","Домен по архитектуре","Предложение по встраиванию"
"Коммерция","ICP","Сегментация","Разбор целевого клиента","Помогает отделить целевых лидов от шума","Когда лидов много, но продажи слабые","Понятный фильтр входящего потока","https://docs.google.com/spreadsheets/d/template","готово","support","5","Сегментация","Коммерция","Показывать после сигнала о смешанном потоке"
"Операции","Процесс","Передача лида","Карта воронки","Показывает, где лид застревает","Когда заявки есть, но до сделки не доходят","Карта этапов и провалов","Карта воронки | шаблон","готово","support","6","Передача лида","Операционная модель","Показывать рядом со следующим шагом"`;

async function main() {
  const url = buildGoogleSheetCsvExportUrl({
    spreadsheetId: "https://docs.google.com/spreadsheets/d/abc123/edit",
    gid: "456"
  });
  assert.equal(url, "https://docs.google.com/spreadsheets/d/abc123/export?format=csv&gid=456");

  const rows = csvRowsToObjects(parseCsv(SAMPLE_CSV));
  assert.equal(rows.length, 2);
  assert.equal(rows[0]["инструмент / методология"], "Разбор целевого клиента");

  const first = mapGoogleSheetToolRow(rows[0], { spreadsheetId: "sheet", gid: "gid" });
  assert.equal(first.slug, "ba-tool-0001");
  assert.equal(first.title, "Разбор целевого клиента");
  assert.deepEqual(first.layer_keys, ["commercial"]);
  assert.equal(first.template_url, "https://docs.google.com/spreadsheets/d/template");
  assert.equal(first.domain_title, "Коммерция");
  assert.equal(first.subdomain_title, "Сегментация");
  assert.equal(first.architecture_order, 5);
  assert.equal(first.problem_types.includes("icp"), true);

  const second = mapGoogleSheetToolRow(rows[1], { spreadsheetId: "sheet", gid: "gid" });
  assert.equal(second.layer_keys[0], "operating_model");
  assert.equal(second.template_url, null);
  assert.equal(second.link_label, "Карта воронки | шаблон");

  const syncClient = new FakeSyncClient();
  const service = new ToolsCatalogSyncService({
    syncClient,
    spreadsheetId: "sheet",
    gid: "gid",
    fetchImpl: async () => ({
      ok: true,
      text: async () => SAMPLE_CSV
    })
  });
  const result = await service.sync();
  assert.equal(result.rawRows, 2);
  assert.equal(result.tools.length, 2);
  assert.equal(result.syncedRows, 2);
  assert.equal(syncClient.calls.length, 1);
  assert.equal(syncClient.calls[0].pathname, "/rest/v1/tools");
  assert.equal(syncClient.calls[0].options.query.on_conflict, "slug");
  assert.equal(syncClient.calls[0].options.body[0].source, "google_sheet_tools_catalog");

  const dryRun = await service.sync({ dryRun: true });
  assert.equal(dryRun.syncedRows, 0);

  console.log("tools catalog sync checks passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
