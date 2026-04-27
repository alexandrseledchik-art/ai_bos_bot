import assert from "node:assert/strict";
import fs from "node:fs";

import { MiniAppApiClient } from "../../mini-app-assets/src/api-client.js";
import { ConsultationBriefBuilder } from "../application/consultation-brief-builder.js";
import { MiniAppBootstrapService } from "../application/mini-app-bootstrap-service.js";
import { MiniAppDiagnosticsService } from "../application/mini-app-diagnostics-service.js";

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
      confidence: overrides.confidence || 0.85,
      evidence: overrides.evidence || [],
      status: "active"
    }
  });

  return rows[0];
}

async function buildPhase7Case() {
  const syncClient = new FakeSupabaseClient();
  const bootstrapService = new MiniAppBootstrapService({ syncClient });
  const bootstrap = await bootstrapService.bootstrap({
    telegramUser: {
      id: 9071,
      username: "phase7_user",
      firstName: "Phase",
      lastName: "Seven",
      languageCode: "ru"
    }
  });
  const service = new MiniAppDiagnosticsService({ syncClient });

  await service.saveOnboarding({
    bootstrap,
    payload: {
      companyName: "Phase 7 Company",
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
  await service.saveExpressAnswer({ bootstrap, payload: { layerKey: "finance", score: 4 } });

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
  const confirmed = await service.applyConstraintAction({
    bootstrap,
    payload: {
      id: constraint.constraintHypothesis.id,
      action: "confirm"
    }
  });
  const nextStep = await service.getOrCreateNextStep({ bootstrap });

  const document = await service.saveDocumentLink({
    bootstrap,
    payload: {
      url: "https://docs.google.com/spreadsheets/d/phase7",
      title: "Карта воронки"
    }
  });
  await service.analyzeDocument({
    bootstrap,
    documentId: document.document.id,
    payload: {
      text: "Воронка: лиды смешанные, нет приоритета. Процесс передачи лида ручной. Финансовые цифры видны."
    }
  });

  return {
    syncClient,
    bootstrap,
    service,
    selectedConstraintId: confirmed.constraintHypothesis.id,
    selectedNextStepId: nextStep.nextStep.id
  };
}

async function assertConsultationBriefFlow() {
  const { syncClient, bootstrap, service, selectedConstraintId, selectedNextStepId } = await buildPhase7Case();

  const generated = await service.buildConsultationBrief({ bootstrap, persist: true });
  const brief = generated.brief;

  assert.match(brief.title, /Кейс:/);
  assert.match(brief.current_request, /Продажи слабые/);
  assert.equal(brief.maturity_summary.completed_layers, 4);
  assert.equal(JSON.stringify(brief.maturity_summary.weak_layers).includes("Коммерция"), true);
  assert.match(brief.constraint_summary, /гипотез/i);
  assert.match(brief.next_step_summary, /20 последних заявок/i);
  assert.equal(brief.evidence.length >= 4, true);
  assert.equal(brief.open_questions.length > 0, true);
  assert.match(generated.statusNote, /материал|гипотез|карта зрелости/i);

  const savedRows = syncClient.getTable("consultation_briefs");
  assert.equal(savedRows.length, 1);
  assert.equal(savedRows[0].status, "draft");
  assert.equal(savedRows[0].evidence.length, brief.evidence.length);
  assert.equal(savedRows[0].open_questions.length, brief.open_questions.length);

  const latest = await service.getOrBuildConsultationBrief({ bootstrap });
  assert.equal(latest.source, "latest_draft");
  assert.equal(latest.brief.id, brief.id);

  const constraintAfterBrief = await service.findLatestConstraintHypothesis({
    bootstrap,
    statuses: ["confirmed", "suggested"]
  });
  const nextStepAfterBrief = await service.findOne("next_steps", {
    case_id: `eq.${bootstrap.activeCase.id}`,
    order: "updated_at.desc",
    select: "*"
  });
  assert.equal(constraintAfterBrief.id, selectedConstraintId);
  assert.equal(nextStepAfterBrief.id, selectedNextStepId);

  const noBooking = await service.markConsultationRequest({ bootstrap, bookingUrl: "" });
  assert.equal(noBooking.canBook, false);
  assert.equal(noBooking.brief.status, "ready");
  assert.match(noBooking.userMessage, /ALEXANDER_BOOKING_URL/);

  const withBooking = await service.markConsultationRequest({
    bootstrap,
    bookingUrl: "https://cal.example/alexander"
  });
  assert.equal(withBooking.canBook, true);
  assert.equal(withBooking.bookingUrl, "https://cal.example/alexander");
  assert.equal(withBooking.brief.status, "sent");
  assert.equal(withBooking.brief.booking_url, "https://cal.example/alexander");
  assert.equal(Boolean(withBooking.brief.requested_at), true);
}

function assertBuilderDoesNotDiagnoseFromScratch() {
  const builder = new ConsultationBriefBuilder();
  const brief = builder.build({
    company: { name: "No Data Company" },
    problemContext: { request_text: "Хочу разобраться" },
    maturity: {
      answeredCount: 0,
      averageScore: null,
      scores: []
    },
    observations: []
  });

  assert.match(brief.constraint_summary, /пока не сформирована/i);
  assert.match(brief.next_step_summary, /пока не выбран/i);
  assert.equal(brief.evidence.length, 0);
  assert.equal(brief.open_questions.length > 0, true);
}

async function assertApiClient() {
  const calls = [];
  const client = new MiniAppApiClient({
    initData: "signed-init-data",
    fetchImpl: async (path, options = {}) => {
      calls.push({
        path,
        method: options.method || "GET",
        initData: options.headers.get("x-telegram-init-data")
      });

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          "content-type": "application/json"
        }
      });
    }
  });

  await client.getConsultationBrief();
  await client.generateConsultationBrief();
  await client.requestConsultation();

  assert.deepEqual(calls.map((call) => call.path), [
    "/api/mini-app/consultation/brief",
    "/api/mini-app/consultation/brief",
    "/api/mini-app/consultation/request"
  ]);
  assert.deepEqual(calls.map((call) => call.method), ["GET", "POST", "POST"]);
  assert.equal(calls.every((call) => call.initData === "signed-init-data"), true);
}

function assertFrontendRoutesAndPrompt() {
  const mainJs = fs.readFileSync("mini-app-assets/src/main.js", "utf8");
  const apiClient = fs.readFileSync("mini-app-assets/src/api-client.js", "utf8");
  const routes = fs.readFileSync("mini-app-assets/src/routes.js", "utf8");
  const config = fs.readFileSync("src/config.js", "utf8");
  const migration = fs.readFileSync("supabase/migrations/20260428_add_mini_app_phase7_consultation.sql", "utf8");
  const prompt = fs.readFileSync("prompts/mini-app/consultation-brief.md", "utf8");
  const briefApi = fs.readFileSync("api/mini-app/consultation/brief.js", "utf8");
  const requestApi = fs.readFileSync("api/mini-app/consultation/request.js", "utf8");

  assert.match(mainJs, /renderConsultation/);
  assert.match(mainJs, /data-consultation-generate/);
  assert.match(mainJs, /data-consultation-copy/);
  assert.match(mainJs, /data-consultation-request/);
  assert.match(mainJs, /Скопировать резюме/);
  assert.match(apiClient, /getConsultationBrief/);
  assert.match(apiClient, /requestConsultation/);
  assert.match(routes, /Разбор с Александром Селедчиком/);
  assert.match(config, /alexanderBookingUrl/);
  assert.match(config, /ALEXANDER_BOOKING_URL/);
  assert.match(migration, /open_questions/);
  assert.match(migration, /requested_at/);
  assert.match(prompt, /Не диагностируй бизнес заново|Do not diagnose/i);
  assert.match(prompt, /Александр Селедчик/);
  assert.match(briefApi, /bookingUrlConfigured/);
  assert.match(requestApi, /markConsultationRequest/);
}

async function main() {
  assertBuilderDoesNotDiagnoseFromScratch();
  await assertConsultationBriefFlow();
  await assertApiClient();
  assertFrontendRoutesAndPrompt();

  console.log("Mini App Phase 7 consultation checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
