import {
  createCompany,
  createCompanySource,
  nowIso
} from "../domain/entities.js";
import { CompanyAnalysisCore, detectConsultantLayersForText } from "./company-analysis-core.js";
import { importDeepDiagnosticXlsx } from "./deep-diagnostic-importer.js";

function cleanText(value) {
  return String(value || "").trim();
}

function normalizeText(value) {
  return cleanText(value).toLowerCase().replace(/\s+/g, " ");
}

function slugify(value) {
  return normalizeText(value)
    .replace(/[^а-яёa-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "company";
}

function latestByCompany(items = [], companyId) {
  return [...items].reverse().find((item) => item.companyId === companyId) || null;
}

function latestAnalysis(state, companyId) {
  return latestByCompany(state.companyAnalyses || [], companyId);
}

function companySummary(state, company) {
  const analysis = latestAnalysis(state, company.id);
  return {
    id: company.id,
    name: company.name,
    industry: company.industry || "",
    description: company.description || "",
    ownerGoal: company.ownerGoal || "",
    currentRequest: company.currentRequest || "",
    workspaceType: company.workspaceType || "consultant",
    userRole: company.userRole || "consultant",
    analysisStatus: company.analysisStatus || "not_analyzed",
    createdAt: company.createdAt,
    updatedAt: company.updatedAt,
    lastAnalysisAt: analysis?.createdAt || "",
    summary: analysis?.summary || "",
    probableConstraint: analysis?.probableConstraint || null,
    nextStep: analysis?.nextStep || null,
    confidence: analysis?.confidence || ""
  };
}

function findCompany(state, companyId) {
  return (state.companies || []).find((company) => company.id === companyId) || null;
}

function assertCompany(state, companyId) {
  const company = findCompany(state, companyId);
  if (!company) {
    const error = new Error("Company not found.");
    error.status = 404;
    throw error;
  }

  return company;
}

function byCompanyId(companyId) {
  return (item) => item?.companyId === companyId || item?.company_id === companyId;
}

function notByCompanyId(companyId) {
  return (item) => !byCompanyId(companyId)(item);
}

function byCaseIds(caseIds) {
  return (item) => caseIds.has(item?.caseId) || caseIds.has(item?.case_id);
}

function notByCaseIds(caseIds) {
  return (item) => !byCaseIds(caseIds)(item);
}

function byThreadIds(threadIds) {
  return (item) => threadIds.has(item?.threadId) || threadIds.has(item?.thread_id);
}

function notByThreadIds(threadIds) {
  return (item) => !byThreadIds(threadIds)(item);
}

function filterStateArray(state, key, predicate) {
  if (Array.isArray(state[key])) {
    state[key] = state[key].filter(predicate);
  }
}

function decodeBase64(value) {
  const raw = cleanText(value).replace(/^data:[^;]+;base64,/, "");
  if (!raw) {
    const error = new Error("Файл диагностики не передан.");
    error.status = 400;
    throw error;
  }

  return Buffer.from(raw, "base64");
}

function profileAnswer(profile, names) {
  const normalizedNames = names.map(normalizeText);
  const found = Object.entries(profile || {}).find(([question]) => normalizedNames.includes(normalizeText(question)));
  return cleanText(found?.[1] || "");
}

function buildProfileDescription(profile) {
  const parts = [
    profileAnswer(profile, ["Основной продукт / услуга"]),
    profileAnswer(profile, ["География"]),
    profileAnswer(profile, ["Количество сотрудников"]) ? `Сотрудников: ${profileAnswer(profile, ["Количество сотрудников"])}` : "",
    profileAnswer(profile, ["Выручка (за прошлый год / текущий прогноз)"]) ? `Выручка: ${profileAnswer(profile, ["Выручка (за прошлый год / текущий прогноз)"])}` : ""
  ].filter(Boolean);

  return parts.join(". ");
}

export class ConsultantWebService {
  constructor({ store, analyzer = new CompanyAnalysisCore() }) {
    this.store = store;
    this.analyzer = analyzer;
  }

  async listCompanies() {
    const state = await this.store.readState();
    const companies = (state.companies || [])
      .filter((company) => company.workspaceType === "consultant" || company.companySource === "web" || company.companySource === "telegram")
      .map((company) => companySummary(state, company))
      .sort((left, right) => String(right.updatedAt || "").localeCompare(String(left.updatedAt || "")));

    return { companies };
  }

  async createCompany(payload) {
    return this.store.update(async (state) => {
      const name = cleanText(payload.name);
      if (!name) {
        const error = new Error("Название компании обязательно.");
        error.status = 400;
        throw error;
      }

      const company = createCompany({
        name,
        telegramChatId: `web:${Date.now()}:${slugify(name)}`,
        industry: cleanText(payload.industry),
        description: cleanText(payload.description),
        ownerGoal: cleanText(payload.ownerGoal),
        currentRequest: cleanText(payload.currentRequest),
        workspaceType: "consultant",
        userRole: "consultant",
        companySource: "web"
      });
      state.companies.push(company);

      const comment = cleanText(payload.comment);
      if (comment) {
        state.companySources = state.companySources || [];
        state.companySources.push(createCompanySource({
          companyId: company.id,
          type: "text",
          title: "Комментарий при создании компании",
          contentText: comment,
          sourceOrigin: "web",
          aiSummary: comment,
          relatedLayers: detectConsultantLayersForText(comment)
        }));
      }

      return { company: companySummary(state, company) };
    });
  }

  async getCompany(companyId) {
    const state = await this.store.readState();
    const company = assertCompany(state, companyId);
    const analysis = latestAnalysis(state, companyId);

    return {
      company: companySummary(state, company),
      sources: (state.companySources || [])
        .filter((source) => source.companyId === companyId)
        .sort((left, right) => String(right.updatedAt || right.createdAt || "").localeCompare(String(left.updatedAt || left.createdAt || ""))),
      layerAnalyses: (state.layerAnalyses || []).filter((item) => item.companyId === companyId),
      toolResults: (state.toolResults || []).filter((item) => item.companyId === companyId),
      analysis,
      analyses: (state.companyAnalyses || [])
        .filter((item) => item.companyId === companyId)
        .slice(-5)
        .reverse()
    };
  }

  async updateCompany(companyId, payload) {
    return this.store.update(async (state) => {
      const company = assertCompany(state, companyId);
      const fields = [
        ["name", "name"],
        ["industry", "industry"],
        ["description", "description"],
        ["ownerGoal", "ownerGoal"],
        ["currentRequest", "currentRequest"]
      ];

      for (const [field, payloadField] of fields) {
        if (payload[payloadField] !== undefined) {
          company[field] = cleanText(payload[payloadField]);
        }
      }

      company.updatedAt = nowIso();
      return { company: companySummary(state, company) };
    });
  }

  async deleteCompany(companyId) {
    return this.store.update(async (state) => {
      const company = assertCompany(state, companyId);
      const companyCases = (state.cases || []).filter(byCompanyId(companyId));
      const caseIds = new Set(companyCases.map((item) => item.id).filter(Boolean));
      const companyThreads = (state.threads || []).filter(byCompanyId(companyId));
      const threadIds = new Set(companyThreads.map((item) => item.id).filter(Boolean));
      const diagnosticRuns = [
        ...(state.diagnosticRuns || []),
        ...(state.diagnostic_runs || [])
      ].filter(byCompanyId(companyId));
      const diagnosticRunIds = new Set(diagnosticRuns.map((item) => item.id).filter(Boolean));

      filterStateArray(state, "companies", (item) => item.id !== companyId);
      filterStateArray(state, "companySources", notByCompanyId(companyId));
      filterStateArray(state, "layerAnalyses", notByCompanyId(companyId));
      filterStateArray(state, "toolResults", notByCompanyId(companyId));
      filterStateArray(state, "companyAnalyses", notByCompanyId(companyId));
      filterStateArray(state, "companyProfiles", notByCompanyId(companyId));
      filterStateArray(state, "company_profiles", notByCompanyId(companyId));
      filterStateArray(state, "diagnosticRuns", notByCompanyId(companyId));
      filterStateArray(state, "diagnostic_runs", notByCompanyId(companyId));

      filterStateArray(state, "cases", notByCompanyId(companyId));
      filterStateArray(state, "observations", notByCaseIds(caseIds));
      filterStateArray(state, "goals", notByCaseIds(caseIds));
      filterStateArray(state, "symptoms", notByCaseIds(caseIds));
      filterStateArray(state, "hypotheses", notByCaseIds(caseIds));
      filterStateArray(state, "constraints", notByCaseIds(caseIds));
      filterStateArray(state, "situations", notByCaseIds(caseIds));
      filterStateArray(state, "actionWaves", notByCaseIds(caseIds));
      filterStateArray(state, "toolRecommendations", notByCaseIds(caseIds));
      filterStateArray(state, "artifacts", notByCaseIds(caseIds));
      filterStateArray(state, "snapshots", notByCaseIds(caseIds));

      filterStateArray(state, "threads", notByCompanyId(companyId));
      filterStateArray(state, "messages", notByThreadIds(threadIds));
      filterStateArray(state, "diagnosticAnswers", (item) => !diagnosticRunIds.has(item?.diagnosticRunId) && !diagnosticRunIds.has(item?.diagnostic_run_id));
      filterStateArray(state, "diagnostic_answers", (item) => !diagnosticRunIds.has(item?.diagnosticRunId) && !diagnosticRunIds.has(item?.diagnostic_run_id));

      for (const context of state.telegramContexts || []) {
        if (context.activeCompanyId === companyId || context.active_company_id === companyId) {
          context.activeCompanyId = "";
          context.active_company_id = "";
          context.lastMessageAt = nowIso();
          context.last_message_at = context.lastMessageAt;
        }
      }

      return {
        deletedCompany: companySummary(
          {
            ...state,
            companyAnalyses: []
          },
          company
        ),
        removed: {
          cases: caseIds.size,
          threads: threadIds.size,
          diagnosticRuns: diagnosticRunIds.size
        }
      };
    });
  }

  async addSource(companyId, payload) {
    return this.store.update(async (state) => {
      const company = assertCompany(state, companyId);
      const contentText = cleanText(payload.contentText || payload.content);
      const fileUrl = cleanText(payload.fileUrl || payload.url);
      const title = cleanText(payload.title) || (fileUrl ? "Ссылка на источник" : "Заметка");

      if (!contentText && !fileUrl) {
        const error = new Error("Добавьте текст или ссылку на источник.");
        error.status = 400;
        throw error;
      }

      const relatedLayers = detectConsultantLayersForText(`${title}\n${contentText}\n${fileUrl}`);
      const source = createCompanySource({
        companyId,
        type: cleanText(payload.type) || (fileUrl ? "link" : "text"),
        title,
        contentText,
        fileUrl,
        sourceOrigin: "web",
        aiSummary: contentText.slice(0, 260) || fileUrl,
        relatedLayers,
        processingStatus: contentText ? "processed" : "link_added"
      });
      state.companySources = state.companySources || [];
      state.companySources.push(source);
      company.updatedAt = nowIso();

      return { source, company: companySummary(state, company) };
    });
  }

  async importDeepDiagnostic(companyId, payload) {
    return this.store.update(async (state) => {
      const company = assertCompany(state, companyId);
      const fileName = cleanText(payload.fileName) || "Глубокая диагностика.xlsx";
      const fileBuffer = decodeBase64(payload.fileBase64 || payload.base64 || payload.file);
      const imported = importDeepDiagnosticXlsx(fileBuffer);
      const relatedLayers = imported.layerScores.map((item) => item.layerCode).filter(Boolean);
      const source = createCompanySource({
        companyId,
        type: "deep_diagnostic",
        title: `Глубокая диагностика: ${fileName}`,
        contentText: imported.contentText,
        sourceOrigin: "web_upload",
        aiSummary: `Импортирована глубокая диагностика: ${imported.layerScores.length} слоёв, ${imported.summary.scoredSubdomainCount} оценённых поддоменов.`,
        relatedLayers,
        sourceMeta: {
          fileName,
          deepDiagnostic: {
            profile: imported.profile,
            layerScores: imported.layerScores,
            weakestSubdomains: imported.weakestSubdomains,
            strongestSubdomains: imported.strongestSubdomains,
            summary: imported.summary
          }
        },
        processingStatus: "processed"
      });

      state.companySources = state.companySources || [];
      state.companySources.push(source);

      const industry = profileAnswer(imported.profile, ["Сфера / рынок"]);
      const ownerGoal = profileAnswer(imported.profile, ["Прибыль (если готов раскрыть)"]);
      const description = buildProfileDescription(imported.profile);

      if (industry && !company.industry) {
        company.industry = industry;
      }
      if (ownerGoal && !company.ownerGoal) {
        company.ownerGoal = ownerGoal;
      }
      if (description && !company.description) {
        company.description = description;
      }

      company.analysisStatus = "source_imported";
      company.updatedAt = nowIso();

      return {
        source,
        importSummary: imported.summary,
        company: companySummary(state, company)
      };
    });
  }

  async analyzeCompany(companyId) {
    return this.store.update(async (state) => {
      assertCompany(state, companyId);
      const result = this.analyzer.analyze({ state, companyId });
      return {
        analysis: result.analysis,
        layerAnalyses: result.layerAnalyses,
        toolResults: result.toolResults
      };
    });
  }
}
