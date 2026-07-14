import { buildArchitectureTree, canonicalArchitectureLayerId } from "./business-architecture-map.js";
import { BUSINESS_ARCHITECTURE_ITEMS } from "./business-architecture-knowledge.js";
import { BUSINESS_LAYERS_V1 } from "./business-layers.js";

export const DIAGNOSTIC_LEVELS = {
  express: {
    key: "express",
    label: "Экспресс-диагностика",
    subjectType: "layer",
    unitLabel: "слоёв",
    expectedCount: 11
  },
  basic: {
    key: "basic",
    label: "Базовая диагностика",
    subjectType: "domain",
    unitLabel: "доменов",
    expectedCount: 72
  },
  deep: {
    key: "deep",
    label: "Расширенная диагностика",
    subjectType: "subdomain",
    unitLabel: "поддоменов",
    expectedCount: 288
  }
};

function maturityLevels(maturity = {}) {
  return [1, 2, 3, 4, 5].map((score) => maturity[String(score)] || "");
}

function architectureItemByNumber() {
  return new Map(BUSINESS_ARCHITECTURE_ITEMS.map((item) => [Number(item.number), item]));
}

export function assertDiagnosticLevel(level) {
  const config = DIAGNOSTIC_LEVELS[level];
  if (!config) {
    throw new Error(`Unknown diagnostic level: ${level}`);
  }
  return config;
}

export function buildDiagnosticCatalog(level) {
  const config = assertDiagnosticLevel(level);

  if (level === "express") {
    return {
      ...config,
      items: BUSINESS_LAYERS_V1.map((layer, index) => ({
        key: layer.key,
        subjectKey: layer.key,
        subjectType: "layer",
        order: index + 1,
        classKey: layer.classKey,
        layerKey: canonicalArchitectureLayerId(layer.key),
        layerTitle: layer.title,
        title: layer.title,
        description: layer.shortDescription,
        levels: layer.levels
      }))
    };
  }

  const tree = buildArchitectureTree();
  const sourceByNumber = architectureItemByNumber();
  const items = [];

  for (const layer of tree) {
    for (const domain of layer.domains) {
      const sourceDomain = sourceByNumber.get(Number(domain.number));
      const domainKey = `domain:${domain.number}`;

      if (level === "basic") {
        items.push({
          key: domainKey,
          subjectKey: domainKey,
          subjectType: "domain",
          order: items.length + 1,
          number: domain.number,
          classKey: layer.classId,
          layerKey: layer.layerId,
          layerTitle: layer.name,
          title: domain.title,
          description: domain.description,
          levels: maturityLevels(sourceDomain?.maturity)
        });
        continue;
      }

      for (const subdomain of domain.subdomains) {
        const sourceSubdomain = sourceByNumber.get(Number(subdomain.number));
        items.push({
          key: `subdomain:${subdomain.number}`,
          subjectKey: `subdomain:${subdomain.number}`,
          subjectType: "subdomain",
          order: items.length + 1,
          number: subdomain.number,
          classKey: layer.classId,
          layerKey: layer.layerId,
          layerTitle: layer.name,
          parentKey: domainKey,
          parentTitle: domain.title,
          title: subdomain.title,
          description: subdomain.description,
          levels: maturityLevels(sourceSubdomain?.maturity)
        });
      }
    }
  }

  return { ...config, items };
}

export function diagnosticCatalogSummary() {
  return Object.fromEntries(
    Object.keys(DIAGNOSTIC_LEVELS).map((level) => {
      const catalog = buildDiagnosticCatalog(level);
      return [level, {
        level,
        label: catalog.label,
        subjectType: catalog.subjectType,
        unitLabel: catalog.unitLabel,
        totalCount: catalog.items.length
      }];
    })
  );
}
