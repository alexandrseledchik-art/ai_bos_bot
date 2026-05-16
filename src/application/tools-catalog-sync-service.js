import { BUSINESS_LAYERS_V1 } from "../domain/business-layers.js";
import { pickCsvValue, readGoogleSheetToolsCsv } from "../infrastructure/google/google-sheet-csv-tools-reader.js";

const SOURCE = "google_sheet_tools_catalog";

const LAYER_ALIASES = new Map([
  ["owner_context", "owner_context"],
  ["контур собственника", "owner_context"],
  ["external_environment", "external_environment"],
  ["внешняя среда", "external_environment"],
  ["внешняя среда и экосистема", "external_environment"],
  ["strategy", "strategy"],
  ["стратегия", "strategy"],
  ["product", "product_value_proposition"],
  ["product_value_proposition", "product_value_proposition"],
  ["продукт", "product_value_proposition"],
  ["продукт и ценностное предложение", "product_value_proposition"],
  ["commercial", "commercial"],
  ["commerce", "commercial"],
  ["коммерция", "commercial"],
  ["операции", "operating_model"],
  ["operations", "operating_model"],
  ["operating_model", "operating_model"],
  ["операционная модель", "operating_model"],
  ["finance", "finance"],
  ["финансы", "finance"],
  ["team", "people_organization"],
  ["people", "people_organization"],
  ["people_organization", "people_organization"],
  ["команда", "people_organization"],
  ["люди и организация", "people_organization"],
  ["governance", "governance_risks"],
  ["management", "governance_risks"],
  ["governance_risks", "governance_risks"],
  ["управление", "governance_risks"],
  ["управление и риски", "governance_risks"],
  ["technology", "technology"],
  ["технологии", "technology"],
  ["data", "data_analytics"],
  ["analytics", "data_analytics"],
  ["data_analytics", "data_analytics"],
  ["данные", "data_analytics"],
  ["данные и аналитика", "data_analytics"]
]);

const PROBLEM_KEYWORDS = [
  {
    patterns: ["продаж", "лид", "заяв", "конверс", "ворон", "клиент", "сделк"],
    problemTypes: ["sales", "leads", "conversion", "funnel", "icp", "segmentation"]
  },
  {
    patterns: ["целев", "сегмент", "icp", "профил", "квалифик", "позиционир"],
    problemTypes: ["icp", "segmentation", "qualification", "positioning"]
  },
  {
    patterns: ["прибыл", "марж", "касс", "деньг", "выруч", "эконом"],
    problemTypes: ["finance", "margin", "cash", "profit", "unit_economics"]
  },
  {
    patterns: ["роль", "ответствен", "процесс", "управ", "хаос", "команд", "регламент"],
    problemTypes: ["roles", "responsibility", "operations", "management", "sales_process"]
  },
  {
    patterns: ["продать бизнес", "продажа бизнеса", "оценк", "покупател", "инвестор"],
    problemTypes: ["sale", "exit", "valuation", "documents"]
  },
  {
    patterns: ["собственник", "партнер", "видение", "мисси", "цель", "горизонт"],
    problemTypes: ["owner_context", "strategy", "alignment"]
  }
];

function normalizeText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeKeyText(value = "") {
  return normalizeText(value).toLowerCase();
}

function numericOrNull(value) {
  const match = String(value || "").match(/\d+/);
  return match ? Number(match[0]) : null;
}

function isUrl(value = "") {
  return /^https?:\/\//i.test(String(value || "").trim());
}

function buildSlug(sourceRow) {
  return `ba-tool-${String(Math.max(1, Number(sourceRow || 1) - 1)).padStart(4, "0")}`;
}

function inferProblemTypes(tool) {
  const text = normalizeKeyText([
    tool.title,
    tool.short_description,
    tool.when_to_use,
    tool.result,
    tool.domain_title,
    tool.subdomain_title,
    tool.embedding_suggestion
  ].filter(Boolean).join(" "));
  const types = new Set();

  for (const rule of PROBLEM_KEYWORDS) {
    if (rule.patterns.some((pattern) => text.includes(pattern))) {
      rule.problemTypes.forEach((type) => types.add(type));
    }
  }

  return [...types];
}

export function normalizeToolLayerKey(value = "") {
  const direct = LAYER_ALIASES.get(normalizeKeyText(value));
  if (direct) {
    return direct;
  }

  const layer = BUSINESS_LAYERS_V1.find((item) => normalizeKeyText(item.title) === normalizeKeyText(value));
  return layer?.key || "";
}

export function mapGoogleSheetToolRow(row, { spreadsheetId = "", gid = "" } = {}) {
  const layerTitle = pickCsvValue(row, ["Слой"]);
  const title = pickCsvValue(row, ["Инструмент / Методология", "Инструмент", "Методология"]);
  const layerKey = normalizeToolLayerKey(layerTitle);

  if (!layerKey || !title) {
    return null;
  }

  const linkCell = pickCsvValue(row, ["Ссылка на инструмент", "Ссылка"]);
  const description = pickCsvValue(row, ["Описание"]);
  const whenToUse = pickCsvValue(row, ["Когда применять"]);
  const result = pickCsvValue(row, ["Результат"]);
  const toolStatus = pickCsvValue(row, ["Статус"]);
  const domainTitle = pickCsvValue(row, ["Домен по архитектуре", "Домен"]);
  const subdomainTitle = pickCsvValue(row, ["Поддомен по архитектуре", "Поддомен", "Поддоммен"]);
  const relation = pickCsvValue(row, ["Связь"]);
  const embeddingSuggestion = pickCsvValue(row, ["Предложение по встраиванию"]);

  const tool = {
    slug: buildSlug(row.sourceRow),
    title,
    short_description: description || title,
    when_to_use: whenToUse || "Когда нужно структурировать этот участок бизнеса и перейти от обсуждения к рабочему документу.",
    template_url: isUrl(linkCell) ? linkCell : null,
    layer_keys: [layerKey],
    problem_types: [],
    is_active: !/архив|не использовать|disabled|inactive/i.test(toolStatus),
    source: SOURCE,
    source_spreadsheet_id: spreadsheetId,
    source_gid: String(gid || ""),
    source_row: row.sourceRow,
    layer_title: layerTitle,
    domain_title: domainTitle || null,
    subdomain_title: subdomainTitle || null,
    tool_status: toolStatus || null,
    result: result || null,
    relation: relation || null,
    link_label: linkCell || null,
    architecture_order: numericOrNull(pickCsvValue(row, ["Порядок по архитектуре"])),
    embedding_suggestion: embeddingSuggestion || null,
    metadata: {
      rawLayer: layerTitle,
      rawDomain: domainTitle,
      rawSubdomain: subdomainTitle,
      hasDirectTemplateUrl: isUrl(linkCell)
    }
  };

  tool.problem_types = inferProblemTypes(tool);
  return tool;
}

function chunk(items, size = 100) {
  const result = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

export class ToolsCatalogSyncService {
  constructor({ syncClient, spreadsheetId, gid, csvUrl = "", fetchImpl = fetch } = {}) {
    this.syncClient = syncClient;
    this.spreadsheetId = spreadsheetId;
    this.gid = gid;
    this.csvUrl = csvUrl;
    this.fetchImpl = fetchImpl;
  }

  async readTools() {
    const csv = await readGoogleSheetToolsCsv({
      spreadsheetId: this.spreadsheetId,
      gid: this.gid,
      csvUrl: this.csvUrl,
      fetchImpl: this.fetchImpl
    });
    const tools = csv.rows
      .map((row) => mapGoogleSheetToolRow(row, {
        spreadsheetId: this.spreadsheetId,
        gid: this.gid
      }))
      .filter(Boolean);

    return {
      sourceUrl: csv.url,
      rawRows: csv.rows.length,
      tools,
      skippedRows: csv.rows.length - tools.length
    };
  }

  async sync({ dryRun = false } = {}) {
    if (!dryRun && !this.syncClient?.enabled) {
      throw new Error("Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
    }

    const payload = await this.readTools();
    if (dryRun) {
      return {
        ...payload,
        syncedRows: 0,
        dryRun: true
      };
    }

    let syncedRows = 0;
    for (const batch of chunk(payload.tools)) {
      const rows = await this.syncClient.request("/rest/v1/tools", {
        method: "POST",
        query: {
          on_conflict: "slug",
          select: "id,slug,title,source,updated_at"
        },
        prefer: "resolution=merge-duplicates,return=representation",
        body: batch
      });
      syncedRows += rows.length;
    }

    return {
      ...payload,
      syncedRows,
      dryRun: false
    };
  }
}
