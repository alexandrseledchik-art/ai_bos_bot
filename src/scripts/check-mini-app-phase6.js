import assert from "node:assert/strict";
import fs from "node:fs";

import { MiniAppApiClient } from "../../mini-app-assets/src/api-client.js";
import { MiniAppBootstrapService } from "../application/mini-app-bootstrap-service.js";
import { MiniAppDiagnosticsService } from "../application/mini-app-diagnostics-service.js";
import { MINI_APP_TOOL_CATALOG } from "../domain/mini-app-tools-catalog.js";

class FakeSupabaseClient {
  constructor() {
    this.enabled = true;
    this.tables = new Map();
    this.counter = 0;
  }

  getTable(name) {
    if (!this.tables.has(name)) {
      this.tables.set(name, []);
    }

    return this.tables.get(name);
  }

  nextId(table) {
    this.counter += 1;
    return `${table}_${this.counter}`;
  }

  parseTable(pathname) {
    const match = String(pathname || "").match(/^\/rest\/v1\/([^/?]+)/);
    if (!match) {
      throw new Error(`Unexpected path ${pathname}`);
    }

    return match[1];
  }

  filterRows(rows, query = {}) {
    let filtered = [...rows];

    for (const [key, value] of Object.entries(query || {})) {
      if (["select", "limit", "order", "on_conflict"].includes(key)) {
        continue;
      }

      const match = String(value).match(/^eq\.(.*)$/);
      if (match) {
        filtered = filtered.filter((row) => String(row[key]) === match[1]);
      }
    }

    if (query.order) {
      const [field, direction] = String(query.order).split(".");
      filtered.sort((left, right) => {
        const leftValue = String(left[field] || "");
        const rightValue = String(right[field] || "");
        return direction === "desc"
          ? rightValue.localeCompare(leftValue)
          : leftValue.localeCompare(rightValue);
      });
    }

    if (query.limit) {
      filtered = filtered.slice(0, Number(query.limit));
    }

    return filtered;
  }

  projectRows(rows, select) {
    if (!select || select === "*") {
      return rows;
    }

    const fields = String(select)
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    return rows.map((row) => Object.fromEntries(fields.map((field) => [field, row[field]])));
  }

  async request(pathname, { method = "GET", query = {}, body } = {}) {
    const table = this.parseTable(pathname);
    const rows = this.getTable(table);

    if (method === "GET") {
      return this.projectRows(this.filterRows(rows, query), query.select);
    }

    if (method === "PATCH") {
      const matching = this.filterRows(rows, query);
      for (const row of matching) {
        Object.assign(row, body, { updated_at: new Date().toISOString() });
      }
      return this.projectRows(matching, query.select);
    }

    if (method !== "POST") {
      throw new Error(`Unsupported fake method ${method}`);
    }

    const conflictKeys = String(query.on_conflict || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    const incomingRows = Array.isArray(body) ? body : [body];
    const result = [];

    for (const incoming of incomingRows) {
      let existing = null;
      if (conflictKeys.length > 0) {
        existing = rows.find((row) => conflictKeys.every((key) => row[key] === incoming[key]));
      }

      if (existing) {
        Object.assign(existing, incoming, { updated_at: new Date().toISOString() });
        result.push(existing);
        continue;
      }

      const created = {
        id: incoming.id || this.nextId(table),
        ...incoming,
        created_at: incoming.created_at || new Date().toISOString(),
        updated_at: incoming.updated_at || new Date().toISOString()
      };
      rows.push(created);
      result.push(created);
    }

    return this.projectRows(result, query.select);
  }
}

async function seedObservation(syncClient, bootstrap, overrides) {
  const rows = await syncClient.request("/rest/v1/observations", {
    method: "POST",
    query: {
      select: "*"
    },
    prefer: "return=representation",
    body: {
      workspace_id: bootstrap.workspace.id,
      company_id: bootstrap.company.id,
      case_id: bootstrap.activeCase.id,
      source_type: overrides.source_type || "chat",
      source_id: overrides.source_id || `msg_${overrides.normalized_signal}`,
      statement: overrides.statement,
      normalized_signal: overrides.normalized_signal,
      layer: overrides.layer || "commercial",
      confidence: overrides.confidence || 0.84,
      evidence: overrides.evidence || [],
      status: "active"
    }
  });

  return rows[0];
}

async function buildPhase6Case() {
  const syncClient = new FakeSupabaseClient();
  const bootstrapService = new MiniAppBootstrapService({ syncClient });
  const bootstrap = await bootstrapService.bootstrap({
    telegramUser: {
      id: 9061,
      username: "phase6_user",
      firstName: "Phase",
      lastName: "Six",
      languageCode: "ru"
    }
  });
  const service = new MiniAppDiagnosticsService({ syncClient });

  await service.saveOnboarding({
    bootstrap,
    payload: {
      companyName: "Phase 6 Company",
      industry: "B2B услуги",
      companySize: "11-50",
      revenueRange: "5-10 млн ₽ в месяц",
      userRole: "Собственник",
      currentRequest: "Продажи слабые: лидов много, но конверсия низкая"
    }
  });

  await service.saveExpressAnswer({ bootstrap, payload: { layerKey: "commercial", score: 2 } });
  await service.saveExpressAnswer({ bootstrap, payload: { layerKey: "operating_model", score: 3 } });
  await service.saveExpressAnswer({ bootstrap, payload: { layerKey: "strategy", score: 3 } });
  await service.saveExpressAnswer({ bootstrap, payload: { layerKey: "finance", score: 3 } });

  await seedObservation(syncClient, bootstrap, {
    normalized_signal: "mixed_inbound_confirmed",
    statement: "В работу идёт смешанный входящий поток.",
    layer: "commercial"
  });
  await seedObservation(syncClient, bootstrap, {
    normalized_signal: "priority_rules_missing",
    statement: "Нет общего правила приоритета для входящих лидов.",
    layer: "commercial"
  });
  await seedObservation(syncClient, bootstrap, {
    normalized_signal: "lead_flow_bottleneck",
    statement: "Лиды есть, но конверсия в продажу слабая.",
    layer: "commercial"
  });

  const constraint = await service.reasonConstraint({ bootstrap });
  await service.applyConstraintAction({
    bootstrap,
    payload: {
      id: constraint.constraintHypothesis.id,
      action: "confirm"
    }
  });
  await service.getOrCreateNextStep({ bootstrap });

  return { syncClient, bootstrap, service };
}

async function assertToolsFlow() {
  const { syncClient, bootstrap, service } = await buildPhase6Case();

  const catalog = await service.getTools({ bootstrap });
  assert.equal(catalog.tools.length, MINI_APP_TOOL_CATALOG.length);
  assert.equal(catalog.totalCount, MINI_APP_TOOL_CATALOG.length);
  assert.equal(catalog.tools.every((tool) => tool.is_active === true), true);

  await syncClient.request("/rest/v1/tool_recommendations", {
    method: "POST",
    query: {
      select: "*"
    },
    prefer: "return=representation",
    body: [1, 2, 3].map((index) => ({
      external_id: `legacy_recommendation_${index}`,
      case_id: bootstrap.activeCase.id,
      name: `Legacy recommendation ${index}`,
      reason: "Старая текстовая рекомендация без catalog tool.",
      usage_moment: "До Mini App Phase 6.",
      priority: index,
      status: "recommended",
      source: "legacy"
    }))
  });

  const recommendations = await service.getRecommendedTools({ bootstrap });
  assert.equal(recommendations.recommendations.length, 3);
  assert.equal(recommendations.recommendations.every((item) => item.tool?.source === "business_architecture_tools"), true);
  assert.equal(recommendations.recommendations.some((item) => item.tool?.layerKeys?.includes("commercial")), true);
  assert.equal(
    recommendations.recommendations.every((item, index) => item.priority === index + 1),
    true
  );

  const persisted = syncClient.getTable("tool_recommendations").filter((item) => item.tool_id);
  assert.equal(persisted.length >= 3, true);
  assert.equal(persisted.every((item) => item.source === "mini_app_recommender"), true);

  const opened = await service.markToolOpened({
    bootstrap,
    toolId: recommendations.recommendations[0].tool.id
  });
  assert.equal(opened.recommendation.status, "opened");

  const recalculated = await service.getRecommendedTools({ bootstrap, recalculate: true });
  assert.equal(recalculated.recommendations.length, 3);
}

async function assertDocumentFlow() {
  const { syncClient, bootstrap, service } = await buildPhase6Case();

  const saved = await service.saveDocumentLink({
    bootstrap,
    payload: {
      url: "https://docs.google.com/spreadsheets/d/example-phase6",
      title: "Карта воронки"
    }
  });
  assert.equal(saved.document.source_kind, "google_sheet");
  assert.equal(saved.document.status, "link_added");

  const inaccessible = await service.analyzeDocument({
    bootstrap,
    documentId: saved.document.id,
    payload: {}
  });
  assert.equal(inaccessible.snapshot, null);
  assert.equal(inaccessible.observations.length, 0);
  assert.equal(inaccessible.document.status, "access_lost");
  assert.match(inaccessible.userMessage, /не могу прочитать/i);
  assert.match(inaccessible.userMessage, /Google-документ/i);

  const analyzed = await service.analyzeDocument({
    bootstrap,
    documentId: saved.document.id,
    payload: {
      text: "Воронка: лиды смешанные, нет приоритета. Финансы: маржа падает. Роли и ответственность не закреплены. Процесс передачи лида ручной."
    }
  });
  assert.equal(analyzed.document.status, "analyzed");
  assert.equal(Boolean(analyzed.snapshot.id), true);
  assert.equal(analyzed.snapshot.summary.length <= 930, true);
  assert.equal(analyzed.snapshot.extracted_observations.length >= 3, true);
  assert.equal(analyzed.observations.length >= 3, true);
  assert.equal(syncClient.getTable("document_snapshots").length, 1);
  assert.equal(syncClient.getTable("observations").some((item) => item.source_type === "document"), true);

  const documents = await service.getDocuments({ bootstrap });
  assert.equal(documents.documents.length, 1);
  assert.equal(documents.documents[0].latestSnapshot.id, analyzed.snapshot.id);
}

async function assertApiClient() {
  const calls = [];
  const client = new MiniAppApiClient({
    initData: "signed-init-data",
    fetchImpl: async (path, options = {}) => {
      calls.push({
        path,
        method: options.method || "GET",
        initData: options.headers.get("x-telegram-init-data"),
        body: options.body ? JSON.parse(options.body) : null
      });

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          "content-type": "application/json"
        }
      });
    }
  });

  await client.getTools();
  await client.getRecommendedTools();
  await client.recalculateRecommendedTools();
  await client.markToolOpened("tool_1");
  await client.getDocuments();
  await client.saveDocument({ url: "https://example.com/doc" });
  await client.analyzeDocument("document_1", { text: "лиды и маржа" });

  assert.deepEqual(calls.map((call) => call.path), [
    "/api/mini-app/tools",
    "/api/mini-app/tools/recommended",
    "/api/mini-app/tools/recalculate",
    "/api/mini-app/tools/tool_1/opened",
    "/api/mini-app/documents",
    "/api/mini-app/documents",
    "/api/mini-app/documents/document_1/analyze"
  ]);
  assert.deepEqual(calls.map((call) => call.method), [
    "GET",
    "GET",
    "POST",
    "POST",
    "GET",
    "POST",
    "POST"
  ]);
  assert.equal(calls.every((call) => call.initData === "signed-init-data"), true);
  assert.equal(calls[5].body.url, "https://example.com/doc");
  assert.equal(calls[6].body.text, "лиды и маржа");
}

function assertFrontendAndRoutes() {
  const mainJs = fs.readFileSync("mini-app-assets/src/main.js", "utf8");
  const styles = fs.readFileSync("mini-app-assets/styles.css", "utf8");
  const apiClient = fs.readFileSync("mini-app-assets/src/api-client.js", "utf8");
  const miniAppApi = fs.readFileSync("api/mini-app/[...path].js", "utf8");

  assert.match(mainJs, /renderRecommendedToolsPanel/);
  assert.match(mainJs, /renderTools/);
  assert.match(mainJs, /renderToolCard/);
  assert.match(mainJs, /renderDocuments/);
  assert.match(mainJs, /Рекомендованные инструменты под текущую ситуацию/);
  assert.match(mainJs, /data-tools-recommendations-toggle/);
  assert.match(mainJs, /data-open-tool-recommendations/);
  assert.doesNotMatch(mainJs, /data-tool-opened/);
  assert.match(mainJs, /data-tool-search-form/);
  assert.match(mainJs, /data-document-analyze/);
  assert.doesNotMatch(mainJs, /CSS\.escape/);
  assert.match(styles, /\.tool-card/);
  assert.match(styles, /\.document-card/);
  assert.match(apiClient, /getRecommendedTools/);
  assert.match(apiClient, /analyzeDocument/);
  assert.match(miniAppApi, /getTools/);
  assert.match(miniAppApi, /getRecommendedTools/);
  assert.match(miniAppApi, /saveDocumentLink/);
  assert.match(miniAppApi, /analyzeDocument/);
}

async function main() {
  await assertToolsFlow();
  await assertDocumentFlow();
  await assertApiClient();
  assertFrontendAndRoutes();

  console.log("Mini App Phase 6 tools and documents checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
