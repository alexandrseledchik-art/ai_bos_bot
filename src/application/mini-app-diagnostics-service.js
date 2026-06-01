import { calculateExpressMaturity } from "./maturity-calculator.js";
import { ConsultationBriefBuilder } from "./consultation-brief-builder.js";
import { ConstraintReasoner } from "./constraint-reasoner.js";
import { DiagnosticPrefillEngine } from "./diagnostic-prefill-engine.js";
import { MiniAppAnalyticsService } from "./mini-app-analytics-service.js";
import { NextStepSelector } from "./next-step-selector.js";
import { ToolRecommender } from "./tool-recommender.js";
import { assertBusinessLayerKey, BUSINESS_LAYERS_V1, getBusinessLayerByKey } from "../domain/business-layers.js";
import { MINI_APP_TOOL_CATALOG } from "../domain/mini-app-tools-catalog.js";

const OFFICIAL_ANSWER_SOURCES = new Set([
  "user_explicit",
  "user_confirmed_inference",
  "user_corrected_inference"
]);

const OFFICIAL_ANSWER_STATUSES = new Set(["confirmed", "corrected"]);
const CONSTRAINT_REJECTION_CHAT_EVENT = "constraint_rejection_chat_requested";
const CONSTRAINT_REJECTION_FEEDBACK_SIGNAL = "constraint_rejection_feedback";
const BUSINESS_ASSEMBLY_ARTIFACT_PREFIX = "miniapp_assembly";
const BUSINESS_ASSEMBLY_LAYER_ORDER = [
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
const BUSINESS_ASSEMBLY_ARTIFACTS = {
  owner_context: [
    {
      id: "owner-decision-frame",
      title: "Карта целей и роли собственника",
      why: "Без этой карты бизнес легко начинает собираться вокруг разных ожиданий: рост, прибыль, свобода времени и роль Александра могут конфликтовать.",
      fillPrompt: "Зафиксировать цель на 3-6 месяцев, желаемую роль Александра, правила ключевых решений и то, что больше не должно держаться только в голове собственника."
    },
    {
      id: "owner-decision-rules",
      title: "Правила CEO-решений",
      why: "AI-BOSS сможет действовать проактивно только если понятно, какие решения он готовит сам, а какие выносит Александру как собственнику.",
      fillPrompt: "Разделить решения на три группы: AI-BOSS делает сам, AI-BOSS предлагает варианты, Александр утверждает."
    }
  ],
  external_environment: [
    {
      id: "market-reality-map",
      title: "Карта рынка и спроса",
      why: "Нужно понять, в какой реальности упаковывается консалтинг: кто уже покупает такие разборы, какие боли обострены и где есть платёжеспособный спрос.",
      fillPrompt: "Описать сегменты собственников, частые триггеры обращения, альтернативы на рынке, уровень срочности и причины платить за разбор."
    }
  ],
  strategy: [
    {
      id: "strategic-focus",
      title: "Стратегический фокус консалтинга",
      why: "Без выбора стартового фокуса AI-BOSS будет улучшать всё сразу и снова превратится в набор идей вместо управленческой системы.",
      fillPrompt: "Выбрать стартовый сегмент, обещание результата, границы продукта, отказ от лишних направлений и критерий успеха на 4 недели."
    }
  ],
  product_value_proposition: [
    {
      id: "offer-map",
      title: "Карта оффера и результата",
      why: "Пользователь должен понимать не методологию, а что он получает после входа: какой результат, какие артефакты и зачем это ему.",
      fillPrompt: "Собрать первый платный оффер: кому, с какой болью, какой результат, какой маршрут, что получает после разбора."
    }
  ],
  commercial: [
    {
      id: "client-route",
      title: "Маршрут клиента от входа до разбора",
      why: "Консалтинг должен продаваться не вручную каждый раз, а через понятный путь: бот, кабинет, резюме, консультация, следующий шаг.",
      fillPrompt: "Описать этапы от первого сообщения до оплаты/разбора, критерии подходящего клиента, точки доверия и причины отказа."
    }
  ],
  operating_model: [
    {
      id: "delivery-process",
      title: "Процесс проведения разбора",
      why: "Чтобы бизнес не упирался во время Александра, нужно зафиксировать, что делает бот, что делает эксперт и какой артефакт выходит после работы.",
      fillPrompt: "Описать подготовку, сам разбор, фиксацию выводов, следующий шаг, контроль выполнения и обновление кейса."
    }
  ],
  finance: [
    {
      id: "profit-model",
      title: "Финансовая модель консалтинга",
      why: "Цель 3 млн чистой прибыли невозможна без простой экономики: цена, мощность, маржа, нагрузка Александра и роль AI-BOSS.",
      fillPrompt: "Посчитать цену оффера, количество разборов, долю ручного времени, расходы, чистую прибыль и ограничение по мощности."
    }
  ],
  people_organization: [
    {
      id: "role-map",
      title: "Карта ролей и ответственности",
      why: "Даже если пока команда маленькая, нужно заранее отделить роль собственника, эксперта, AI-BOSS и будущих помощников.",
      fillPrompt: "Разложить роли по задачам: кто собирает факты, кто принимает решения, кто ведёт клиента, кто фиксирует артефакты и кто контролирует выполнение."
    }
  ],
  governance_risks: [
    {
      id: "management-rhythm",
      title: "Ритм управления и контрольные петли",
      why: "CEO-режим появляется не от названия, а от регулярного цикла: что проверяем, какие решения принимаем и когда возвращаемся к фактам.",
      fillPrompt: "Задать еженедельный ритм: повестка, решения Александра, действия AI-BOSS, факты выполнения, риски и пересборка гипотез."
    }
  ],
  technology: [
    {
      id: "systems-map",
      title: "Карта систем и автоматизаций",
      why: "Если документы, чат, кабинет и будущие интеграции не связаны, AI-BOSS не сможет сам собирать факты и управлять процессом.",
      fillPrompt: "Описать текущие системы, где лежат документы, какие данные нужны из Telegram, Mini App, CRM, таблиц и что должно синхронизироваться."
    }
  ],
  data_analytics: [
    {
      id: "metrics-map",
      title: "Карта метрик и источников данных",
      why: "Чтобы бот принимал решения не по ощущениям, нужно определить минимальные факты: лиды, конверсия, выручка, маржа, загрузка, выполнение шагов.",
      fillPrompt: "Собрать список метрик, источников, частоту обновления, владельца данных и решения, которые принимаются по каждой метрике."
    }
  ]
};

function firstRow(rows) {
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeText(value) {
  return trimString(value).toLowerCase();
}

function normalizeLookupText(value) {
  return normalizeText(value)
    .replace(/[^a-zа-яё0-9]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function assemblyArtifactExternalId(caseId, artifactId) {
  return `${BUSINESS_ASSEMBLY_ARTIFACT_PREFIX}_${caseId}_${artifactId}`;
}

function getAssemblyArtifactDefinitions(layerKey) {
  return BUSINESS_ASSEMBLY_ARTIFACTS[layerKey] || [];
}

function getBusinessAssemblyOrderIndex(layerKey) {
  const index = BUSINESS_ASSEMBLY_LAYER_ORDER.indexOf(layerKey);
  return index >= 0 ? index : BUSINESS_ASSEMBLY_LAYER_ORDER.length;
}

function truncateText(value, maxLength = 900) {
  const text = trimString(value);
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 1).trim()}…`;
}

function hasUsefulChatFeedback(value) {
  const text = trimString(value);
  return text.length >= 12 && !text.startsWith("/");
}

function inferLayerFromRejectionFeedback(text, fallbackLayer = "") {
  const normalized = normalizeText(text);
  const rules = [
    { layerKey: "owner_context", pattern: /собственник|партн[её]р|цель|роль|решени|приоритет|фокус/ },
    { layerKey: "external_environment", pattern: /рынок|спрос|конкурент|отрасл|внешн/ },
    { layerKey: "strategy", pattern: /стратег|сегмент|позиционир|фокус|направлен|рынок/ },
    { layerKey: "product_value_proposition", pattern: /продукт|ценност|оффер|предложени|упаковк|результат|клиентск/ },
    { layerKey: "commercial", pattern: /продаж|лид|заяв|ворон|конверс|трафик|клиент/ },
    { layerKey: "operating_model", pattern: /процесс|операцион|исполн|срок|качест|delivery|передач/ },
    { layerKey: "finance", pattern: /деньг|финанс|прибыл|марж|касс|выруч|расход/ },
    { layerKey: "people_organization", pattern: /команд|люд|сотруд|менедж|компетенц|нагруз|выгор/ },
    { layerKey: "governance_risks", pattern: /управлен|контрол|ответствен|риск|ритм|хаос/ },
    { layerKey: "technology", pattern: /технолог|автомат|crm|инструмент|систем|интеграц/ },
    { layerKey: "data_analytics", pattern: /данн|цифр|аналит|отч[её]т|метрик|неточн|факт/ }
  ];
  const match = rules.find((rule) => rule.pattern.test(normalized));

  if (match) {
    return match.layerKey;
  }

  return getBusinessLayerByKey(fallbackLayer) ? fallbackLayer : "data_analytics";
}

function normalizeUrl(value) {
  const raw = trimString(value);
  if (!raw) {
    return "";
  }

  try {
    const url = new URL(raw);
    if (!["http:", "https:"].includes(url.protocol)) {
      return "";
    }
    return url.toString();
  } catch {
    return "";
  }
}

function guessSourceKind(url) {
  const text = String(url || "").toLowerCase();
  if (text.includes("docs.google.com/spreadsheets")) {
    return "google_sheet";
  }
  if (text.includes("docs.google.com/document")) {
    return "google_doc";
  }
  if (text.endsWith(".xlsx") || text.endsWith(".xls")) {
    return "excel";
  }
  if (text.endsWith(".pdf")) {
    return "pdf";
  }
  return "link";
}

function normalizeSourceKind(value, fallbackUrl) {
  const sourceKind = trimString(value);
  const allowedKinds = new Set(["link", "google_sheet", "google_doc", "excel", "pdf"]);
  return allowedKinds.has(sourceKind) ? sourceKind : guessSourceKind(fallbackUrl);
}

function compactText(value, maxLength = 900) {
  const text = trimString(value).replace(/\s+/g, " ");
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength - 1).trim()}…`;
}

function createDocumentInsights(text) {
  const lower = text.toLowerCase();
  const extracted = [];
  const risks = [];
  const openQuestions = [];

  const addObservation = (normalizedSignal, layer, statement) => {
    if (!extracted.some((item) => item.normalized_signal === normalizedSignal)) {
      extracted.push({ normalized_signal: normalizedSignal, layer, statement });
    }
  };

  if (/лид|заяв|клиент|ворон|конверс|сегмент|icp|целев/.test(lower)) {
    addObservation("document_commercial_flow_signal", "commercial", "В документе есть сигналы о клиентском потоке, лидах, сегментах или конверсии.");
    openQuestions.push("Понятно ли из документа, какие лиды считаются целевыми и как они приоритизируются?");
  }
  if (/марж|прибыл|выруч|касс|расход|деньг/.test(lower)) {
    addObservation("document_finance_signal", "finance", "В документе есть финансовые сигналы: выручка, маржа, расходы, касса или прибыль.");
    openQuestions.push("Связаны ли финансовые цифры с конкретными слоями потока: спрос, продажи, исполнение?");
  }
  if (/роль|ответствен|raci|кто делает|соглас|информ/.test(lower)) {
    addObservation("document_responsibility_signal", "governance_risks", "В документе есть сигналы о ролях, ответственности или согласовании.");
    risks.push("Если ответственность описана общо, документ может не превращаться в рабочий порядок действий.");
  }
  if (/процесс|этап|срок|передач|очеред|delivery|исполн/.test(lower)) {
    addObservation("document_operating_model_signal", "operating_model", "В документе есть сигналы об этапах процесса, сроках, передаче или исполнении.");
    openQuestions.push("На каком этапе из документа чаще всего возникает задержка или ручное решение?");
  }
  if (/собственник|партнер|партнёр|цель|горизонт/.test(lower)) {
    addObservation("document_owner_context_signal", "owner_context", "В документе есть сигналы о целях, роли собственника или верхней рамке решений.");
  }
  if (/crm|отчет|отчёт|метрик|аналит|дашборд|данн/.test(lower)) {
    addObservation("document_data_signal", "data_analytics", "В документе есть сигналы о данных, CRM, отчётности или метриках.");
    risks.push("Если метрики не связаны с решением, документ может показывать цифры, но не объяснять ограничение.");
  }

  if (!extracted.length) {
    openQuestions.push("Какие выводы из документа важнее всего для текущего управленческого кейса?");
  }

  return {
    summary: compactText(`Короткий снимок документа: ${text}`, 900),
    extractedObservations: extracted.slice(0, 6),
    risks: risks.slice(0, 5),
    openQuestions: openQuestions.slice(0, 5)
  };
}

function isCompletedOnboarding(payload) {
  return Boolean(trimString(payload.companyName) && trimString(payload.currentRequest) && trimString(payload.userRole));
}

function isOfficialAnswer(answer) {
  return OFFICIAL_ANSWER_SOURCES.has(answer?.source) && OFFICIAL_ANSWER_STATUSES.has(answer?.status);
}

function statusRank(value, rankMap) {
  return rankMap[value] ?? 0;
}

function normalizeConfidence(value, fallback = 0.75) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.max(0, Math.min(1, numeric));
}

export class MiniAppDiagnosticsService {
  constructor({ syncClient }) {
    this.syncClient = syncClient;
    this.analytics = new MiniAppAnalyticsService({ syncClient });
  }

  async logMiniAppEvent({ bootstrap, eventName, metadata = {} }) {
    return this.analytics.logEvent({ bootstrap, eventName, metadata });
  }

  async findOne(table, query) {
    const rows = await this.syncClient.request(`/rest/v1/${table}`, {
      query: {
        ...query,
        limit: 1
      }
    });

    return firstRow(rows);
  }

  async findMany(table, query = {}) {
    return this.syncClient.request(`/rest/v1/${table}`, { query });
  }

  async insertOne(table, body, select = "*") {
    const rows = await this.syncClient.request(`/rest/v1/${table}`, {
      method: "POST",
      query: { select },
      prefer: "return=representation",
      body
    });

    return firstRow(rows);
  }

  async upsertOne(table, body, { onConflict, select = "*" } = {}) {
    const rows = await this.syncClient.request(`/rest/v1/${table}`, {
      method: "POST",
      query: {
        ...(onConflict ? { on_conflict: onConflict } : {}),
        select
      },
      prefer: "resolution=merge-duplicates,return=representation",
      body
    });

    return firstRow(rows);
  }

  async patchOne(table, id, body, select = "*") {
    const rows = await this.syncClient.request(`/rest/v1/${table}`, {
      method: "PATCH",
      query: {
        id: `eq.${id}`,
        select
      },
      prefer: "return=representation",
      body
    });

    return firstRow(rows);
  }

  async patchWhere(table, query, body, select = "*") {
    return this.syncClient.request(`/rest/v1/${table}`, {
      method: "PATCH",
      query: {
        ...query,
        select
      },
      prefer: "return=representation",
      body
    });
  }

  async findLatestPendingConstraintRejectionChat({ bootstrap }) {
    if (!bootstrap?.appUser?.id) {
      return null;
    }

    const rows = await this.findMany("mini_app_analytics_events", {
      app_user_id: `eq.${bootstrap.appUser.id}`,
      event_name: `eq.${CONSTRAINT_REJECTION_CHAT_EVENT}`,
      order: "created_at.desc",
      select: "*",
      limit: 8
    });

    return (rows || []).find((row) => {
      const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
      return metadata.status !== "consumed";
    }) || null;
  }

  buildContextIds(bootstrap) {
    return {
      workspace_id: bootstrap.workspace.id,
      company_id: bootstrap.company.id,
      case_id: bootstrap.activeCase.id
    };
  }

  buildEvalSnapshot({ inputs, constraintHypothesis = null, nextStep = null, triggerEvent = "snapshot" }) {
    const answers = inputs?.answers || [];
    const observations = inputs?.observations || [];
    const maturity = inputs?.maturity || calculateExpressMaturity(answers);
    const confirmedAnswersCount = answers.filter(isOfficialAnswer).length;
    const suggestedAnswersCount = answers.filter((answer) => answer?.status === "suggested").length;
    const confidence = constraintHypothesis?.confidence === undefined || constraintHypothesis?.confidence === null
      ? null
      : Number(constraintHypothesis.confidence);
    const qualityFlags = [];

    if (!observations.length) {
      qualityFlags.push("no_observations");
    }
    if (suggestedAnswersCount > 0) {
      qualityFlags.push("has_unconfirmed_suggestions");
    }
    if (confirmedAnswersCount < 3) {
      qualityFlags.push("low_confirmed_answers");
    }
    if (confidence !== null && confidence < 0.55) {
      qualityFlags.push("low_constraint_confidence");
    }
    if (constraintHypothesis && constraintHypothesis.status !== "confirmed") {
      qualityFlags.push("constraint_needs_confirmation");
    }
    if (!nextStep) {
      qualityFlags.push("next_step_missing");
    }

    const selectedLayerScore = constraintHypothesis?.layerKey
      ? maturity.scores?.find((score) => score.layerKey === constraintHypothesis.layerKey)
      : null;
    const answeredScores = (maturity.scores || []).filter((score) => score.status === "answered");
    const minScore = answeredScores.length ? Math.min(...answeredScores.map((score) => Number(score.score))) : null;
    const selectedIsOnlyLowest = Boolean(
      selectedLayerScore &&
      minScore !== null &&
      Number(selectedLayerScore.score) === minScore &&
      answeredScores.filter((score) => Number(score.score) === minScore).length === 1
    );

    if (selectedIsOnlyLowest && observations.length < 2) {
      qualityFlags.push("possible_lowest_score_bias");
    }

    return {
      problem_context: inputs?.problemContext?.request_text || inputs?.companyProfile?.current_request || "",
      observations_count: observations.length,
      suggested_answers_count: suggestedAnswersCount,
      confirmed_answers_count: confirmedAnswersCount,
      selected_constraint: constraintHypothesis
        ? {
            id: constraintHypothesis.id || "",
            title: constraintHypothesis.title || "",
            layerKey: constraintHypothesis.layerKey || constraintHypothesis.layer || "",
            status: constraintHypothesis.status || "",
            isHypothesis: true
          }
        : null,
      confidence,
      next_step: nextStep
        ? {
            id: nextStep.id || "",
            title: nextStep.title || "",
            status: nextStep.status || ""
          }
        : null,
      quality_flags: qualityFlags,
      trigger_event: triggerEvent,
      payload: {
        maturityProgress: maturity.progressPercent || 0,
        weakLayers: (maturity.weakLayers || []).map((item) => item.layerKey),
        strongLayers: (maturity.strongLayers || []).map((item) => item.layerKey)
      }
    };
  }

  async captureEvalSnapshot({ bootstrap, triggerEvent, inputs = null, constraintHypothesis = null, nextStep = null } = {}) {
    const resolvedInputs = inputs || await this.getConstraintInputs({ bootstrap });
    const snapshot = this.buildEvalSnapshot({
      inputs: resolvedInputs,
      constraintHypothesis,
      nextStep,
      triggerEvent
    });

    return this.analytics.saveEvalSnapshot({ bootstrap, snapshot });
  }

  async getOnboarding({ bootstrap }) {
    await this.logMiniAppEvent({
      bootstrap,
      eventName: "onboarding_started",
      metadata: {
        onboardingStatus: bootstrap.companyProfile?.onboarding_status || "draft"
      }
    });

    const problemContext = await this.findOne("problem_contexts", {
      case_id: `eq.${bootstrap.activeCase.id}`,
      status: "eq.active",
      order: "updated_at.desc",
      select: "*"
    });

    return {
      company: bootstrap.company,
      companyProfile: bootstrap.companyProfile,
      problemContext,
      values: {
        companyName: bootstrap.company?.name || "",
        industry: bootstrap.companyProfile?.industry || "",
        companySize: bootstrap.companyProfile?.company_size || "",
        revenueRange: bootstrap.companyProfile?.revenue_range || "",
        userRole: bootstrap.companyProfile?.user_role || "",
        currentRequest: bootstrap.companyProfile?.current_request || problemContext?.request_text || ""
      }
    };
  }

  async saveOnboarding({ bootstrap, payload }) {
    const contextIds = this.buildContextIds(bootstrap);
    const companyName = trimString(payload.companyName) || bootstrap.company.name || "Компания";
    const currentRequest = trimString(payload.currentRequest);
    const onboardingStatus = isCompletedOnboarding({ ...payload, companyName }) ? "completed" : "draft";

    const company = await this.patchOne("companies", bootstrap.company.id, {
      name: companyName
    });

    const companyProfile = await this.upsertOne(
      "company_profiles",
      {
        workspace_id: contextIds.workspace_id,
        company_id: contextIds.company_id,
        industry: trimString(payload.industry) || null,
        company_size: trimString(payload.companySize) || null,
        revenue_range: trimString(payload.revenueRange) || null,
        user_role: trimString(payload.userRole) || null,
        current_request: currentRequest || null,
        onboarding_status: onboardingStatus,
        version: 1
      },
      {
        onConflict: "company_id"
      }
    );

    let problemContext = await this.findOne("problem_contexts", {
      case_id: `eq.${contextIds.case_id}`,
      status: "eq.active",
      order: "updated_at.desc",
      select: "*"
    });

    if (currentRequest) {
      const body = {
        workspace_id: contextIds.workspace_id,
        company_id: contextIds.company_id,
        case_id: contextIds.case_id,
        request_text: currentRequest,
        request_type: "owner_request",
        status: "active",
        confidence: 1,
        version: 1
      };

      problemContext = problemContext
        ? await this.patchOne("problem_contexts", problemContext.id, body)
        : await this.insertOne("problem_contexts", body);
    }

    await this.logMiniAppEvent({
      bootstrap,
      eventName: onboardingStatus === "completed" ? "onboarding_completed" : "onboarding_started",
      metadata: {
        onboardingStatus,
        hasCurrentRequest: Boolean(currentRequest)
      }
    });

    return {
      company,
      companyProfile,
      problemContext,
      onboardingStatus
    };
  }

  async resolveExpressDiagnosticRun({ bootstrap }) {
    const contextIds = this.buildContextIds(bootstrap);
    const existing = await this.findOne("diagnostic_runs", {
      case_id: `eq.${contextIds.case_id}`,
      level: "eq.express",
      status: "eq.draft",
      order: "updated_at.desc",
      select: "*"
    });

    if (existing) {
      return existing;
    }

    const completed = await this.findOne("diagnostic_runs", {
      case_id: `eq.${contextIds.case_id}`,
      level: "eq.express",
      status: "eq.completed",
      order: "updated_at.desc",
      select: "*"
    });

    if (completed) {
      return completed;
    }

    return this.insertOne("diagnostic_runs", {
      ...contextIds,
      level: "express",
      status: "draft",
      completion_percent: 0,
      version: 1
    });
  }

  async getExpressAnswers(runId) {
    return this.findMany("diagnostic_answers", {
      diagnostic_run_id: `eq.${runId}`,
      level: "eq.express",
      subject_type: "eq.layer",
      order: "updated_at.desc",
      select: "*"
    });
  }

  async saveMaturityScores({ bootstrap, run, maturity }) {
    const contextIds = this.buildContextIds(bootstrap);
    const rows = maturity.scores
      .filter((score) => score.status === "answered")
      .map((score) => ({
        ...contextIds,
        diagnostic_run_id: run.id,
        subject_type: "layer",
        subject_key: score.layerKey,
        score: score.score,
        source_level: "express",
        confidence: score.confidence || 1,
        calculated_from: score.answerId ? [{ diagnostic_answer_id: score.answerId }] : [],
        version: 1
      }));

    if (!rows.length) {
      return [];
    }

    return this.syncClient.request("/rest/v1/maturity_scores", {
      method: "POST",
      query: {
        on_conflict: "diagnostic_run_id,subject_type,subject_key,version",
        select: "*"
      },
      prefer: "resolution=merge-duplicates,return=representation",
      body: rows
    });
  }

  async refreshRunProgress({ bootstrap, run }) {
    const answers = await this.getExpressAnswers(run.id);
    const maturity = calculateExpressMaturity(answers);
    const nextStatus = maturity.progressPercent >= 100 ? "completed" : "draft";
    const updatedRun = await this.patchOne("diagnostic_runs", run.id, {
      completion_percent: maturity.progressPercent,
      status: nextStatus
    });

    await this.saveMaturityScores({ bootstrap, run: updatedRun || run, maturity });
    if (nextStatus === "completed") {
      await this.logMiniAppEvent({
        bootstrap,
        eventName: "diagnostics_completed",
        metadata: {
          level: "express",
          answeredCount: maturity.answeredCount,
          totalCount: maturity.totalCount
        }
      });
    }

    return {
      run: updatedRun || run,
      answers,
      maturity
    };
  }

  buildAnswerMap(answers) {
    return Object.fromEntries(
      (answers || []).filter(isOfficialAnswer).map((answer) => [
        answer.subject_key,
        {
          id: answer.id,
          layerKey: answer.subject_key,
          score: answer.score,
          selectedDescription: answer.selected_description,
          source: answer.source,
          status: answer.status,
          confidence: answer.confidence
        }
      ])
    );
  }

  async getExpressDiagnostics({ bootstrap }) {
    await this.logMiniAppEvent({
      bootstrap,
      eventName: "diagnostics_started",
      metadata: {
        level: "express"
      }
    });

    const run = await this.resolveExpressDiagnosticRun({ bootstrap });
    const answers = await this.getExpressAnswers(run.id);
    const maturity = calculateExpressMaturity(answers);

    return {
      layers: BUSINESS_LAYERS_V1,
      run,
      answers: this.buildAnswerMap(answers),
      maturity,
      progress: {
        answeredCount: maturity.answeredCount,
        totalCount: maturity.totalCount,
        percent: maturity.progressPercent
      }
    };
  }

  async saveExpressAnswer({ bootstrap, payload }) {
    const layer = assertBusinessLayerKey(trimString(payload.layerKey));
    const score = Number(payload.score);

    if (!Number.isInteger(score) || score < 1 || score > 5) {
      throw new Error("Express diagnostic score must be an integer from 1 to 5.");
    }

    const run = await this.resolveExpressDiagnosticRun({ bootstrap });
    const contextIds = this.buildContextIds(bootstrap);
    const selectedDescription = trimString(payload.selectedDescription) || layer.levels[score - 1] || "";

    const answer = await this.upsertOne(
      "diagnostic_answers",
      {
        ...contextIds,
        diagnostic_run_id: run.id,
        level: "express",
        subject_type: "layer",
        subject_key: layer.key,
        score,
        selected_description: selectedDescription,
        source: "user_explicit",
        status: "confirmed",
        confidence: 1,
        evidence_observation_ids: [],
        confirmed_at: new Date().toISOString(),
        version: 1
      },
      {
        onConflict: "diagnostic_run_id,subject_type,subject_key,version"
      }
    );

    const refreshed = await this.refreshRunProgress({ bootstrap, run });

    return {
      answer,
      ...refreshed
    };
  }

  async getCaseObservations({ bootstrap }) {
    return this.findMany("observations", {
      case_id: `eq.${bootstrap.activeCase.id}`,
      status: "eq.active",
      order: "created_at.asc",
      select: "*"
    });
  }

  async getActiveProblemContext({ bootstrap }) {
    return this.findOne("problem_contexts", {
      case_id: `eq.${bootstrap.activeCase.id}`,
      status: "eq.active",
      order: "updated_at.desc",
      select: "*"
    });
  }

  async persistPrefillSuggestions({ bootstrap, run, suggestions }) {
    const contextIds = this.buildContextIds(bootstrap);
    const persisted = [];

    for (const suggestion of suggestions) {
      const answer = await this.upsertOne(
        "diagnostic_answers",
        {
          ...contextIds,
          diagnostic_run_id: run.id,
          level: "express",
          subject_type: "layer",
          subject_key: suggestion.layerKey,
          score: suggestion.score,
          selected_description: suggestion.selectedDescription,
          source: "inferred_from_chat",
          status: "suggested",
          confidence: suggestion.confidence,
          evidence_observation_ids: suggestion.evidenceObservationIds || [],
          version: 1
        },
        {
          onConflict: "diagnostic_run_id,subject_type,subject_key,version"
        }
      );

      persisted.push({
        ...suggestion,
        answerId: answer?.id || "",
        status: answer?.status || "suggested",
        source: answer?.source || "inferred_from_chat"
      });
    }

    return persisted;
  }

  async getDiagnosticPrefill({ bootstrap }) {
    const run = await this.resolveExpressDiagnosticRun({ bootstrap });
    const [observations, existingAnswers, problemContext] = await Promise.all([
      this.getCaseObservations({ bootstrap }),
      this.getExpressAnswers(run.id),
      this.getActiveProblemContext({ bootstrap })
    ]);

    if (!observations.length) {
      return {
        run,
        observations,
        suggestions: [],
        suggestionsByLayer: {}
      };
    }

    const engine = new DiagnosticPrefillEngine();
    const suggestions = engine.generate({
      observations,
      existingAnswers,
      companyProfile: bootstrap.companyProfile,
      problemContext
    });
    const persistedSuggestions = await this.persistPrefillSuggestions({ bootstrap, run, suggestions });

    if (persistedSuggestions.length) {
      await this.logMiniAppEvent({
        bootstrap,
        eventName: "suggestion_shown",
        metadata: {
          count: persistedSuggestions.length,
          layerKeys: persistedSuggestions.map((suggestion) => suggestion.layerKey)
        }
      });
    }

    return {
      run,
      observations,
      suggestions: persistedSuggestions,
      suggestionsByLayer: Object.fromEntries(persistedSuggestions.map((suggestion) => [suggestion.layerKey, suggestion]))
    };
  }

  async applyPrefillAction({ bootstrap, payload }) {
    const action = trimString(payload.action);
    const layer = assertBusinessLayerKey(trimString(payload.layerKey));
    const run = await this.resolveExpressDiagnosticRun({ bootstrap });
    const score = payload.score === undefined || payload.score === null ? null : Number(payload.score);
    const existing = payload.answerId
      ? await this.findOne("diagnostic_answers", {
          id: `eq.${payload.answerId}`,
          diagnostic_run_id: `eq.${run.id}`,
          select: "*"
        })
      : await this.findOne("diagnostic_answers", {
          diagnostic_run_id: `eq.${run.id}`,
          subject_type: "eq.layer",
          subject_key: `eq.${layer.key}`,
          version: "eq.1",
          select: "*"
        });

    if (!existing) {
      throw new Error("Suggested answer was not found.");
    }

    if (action === "reject") {
      const answer = await this.patchOne("diagnostic_answers", existing.id, {
        status: "rejected"
      });
      const refreshed = await this.refreshRunProgress({ bootstrap, run });
      await this.logMiniAppEvent({
        bootstrap,
        eventName: "suggestion_rejected",
        metadata: {
          layerKey: layer.key,
          answerId: answer?.id || existing.id
        }
      });
      return { action, answer, ...refreshed };
    }

    if ((action === "confirm" || action === "correct") && (!Number.isInteger(score) || score < 1 || score > 5)) {
      throw new Error("Confirmed or corrected score must be an integer from 1 to 5.");
    }

    if (action !== "confirm" && action !== "correct") {
      throw new Error(`Unsupported prefill action: ${action}`);
    }

    const answer = await this.patchOne("diagnostic_answers", existing.id, {
      score,
      selected_description: trimString(payload.selectedDescription) || layer.levels[score - 1] || existing.selected_description,
      source: action === "confirm" ? "user_confirmed_inference" : "user_corrected_inference",
      status: action === "confirm" ? "confirmed" : "corrected",
      confidence: 1,
      confirmed_at: new Date().toISOString()
    });
    const refreshed = await this.refreshRunProgress({ bootstrap, run });

    await this.logMiniAppEvent({
      bootstrap,
      eventName: "suggestion_confirmed",
      metadata: {
        action,
        layerKey: layer.key,
        score,
        answerId: answer?.id || existing.id
      }
    });

    return { action, answer, ...refreshed };
  }

  async getConstraintInputs({ bootstrap }) {
    const run = await this.resolveExpressDiagnosticRun({ bootstrap });
    const [answers, observations, problemContext, rejectedHypotheses] = await Promise.all([
      this.getExpressAnswers(run.id),
      this.getCaseObservations({ bootstrap }),
      this.getActiveProblemContext({ bootstrap }),
      this.findMany("constraint_hypotheses", {
        case_id: `eq.${bootstrap.activeCase.id}`,
        status: "eq.rejected",
        order: "updated_at.desc",
        select: "*"
      })
    ]);
    const maturity = calculateExpressMaturity(answers);

    return {
      run,
      answers,
      maturity,
      observations,
      problemContext,
      rejectedHypotheses: rejectedHypotheses || [],
      companyProfile: bootstrap.companyProfile
    };
  }

  decorateConstraintHypothesis(row, reasoningPrimary = null) {
    if (!row) {
      return null;
    }

    const layer = getBusinessLayerByKey(row.layer);

    return {
      ...row,
      layerKey: row.layer,
      layerTitle: layer?.title || row.layer || "Слой бизнеса",
      classKey: row.layer_class || layer?.classKey || "",
      alternatives: row.alternative_hypotheses || [],
      supportingObservations: reasoningPrimary?.supportingObservations || [],
      whatItExplains: reasoningPrimary?.whatItExplains || [],
      missingEvidence: reasoningPrimary?.missingEvidence || [],
      whatToCheckNext: reasoningPrimary?.whatToCheckNext || [],
      rankingReasons: reasoningPrimary?.rankingReasons || [],
      confidenceLabel: reasoningPrimary?.confidenceLabel || (Number(row.confidence) < 0.6 ? "низкая уверенность" : "рабочая уверенность"),
      selectionSource: reasoningPrimary?.selectionSource || "deterministic_shortlist_only",
      llmScope: reasoningPrimary?.llmScope || "explanation_only_after_selection",
      isHypothesis: true
    };
  }

  async findLatestConstraintHypothesis({ bootstrap, statuses = ["confirmed", "suggested"] }) {
    const rows = await this.findMany("constraint_hypotheses", {
      case_id: `eq.${bootstrap.activeCase.id}`,
      order: "updated_at.desc",
      select: "*"
    });

    return (rows || []).find((row) => statuses.includes(row.status)) || null;
  }

  async persistConstraintHypothesis({ bootstrap, reasoning }) {
    if (!reasoning?.primary) {
      throw new Error("ConstraintReasoner did not produce a primary hypothesis.");
    }

    const contextIds = this.buildContextIds(bootstrap);
    const primary = reasoning.primary;
    const layer = assertBusinessLayerKey(primary.layerKey);
    const body = {
      ...contextIds,
      title: primary.title,
      layer: layer.key,
      layer_class: layer.classKey,
      constraint_type: primary.constraintType,
      explanation: primary.explanation,
      supporting_observation_ids: primary.evidenceObservationIds || [],
      alternative_hypotheses: reasoning.alternatives || [],
      confidence: primary.confidence,
      status: "suggested",
      version: 1
    };

    const existing = await this.findLatestConstraintHypothesis({
      bootstrap,
      statuses: ["suggested"]
    });
    const hypothesis = existing
      ? await this.patchOne("constraint_hypotheses", existing.id, body)
      : await this.insertOne("constraint_hypotheses", body);

    return this.decorateConstraintHypothesis(hypothesis, primary);
  }

  async reasonConstraint({ bootstrap }) {
    const inputs = await this.getConstraintInputs({ bootstrap });
    const reasoner = new ConstraintReasoner();
    const reasoning = reasoner.reason(inputs);
    const constraintHypothesis = await this.persistConstraintHypothesis({ bootstrap, reasoning });
    await this.logMiniAppEvent({
      bootstrap,
      eventName: "constraint_viewed",
      metadata: {
        layerKey: constraintHypothesis.layerKey,
        confidence: constraintHypothesis.confidence,
        observationsCount: inputs.observations.length
      }
    });
    await this.captureEvalSnapshot({
      bootstrap,
      triggerEvent: "constraint_viewed",
      inputs,
      constraintHypothesis
    });

    return {
      constraintHypothesis,
      reasoning: {
        alternatives: reasoning.alternatives,
        candidates: reasoning.candidates,
        primary: reasoning.primary,
        shortlist: reasoning.shortlist,
        policy: reasoning.policy
      },
      maturity: inputs.maturity,
      observations: inputs.observations
    };
  }

  async applyConstraintAction({ bootstrap, payload }) {
    const action = trimString(payload.action);
    const id = trimString(payload.id || payload.constraintHypothesisId);

    if (!id) {
      throw new Error("Constraint hypothesis id is required.");
    }

    if (action !== "confirm" && action !== "reject") {
      throw new Error(`Unsupported constraint action: ${action}`);
    }

    const existing = await this.findOne("constraint_hypotheses", {
      id: `eq.${id}`,
      case_id: `eq.${bootstrap.activeCase.id}`,
      select: "*"
    });

    if (!existing) {
      throw new Error("Constraint hypothesis was not found.");
    }

    const updated = await this.patchOne("constraint_hypotheses", existing.id, {
      status: action === "confirm" ? "confirmed" : "rejected"
    });
    const decorated = this.decorateConstraintHypothesis(updated);

    await this.logMiniAppEvent({
      bootstrap,
      eventName: action === "confirm" ? "constraint_confirmed" : "constraint_rejected",
      metadata: {
        constraintHypothesisId: decorated.id,
        layerKey: decorated.layerKey,
        confidence: decorated.confidence
      }
    });
    await this.captureEvalSnapshot({
      bootstrap,
      triggerEvent: action === "confirm" ? "constraint_confirmed" : "constraint_rejected",
      constraintHypothesis: decorated
    });

    return {
      action,
      constraintHypothesis: decorated
    };
  }

  buildConstraintRejectionChatMessage(constraintHypothesis) {
    const title = constraintHypothesis?.layerTitle || constraintHypothesis?.title || "предыдущая версия";

    return [
      `Ок, версию «${title}» не берём как рабочую.`,
      "",
      "Напиши одним сообщением, что в ней не сходится: почему это не похоже на главное ограничение, что выглядит следствием, где данные неточные или какой факт я не учёл.",
      "",
      "Я сохраню это как новый сигнал и пересоберу гипотезу уже с учётом твоего ответа."
    ].join("\n");
  }

  async requestConstraintRejectionChat({ bootstrap, payload }) {
    const id = trimString(payload.id || payload.constraintHypothesisId);

    if (!id) {
      throw new Error("Constraint hypothesis id is required.");
    }

    const existing = await this.findOne("constraint_hypotheses", {
      id: `eq.${id}`,
      case_id: `eq.${bootstrap.activeCase.id}`,
      select: "*"
    });

    if (!existing) {
      throw new Error("Constraint hypothesis was not found.");
    }

    const constraintHypothesis = this.decorateConstraintHypothesis(existing);
    const chatMessage = this.buildConstraintRejectionChatMessage(constraintHypothesis);
    const event = await this.logMiniAppEvent({
      bootstrap,
      eventName: CONSTRAINT_REJECTION_CHAT_EVENT,
      metadata: {
        status: "pending",
        constraintHypothesisId: constraintHypothesis.id,
        title: constraintHypothesis.title,
        layerKey: constraintHypothesis.layerKey,
        layerTitle: constraintHypothesis.layerTitle,
        chatMessage
      }
    });

    return {
      constraintHypothesis,
      chatHandoff: {
        eventId: event?.id || "",
        status: "pending",
        chatMessage,
        title: constraintHypothesis.title,
        layerKey: constraintHypothesis.layerKey,
        layerTitle: constraintHypothesis.layerTitle
      }
    };
  }

  async recordConstraintRejectionChatReply({ bootstrap, payload }) {
    const text = truncateText(payload?.text || payload?.message || "");

    if (!hasUsefulChatFeedback(text)) {
      return null;
    }

    const event = await this.findLatestPendingConstraintRejectionChat({ bootstrap });
    if (!event) {
      return null;
    }

    const metadata = event.metadata && typeof event.metadata === "object" ? event.metadata : {};
    const rejectedLayerKey = metadata.layerKey || "";
    const inferredLayerKey = inferLayerFromRejectionFeedback(text, rejectedLayerKey);
    const layer = getBusinessLayerByKey(inferredLayerKey) || getBusinessLayerByKey(rejectedLayerKey) || getBusinessLayerByKey("data_analytics");
    const contextIds = this.buildContextIds(bootstrap);
    const statement = [
      `Пользователь отклонил гипотезу «${metadata.layerTitle || metadata.title || "предыдущая версия"}».`,
      `Причина: ${text}`
    ].join(" ");
    const observation = await this.upsertOne(
      "observations",
      {
        ...contextIds,
        source_type: "chat",
        source_id: `constraint_rejection_feedback:${event.id}`,
        statement,
        normalized_signal: CONSTRAINT_REJECTION_FEEDBACK_SIGNAL,
        layer: layer.key,
        layer_class: layer.classKey,
        flow_type: "constraint_rejection_feedback",
        confidence: 0.95,
        evidence: [{
          text,
          rejectedLayerKey,
          rejectedConstraintHypothesisId: metadata.constraintHypothesisId || "",
          inferredLayerKey: layer.key
        }],
        status: "active"
      },
      {
        onConflict: "case_id,source_type,source_id,normalized_signal"
      }
    );

    const consumedAt = new Date().toISOString();
    await this.patchOne("mini_app_analytics_events", event.id, {
      metadata: {
        ...metadata,
        status: "consumed",
        consumedAt,
        responseText: text,
        feedbackObservationId: observation?.id || "",
        inferredLayerKey: layer.key
      }
    });
    await this.logMiniAppEvent({
      bootstrap,
      eventName: "constraint_rejection_chat_received",
      metadata: {
        sourceEventId: event.id,
        constraintHypothesisId: metadata.constraintHypothesisId || "",
        rejectedLayerKey,
        inferredLayerKey: layer.key,
        feedbackObservationId: observation?.id || ""
      }
    });

    return {
      type: "constraint_rejection_feedback",
      observation,
      eventId: event.id,
      constraintHypothesisId: metadata.constraintHypothesisId || "",
      constraintTitle: metadata.title || "",
      layerKey: rejectedLayerKey,
      layerTitle: metadata.layerTitle || "",
      inferredLayerKey: layer.key,
      text
    };
  }

  decorateNextStep(row, constraintHypothesis = null) {
    if (!row) {
      return null;
    }

    return {
      ...row,
      constraintHypothesis,
      isLinkedToConstraint: Boolean(row.constraint_hypothesis_id)
    };
  }

  async findLatestNextStep({ bootstrap, constraintHypothesisId }) {
    const rows = await this.findMany("next_steps", {
      case_id: `eq.${bootstrap.activeCase.id}`,
      order: "updated_at.desc",
      select: "*"
    });

    return (rows || []).find((row) =>
      row.constraint_hypothesis_id === constraintHypothesisId &&
      ["suggested", "accepted"].includes(row.status)
    ) || null;
  }

  async persistNextStep({ bootstrap, constraintHypothesis, nextStep }) {
    const existing = await this.findLatestNextStep({
      bootstrap,
      constraintHypothesisId: constraintHypothesis.id
    });

    if (existing) {
      return this.decorateNextStep(existing, constraintHypothesis);
    }

    const contextIds = this.buildContextIds(bootstrap);
    const inserted = await this.insertOne("next_steps", {
      ...contextIds,
      constraint_hypothesis_id: constraintHypothesis.id,
      title: nextStep.title,
      description: nextStep.description,
      why_this_first: nextStep.whyThisFirst,
      action_type: nextStep.actionType,
      target_entity_type: nextStep.targetEntityType,
      target_entity_id: nextStep.targetEntityId,
      confidence: nextStep.confidence,
      status: "suggested",
      version: 1
    });

    return this.decorateNextStep(inserted, constraintHypothesis);
  }

  async getOrCreateNextStep({ bootstrap }) {
    let constraintHypothesis = await this.findLatestConstraintHypothesis({
      bootstrap,
      statuses: ["confirmed", "suggested"]
    });

    if (!constraintHypothesis) {
      const reasoned = await this.reasonConstraint({ bootstrap });
      constraintHypothesis = reasoned.constraintHypothesis;
    } else {
      constraintHypothesis = this.decorateConstraintHypothesis(constraintHypothesis);
    }

    const selector = new NextStepSelector();
    const nextStep = selector.select({ constraintHypothesis });
    const persisted = await this.persistNextStep({ bootstrap, constraintHypothesis, nextStep });
    await this.logMiniAppEvent({
      bootstrap,
      eventName: "next_step_viewed",
      metadata: {
        nextStepId: persisted.id,
        constraintHypothesisId: constraintHypothesis.id,
        actionType: persisted.action_type || persisted.actionType || "",
        confidence: persisted.confidence
      }
    });
    await this.captureEvalSnapshot({
      bootstrap,
      triggerEvent: "next_step_viewed",
      constraintHypothesis,
      nextStep: persisted
    });

    return {
      nextStep: persisted,
      constraintHypothesis
    };
  }

  async findLatestNextStepAny({ bootstrap, statuses = ["accepted", "suggested", "done", "skipped"] } = {}) {
    const rows = await this.findMany("next_steps", {
      case_id: `eq.${bootstrap.activeCase.id}`,
      order: "updated_at.desc",
      select: "*"
    });
    const rank = {
      accepted: 4,
      suggested: 3,
      done: 2,
      skipped: 1
    };

    return (rows || [])
      .filter((row) => statuses.includes(row.status))
      .sort((left, right) => statusRank(right.status, rank) - statusRank(left.status, rank))
      [0] || null;
  }

  buildOwnerDecisionQueue({ bootstrap, maturity, constraintHypothesis, nextStep, toolRecommendations, documents }) {
    const decisions = [];
    const profile = bootstrap.companyProfile || {};
    const companyName = bootstrap.company?.name || "Компания";

    if (!trimString(profile.current_request)) {
      decisions.push({
        id: "current_request",
        title: "Зафиксировать главный запрос",
        reason: "Без запроса AI-BOSS будет видеть симптомы, но не сможет понять, какое ограничение важнее именно сейчас.",
        owner: "Собственник",
        status: "needs_owner"
      });
    }

    if ((maturity?.progressPercent || 0) < 100) {
      decisions.push({
        id: "diagnostic_scope",
        title: "Довести быстрый срез до полной картины",
        reason: `Сейчас оценено ${maturity?.answeredCount || 0}/${maturity?.totalCount || 11} областей. Этого хватает для движения, но не для уверенного управленческого среза.`,
        owner: "AI-BOSS готовит, собственник подтверждает",
        status: "in_progress"
      });
    }

    if (!constraintHypothesis) {
      decisions.push({
        id: "constraint_choice",
        title: "Выбрать рабочую гипотезу ограничения",
        reason: "Пока нет главной версии, сложно понять, какой шаг даст системный эффект, а не просто закроет ближайшую боль.",
        owner: "AI-BOSS предлагает, собственник подтверждает",
        status: "needs_decision"
      });
    } else if (constraintHypothesis.status !== "confirmed") {
      decisions.push({
        id: "constraint_confirmation",
        title: "Подтвердить или отклонить гипотезу ограничения",
        reason: `Сейчас гипотеза: ${constraintHypothesis.title}. Её нужно принять как рабочую версию или заменить, чтобы не вести действия в разные стороны.`,
        owner: "Собственник",
        status: "needs_owner"
      });
    }

    if (!nextStep) {
      decisions.push({
        id: "first_action",
        title: "Выбрать первый проверочный шаг",
        reason: "CEO-контур должен вести не к общему совету, а к ближайшему действию, которое проверяет ограничение.",
        owner: "AI-BOSS предлагает",
        status: "needs_action"
      });
    } else if (nextStep.status === "suggested") {
      decisions.push({
        id: "accept_first_action",
        title: "Взять следующий шаг в работу",
        reason: `Предложен шаг: ${nextStep.title}. Его нужно зафиксировать, чтобы он стал управленческим обязательством, а не рекомендацией в интерфейсе.`,
        owner: "Собственник",
        status: "needs_owner"
      });
    } else if (nextStep.status === "accepted") {
      decisions.push({
        id: "action_result",
        title: "Вернуться с результатом выполненного шага",
        reason: "После выполнения AI-BOSS должен обновить гипотезу и следующий шаг, иначе система не учится на фактах.",
        owner: "Собственник приносит факт, AI-BOSS пересобирает вывод",
        status: "in_progress"
      });
    }

    if (!toolRecommendations?.length && nextStep) {
      decisions.push({
        id: "tool_package",
        title: "Подобрать инструменты под текущий шаг",
        reason: "Инструменты должны появляться после гипотезы и действия, чтобы помогать работе, а не заменять мышление.",
        owner: "AI-BOSS",
        status: "system_action"
      });
    }

    if (!documents?.length) {
      decisions.push({
        id: "evidence_sources",
        title: "Добавить первый факт или документ",
        reason: `${companyName} пока держится в основном на ручном описании. Для управленческого контура нужен хотя бы один источник фактов.`,
        owner: "Собственник / AI-BOSS",
        status: "needs_evidence"
      });
    }

    return decisions.slice(0, 6);
  }

  buildCeoAgenda({ bootstrap, maturity, observations, constraintHypothesis, nextStep, toolRecommendations, documents }) {
    const agenda = [];
    const progressPercent = Number(maturity?.progressPercent || 0);

    if ((bootstrap.companyProfile?.onboarding_status || "draft") !== "completed") {
      agenda.push({
        id: "profile",
        kind: "system_action",
        title: "Собрать входной профиль",
        text: "AI-BOSSу нужен минимальный контекст: компания, роль, масштаб, текущий запрос.",
        route: "/mini-app/onboarding",
        cta: "Открыть профиль"
      });
    }

    if (progressPercent < 100) {
      agenda.push({
        id: "diagnostics",
        kind: "system_action",
        title: "Дозаполнить быстрый срез",
        text: `Оценено ${maturity?.answeredCount || 0}/${maturity?.totalCount || 11} областей. Полный срез помогает не перепутать слабую область с главным ограничением.`,
        route: "/mini-app/diagnostics/express",
        cta: "Пройти диагностику"
      });
    }

    if (!constraintHypothesis || constraintHypothesis.status !== "confirmed") {
      agenda.push({
        id: "constraint",
        kind: "owner_decision",
        title: constraintHypothesis ? "Решить судьбу гипотезы" : "Построить гипотезу ограничения",
        text: constraintHypothesis
          ? "Гипотеза уже есть, но ещё не стала рабочей управленческой версией."
          : "Нужно выбрать область, которая лучше всего объясняет текущий запрос и влияет на остальные изменения.",
        route: "/mini-app/constraint",
        cta: "Открыть гипотезу"
      });
    }

    if (!nextStep || nextStep.status === "suggested") {
      agenda.push({
        id: "next_step",
        kind: "action",
        title: nextStep ? "Зафиксировать первый шаг" : "Выбрать первый шаг",
        text: nextStep
          ? `Предложен шаг: ${nextStep.title}. Его нужно взять в работу или заменить.`
          : "CEO-контур должен завершаться действием, а не только выводом.",
        route: "/mini-app/next-step",
        cta: "Открыть шаг"
      });
    }

    if (nextStep?.status === "accepted") {
      agenda.push({
        id: "control",
        kind: "control",
        title: "Проконтролировать выполнение",
        text: "Следующий шаг взят в работу. После факта выполнения нужно обновить кейс и проверить, изменилась ли гипотеза.",
        route: "/mini-app/next-step",
        cta: "Отметить результат"
      });
    }

    if (nextStep && toolRecommendations.length < 1) {
      agenda.push({
        id: "tools",
        kind: "system_action",
        title: "Подобрать инструменты под действие",
        text: "Инструменты нужны как опора для текущего шага, а не как отдельный каталог ради каталога.",
        route: "/mini-app/tools",
        cta: "Открыть инструменты"
      });
    }

    if (!documents.length && observations.length < 2) {
      agenda.push({
        id: "facts",
        kind: "evidence",
        title: "Добавить факты",
        text: "Пока мало внешних подтверждений. Документ, таблица или короткий срез цифр сделают решения точнее.",
        route: "/mini-app/documents",
        cta: "Добавить документ"
      });
    }

    agenda.push({
      id: "brief",
      kind: "artifact",
      title: "Собрать управленческое резюме",
      text: "Когда профиль, срез, гипотеза и шаг собраны, AI-BOSS должен упаковать кейс для разбора и дальнейших решений.",
      route: "/mini-app/consultation",
      cta: "Собрать резюме"
    });

    return agenda.slice(0, 6);
  }

  buildCeoControlLoop({ maturity, constraintHypothesis, nextStep, toolRecommendations, documents }) {
    const openLoops = [];

    if ((maturity?.progressPercent || 0) < 100) {
      openLoops.push("не завершён быстрый срез");
    }
    if (!constraintHypothesis || constraintHypothesis.status !== "confirmed") {
      openLoops.push("гипотеза ограничения ещё не подтверждена");
    }
    if (!nextStep || nextStep.status === "suggested") {
      openLoops.push("следующий шаг ещё не взят в работу");
    }
    if (nextStep?.status === "accepted") {
      openLoops.push("нужен факт выполнения следующего шага");
    }
    if (!toolRecommendations?.length) {
      openLoops.push("нет привязанных инструментов под текущую ситуацию");
    }
    if (!documents?.length) {
      openLoops.push("нет сохранённых документов или источников фактов");
    }

    const nextReview = nextStep?.status === "accepted"
      ? "После выполнения шага: принести факт, обновить гипотезу и выбрать следующий шаг."
      : "Сначала довести контур до управляемого состояния: профиль, срез, гипотеза, первый шаг.";

    return {
      cadence: "еженедельный управленческий цикл",
      nextReview,
      openLoops,
      rule: "AI-BOSS сам готовит повестку и варианты решений, но стратегические развилки остаются за собственником."
    };
  }

  async getCeoOperatingBrief({ bootstrap }) {
    const inputs = await this.getConstraintInputs({ bootstrap });
    const [constraintRow, nextStepRow, toolRecommendations, documents] = await Promise.all([
      this.findLatestConstraintHypothesis({ bootstrap, statuses: ["confirmed", "suggested"] }),
      this.findLatestNextStepAny({ bootstrap }),
      this.findMany("tool_recommendations", {
        case_id: `eq.${bootstrap.activeCase.id}`,
        order: "priority.asc",
        select: "*"
      }),
      this.findMany("document_sources", {
        case_id: `eq.${bootstrap.activeCase.id}`,
        order: "updated_at.desc",
        select: "*"
      })
    ]);
    const constraintHypothesis = constraintRow ? this.decorateConstraintHypothesis(constraintRow) : null;
    const nextStep = nextStepRow ? this.decorateNextStep(nextStepRow, constraintHypothesis) : null;
    const maturity = inputs.maturity || calculateExpressMaturity(inputs.answers || []);
    const profileReady = (bootstrap.companyProfile?.onboarding_status || "draft") === "completed";
    const diagnosticReady = Number(maturity.progressPercent || 0) >= 100;
    const constraintReady = constraintHypothesis?.status === "confirmed";
    const actionReady = nextStep?.status === "accepted" || nextStep?.status === "done";
    const operatingScore = [profileReady, diagnosticReady, constraintReady, actionReady]
      .filter(Boolean).length;
    const mode = operatingScore >= 4
      ? "active_ceo_loop"
      : operatingScore >= 2
        ? "building_ceo_loop"
        : "setup_needed";
    const summaryByMode = {
      active_ceo_loop: "CEO-контур уже ведёт кейс: есть контекст, срез, рабочая гипотеза и действие в работе.",
      building_ceo_loop: "CEO-контур частично собран: AI-BOSS уже может вести повестку, но есть незакрытые управленческие петли.",
      setup_needed: "Пока это больше рабочее пространство, чем CEO-контур: нужно собрать контекст, срез и первый управленческий шаг."
    };
    const agenda = this.buildCeoAgenda({
      bootstrap,
      maturity,
      observations: inputs.observations || [],
      constraintHypothesis,
      nextStep,
      toolRecommendations: toolRecommendations || [],
      documents: documents || []
    });
    const ownerDecisions = this.buildOwnerDecisionQueue({
      bootstrap,
      maturity,
      constraintHypothesis,
      nextStep,
      toolRecommendations: toolRecommendations || [],
      documents: documents || []
    });
    const controlLoop = this.buildCeoControlLoop({
      maturity,
      constraintHypothesis,
      nextStep,
      toolRecommendations: toolRecommendations || [],
      documents: documents || []
    });

    await this.logMiniAppEvent({
      bootstrap,
      eventName: "ceo_brief_viewed",
      metadata: {
        mode,
        operatingScore,
        agendaCount: agenda.length,
        ownerDecisionCount: ownerDecisions.length
      }
    });

    return {
      ceoBrief: {
        mode,
        title: "CEO-контур AI-BOSS",
        summary: summaryByMode[mode],
        operatingScore,
        operatingScoreMax: 4,
        posture: "AI-BOSS действует как управляющий контур: сам держит повестку, предлагает следующий ход и выносит собственнику только ключевые решения.",
        metrics: {
          profileReady,
          diagnosticReady,
          diagnosticCoverage: {
            answeredCount: maturity.answeredCount || 0,
            totalCount: maturity.totalCount || 11,
            percent: maturity.progressPercent || 0
          },
          constraintStatus: constraintHypothesis?.status || "missing",
          nextStepStatus: nextStep?.status || "missing",
          toolRecommendationsCount: toolRecommendations?.length || 0,
          documentsCount: documents?.length || 0,
          observationsCount: inputs.observations?.length || 0
        },
        agenda,
        ownerDecisions,
        systemActions: agenda.filter((item) => item.kind === "system_action" || item.kind === "action"),
        controlLoop
      },
      constraintHypothesis,
      nextStep
    };
  }

  findAssemblyArtifactMatch({ definition, layer, artifacts = [], documents = [], caseId }) {
    const externalId = assemblyArtifactExternalId(caseId, definition.id);
    const generatedArtifact = (artifacts || []).find((artifact) => artifact.external_id === externalId);

    if (generatedArtifact) {
      return {
        status: "ready",
        source: "artifact",
        id: generatedArtifact.id,
        title: generatedArtifact.title,
        updatedAt: generatedArtifact.updated_at || generatedArtifact.created_at || ""
      };
    }

    const definitionTitle = normalizeLookupText(definition.title);
    const layerTitle = normalizeLookupText(layer.title);
    const matchedDocument = (documents || []).find((document) => {
      const title = normalizeLookupText(document.title || document.url);
      if (!title) {
        return false;
      }
      return title.includes(definitionTitle) ||
        definitionTitle.includes(title) ||
        (layerTitle && title.includes(layerTitle));
    });

    if (matchedDocument) {
      return {
        status: ["analyzed", "link_added"].includes(matchedDocument.status) ? "ready" : "in_progress",
        source: "document",
        id: matchedDocument.id,
        title: matchedDocument.title || matchedDocument.url,
        updatedAt: matchedDocument.updated_at || matchedDocument.created_at || ""
      };
    }

    return {
      status: "missing",
      source: "",
      id: "",
      title: "",
      updatedAt: ""
    };
  }

  buildAssemblyLayer({ layer, index, artifacts, documents, observations, answers, catalogTools, caseId }) {
    const definitions = getAssemblyArtifactDefinitions(layer.key);
    const answer = (answers || []).find((item) => item.subject_key === layer.key && isOfficialAnswer(item));
    const layerObservations = (observations || []).filter((item) => item.layer === layer.key);
    const layerTools = (catalogTools || [])
      .filter((tool) => (tool.layer_keys || tool.layerKeys || []).includes(layer.key));
    const recommendedTools = layerTools
      .slice(0, 3)
      .map((tool) => this.decorateTool(tool));
    const requiredArtifacts = definitions.map((definition) => ({
      ...definition,
      match: this.findAssemblyArtifactMatch({
        definition,
        layer,
        artifacts,
        documents,
        caseId
      })
    }));
    const readyArtifactsCount = requiredArtifacts.filter((artifact) => artifact.match.status === "ready").length;
    const status = requiredArtifacts.length > 0 && readyArtifactsCount >= requiredArtifacts.length
      ? "ready"
      : readyArtifactsCount > 0 || layerObservations.length > 0 || Number.isFinite(Number(answer?.score))
        ? "in_progress"
        : "missing";

    return {
      order: index + 1,
      layerKey: layer.key,
      classKey: layer.classKey,
      title: layer.title,
      shortDescription: layer.shortDescription,
      role: layer.role,
      priorityReason: layer.priorityWhen,
      maturityScore: Number.isFinite(Number(answer?.score)) ? Number(answer.score) : null,
      observationCount: layerObservations.length,
      status,
      requiredArtifacts,
      toolCount: layerTools.length,
      recommendedTools,
      toolGap: recommendedTools.length
        ? null
        : "В каталоге пока нет привязанного инструмента для этого слоя. Нужно добавить инструмент или создать рабочий документ вручную."
    };
  }

  buildAssemblySummary(layers) {
    const totalLayers = layers.length;
    const completedLayers = layers.filter((layer) => layer.status === "ready").length;
    const totalArtifacts = layers.reduce((sum, layer) => sum + layer.requiredArtifacts.length, 0);
    const readyArtifacts = layers.reduce(
      (sum, layer) => sum + layer.requiredArtifacts.filter((artifact) => artifact.match.status === "ready").length,
      0
    );
    const percent = totalArtifacts > 0 ? Math.round((readyArtifacts / totalArtifacts) * 100) : 0;

    return {
      totalLayers,
      completedLayers,
      artifactProgress: {
        ready: readyArtifacts,
        total: totalArtifacts,
        percent
      }
    };
  }

  buildAssemblyNextRequest(layers) {
    const nextLayer = layers.find((layer) => layer.status !== "ready") || null;

    if (!nextLayer) {
      return {
        status: "complete",
        title: "Бизнес собран по текущей карте",
        text: "Все базовые артефакты созданы или добавлены. Дальше можно переходить к регулярному CEO-циклу: факты, решения, действия, контроль.",
        layer: null,
        artifact: null,
        route: "/mini-app/ceo"
      };
    }

    const nextArtifact = nextLayer.requiredArtifacts.find((artifact) => artifact.match.status !== "ready") ||
      nextLayer.requiredArtifacts[0] ||
      null;

    return {
      status: "needs_artifact",
      title: nextArtifact
        ? `Нужен документ: ${nextArtifact.title}`
        : `Нужен рабочий материал по слою: ${nextLayer.title}`,
      text: nextArtifact
        ? nextArtifact.fillPrompt
        : "Нужно создать или прислать документ, который позволит собрать этот слой не по словам, а по фактам.",
      layer: {
        layerKey: nextLayer.layerKey,
        title: nextLayer.title,
        order: nextLayer.order
      },
      artifact: nextArtifact
        ? {
            id: nextArtifact.id,
            title: nextArtifact.title,
            why: nextArtifact.why,
            fillPrompt: nextArtifact.fillPrompt
          }
        : null,
      route: "/mini-app/documents"
    };
  }

  async getBusinessAssemblyPlan({ bootstrap }) {
    const run = await this.resolveExpressDiagnosticRun({ bootstrap });
    const [answers, observations, documents, artifacts] = await Promise.all([
      this.getExpressAnswers(run.id),
      this.getCaseObservations({ bootstrap }),
      this.findMany("document_sources", {
        case_id: `eq.${bootstrap.activeCase.id}`,
        order: "updated_at.desc",
        select: "*"
      }),
      this.findMany("artifacts", {
        case_id: `eq.${bootstrap.activeCase.id}`,
        order: "created_at.desc",
        select: "*"
      })
    ]);
    const catalogTools = await this.getRuntimeCatalogTools();
    const layers = [...BUSINESS_LAYERS_V1]
      .sort((left, right) => getBusinessAssemblyOrderIndex(left.key) - getBusinessAssemblyOrderIndex(right.key))
      .map((layer, index) => this.buildAssemblyLayer({
        layer,
        index,
        artifacts,
        documents,
        observations,
        answers,
        catalogTools,
        caseId: bootstrap.activeCase.id
      }));
    const summary = this.buildAssemblySummary(layers);
    const nextRequest = this.buildAssemblyNextRequest(layers);

    await this.logMiniAppEvent({
      bootstrap,
      eventName: "business_assembly_viewed",
      metadata: {
        completedLayers: summary.completedLayers,
        totalLayers: summary.totalLayers,
        readyArtifacts: summary.artifactProgress.ready,
        totalArtifacts: summary.artifactProgress.total,
        nextLayerKey: nextRequest.layer?.layerKey || ""
      }
    });

    return {
      assembly: {
        mode: "evidence_first_business_build",
        title: "Архитектура бизнеса",
        summary: "Это путь для последовательной сборки бизнеса: собрать факты, документы и решения по 11 слоям, а не опираться только на ощущения.",
        storage: {
          title: "Документы и артефакты кейса",
          route: "/mini-app/documents"
        },
        ...summary,
        nextRequest,
        layers
      }
    };
  }

  buildAssemblyDraftContent({ bootstrap, layer, definition }) {
    const companyName = bootstrap.company?.name || "Компания";
    const currentRequest = bootstrap.companyProfile?.current_request || "";

    return [
      `# ${definition.title}`,
      "",
      `Компания: ${companyName}`,
      `Слой: ${layer.title}`,
      "",
      "## Зачем нужен документ",
      definition.why,
      "",
      "## Что нужно заполнить",
      definition.fillPrompt,
      "",
      "## Текущий запрос",
      currentRequest || "Пока не указан. Добавьте текущий управленческий запрос, чтобы документ был связан с реальной задачей.",
      "",
      "## Факты",
      "- Что уже известно:",
      "- Какие данные или документы подтверждают это:",
      "- Что пока держится только на ощущениях:",
      "",
      "## Решения",
      "- Что AI-BOSS может подготовить сам:",
      "- Что нужно согласовать с Александром:",
      "- Какой следующий проверочный шаг:"
    ].join("\n");
  }

  async createBusinessAssemblyDraft({ bootstrap, payload = {} }) {
    const artifactId = trimString(payload.artifactId);
    const layerKey = trimString(payload.layerKey);
    const layer = getBusinessLayerByKey(layerKey);

    if (!layer || !artifactId) {
      throw new Error("Нужно передать слой и документ, который нужно создать.");
    }

    const definition = getAssemblyArtifactDefinitions(layer.key).find((item) => item.id === artifactId);
    if (!definition) {
      throw new Error("Такой документ не найден в карте сборки бизнеса.");
    }

    const externalId = assemblyArtifactExternalId(bootstrap.activeCase.id, definition.id);
    const content = this.buildAssemblyDraftContent({ bootstrap, layer, definition });
    const artifact = await this.upsertOne(
      "artifacts",
      {
        external_id: externalId,
        workspace_id: bootstrap.workspace.id,
        case_id: bootstrap.activeCase.id,
        kind: "snapshot",
        title: definition.title,
        summary: `${layer.title}: ${definition.why}`,
        path: `miniapp://assembly/${definition.id}`,
        content
      },
      {
        onConflict: "external_id"
      }
    );

    await this.logMiniAppEvent({
      bootstrap,
      eventName: "business_assembly_draft_created",
      metadata: {
        artifactId: artifact.id,
        assemblyArtifactId: definition.id,
        layerKey: layer.key
      }
    });

    return {
      artifact,
      ...(await this.getBusinessAssemblyPlan({ bootstrap }))
    };
  }

  async updateNextStepStatus({ bootstrap, payload }) {
    const action = trimString(payload.action);
    const id = trimString(payload.id || payload.nextStepId);
    const statusByAction = {
      accept: "accepted",
      done: "done",
      skip: "skipped"
    };

    if (!id || !statusByAction[action]) {
      throw new Error(`Unsupported next step action: ${action || "empty"}`);
    }

    const existing = await this.findOne("next_steps", {
      id: `eq.${id}`,
      case_id: `eq.${bootstrap.activeCase.id}`,
      select: "*"
    });

    if (!existing) {
      throw new Error("Next step was not found.");
    }

    const updated = await this.patchOne("next_steps", existing.id, {
      status: statusByAction[action]
    });
    const decorated = this.decorateNextStep(updated);

    if (action === "accept" || action === "done") {
      await this.logMiniAppEvent({
        bootstrap,
        eventName: action === "accept" ? "next_step_accepted" : "next_step_done",
        metadata: {
          nextStepId: decorated.id,
          status: decorated.status
        }
      });
    }
    await this.captureEvalSnapshot({
      bootstrap,
      triggerEvent: action === "accept" ? "next_step_accepted" : action === "done" ? "next_step_done" : "next_step_skipped",
      nextStep: decorated
    });

    return {
      action,
      nextStep: decorated
    };
  }

  getCatalogTools() {
    return MINI_APP_TOOL_CATALOG;
  }

  normalizeStoredTool(row) {
    if (!row?.id || !row?.slug || !row?.title) {
      return null;
    }

    return {
      ...row,
      short_description: row.short_description || row.description || row.title,
      when_to_use: row.when_to_use || row.whenToUse || "Использовать, когда нужно структурировать этот участок бизнеса.",
      template_url: row.template_url || row.templateUrl || null,
      layer_keys: Array.isArray(row.layer_keys) ? row.layer_keys : Array.isArray(row.layerKeys) ? row.layerKeys : [],
      problem_types: Array.isArray(row.problem_types) ? row.problem_types : Array.isArray(row.problemTypes) ? row.problemTypes : [],
      is_active: row.is_active !== false,
      source: row.source || "supabase_tools"
    };
  }

  async loadStoredTools() {
    if (!this.syncClient?.enabled) {
      return [];
    }

    try {
      const rows = await this.findMany("tools", {
        is_active: "eq.true",
        order: "slug.asc",
        select: "*"
      });

      return (rows || []).map((row) => this.normalizeStoredTool(row)).filter(Boolean);
    } catch {
      return [];
    }
  }

  async getRuntimeCatalogTools() {
    const storedTools = await this.loadStoredTools();
    return storedTools.length ? storedTools : this.getCatalogTools();
  }

  decorateTool(row, recommendation = null) {
    if (!row) {
      return null;
    }
    const templateUrl = row.template_url || row.templateUrl || "";

    return {
      ...row,
      layerKeys: row.layer_keys || row.layerKeys || [],
      problemTypes: row.problem_types || row.problemTypes || [],
      templateUrl,
      hasTemplate: Boolean(templateUrl),
      recommendation
    };
  }

  async getTools({ bootstrap }) {
    const tools = await this.getRuntimeCatalogTools();
    const recommendations = await this.findMany("tool_recommendations", {
      case_id: `eq.${bootstrap.activeCase.id}`,
      order: "priority.asc",
      select: "*"
    });
    const recommendationByToolId = new Map((recommendations || []).filter((item) => item.tool_id).map((item) => [item.tool_id, item]));

    return {
      totalCount: tools.length,
      tools: tools.map((tool) => this.decorateTool(tool, recommendationByToolId.get(tool.id) || null))
    };
  }

  async getToolBySlug({ bootstrap, slug }) {
    const tools = await this.getRuntimeCatalogTools();
    const tool = tools.find((item) => item.slug === trimString(slug));

    if (!tool) {
      throw new Error("Tool was not found.");
    }

    const recommendation = await this.findOne("tool_recommendations", {
      case_id: `eq.${bootstrap.activeCase.id}`,
      tool_id: `eq.${tool.id}`,
      select: "*"
    });

    return {
      tool: this.decorateTool(tool, recommendation)
    };
  }

  async getRecommendationContext({ bootstrap }) {
    const run = await this.resolveExpressDiagnosticRun({ bootstrap });
    const [answers, problemContext, constraintHypothesis, nextStep] = await Promise.all([
      this.getExpressAnswers(run.id),
      this.getActiveProblemContext({ bootstrap }),
      this.findLatestConstraintHypothesis({ bootstrap, statuses: ["confirmed", "suggested"] }),
      this.findOne("next_steps", {
        case_id: `eq.${bootstrap.activeCase.id}`,
        order: "updated_at.desc",
        select: "*"
      })
    ]);

    return {
      maturity: calculateExpressMaturity(answers),
      problemContext,
      companyProfile: bootstrap.companyProfile,
      constraintHypothesis: constraintHypothesis ? this.decorateConstraintHypothesis(constraintHypothesis) : null,
      nextStep
    };
  }

  async persistToolRecommendations({ bootstrap, recommendations }) {
    const contextIds = this.buildContextIds(bootstrap);
    const persisted = [];

    for (const item of recommendations) {
      const tool = item.tool;
      const row = await this.upsertOne(
        "tool_recommendations",
        {
          external_id: `miniapp_${contextIds.case_id}_${tool.id}`,
          case_id: contextIds.case_id,
          workspace_id: contextIds.workspace_id,
          company_id: contextIds.company_id,
          tool_id: tool.id,
          name: tool.title,
          reason: item.reason,
          usage_moment: item.usageMoment,
          priority: item.priority,
          status: "recommended",
          source: "mini_app_recommender"
        },
        {
          onConflict: "external_id"
        }
      );

      persisted.push({
        ...row,
        tool: this.decorateTool(tool),
        score: item.score,
        scoreParts: item.scoreParts
      });
    }

    return persisted;
  }

  async getRecommendedTools({ bootstrap, recalculate = false } = {}) {
    const tools = await this.getRuntimeCatalogTools();
    const existing = recalculate
      ? []
      : await this.findMany("tool_recommendations", {
          case_id: `eq.${bootstrap.activeCase.id}`,
          order: "priority.asc",
          select: "*"
        });
    const toolById = new Map(tools.map((tool) => [tool.id, tool]));
    const existingCatalogRecommendations = (existing || []).filter((row) => row.tool_id && toolById.has(row.tool_id));

    if (existingCatalogRecommendations.length >= 3) {
      return {
        recommendations: existingCatalogRecommendations.slice(0, 3).map((row) => ({
          ...row,
          tool: this.decorateTool(toolById.get(row.tool_id) || null)
        }))
      };
    }

    const context = await this.getRecommendationContext({ bootstrap });
    const recommender = new ToolRecommender();
    const recommendations = recommender.recommend({
      tools,
      ...context
    });
    const persisted = await this.persistToolRecommendations({ bootstrap, recommendations });

    return {
      recommendations: persisted
    };
  }

  async markToolOpened({ bootstrap, toolId }) {
    const tools = await this.getRuntimeCatalogTools();
    const normalizedToolId = trimString(toolId);
    const tool = tools.find((item) => item.id === normalizedToolId || item.slug === normalizedToolId);

    if (!tool) {
      throw new Error("Tool was not found.");
    }

    let recommendation = await this.findOne("tool_recommendations", {
      case_id: `eq.${bootstrap.activeCase.id}`,
      tool_id: `eq.${tool.id}`,
      select: "*"
    });

    if (!recommendation) {
      const contextIds = this.buildContextIds(bootstrap);
      recommendation = await this.insertOne("tool_recommendations", {
        external_id: `miniapp_${contextIds.case_id}_${tool.id}`,
        case_id: contextIds.case_id,
        workspace_id: contextIds.workspace_id,
        company_id: contextIds.company_id,
        tool_id: tool.id,
        name: tool.title,
        reason: "Пользователь открыл инструмент из каталога.",
        usage_moment: tool.when_to_use,
        priority: 99,
        status: "opened",
        source: "user_opened"
      });
    } else {
      recommendation = await this.patchOne("tool_recommendations", recommendation.id, {
        status: "opened"
      });
    }

    await this.logMiniAppEvent({
      bootstrap,
      eventName: "tool_opened",
      metadata: {
        toolId: tool.id,
        slug: tool.slug,
        title: tool.title
      }
    });

    return {
      tool: this.decorateTool(tool, recommendation),
      recommendation
    };
  }

  async getDocuments({ bootstrap }) {
    const [sources, snapshots, artifacts] = await Promise.all([
      this.findMany("document_sources", {
        case_id: `eq.${bootstrap.activeCase.id}`,
        order: "updated_at.desc",
        select: "*"
      }),
      this.findMany("document_snapshots", {
        case_id: `eq.${bootstrap.activeCase.id}`,
        order: "created_at.desc",
        select: "*"
      }),
      this.findMany("artifacts", {
        case_id: `eq.${bootstrap.activeCase.id}`,
        order: "created_at.desc",
        select: "*"
      })
    ]);
    const latestSnapshotBySource = new Map();

    for (const snapshot of snapshots || []) {
      if (!latestSnapshotBySource.has(snapshot.document_source_id)) {
        latestSnapshotBySource.set(snapshot.document_source_id, snapshot);
      }
    }

    return {
      documents: (sources || []).map((source) => ({
        ...source,
        latestSnapshot: latestSnapshotBySource.get(source.id) || null
      })),
      artifacts: artifacts || []
    };
  }

  async saveDocumentLink({ bootstrap, payload }) {
    const url = normalizeUrl(payload.url);
    if (!url) {
      throw new Error("Добавьте корректную http/https ссылку на документ.");
    }

    const contextIds = this.buildContextIds(bootstrap);
    const existing = await this.findOne("document_sources", {
      case_id: `eq.${contextIds.case_id}`,
      url: `eq.${url}`,
      select: "*"
    });
    const body = {
      ...contextIds,
      tool_id: trimString(payload.toolId) || null,
      url,
      title: trimString(payload.title) || null,
      source_kind: normalizeSourceKind(payload.sourceKind, url),
      status: "link_added",
      version: 1
    };

    const document = existing
      ? await this.patchOne("document_sources", existing.id, body)
      : await this.insertOne("document_sources", body);

    await this.logMiniAppEvent({
      bootstrap,
      eventName: "document_added",
      metadata: {
        documentId: document.id,
        sourceKind: document.source_kind,
        hasTool: Boolean(document.tool_id)
      }
    });

    return {
      document
    };
  }

  async createObservationsFromSnapshot({ bootstrap, source, snapshot, extractedObservations }) {
    const contextIds = this.buildContextIds(bootstrap);
    const created = [];

    for (const item of extractedObservations || []) {
      if (!getBusinessLayerByKey(item.layer)) {
        continue;
      }

      const row = await this.upsertOne(
        "observations",
        {
          ...contextIds,
          source_type: "document",
          source_id: source.id,
          statement: item.statement,
          normalized_signal: item.normalized_signal,
          layer: item.layer,
          confidence: 0.72,
          evidence: [{ document_snapshot_id: snapshot.id }],
          status: "active"
        },
        {
          onConflict: "case_id,source_type,source_id,normalized_signal"
        }
      );
      created.push(row);
    }

    return created;
  }

  async analyzeDocument({ bootstrap, documentId, payload = {} }) {
    const source = await this.findOne("document_sources", {
      id: `eq.${trimString(documentId)}`,
      case_id: `eq.${bootstrap.activeCase.id}`,
      select: "*"
    });

    if (!source) {
      throw new Error("Document source was not found.");
    }

    const text = trimString(payload.text || payload.documentText || payload.content);
    if (!text) {
      const updated = await this.patchOne("document_sources", source.id, {
        status: "access_lost"
      });
      await this.logMiniAppEvent({
        bootstrap,
        eventName: "document_access_failed",
        metadata: {
          documentId: updated.id,
          sourceKind: updated.source_kind
        }
      });

      return {
        document: updated,
        snapshot: null,
        observations: [],
        userMessage: "Я сохранил ссылку, но не могу прочитать закрытый документ без доступа или вставленного текста. Сейчас автоматического доступа к Google-документам ещё нет: вставь ключевые выводы документа и запусти анализ ещё раз."
      };
    }

    const insights = createDocumentInsights(text);
    const contextIds = this.buildContextIds(bootstrap);
    const snapshot = await this.insertOne("document_snapshots", {
      ...contextIds,
      document_source_id: source.id,
      summary: insights.summary,
      extracted_observations: insights.extractedObservations,
      risks: insights.risks,
      open_questions: insights.openQuestions,
      status: "active",
      version: 1
    });
    const updatedSource = await this.patchOne("document_sources", source.id, {
      status: "analyzed",
      last_analyzed_at: new Date().toISOString()
    });
    const observations = await this.createObservationsFromSnapshot({
      bootstrap,
      source,
      snapshot,
      extractedObservations: insights.extractedObservations
    });
    await this.logMiniAppEvent({
      bootstrap,
      eventName: "document_analyzed",
      metadata: {
        documentId: updatedSource.id,
        snapshotId: snapshot.id,
        observationsCount: observations.length
      }
    });

    return {
      document: updatedSource,
      snapshot,
      observations,
      userMessage: observations.length
        ? "Документ проанализирован: короткий снимок сохранён, полезные выводы добавлены как наблюдения по кейсу."
        : "Документ проанализирован: короткий снимок сохранён, но сильных наблюдений для диагностики пока не выделено."
    };
  }

  async getConsultationInputs({ bootstrap }) {
    const run = await this.resolveExpressDiagnosticRun({ bootstrap });
    const [answers, problemContext, observations, constraintHypothesis, nextStep, documentSnapshots, artifacts] = await Promise.all([
      this.getExpressAnswers(run.id),
      this.getActiveProblemContext({ bootstrap }),
      this.getCaseObservations({ bootstrap }),
      this.findLatestConstraintHypothesis({ bootstrap, statuses: ["confirmed", "suggested"] }),
      this.findOne("next_steps", {
        case_id: `eq.${bootstrap.activeCase.id}`,
        order: "updated_at.desc",
        select: "*"
      }),
      this.findMany("document_snapshots", {
        case_id: `eq.${bootstrap.activeCase.id}`,
        status: "eq.active",
        order: "created_at.desc",
        select: "*"
      }),
      this.findMany("artifacts", {
        case_id: `eq.${bootstrap.activeCase.id}`,
        order: "created_at.desc",
        limit: 5,
        select: "*"
      })
    ]);

    return {
      company: bootstrap.company,
      companyProfile: bootstrap.companyProfile,
      problemContext,
      maturity: calculateExpressMaturity(answers),
      constraintHypothesis: constraintHypothesis ? this.decorateConstraintHypothesis(constraintHypothesis) : null,
      nextStep,
      observations,
      documentSnapshots,
      artifacts
    };
  }

  async findLatestConsultationBrief({ bootstrap, statuses = ["draft"] } = {}) {
    const rows = await this.findMany("consultation_briefs", {
      case_id: `eq.${bootstrap.activeCase.id}`,
      order: "updated_at.desc",
      select: "*"
    });

    return (rows || []).find((row) => statuses.includes(row.status)) || null;
  }

  decorateConsultationBrief(row) {
    if (!row) {
      return null;
    }

    return {
      ...row,
      currentRequest: row.current_request || row.currentRequest || "",
      maturitySummary: row.maturity_summary || row.maturitySummary || {},
      constraintSummary: row.constraint_summary || row.constraintSummary || "",
      nextStepSummary: row.next_step_summary || row.nextStepSummary || "",
      evidence: row.evidence || [],
      openQuestions: row.open_questions || row.openQuestions || []
    };
  }

  async persistConsultationBrief({ bootstrap, brief, status = "draft" }) {
    const contextIds = this.buildContextIds(bootstrap);
    const body = {
      ...contextIds,
      title: brief.title,
      summary: brief.summary,
      current_request: brief.current_request,
      maturity_summary: brief.maturity_summary,
      constraint_summary: brief.constraint_summary,
      next_step_summary: brief.next_step_summary,
      evidence: brief.evidence || [],
      open_questions: brief.open_questions || [],
      status,
      version: 1
    };
    const existing = await this.findLatestConsultationBrief({
      bootstrap,
      statuses: ["draft", "ready"]
    });
    const row = existing
      ? await this.patchOne("consultation_briefs", existing.id, body)
      : await this.insertOne("consultation_briefs", body);

    return this.decorateConsultationBrief(row);
  }

  async buildConsultationBrief({ bootstrap, persist = true } = {}) {
    const inputs = await this.getConsultationInputs({ bootstrap });
    const builder = new ConsultationBriefBuilder();
    const brief = builder.build(inputs);
    const persistedBrief = persist
      ? await this.persistConsultationBrief({ bootstrap, brief, status: "draft" })
      : this.decorateConsultationBrief(brief);
    await this.logMiniAppEvent({
      bootstrap,
      eventName: "consultation_brief_generated",
      metadata: {
        briefId: persistedBrief?.id || "",
        source: "generated_from_case_state",
        hasConstraint: Boolean(inputs.constraintHypothesis),
        hasNextStep: Boolean(inputs.nextStep)
      }
    });
    await this.captureEvalSnapshot({
      bootstrap,
      triggerEvent: "consultation_brief_generated",
      inputs,
      constraintHypothesis: inputs.constraintHypothesis,
      nextStep: inputs.nextStep
    });

    return {
      brief: persistedBrief,
      statusNote: builder.buildStatusNote(inputs),
      source: "generated_from_case_state"
    };
  }

  async getOrBuildConsultationBrief({ bootstrap }) {
    const existing = await this.findLatestConsultationBrief({
      bootstrap,
      statuses: ["draft"]
    });

    if (!existing) {
      return this.buildConsultationBrief({ bootstrap, persist: true });
    }

    const inputs = await this.getConsultationInputs({ bootstrap });
    const builder = new ConsultationBriefBuilder();

    return {
      brief: this.decorateConsultationBrief(existing),
      statusNote: builder.buildStatusNote(inputs),
      source: "latest_draft"
    };
  }

  async markConsultationRequest({ bootstrap, bookingUrl = "" } = {}) {
    const existing = await this.findLatestConsultationBrief({
      bootstrap,
      statuses: ["draft", "ready", "sent"]
    });
    const briefResult = existing
      ? {
          brief: this.decorateConsultationBrief(existing)
        }
      : await this.buildConsultationBrief({ bootstrap, persist: true });
    const canBook = Boolean(trimString(bookingUrl));
    const updated = await this.patchOne("consultation_briefs", briefResult.brief.id, {
      status: canBook ? "sent" : "ready",
      requested_at: new Date().toISOString(),
      booking_url: canBook ? bookingUrl : null
    });
    await this.logMiniAppEvent({
      bootstrap,
      eventName: "consultation_clicked",
      metadata: {
        briefId: updated.id,
        canBook
      }
    });

    return {
      brief: this.decorateConsultationBrief(updated),
      bookingUrl: canBook ? bookingUrl : "",
      canBook,
      userMessage: canBook
        ? "Резюме подготовлено. Можно перейти к записи на консультацию."
        : "Резюме подготовлено, но ссылка на запись пока не настроена. Добавьте ALEXANDER_BOOKING_URL в окружение."
    };
  }

  async overrideConstraint({ bootstrap, payload }) {
    const layer = assertBusinessLayerKey(trimString(payload.layerKey));
    const contextIds = this.buildContextIds(bootstrap);
    const confidence = normalizeConfidence(payload.confidence, 0.75);
    const title = trimString(payload.title) || `Ограничение: ${layer.title}`;
    const explanation = trimString(payload.explanation) || "Ограничение вручную задано для альфа-проверки качества кейса.";

    const inserted = await this.insertOne("constraint_hypotheses", {
      ...contextIds,
      title,
      layer: layer.key,
      layer_class: layer.classKey,
      constraint_type: trimString(payload.constraintType) || "manual_override",
      explanation,
      supporting_observation_ids: Array.isArray(payload.supportingObservationIds) ? payload.supportingObservationIds : [],
      alternative_hypotheses: Array.isArray(payload.alternativeHypotheses) ? payload.alternativeHypotheses : [],
      confidence,
      status: "confirmed",
      version: 1
    });
    const constraintHypothesis = this.decorateConstraintHypothesis(inserted);

    await this.logMiniAppEvent({
      bootstrap,
      eventName: "manual_constraint_override",
      metadata: {
        constraintHypothesisId: constraintHypothesis.id,
        layerKey: constraintHypothesis.layerKey,
        confidence
      }
    });
    await this.captureEvalSnapshot({
      bootstrap,
      triggerEvent: "manual_constraint_override",
      constraintHypothesis
    });

    return {
      constraintHypothesis
    };
  }

  async overrideNextStep({ bootstrap, payload }) {
    const contextIds = this.buildContextIds(bootstrap);
    const constraintHypothesisId = trimString(payload.constraintHypothesisId);
    const constraintHypothesis = constraintHypothesisId
      ? await this.findOne("constraint_hypotheses", {
          id: `eq.${constraintHypothesisId}`,
          case_id: `eq.${bootstrap.activeCase.id}`,
          select: "*"
        })
      : await this.findLatestConstraintHypothesis({ bootstrap, statuses: ["confirmed", "suggested"] });

    if (!constraintHypothesis) {
      throw new Error("Constraint hypothesis is required before overriding next step.");
    }

    const inserted = await this.insertOne("next_steps", {
      ...contextIds,
      constraint_hypothesis_id: constraintHypothesis.id,
      title: trimString(payload.title) || "Ручной следующий шаг",
      description: trimString(payload.description) || "Следующий шаг вручную задан для альфа-проверки.",
      why_this_first: trimString(payload.whyThisFirst) || "Выбран вручную как ближайшее полезное действие по кейсу.",
      action_type: trimString(payload.actionType) || "manual_override",
      target_entity_type: trimString(payload.targetEntityType) || null,
      target_entity_id: trimString(payload.targetEntityId) || null,
      confidence: normalizeConfidence(payload.confidence, 0.75),
      status: trimString(payload.status) || "accepted",
      version: 1
    });
    const nextStep = this.decorateNextStep(inserted, this.decorateConstraintHypothesis(constraintHypothesis));

    await this.logMiniAppEvent({
      bootstrap,
      eventName: "manual_next_step_override",
      metadata: {
        nextStepId: nextStep.id,
        constraintHypothesisId: constraintHypothesis.id
      }
    });
    await this.captureEvalSnapshot({
      bootstrap,
      triggerEvent: "manual_next_step_override",
      constraintHypothesis: this.decorateConstraintHypothesis(constraintHypothesis),
      nextStep
    });

    return {
      nextStep
    };
  }

  async getMaturity({ bootstrap }) {
    const run = await this.resolveExpressDiagnosticRun({ bootstrap });
    const answers = await this.getExpressAnswers(run.id);
    const maturity = calculateExpressMaturity(answers);

    return {
      run,
      maturity,
      layers: BUSINESS_LAYERS_V1.map((layer) => ({
        ...layer,
        score: maturity.scores.find((score) => score.layerKey === layer.key)?.score ?? null
      }))
    };
  }
}

export function getExpressLayerLevel(layerKey, score) {
  const layer = getBusinessLayerByKey(layerKey);
  return layer?.levels?.[Number(score) - 1] || "";
}
