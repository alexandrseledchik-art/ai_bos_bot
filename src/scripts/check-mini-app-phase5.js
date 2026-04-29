import assert from "node:assert/strict";
import fs from "node:fs";

import { MiniAppApiClient } from "../../mini-app-assets/src/api-client.js";
import { CONSTRAINT_REASONER_POLICY, ConstraintReasoner } from "../application/constraint-reasoner.js";
import { MiniAppBootstrapService } from "../application/mini-app-bootstrap-service.js";
import { MiniAppDiagnosticsService } from "../application/mini-app-diagnostics-service.js";
import { NextStepSelector } from "../application/next-step-selector.js";

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
      source_type: "chat",
      source_id: overrides.source_id || `msg_${overrides.normalized_signal}`,
      statement: overrides.statement,
      normalized_signal: overrides.normalized_signal,
      layer: overrides.layer || "commercial",
      confidence: overrides.confidence || 0.82,
      evidence: [],
      status: "active"
    }
  });

  return rows[0];
}

async function buildPhase5Case() {
  const syncClient = new FakeSupabaseClient();
  const bootstrapService = new MiniAppBootstrapService({ syncClient });
  const bootstrap = await bootstrapService.bootstrap({
    telegramUser: {
      id: 9051,
      username: "phase5_user",
      firstName: "Phase",
      lastName: "Five",
      languageCode: "ru"
    }
  });
  const service = new MiniAppDiagnosticsService({ syncClient });

  await service.saveOnboarding({
    bootstrap,
    payload: {
      companyName: "Phase 5 Company",
      industry: "B2B услуги",
      companySize: "11-50",
      revenueRange: "5-10 млн ₽ в месяц",
      userRole: "Собственник",
      currentRequest: "Продажи слабые: лидов много, но конверсия низкая"
    }
  });

  await service.saveExpressAnswer({ bootstrap, payload: { layerKey: "commercial", score: 3 } });
  await service.saveExpressAnswer({ bootstrap, payload: { layerKey: "operating_model", score: 3 } });
  await service.saveExpressAnswer({ bootstrap, payload: { layerKey: "strategy", score: 3 } });
  await service.saveExpressAnswer({ bootstrap, payload: { layerKey: "people_organization", score: 1 } });

  await seedObservation(syncClient, bootstrap, {
    normalized_signal: "mixed_inbound_confirmed",
    statement: "В работу идёт смешанный входящий поток",
    layer: "commercial"
  });
  await seedObservation(syncClient, bootstrap, {
    normalized_signal: "priority_rules_missing",
    statement: "Нет общего правила приоритета для входящих лидов",
    layer: "commercial"
  });
  await seedObservation(syncClient, bootstrap, {
    normalized_signal: "target_segment_unclear",
    statement: "Целевые и нецелевые заявки не отделяются до продажи",
    layer: "commercial"
  });

  return { syncClient, bootstrap, service };
}

async function assertConstraintFlow() {
  const { service, bootstrap } = await buildPhase5Case();
  const result = await service.reasonConstraint({ bootstrap });
  const hypothesis = result.constraintHypothesis;

  assert.equal(hypothesis.isHypothesis, true);
  assert.equal(hypothesis.layerKey, "commercial");
  assert.notEqual(hypothesis.layerKey, "people_organization");
  assert.equal(hypothesis.selectionSource, CONSTRAINT_REASONER_POLICY.selection);
  assert.equal(hypothesis.llmScope, CONSTRAINT_REASONER_POLICY.llmScope);
  assert.equal(hypothesis.status, "suggested");
  assert.match(hypothesis.explanation, /гипотеза/i);
  assert.equal(hypothesis.supportingObservations.length >= 2, true);
  assert.equal(hypothesis.whatToCheckNext.length > 0, true);
  assert.equal(hypothesis.missingEvidence.length > 0, true);
  assert.equal(result.reasoning.alternatives.length > 0, true);
  assert.equal(result.reasoning.policy.forbidden, "free_business_diagnosis_from_scratch");
  assert.equal(result.reasoning.shortlist[0].selectionSource, "deterministic_shortlist_only");

  const rejected = await service.applyConstraintAction({
    bootstrap,
    payload: {
      id: hypothesis.id,
      action: "reject"
    }
  });
  assert.equal(rejected.constraintHypothesis.status, "rejected");

  const rerun = await service.reasonConstraint({ bootstrap });
  const confirmed = await service.applyConstraintAction({
    bootstrap,
    payload: {
      id: rerun.constraintHypothesis.id,
      action: "confirm"
    }
  });
  assert.equal(confirmed.constraintHypothesis.status, "confirmed");

  const nextStepResult = await service.getOrCreateNextStep({ bootstrap });
  assert.equal(Boolean(nextStepResult.nextStep), true);
  assert.equal(nextStepResult.nextStep.constraint_hypothesis_id, confirmed.constraintHypothesis.id);
  assert.match(nextStepResult.nextStep.title, /лид/i);
  assert.match(nextStepResult.nextStep.description, /20 последних/i);
  assert.equal(/сделайте план/i.test(nextStepResult.nextStep.description), false);
  assert.equal(nextStepResult.nextStep.status, "suggested");
}

function assertReasonerDoesNotUseLowestScoreOnly() {
  const reasoner = new ConstraintReasoner();
  const result = reasoner.reason({
    problemContext: {
      request_text: "Продажи слабые, лидов много, конверсия низкая"
    },
    maturity: {
      answeredCount: 4,
      scores: [
        { layerKey: "commercial", score: 3 },
        { layerKey: "operating_model", score: 3 },
        { layerKey: "strategy", score: 3 },
        { layerKey: "people_organization", score: 1 }
      ]
    },
    observations: [
      { id: "obs_1", layer: "commercial", statement: "Смешанный поток", confidence: 0.9, status: "active" },
      { id: "obs_2", layer: "commercial", statement: "Нет приоритета лидов", confidence: 0.9, status: "active" },
      { id: "obs_3", layer: "commercial", statement: "Целевые заявки не отделяются", confidence: 0.9, status: "active" }
    ]
  });

  assert.equal(result.primary.layerKey, "commercial");
  assert.notEqual(result.primary.layerKey, "people_organization");
  assert.equal(result.policy.selection, "deterministic_shortlist_only");
  assert.equal(result.primary.llmScope, "explanation_only_after_selection");
  assert.equal(result.shortlist.every((candidate) => candidate.selectionSource === "deterministic_shortlist_only"), true);
}

function assertNextStepSelector() {
  const selector = new NextStepSelector();
  const nextStep = selector.select({
    constraintHypothesis: {
      id: "constraint_1",
      layer: "commercial",
      confidence: 0.74
    }
  });

  assert.equal(nextStep.targetEntityId, "constraint_1");
  assert.equal(nextStep.actionType, "lead_flow_audit");
  assert.match(nextStep.description, /20 последних заявок/);
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

  await client.reasonConstraint();
  await client.applyConstraintAction({ id: "constraint_1", action: "confirm" });
  await client.getNextStep();
  await client.updateNextStep({ id: "step_1", action: "accept" });

  assert.deepEqual(calls.map((call) => call.path), [
    "/api/mini-app/constraint/reason",
    "/api/mini-app/constraint/reason",
    "/api/mini-app/next-step",
    "/api/mini-app/next-step"
  ]);
  assert.equal(calls[1].method, "POST");
  assert.equal(calls[3].body.action, "accept");
  assert.equal(calls.every((call) => call.initData === "signed-init-data"), true);
}

function assertFrontendAndRoutes() {
  const mainJs = fs.readFileSync("mini-app-assets/src/main.js", "utf8");
  const styles = fs.readFileSync("mini-app-assets/styles.css", "utf8");
  const apiClient = fs.readFileSync("mini-app-assets/src/api-client.js", "utf8");
  const miniAppApi = fs.readFileSync("api/mini-app/[...path].js", "utf8");

  assert.match(mainJs, /renderConstraint/);
  assert.match(mainJs, /renderNextStep/);
  assert.match(mainJs, /Что показала диагностика/);
  assert.match(mainJs, /Почему начинаем с этой гипотезы/);
  assert.match(mainJs, /Сейчас есть предположение/);
  assert.match(mainJs, /Точки роста по областям/);
  assert.match(mainJs, /Что проверяем первым/);
  assert.match(mainJs, /Что меняют кнопки/);
  assert.match(mainJs, /Подтвердить как рабочую версию/);
  assert.match(mainJs, /Отклонить версию/);
  assert.match(mainJs, /сила версии/);
  assert.match(mainJs, /Что проверяем/);
  assert.match(mainJs, /Зачем это знать/);
  assert.match(mainJs, /data-constraint-action/);
  assert.match(mainJs, /data-next-step-action/);
  assert.match(styles, /\.insight-card/);
  assert.match(styles, /\.decision-note/);
  assert.match(styles, /\.selection-breakdown/);
  assert.match(styles, /\.growth-row/);
  assert.match(apiClient, /reasonConstraint/);
  assert.match(apiClient, /getNextStep/);
  assert.match(miniAppApi, /reasonConstraint/);
  assert.match(miniAppApi, /getOrCreateNextStep/);
}

async function main() {
  assertReasonerDoesNotUseLowestScoreOnly();
  assertNextStepSelector();
  await assertConstraintFlow();
  await assertApiClient();
  assertFrontendAndRoutes();

  console.log("Mini App Phase 5 constraint and next step checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
