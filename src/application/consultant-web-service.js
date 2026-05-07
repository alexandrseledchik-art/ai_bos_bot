import {
  createCompany,
  createCompanySource,
  nowIso
} from "../domain/entities.js";
import { PublicGoogleLinkReader } from "../infrastructure/google/public-google-link-reader.js";
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

function findExistingDriveSource(state, companyId, file) {
  const externalId = `google_drive:${file.id}`;
  return (state.companySources || []).find((source) =>
    source.companyId === companyId &&
    (source.externalId === externalId || (file.webViewLink && source.fileUrl === file.webViewLink))
  ) || null;
}

function buildDriveSourceSummary({ file, readable, reason }) {
  if (readable) {
    return `Google Drive: ${file.name}`;
  }

  return reason || `Google Drive: ${file.name}. Файл сохранён как ссылка, текст пока не извлечён.`;
}

function buildPublicGoogleSummary({ title, readable, reason, text }) {
  if (readable) {
    const preview = cleanText(text).slice(0, 220);
    return `${title || "Google"}: текст извлечён по публичной ссылке${preview ? `. ${preview}` : ""}`;
  }

  return reason || "Google-ссылка сохранена, но текст пока не извлечён.";
}

function latestTimestamp(items = []) {
  return items
    .map((item) => item?.updatedAt || item?.processedAt || item?.createdAt || "")
    .filter(Boolean)
    .sort()
    .at(-1) || "";
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
  constructor({
    store,
    analyzer = new CompanyAnalysisCore(),
    googleDrive = null,
    publicGoogleLinkReader = new PublicGoogleLinkReader()
  }) {
    this.store = store;
    this.analyzer = analyzer;
    this.googleDrive = googleDrive;
    this.publicGoogleLinkReader = publicGoogleLinkReader;
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
      integrations: this.buildIntegrationsStatus(state, company),
      analyses: (state.companyAnalyses || [])
        .filter((item) => item.companyId === companyId)
        .slice(-5)
        .reverse()
    };
  }

  buildIntegrationsStatus(state, company) {
    const driveSources = (state.companySources || []).filter((source) =>
      source.companyId === company.id &&
      source.sourceOrigin === "google_drive"
    );
    const readableCount = driveSources.filter((source) => source.processingStatus === "processed" && cleanText(source.contentText)).length;

    return {
      googleDrive: {
        type: "google_drive",
        title: "Google Drive",
        configured: Boolean(this.googleDrive?.enabled),
        status: this.googleDrive?.enabled ? "ready" : "not_configured",
        sourceCount: driveSources.length,
        readableCount,
        lastSyncedAt: latestTimestamp(driveSources),
        expectedFolderName: company.name,
        setupRequired: this.googleDrive?.enabled
          ? []
          : [
              "GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL",
              "GOOGLE_DRIVE_PRIVATE_KEY",
              "GOOGLE_DRIVE_FOLDER_ID"
            ]
      },
      apiConnectors: [
        {
          type: "crm",
          title: "CRM",
          status: "planned",
          description: "amoCRM / Bitrix24 / другая CRM: лиды, сделки, статусы, причины отказов."
        },
        {
          type: "finance",
          title: "Финансы",
          status: "planned",
          description: "P&L, cash flow, платежи, маржа и финансовые обязательства."
        },
        {
          type: "marketing",
          title: "Маркетинг",
          status: "planned",
          description: "Рекламные кабинеты, аналитика сайта, каналы и стоимость потока."
        }
      ]
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

  async getIntegrations(companyId) {
    const state = await this.store.readState();
    const company = assertCompany(state, companyId);
    return {
      company: companySummary(state, company),
      integrations: this.buildIntegrationsStatus(state, company)
    };
  }

  async syncGoogleDrive(companyId) {
    return this.store.update(async (state) => {
      const company = assertCompany(state, companyId);

      if (!this.googleDrive?.enabled) {
        return {
          company: companySummary(state, company),
          integrations: this.buildIntegrationsStatus(state, company),
          googleDrive: {
            ok: false,
            reason: "not_configured",
            message: "Google Drive не настроен. Добавь в Vercel env GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL, GOOGLE_DRIVE_PRIVATE_KEY и GOOGLE_DRIVE_FOLDER_ID.",
            syncedCount: 0,
            readableCount: 0,
            unsupported: []
          }
        };
      }

      const { companyFolder, files, usedRootFolder = false } = await this.googleDrive.listCompanyFiles(company.name);
      if (!companyFolder) {
        return {
          company: companySummary(state, company),
          integrations: this.buildIntegrationsStatus(state, company),
          googleDrive: {
            ok: false,
            reason: "company_folder_not_found",
            message: `В корневой папке Google Drive не найдена подпапка компании "${company.name}". Создай папку с таким названием или переименуй компанию.`,
            expectedFolderName: company.name,
            syncedCount: 0,
            readableCount: 0,
            unsupported: [],
            usedRootFolder: false
          }
        };
      }

      const unsupported = [];
      let syncedCount = 0;
      let readableCount = 0;

      state.companySources = state.companySources || [];

      for (const file of files) {
        const extracted = await this.googleDrive.readFileText(file);
        const contentText = extracted.text || "";
        const relatedLayers = detectConsultantLayersForText(`${file.name}\n${contentText}`);
        const existing = findExistingDriveSource(state, company.id, file);
        const common = {
          externalId: `google_drive:${file.id}`,
          type: "document",
          title: file.name,
          contentText,
          fileUrl: file.webViewLink || "",
          sourceOrigin: "google_drive",
          aiSummary: buildDriveSourceSummary({ file, readable: extracted.readable, reason: extracted.reason }),
          relatedLayers,
          sourceMeta: {
            googleDriveFileId: file.id,
            googleDriveFolderId: companyFolder.id,
            googleDriveFolderName: companyFolder.name || "",
            mimeType: file.mimeType || "",
            modifiedTime: file.modifiedTime || "",
            readable: extracted.readable,
            readReason: extracted.reason || ""
          },
          processingStatus: extracted.readable ? "processed" : "link_added"
        };

        if (existing) {
          Object.assign(existing, common, {
            processedAt: extracted.readable ? nowIso() : existing.processedAt || "",
            updatedAt: nowIso()
          });
        } else {
          state.companySources.push(createCompanySource({
            companyId: company.id,
            ...common
          }));
        }

        syncedCount += 1;
        if (extracted.readable) {
          readableCount += 1;
        } else {
          unsupported.push(file.name);
        }
      }

      company.updatedAt = nowIso();

      return {
        company: companySummary(state, company),
        integrations: this.buildIntegrationsStatus(state, company),
        googleDrive: {
          ok: true,
          folderName: companyFolder.name || "",
          usedRootFolder,
          syncedCount,
          readableCount,
          unsupported
        }
      };
    });
  }

  async addSource(companyId, payload) {
    return this.store.update(async (state) => {
      const company = assertCompany(state, companyId);
      let contentText = cleanText(payload.contentText || payload.content);
      const fileUrl = cleanText(payload.fileUrl || payload.url);
      const title = cleanText(payload.title) || (fileUrl ? "Ссылка на источник" : "Заметка");
      const requestedType = cleanText(payload.type);
      let sourceOrigin = "web";
      let processingStatus = contentText ? "processed" : "link_added";
      let sourceType = requestedType || (fileUrl ? "link" : "text");
      let aiSummary = contentText.slice(0, 260) || fileUrl;
      let sourceMeta = {};

      if (!contentText && !fileUrl) {
        const error = new Error("Добавьте текст или ссылку на источник.");
        error.status = 400;
        throw error;
      }

      if (fileUrl && !contentText && this.publicGoogleLinkReader) {
        const googleLink = await this.publicGoogleLinkReader.read(fileUrl);
        if (googleLink.supported) {
          contentText = cleanText(googleLink.text);
          sourceOrigin = "google_link";
          sourceType = googleLink.readable
            ? googleLink.sourceType
            : (requestedType && requestedType !== "text" ? requestedType : "link");
          processingStatus = googleLink.readable ? "processed" : "link_added";
          aiSummary = buildPublicGoogleSummary({
            title: googleLink.title,
            readable: googleLink.readable,
            reason: googleLink.reason,
            text: contentText
          });
          sourceMeta = {
            publicGoogleLink: {
              id: googleLink.id,
              kind: googleLink.kind,
              exportUrl: googleLink.exportUrl,
              readable: googleLink.readable,
              readReason: googleLink.reason || ""
            }
          };
        }
      }

      const relatedLayers = detectConsultantLayersForText(`${title}\n${contentText}\n${fileUrl}`);
      const source = createCompanySource({
        companyId,
        type: sourceType,
        title,
        contentText,
        fileUrl,
        sourceOrigin,
        aiSummary,
        relatedLayers,
        sourceMeta,
        processingStatus
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
