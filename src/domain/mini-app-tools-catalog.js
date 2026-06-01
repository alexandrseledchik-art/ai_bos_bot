import { BUSINESS_ARCHITECTURE_TOOLS } from "./business-architecture-knowledge.js";

const PROBLEM_TYPE_HINTS = [
  {
    patterns: ["продаж", "лид", "заяв", "конверс", "ворон", "клиент", "сегмент"],
    types: ["sales", "leads", "conversion", "funnel", "icp", "segmentation"]
  },
  {
    patterns: ["марж", "прибыл", "касс", "деньг", "выруч", "эконом", "бюджет"],
    types: ["finance", "margin", "cash", "profit", "unit_economics"]
  },
  {
    patterns: ["роль", "ответствен", "raci", "процесс", "операцион", "регламент", "sla"],
    types: ["roles", "responsibility", "operations", "management", "sales_process"]
  },
  {
    patterns: ["продажа бизнеса", "инвестор", "оценк", "due diligence", "документ"],
    types: ["sale", "exit", "valuation", "documents"]
  }
];

const TOOL_LAYER_KEY_ALIASES = {
  product: "product_value_proposition",
  operations: "operating_model",
  team: "people_organization",
  governance: "governance_risks"
};

function normalizeText(...parts) {
  return parts.filter(Boolean).join(" ").toLowerCase();
}

function normalizeLayerKey(layerId) {
  return TOOL_LAYER_KEY_ALIASES[layerId] || layerId || "";
}

function inferProblemTypes(tool) {
  const text = normalizeText(tool.layer, tool.domain, tool.subdomain, tool.name, tool.description, tool.whenToUse, tool.result);
  const types = new Set();

  for (const hint of PROBLEM_TYPE_HINTS) {
    if (hint.patterns.some((pattern) => text.includes(pattern))) {
      hint.types.forEach((type) => types.add(type));
    }
  }

  return [...types];
}

function toCatalogTool(tool, index) {
  const slug = `ba-tool-${String(index + 1).padStart(4, "0")}`;

  return {
    id: slug,
    slug,
    title: tool.name,
    short_description: tool.description,
    when_to_use: tool.whenToUse,
    result: tool.result,
    template_url: tool.url || null,
    layer_keys: tool.layerId ? [normalizeLayerKey(tool.layerId)] : [],
    layer: tool.layer,
    domain: tool.domain,
    subdomain: tool.subdomain || "",
    status: tool.status || "",
    relation: tool.relation || "",
    link_label: tool.linkLabel || "",
    source_row: tool.sourceRow || null,
    problem_types: inferProblemTypes(tool),
    is_active: true,
    source: "business_architecture_tools"
  };
}

export const MINI_APP_TOOL_CATALOG = BUSINESS_ARCHITECTURE_TOOLS.map(toCatalogTool);
