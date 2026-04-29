import assert from "node:assert/strict";
import fs from "node:fs";

import { MiniAppApiClient } from "../../mini-app-assets/src/api-client.js";
import { MiniAppBootstrapService } from "../application/mini-app-bootstrap-service.js";
import { MiniAppDiagnosticsService } from "../application/mini-app-diagnostics-service.js";
import { calculateExpressMaturity } from "../application/maturity-calculator.js";
import { BUSINESS_LAYER_KEYS_V1, BUSINESS_LAYERS_V1 } from "../domain/business-layers.js";

const EXPECTED_LAYER_KEYS = [
  "owner_context",
  "external_environment",
  "strategy",
  "product_value_proposition",
  "commercial",
  "operating_model",
  "finance",
  "people_organization",
  "governance_risks",
  "technology",
  "data_analytics"
];

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

function assertBusinessLayers() {
  assert.deepEqual(BUSINESS_LAYER_KEYS_V1, EXPECTED_LAYER_KEYS);
  assert.equal(BUSINESS_LAYERS_V1.length, 11);

  for (const layer of BUSINESS_LAYERS_V1) {
    assert.equal(typeof layer.title, "string");
    assert.equal(layer.levels.length, 5, `${layer.key} should have 5 maturity descriptions`);
    assert.equal(layer.levels.every((description) => description.length > 20), true);
  }
}

function assertMaturityCalculator() {
  const answers = BUSINESS_LAYERS_V1.map((layer, index) => ({
    id: `answer_${layer.key}`,
    level: "express",
    subject_type: "layer",
    subject_key: layer.key,
    score: (index % 5) + 1,
    source: "user_explicit",
    status: "confirmed",
    confidence: 1,
    updated_at: `2026-04-27T00:${String(index).padStart(2, "0")}:00.000Z`
  }));

  answers.push({
    id: "ignored_suggestion",
    level: "express",
    subject_type: "layer",
    subject_key: "commercial",
    score: 1,
    source: "inferred_from_chat",
    status: "suggested",
    confidence: 0.7,
    updated_at: "2026-04-27T01:00:00.000Z"
  });

  const maturity = calculateExpressMaturity(answers);
  assert.equal(maturity.totalCount, 11);
  assert.equal(maturity.answeredCount, 11);
  assert.equal(maturity.progressPercent, 100);
  assert.equal(maturity.scores.find((score) => score.layerKey === "commercial").status, "answered");
}

async function assertDiagnosticsService() {
  const syncClient = new FakeSupabaseClient();
  const bootstrapService = new MiniAppBootstrapService({ syncClient });
  const telegramUser = {
    id: 777,
    username: "phase_three",
    firstName: "Phase",
    lastName: "Three",
    languageCode: "ru"
  };
  const bootstrap = await bootstrapService.bootstrap({ telegramUser });

  const service = new MiniAppDiagnosticsService({ syncClient });

  const onboarding = await service.saveOnboarding({
    bootstrap,
    payload: {
      companyName: "Phase 3 Company",
      industry: "Consulting",
      companySize: "2-10",
      revenueRange: "1-3 млн ₽",
      userRole: "Собственник",
      currentRequest: "Падают продажи при большом числе лидов"
    }
  });
  assert.equal(onboarding.onboardingStatus, "completed");
  assert.equal(onboarding.company.name, "Phase 3 Company");
  assert.equal(onboarding.problemContext.request_text, "Падают продажи при большом числе лидов");

  const express = await service.getExpressDiagnostics({ bootstrap });
  assert.equal(express.layers.length, 11);
  assert.equal(express.progress.answeredCount, 0);

  for (let index = 0; index < BUSINESS_LAYERS_V1.length; index += 1) {
    await service.saveExpressAnswer({
      bootstrap,
      payload: {
        layerKey: BUSINESS_LAYERS_V1[index].key,
        score: (index % 5) + 1
      }
    });
  }

  const maturity = await service.getMaturity({ bootstrap });
  assert.equal(maturity.maturity.answeredCount, 11);
  assert.equal(maturity.maturity.progressPercent, 100);
  assert.equal(maturity.run.status, "completed");
  assert.equal(syncClient.getTable("maturity_scores").length, 11);

  const refreshedBootstrap = await bootstrapService.bootstrap({ telegramUser });
  assert.equal(refreshedBootstrap.onboardingStatus, "completed");
  assert.equal(refreshedBootstrap.companyProfile.onboarding_status, "completed");
  assert.equal(refreshedBootstrap.dashboardSummary.diagnosticProgress.express, 100);
  assert.equal(refreshedBootstrap.dashboardSummary.expressProgress.answeredCount, 11);
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

  await client.getOnboarding();
  await client.saveOnboarding({ companyName: "Test" });
  await client.getExpressDiagnostics();
  await client.saveExpressAnswer({ layerKey: "commercial", score: 3 });
  await client.getMaturity();

  assert.deepEqual(calls.map((call) => call.path), [
    "/api/mini-app/onboarding",
    "/api/mini-app/onboarding",
    "/api/mini-app/diagnostics/express",
    "/api/mini-app/diagnostics/express/answer",
    "/api/mini-app/maturity"
  ]);
  assert.equal(calls.every((call) => call.initData === "signed-init-data"), true);
  assert.equal(calls[1].method, "POST");
  assert.equal(calls[3].body.layerKey, "commercial");
}

function assertFrontendShell() {
  const mainJs = fs.readFileSync("mini-app-assets/src/main.js", "utf8");
  const styles = fs.readFileSync("mini-app-assets/styles.css", "utf8");
  const migration = fs.readFileSync("supabase/migrations/20260428_add_mini_app_mvp_phase1.sql", "utf8");

  assert.match(mainJs, /data-onboarding-form/);
  assert.match(mainJs, /data-answer-layer/);
  assert.match(mainJs, /api\.getMaturity/);
  assert.match(mainJs, /Срез зрелости по областям/);
  assert.match(mainJs, /оценено областей/);
  assert.match(mainJs, /Что видно по срезу/);
  assert.match(mainJs, /Это быстрый срез по оцененным областям/);
  assert.match(mainJs, /formatDiagnosticCoverage/);
  assert.match(mainJs, /renderDiagnosticProgress/);
  assert.match(mainJs, /Заполнение диагностики/);
  assert.match(mainJs, /Оценено/);
  assert.match(mainJs, /Текущий выбор/);
  assert.match(mainJs, /Как пользоваться Кабинетом/);
  assert.match(styles, /\.level-option/);
  assert.match(styles, /\.progress-label/);
  assert.match(styles, /\.progress-caption/);
  assert.match(styles, /\.level-option em/);
  assert.match(styles, /\.maturity-row/);
  assert.match(migration, /maturity_scores_run_subject_version_unique/);
}

async function main() {
  assertBusinessLayers();
  assertMaturityCalculator();
  await assertDiagnosticsService();
  await assertApiClient();
  assertFrontendShell();

  console.log("Mini App Phase 3 onboarding and express diagnostics checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
