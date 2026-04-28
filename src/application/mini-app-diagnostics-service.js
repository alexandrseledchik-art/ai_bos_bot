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

function firstRow(rows) {
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
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
    const [answers, observations, problemContext] = await Promise.all([
      this.getExpressAnswers(run.id),
      this.getCaseObservations({ bootstrap }),
      this.getActiveProblemContext({ bootstrap })
    ]);
    const maturity = calculateExpressMaturity(answers);

    return {
      run,
      answers,
      maturity,
      observations,
      problemContext,
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

  decorateTool(row, recommendation = null) {
    if (!row) {
      return null;
    }

    return {
      ...row,
      layerKeys: row.layer_keys || [],
      problemTypes: row.problem_types || [],
      templateUrl: row.template_url || "",
      hasTemplate: Boolean(row.template_url),
      recommendation
    };
  }

  async getTools({ bootstrap }) {
    const tools = this.getCatalogTools();
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
    const tool = this.getCatalogTools().find((item) => item.slug === trimString(slug));

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
    const tools = this.getCatalogTools();
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
    const tool = this.getCatalogTools().find((item) => item.id === trimString(toolId));

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
    const sources = await this.findMany("document_sources", {
      case_id: `eq.${bootstrap.activeCase.id}`,
      order: "updated_at.desc",
      select: "*"
    });
    const snapshots = await this.findMany("document_snapshots", {
      case_id: `eq.${bootstrap.activeCase.id}`,
      order: "created_at.desc",
      select: "*"
    });
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
      }))
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
