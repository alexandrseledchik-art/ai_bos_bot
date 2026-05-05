import {
  createCompany,
  createCompanySource,
  nowIso
} from "../domain/entities.js";
import { CompanyAnalysisCore, detectConsultantLayersForText } from "./company-analysis-core.js";

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
