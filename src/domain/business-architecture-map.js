import {
  BUSINESS_ARCHITECTURE_ITEMS,
  BUSINESS_ARCHITECTURE_LAYERS
} from "./business-architecture-knowledge.js";

export const BUSINESS_ARCHITECTURE_LAYER_ALIASES = {
  product_value_proposition: "product",
  operating_model: "operations",
  people_organization: "team",
  governance_risks: "governance"
};

export function canonicalArchitectureLayerId(value) {
  return BUSINESS_ARCHITECTURE_LAYER_ALIASES[value] || value || "";
}

export function buildArchitectureItems(items = BUSINESS_ARCHITECTURE_ITEMS) {
  const currentDomainByLayer = new Map();

  return items.flatMap((item) => {
    const layerCode = canonicalArchitectureLayerId(item.layerId);

    if (item.block === "Домен") {
      currentDomainByLayer.set(layerCode, item.domain);
      return [];
    }

    if (item.block !== "Поддомен") {
      return [];
    }

    return {
      number: item.number,
      layerCode,
      layerName: item.layer,
      block: item.block,
      parentDomain: currentDomainByLayer.get(layerCode) || "",
      subdomain: item.domain,
      domain: item.domain,
      description: item.description,
      action: item.action,
      expectedResult: item.expectedResult,
      toolHints: item.toolHints
    };
  });
}

export function buildArchitectureTree({
  items = BUSINESS_ARCHITECTURE_ITEMS,
  layers = BUSINESS_ARCHITECTURE_LAYERS
} = {}) {
  const rowsByLayer = new Map();
  const currentDomainByLayer = new Map();

  for (const item of items) {
    const layerId = canonicalArchitectureLayerId(item.layerId);
    const rows = rowsByLayer.get(layerId) || [];
    let parentDomain = "";

    if (item.block === "Домен") {
      currentDomainByLayer.set(layerId, item.domain);
    }

    if (item.block === "Поддомен") {
      parentDomain = currentDomainByLayer.get(layerId) || "";
    }

    rows.push({
      ...item,
      layerId,
      layerCode: layerId,
      parentDomain
    });
    rowsByLayer.set(layerId, rows);
  }

  return layers.map((layer, index) => {
    const layerId = canonicalArchitectureLayerId(layer.id);
    const rows = rowsByLayer.get(layerId) || [];
    const layerRow = rows.find((item) => item.block === "Слой") || null;
    const domains = rows
      .filter((item) => item.block === "Домен")
      .map((domain) => {
        const subdomains = rows
          .filter((item) => item.block === "Поддомен" && item.parentDomain === domain.domain)
          .map((subdomain) => ({
            number: subdomain.number,
            title: subdomain.domain,
            domain: subdomain.domain,
            parentDomain: domain.domain,
            description: subdomain.description,
            action: subdomain.action,
            expectedResult: subdomain.expectedResult,
            toolHints: subdomain.toolHints
          }));

        return {
          number: domain.number,
          title: domain.domain,
          domain: domain.domain,
          description: domain.description,
          action: domain.action,
          expectedResult: domain.expectedResult,
          toolHints: domain.toolHints,
          subdomains,
          subdomainCount: subdomains.length
        };
      });

    return {
      layerId,
      layerCode: layerId,
      classId: layer.classId,
      order: index + 1,
      name: layer.name,
      description: layer.whatItIs || layerRow?.description || "",
      action: layerRow?.action || "",
      expectedResult: layerRow?.expectedResult || "",
      domains,
      domainCount: domains.length,
      subdomainCount: domains.reduce((sum, domain) => sum + domain.subdomainCount, 0)
    };
  });
}
