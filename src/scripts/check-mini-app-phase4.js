import assert from "node:assert/strict";
import fs from "node:fs";

import { MiniAppApiClient } from "../../mini-app-assets/src/api-client.js";
import { ConversationService } from "../application/conversation-service.js";
import { DiagnosticPrefillEngine } from "../application/diagnostic-prefill-engine.js";
import { MiniAppBootstrapService } from "../application/mini-app-bootstrap-service.js";
import { MiniAppDiagnosticsService } from "../application/mini-app-diagnostics-service.js";
import { createCase, createCompany, createThread, emptyState } from "../domain/entities.js";

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

class FakeStore {
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

function buildDecision() {
  return {
    selectedMode: "diagnostic_mode",
    decision: {
      action: "diagnose",
      confidence: 0.7,
      signalSufficiency: "enough",
      rationale: "Test diagnostic decision."
    },
    response: {
      whatIUnderstood: "Есть перегруз входящего потока.",
      hypotheses: ["Коммерческий фильтр может быть слабым."],
      whyItMatters: "Важно отделить симптом от причины.",
      nextStep: "Проверить качество и приоритет входящих лидов.",
      responseText: "Проверим, где входящий поток ломается."
    },
    entryState: {
      claimedProblem: "много лидов, менеджеры не успевают",
      symptoms: ["лидов много", "не успевают обработать"],
      observedSignals: ["lead_overload", "team_overload_reported"],
      candidateConstraints: [
        {
          label: "Слабый коммерческий фильтр",
          layer: "commercial",
          confidence: 0.7
        }
      ],
      promotionReadiness: "ready_for_diagnostic_case"
    },
    memory: {
      goal: "Разобрать продажи",
      symptoms: ["лидов много"],
      hypotheses: ["Входящий поток смешанный"],
      constraint: "",
      situation: "",
      actionWave: {
        enabled: false,
        firstStep: "",
        notNow: "",
        whyThisFirst: ""
      },
      toolRecommendations: [],
      artifact: {
        shouldSave: false,
        title: "",
        summary: "",
        kind: "snapshot"
      }
    }
  };
}

async function assertChatObservationPersistence() {
  const store = new FakeStore();
  const company = createCompany({ name: "Chat Company", telegramChatId: "9001" });
  const thread = createThread({ telegramChatId: "9001", companyId: company.id });
  const activeCase = createCase({
    companyId: company.id,
    kind: "diagnostic_case",
    mode: "diagnostic_mode",
    summary: "Existing diagnostic case"
  });
  thread.activeCaseId = activeCase.id;
  store.state.companies.push(company);
  store.state.threads.push(thread);
  store.state.cases.push(activeCase);

  const service = new ConversationService({
    store,
    screener: { screen: async () => ({}) },
    reasoner: { decide: async () => buildDecision() }
  });

  await service.handleUserMessage({
    telegramChatId: "9001",
    text: "Лидов много, менеджеры не успевают обработать",
    userMeta: { username: "phase4_user" }
  });

  assert.equal(store.state.observations.length > 0, true);
  assert.equal(
    store.state.observations.some((item) => item.normalizedSignal === "lead_overload"),
    true
  );
  assert.equal(
    store.state.observations.every((item) => item.layer === "commercial" || item.layer === "operating_model"),
    true
  );
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
      source_type: "chat",
      source_id: overrides.source_id || `msg_${overrides.normalized_signal}`,
      statement: overrides.statement,
      normalized_signal: overrides.normalized_signal,
      layer: overrides.layer || "commercial",
      confidence: overrides.confidence || 0.8,
      evidence: overrides.evidence || [],
      status: "active",
      created_at: overrides.created_at
    }
  });

  return rows[0];
}

async function assertPrefillFlow() {
  const syncClient = new FakeSupabaseClient();
  const bootstrapService = new MiniAppBootstrapService({ syncClient });
  const bootstrap = await bootstrapService.bootstrap({
    telegramUser: {
      id: 9001,
      username: "phase4_user",
      firstName: "Phase",
      lastName: "Four",
      languageCode: "ru"
    }
  });
  const service = new MiniAppDiagnosticsService({ syncClient });

  await service.saveOnboarding({
    bootstrap,
    payload: {
      companyName: "Phase 4 Company",
      userRole: "Собственник",
      currentRequest: "Продажи слабые, лидов много, конверсия низкая"
    }
  });

  await seedObservation(syncClient, bootstrap, {
    normalized_signal: "mixed_inbound_confirmed",
    statement: "В работу идёт смешанный поток"
  });

  const firstPrefill = await service.getDiagnosticPrefill({ bootstrap });
  const commercial = firstPrefill.suggestionsByLayer.commercial;
  assert.equal(Boolean(commercial), true);
  assert.equal(commercial.displayConfidence, "вероятная оценка, подтвердите");
  assert.equal(commercial.evidence.length > 0, true);

  const maturityBeforeConfirm = await service.getMaturity({ bootstrap });
  assert.equal(maturityBeforeConfirm.maturity.answeredCount, 0);

  const rejected = await service.applyPrefillAction({
    bootstrap,
    payload: {
      action: "reject",
      answerId: commercial.answerId,
      layerKey: "commercial"
    }
  });
  assert.equal(rejected.answer.status, "rejected");

  const afterReject = await service.getDiagnosticPrefill({ bootstrap });
  assert.equal(Boolean(afterReject.suggestionsByLayer.commercial), false);

  await seedObservation(syncClient, bootstrap, {
    normalized_signal: "priority_rules_missing",
    statement: "Нет правил приоритета входящих",
    source_id: "msg_new_evidence",
    created_at: "2030-01-01T00:00:00.000Z"
  });

  const afterNewEvidence = await service.getDiagnosticPrefill({ bootstrap });
  assert.equal(Boolean(afterNewEvidence.suggestionsByLayer.commercial), true);

  const confirmed = await service.applyPrefillAction({
    bootstrap,
    payload: {
      action: "confirm",
      answerId: afterNewEvidence.suggestionsByLayer.commercial.answerId,
      layerKey: "commercial",
      score: afterNewEvidence.suggestionsByLayer.commercial.score,
      selectedDescription: afterNewEvidence.suggestionsByLayer.commercial.selectedDescription
    }
  });
  assert.equal(confirmed.answer.status, "confirmed");
  assert.equal(confirmed.answer.source, "user_confirmed_inference");

  const maturityAfterConfirm = await service.getMaturity({ bootstrap });
  assert.equal(maturityAfterConfirm.maturity.answeredCount, 1);
}

function assertEngineThresholds() {
  const engine = new DiagnosticPrefillEngine();
  const suggestions = engine.generate({
    observations: [
      {
        id: "obs_low",
        normalized_signal: "team_overload_reported",
        statement: "Команда перегружена",
        status: "active",
        created_at: "2026-04-27T00:00:00.000Z"
      }
    ],
    existingAnswers: []
  });

  assert.equal(suggestions.some((item) => item.layerKey === "people_organization"), false);
  assert.equal(suggestions.some((item) => item.displayConfidence === "предположение системы"), true);
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

  await client.getDiagnosticPrefill();
  await client.applyDiagnosticPrefillAction({
    action: "confirm",
    answerId: "answer_1",
    layerKey: "commercial",
    score: 2
  });

  assert.equal(calls[0].path, "/api/mini-app/diagnostics/prefill");
  assert.equal(calls[0].method, "GET");
  assert.equal(calls[1].method, "POST");
  assert.equal(calls[1].body.action, "confirm");
  assert.equal(calls.every((call) => call.initData === "signed-init-data"), true);
}

function assertFrontendAndMigration() {
  const mainJs = fs.readFileSync("mini-app-assets/src/main.js", "utf8");
  const styles = fs.readFileSync("mini-app-assets/styles.css", "utf8");
  const migration = fs.readFileSync("supabase/migrations/20260428_add_mini_app_mvp_phase1.sql", "utf8");

  assert.match(mainJs, /getDiagnosticPrefill/);
  assert.match(mainJs, /applyDiagnosticPrefillAction/);
  assert.match(mainJs, /data-prefill-action/);
  assert.match(mainJs, /suggestion-card/);
  assert.match(styles, /\.suggestion-card/);
  assert.match(migration, /observations_case_source_signal_unique/);
}

async function main() {
  assertEngineThresholds();
  await assertChatObservationPersistence();
  await assertPrefillFlow();
  await assertApiClient();
  assertFrontendAndMigration();

  console.log("Mini App Phase 4 hybrid prefill checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
