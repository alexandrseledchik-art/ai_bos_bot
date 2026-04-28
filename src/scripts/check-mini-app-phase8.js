import assert from "node:assert/strict";
import fs from "node:fs";

import { MiniAppApiClient } from "../../mini-app-assets/src/api-client.js";
import { ConstraintReasoner } from "../application/constraint-reasoner.js";
import { MiniAppBootstrapService } from "../application/mini-app-bootstrap-service.js";
import { MiniAppDiagnosticsService } from "../application/mini-app-diagnostics-service.js";
import { NextStepSelector } from "../application/next-step-selector.js";
import { calculateExpressMaturity } from "../application/maturity-calculator.js";
import { BUSINESS_LAYERS_V1 } from "../domain/business-layers.js";

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

function eventNames(syncClient) {
  return syncClient.getTable("mini_app_analytics_events").map((row) => row.event_name);
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

function buildAnswer(layerKey, score) {
  return {
    id: `answer_${layerKey}`,
    level: "express",
    subject_type: "layer",
    subject_key: layerKey,
    score,
    source: "user_explicit",
    status: "confirmed",
    confidence: 1
  };
}

function buildAnswers(scoreByLayer = {}) {
  return BUSINESS_LAYERS_V1.map((layer) => buildAnswer(layer.key, scoreByLayer[layer.key] ?? 3));
}

function buildScenario(category, index, overrides = {}) {
  const baseScores = Object.fromEntries(BUSINESS_LAYERS_V1.map((layer) => [layer.key, 3]));
  const observations = [];

  if (category === "sales") {
    baseScores.commercial = index % 3 === 0 ? 2 : 3;
    baseScores.people_organization = index % 4 === 0 ? 1 : 3;
    observations.push(
      { id: `sales_${index}_1`, layer: "commercial", normalized_signal: "mixed_inbound_confirmed", statement: "В работу попадает смешанный поток лидов.", confidence: 0.9 },
      { id: `sales_${index}_2`, layer: "commercial", normalized_signal: "priority_rules_missing", statement: "Нет единого правила приоритета входящих заявок.", confidence: 0.86 }
    );
  }

  if (category === "owner") {
    baseScores.owner_context = 2;
    baseScores.governance_risks = 2;
    observations.push(
      { id: `owner_${index}_1`, layer: "owner_context", normalized_signal: "owner_bottleneck", statement: "Решения часто сходятся на собственнике.", confidence: 0.84 },
      { id: `owner_${index}_2`, layer: "governance_risks", normalized_signal: "decision_flow_stuck", statement: "Задачи зависают без понятного владельца решения.", confidence: 0.78 }
    );
  }

  if (category === "scale") {
    baseScores.strategy = 2;
    baseScores.operating_model = index % 2 ? 2 : 3;
    observations.push(
      { id: `scale_${index}_1`, layer: "strategy", normalized_signal: "focus_spread", statement: "Рост распыляется между разными сегментами и инициативами.", confidence: 0.82 },
      { id: `scale_${index}_2`, layer: "operating_model", normalized_signal: "process_not_scaling", statement: "Новый поток быстро создаёт ручные очереди.", confidence: 0.74 }
    );
  }

  if (category === "sale_prep") {
    baseScores.commercial = 2;
    baseScores.product_value_proposition = index % 2 ? 2 : 3;
    observations.push(
      { id: `prep_${index}_1`, layer: "commercial", normalized_signal: "qualification_missing_confirmed", statement: "До продавца нет устойчивого фильтра целевых заявок.", confidence: 0.88 },
      { id: `prep_${index}_2`, layer: "product_value_proposition", normalized_signal: "value_unclear", statement: "Клиенты интересуются, но ценность предложения объясняется нестабильно.", confidence: 0.72 }
    );
  }

  if (category === "vague") {
    baseScores.data_analytics = index % 2 ? 2 : 3;
    observations.push(
      { id: `vague_${index}_1`, layer: "data_analytics", normalized_signal: "visibility_gap", statement: "Пока не хватает фактов, чтобы уверенно отделить симптом от причины.", confidence: 0.55 }
    );
  }

  return {
    category,
    request: overrides.request || {
      sales: "Падают продажи: лидов много, но конверсия слабая.",
      owner: "Собственник перегружен, решения зависают.",
      scale: "Бизнес не масштабируется, рост быстро превращается в хаос.",
      sale_prep: "Готовим продажи: заявок много, но они плохо проходят квалификацию.",
      vague: "Хочу разобраться, что тормозит бизнес."
    }[category],
    answers: buildAnswers({ ...baseScores, ...(overrides.scores || {}) }),
    observations: overrides.observations || observations
  };
}

function buildEvalScenarios() {
  const categories = ["sales", "owner", "scale", "sale_prep", "vague"];
  return categories.flatMap((category) =>
    Array.from({ length: 10 }, (_, index) => buildScenario(category, index + 1))
  );
}

function assertConcreteNextStep(nextStep) {
  assert.equal(Boolean(nextStep?.title), true);
  assert.equal(String(nextStep.description || "").length > 55, true);
  assert.equal(String(nextStep.whyThisFirst || "").length > 45, true);
  assert.doesNotMatch(
    `${nextStep.title} ${nextStep.description}`,
    /просто\s+улучшить|сделать\s+план\s+развития|разобраться\s+с\s+этим$/i
  );
}

function assertReasoningQuality(scenario) {
  const reasoner = new ConstraintReasoner();
  const selector = new NextStepSelector();
  const maturity = calculateExpressMaturity(scenario.answers);
  const result = reasoner.reason({
    maturity,
    observations: scenario.observations,
    problemContext: { request_text: scenario.request },
    companyProfile: { current_request: scenario.request }
  });

  assert.equal(result.policy.selection, "deterministic_shortlist_only");
  assert.equal(result.policy.llmScope, "explanation_only_after_selection");
  assert.equal(result.policy.forbidden, "free_business_diagnosis_from_scratch");
  assert.equal(result.primary.isHypothesis, true);
  assert.equal(result.primary.selectionSource, "deterministic_shortlist_only");
  assert.match(result.primary.explanation, /гипотез/i);
  assert.equal(result.primary.confidence < 1, true);
  assert.equal(result.alternatives.length > 0, true);

  const nextStep = selector.select({ constraintHypothesis: result.primary });
  assertConcreteNextStep(nextStep);

  return result;
}

function assertFiftyInternalEvalScenarios() {
  const scenarios = buildEvalScenarios();
  assert.equal(scenarios.length, 50);

  const results = scenarios.map(assertReasoningQuality);
  const selectedLayers = new Set(results.map((result) => result.primary.layerKey));
  assert.equal(selectedLayers.size >= 4, true);

  const notLowestOnly = buildScenario("sales", 99, {
    scores: {
      people_organization: 1,
      commercial: 3
    },
    observations: [
      { id: "not_lowest_1", layer: "commercial", normalized_signal: "mixed_inbound_confirmed", statement: "Лиды смешанные: целевые и нецелевые попадают в одну обработку.", confidence: 0.92 },
      { id: "not_lowest_2", layer: "commercial", normalized_signal: "priority_rules_missing", statement: "Приоритет лидов не закреплён как правило.", confidence: 0.88 }
    ]
  });
  const selected = assertReasoningQuality(notLowestOnly).primary;
  assert.equal(selected.layerKey, "commercial");

  const lowData = assertReasoningQuality({
    category: "vague",
    request: "Хочу понять, что не так с бизнесом.",
    answers: [buildAnswer("data_analytics", 2), buildAnswer("commercial", 3)],
    observations: []
  }).primary;
  assert.equal(lowData.confidence <= 0.62, true);
  assert.match(lowData.explanation, /недостаточно|факты|данных/i);
}

async function buildPhase8Case() {
  const syncClient = new FakeSupabaseClient();
  const bootstrapService = new MiniAppBootstrapService({ syncClient });
  const bootstrap = await bootstrapService.bootstrap({
    telegramUser: {
      id: 9081,
      username: "phase8_user",
      firstName: "Phase",
      lastName: "Eight",
      languageCode: "ru"
    }
  });
  const service = new MiniAppDiagnosticsService({ syncClient });

  await service.logMiniAppEvent({
    bootstrap,
    eventName: "mini_app_opened",
    metadata: { alphaMode: true }
  });
  await service.getOnboarding({ bootstrap });
  await service.saveOnboarding({
    bootstrap,
    payload: {
      companyName: "Phase 8 Company",
      industry: "B2B услуги",
      companySize: "11-50",
      revenueRange: "5-10 млн ₽ в месяц",
      userRole: "Собственник",
      currentRequest: "Продажи слабые: лидов много, но конверсия низкая"
    }
  });

  const emptyPrefill = await service.getDiagnosticPrefill({ bootstrap });
  assert.equal(emptyPrefill.suggestions.length, 0);

  await seedObservation(syncClient, bootstrap, {
    normalized_signal: "lead_overload",
    statement: "Лидов много, но команда не успевает обработать поток.",
    layer: "commercial"
  });
  await seedObservation(syncClient, bootstrap, {
    normalized_signal: "mixed_inbound_confirmed",
    statement: "В работу попадает смешанный входящий поток.",
    layer: "commercial"
  });
  await seedObservation(syncClient, bootstrap, {
    normalized_signal: "priority_rules_missing",
    statement: "Нет общего правила приоритета входящих лидов.",
    layer: "commercial"
  });
  await seedObservation(syncClient, bootstrap, {
    normalized_signal: "slow_first_response",
    statement: "Первый ответ по лидам часто занимает больше суток.",
    layer: "operating_model"
  });

  await service.getExpressDiagnostics({ bootstrap });
  const prefill = await service.getDiagnosticPrefill({ bootstrap });
  assert.equal(prefill.suggestions.length > 0, true);
  assert.equal(prefill.suggestions.every((item) => item.status === "suggested"), true);

  const confirmTarget = prefill.suggestions[0];
  await service.applyPrefillAction({
    bootstrap,
    payload: {
      action: "confirm",
      layerKey: confirmTarget.layerKey,
      answerId: confirmTarget.answerId,
      score: confirmTarget.score,
      selectedDescription: confirmTarget.selectedDescription
    }
  });
  const rejectTarget = prefill.suggestions.find((item) => item.answerId !== confirmTarget.answerId);
  if (rejectTarget) {
    await service.applyPrefillAction({
      bootstrap,
      payload: {
        action: "reject",
        layerKey: rejectTarget.layerKey,
        answerId: rejectTarget.answerId
      }
    });
  }

  for (const layer of BUSINESS_LAYERS_V1) {
    await service.saveExpressAnswer({
      bootstrap,
      payload: {
        layerKey: layer.key,
        score: layer.key === "commercial" ? 2 : layer.key === "people_organization" ? 1 : 3,
        selectedDescription: layer.levels[layer.key === "commercial" || layer.key === "people_organization" ? 1 : 2]
      }
    });
  }

  const constraint = await service.reasonConstraint({ bootstrap });
  assert.notEqual(constraint.constraintHypothesis.layerKey, "people_organization");
  await service.applyConstraintAction({
    bootstrap,
    payload: {
      id: constraint.constraintHypothesis.id,
      action: "reject"
    }
  });
  const reasonedAgain = await service.reasonConstraint({ bootstrap });
  const confirmed = await service.applyConstraintAction({
    bootstrap,
    payload: {
      id: reasonedAgain.constraintHypothesis.id,
      action: "confirm"
    }
  });
  assert.equal(confirmed.constraintHypothesis.status, "confirmed");

  const nextStep = await service.getOrCreateNextStep({ bootstrap });
  assertConcreteNextStep({
    title: nextStep.nextStep.title,
    description: nextStep.nextStep.description,
    whyThisFirst: nextStep.nextStep.why_this_first
  });
  await service.updateNextStepStatus({
    bootstrap,
    payload: {
      id: nextStep.nextStep.id,
      action: "accept"
    }
  });
  await service.updateNextStepStatus({
    bootstrap,
    payload: {
      id: nextStep.nextStep.id,
      action: "done"
    }
  });

  const tools = await service.getRecommendedTools({ bootstrap, recalculate: true });
  assert.equal(tools.recommendations.length, 3);
  await service.markToolOpened({ bootstrap, toolId: tools.recommendations[0].tool.id });

  const inaccessible = await service.saveDocumentLink({
    bootstrap,
    payload: {
      url: "https://docs.google.com/spreadsheets/d/phase8-closed",
      title: "Закрытая карта воронки"
    }
  });
  const accessResult = await service.analyzeDocument({
    bootstrap,
    documentId: inaccessible.document.id,
    payload: {}
  });
  assert.match(accessResult.userMessage, /не могу прочитать|доступ/i);

  const document = await service.saveDocumentLink({
    bootstrap,
    payload: {
      url: "https://docs.google.com/spreadsheets/d/phase8-open",
      title: "Карта воронки"
    }
  });
  const analyzed = await service.analyzeDocument({
    bootstrap,
    documentId: document.document.id,
    payload: {
      text: "Воронка: лиды смешанные, нет приоритета. Процесс передачи лида ручной. Финансовые цифры видны."
    }
  });
  assert.equal(Boolean(analyzed.snapshot), true);
  assert.equal(analyzed.observations.length > 0, true);

  const brief = await service.buildConsultationBrief({ bootstrap, persist: true });
  assert.equal(Boolean(brief.brief.title), true);
  await service.markConsultationRequest({ bootstrap, bookingUrl: "https://cal.example/alexander" });

  const override = await service.overrideConstraint({
    bootstrap,
    payload: {
      layerKey: "commercial",
      title: "Ручная гипотеза: коммерческий фильтр",
      explanation: "Ручная корректировка для альфа-проверки.",
      confidence: 0.8
    }
  });
  assert.equal(override.constraintHypothesis.status, "confirmed");
  const nextOverride = await service.overrideNextStep({
    bootstrap,
    payload: {
      constraintHypothesisId: override.constraintHypothesis.id,
      title: "Ручной следующий шаг",
      description: "Проверить 20 последних лидов и отметить целевость, приоритет, владельца и место остановки.",
      whyThisFirst: "Это быстро покажет, где теряется результат: в качестве входа, маршрутизации или мощности.",
      actionType: "manual_lead_audit"
    }
  });
  assert.equal(nextOverride.nextStep.status, "accepted");

  return {
    syncClient,
    bootstrap,
    service
  };
}

async function assertPhase8Flow() {
  const { syncClient } = await buildPhase8Case();
  const names = eventNames(syncClient);

  for (const expected of [
    "mini_app_opened",
    "onboarding_started",
    "onboarding_completed",
    "diagnostics_started",
    "diagnostics_completed",
    "suggestion_shown",
    "suggestion_confirmed",
    "suggestion_rejected",
    "constraint_viewed",
    "constraint_confirmed",
    "constraint_rejected",
    "next_step_viewed",
    "next_step_accepted",
    "next_step_done",
    "tool_opened",
    "document_added",
    "document_analyzed",
    "consultation_brief_generated",
    "consultation_clicked"
  ]) {
    assert.equal(names.includes(expected), true, `Missing event: ${expected}`);
  }

  const evalLogs = syncClient.getTable("mini_app_eval_logs");
  assert.equal(evalLogs.length > 0, true);
  assert.equal(evalLogs.some((row) => row.selected_constraint?.isHypothesis), true);
  assert.equal(evalLogs.some((row) => row.next_step?.title), true);
  assert.equal(evalLogs.some((row) => row.problem_context.includes("Продажи")), true);
  assert.equal(evalLogs.every((row) => Array.isArray(row.quality_flags)), true);

  const answered = syncClient
    .getTable("diagnostic_answers")
    .filter((row) => row.status === "confirmed" || row.status === "corrected");
  const suggested = syncClient
    .getTable("diagnostic_answers")
    .filter((row) => row.status === "suggested");
  assert.equal(answered.length >= 11, true);
  assert.equal(suggested.length >= 0, true);
}

async function assertApiClientDevOverrides() {
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

  await client.overrideConstraint({ layerKey: "commercial" });
  await client.overrideNextStep({ title: "Manual step" });

  assert.deepEqual(calls.map((call) => call.path), [
    "/api/mini-app/dev/constraint-override",
    "/api/mini-app/dev/next-step-override"
  ]);
  assert.deepEqual(calls.map((call) => call.method), ["POST", "POST"]);
  assert.equal(calls.every((call) => call.initData === "signed-init-data"), true);
}

function assertStaticPhase8Wiring() {
  const config = fs.readFileSync("src/config.js", "utf8");
  const migration = fs.readFileSync("supabase/migrations/20260428_add_mini_app_phase8_alpha.sql", "utf8");
  const mainJs = fs.readFileSync("mini-app-assets/src/main.js", "utf8");
  const apiClient = fs.readFileSync("mini-app-assets/src/api-client.js", "utf8");
  const service = fs.readFileSync("src/application/mini-app-diagnostics-service.js", "utf8");
  const miniAppApi = fs.readFileSync("api/mini-app/[...path].js", "utf8");

  assert.match(config, /MINI_APP_ALPHA_MODE/);
  assert.match(migration, /mini_app_analytics_events/);
  assert.match(migration, /mini_app_eval_logs/);
  assert.match(migration, /row level security/);
  assert.match(mainJs, /alpha-banner/);
  assert.match(mainJs, /Срез зрелости по областям/);
  assert.match(mainJs, /главное ограничение проверяем отдельно/);
  assert.match(mainJs, /Данных пока мало/);
  assert.match(apiClient, /overrideConstraint/);
  assert.match(apiClient, /overrideNextStep/);
  assert.match(service, /suggestion_shown/);
  assert.match(service, /captureEvalSnapshot/);
  assert.match(service, /manual_constraint_override/);
  assert.match(miniAppApi, /mini_app_opened/);
  assert.match(miniAppApi, /miniAppAlphaMode/);
  assert.match(miniAppApi, /dev\/constraint-override/);
  assert.match(miniAppApi, /dev\/next-step-override/);
}

async function main() {
  assertFiftyInternalEvalScenarios();
  await assertPhase8Flow();
  await assertApiClientDevOverrides();
  assertStaticPhase8Wiring();

  console.log("Mini App Phase 8 alpha launch checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
