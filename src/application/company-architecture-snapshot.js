import { buildArchitectureTree, canonicalArchitectureLayerId } from "../domain/business-architecture-map.js";
import {
  isBusinessArchitectureReferenceSource,
  matchBusinessArchitectureContentForSource,
  matchBusinessArchitectureToolsForSource
} from "../domain/business-architecture-tool-matcher.js";

const ARCHITECTURE_TREE = buildArchitectureTree();
const LAYER_ORDER = [
  "owner_context",
  "external_environment",
  "strategy",
  "product",
  "commercial",
  "operations",
  "finance",
  "team",
  "governance",
  "technology",
  "data_analytics"
];

function cleanText(value) {
  return String(value || "").trim();
}

function normalizeText(value) {
  return cleanText(value)
    .toLowerCase()
    .replaceAll("ё", "е")
    .replace(/[^a-zа-я0-9]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sourceReadableContent(source = {}) {
  return [
    source.contentText,
    source.content_text,
    source.text,
    source.summary,
    source.aiSummary,
    source.ai_summary,
    source.latestSnapshot?.content_text,
    source.latestSnapshot?.summary
  ].filter(Boolean).join(" ");
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function splitToolHints(value) {
  if (Array.isArray(value)) {
    return value.flatMap(splitToolHints);
  }

  return cleanText(value)
    .split(/[;\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeSource(source = {}) {
  const base = {
    id: source.id || source.external_id || source.externalId || "",
    title: source.title || source.url || source.file_url || "Источник",
    fileUrl: source.fileUrl || source.file_url || source.url || "",
    type: source.source_kind || source.sourceKind || source.type || "document",
    contentText: sourceReadableContent(source),
    aiSummary: source.ai_summary || source.aiSummary || source.summary || "",
    relatedLayers: source.related_layers || source.relatedLayers || [],
    sourceMeta: source.source_meta || source.sourceMeta || {}
  };

  if (isBusinessArchitectureReferenceSource(base)) {
    return {
      ...base,
      relatedLayers: [],
      sourceMeta: {
        ...base.sourceMeta,
        referenceCatalog: true,
        toolMatches: [],
        contentMatches: []
      }
    };
  }

  return {
    ...base,
    sourceMeta: {
      ...base.sourceMeta,
      toolMatches: asArray(base.sourceMeta.toolMatches).length
        ? asArray(base.sourceMeta.toolMatches)
        : matchBusinessArchitectureToolsForSource(base),
      contentMatches: asArray(base.sourceMeta.contentMatches).length
        ? asArray(base.sourceMeta.contentMatches)
        : matchBusinessArchitectureContentForSource(base)
    }
  };
}

function sourceToolMatches(source) {
  return asArray(source.sourceMeta?.toolMatches);
}

function sourceContentMatches(source) {
  return asArray(source.sourceMeta?.contentMatches);
}

function sameArchitectureItem(match = {}, item = {}) {
  const matchLayer = canonicalArchitectureLayerId(match.layerId || match.layer || match.layerCode);
  const itemLayer = canonicalArchitectureLayerId(item.layerCode || item.layerId || item.layerName);

  return matchLayer === itemLayer &&
    normalizeText(match.parentDomain || "") === normalizeText(item.parentDomain || "") &&
    normalizeText(match.subdomain || match.domain || "") === normalizeText(item.subdomain || item.domain || "");
}

function toolMatchBelongsToItem(match = {}, item = {}) {
  const matchLayer = canonicalArchitectureLayerId(match.layerId || match.layer || match.layerCode);
  const itemLayer = canonicalArchitectureLayerId(item.layerCode || item.layerId || item.layerName);

  if (matchLayer !== itemLayer) {
    return false;
  }

  const matchDomain = normalizeText(match.domain || match.subdomain || "");
  const itemSubdomain = normalizeText(item.subdomain || item.domain || "");
  const itemTools = splitToolHints(item.toolHints).map(normalizeText);
  const matchName = normalizeText([match.name, match.linkLabel].filter(Boolean).join(" "));

  return Boolean(
    (matchDomain && itemSubdomain && (matchDomain === itemSubdomain || matchDomain.includes(itemSubdomain) || itemSubdomain.includes(matchDomain))) ||
    itemTools.some((tool) => tool && matchName && (matchName.includes(tool) || tool.includes(matchName)))
  );
}

function sourceHasReadableBusinessText(source = {}) {
  const words = normalizeText([source.contentText, source.aiSummary].filter(Boolean).join(" "))
    .split(" ")
    .filter((token) => token.length >= 3);

  return words.length >= 12;
}

function assessEvidenceForItem(source, item) {
  const exactContentMatches = sourceContentMatches(source).filter((match) => sameArchitectureItem(match, item));
  const exactToolMatches = sourceToolMatches(source).filter((match) => toolMatchBelongsToItem(match, item));
  const bestContent = exactContentMatches
    .sort((left, right) => Number(right.score || 0) - Number(left.score || 0))[0] || null;

  if (bestContent?.contentQuality === "sufficient") {
    return {
      status: "sufficient",
      label: "заполнение подтверждено",
      summary: "Внутри источника есть данные именно по этому поддомену.",
      reasons: asArray(bestContent.qualityReasons).slice(0, 3),
      missing: [],
      matchType: exactToolMatches.length ? "tool_and_content" : "content"
    };
  }

  if (bestContent?.contentQuality === "partial") {
    return {
      status: "partial",
      label: "нужно дополнить",
      summary: "Данные по поддомену есть, но пока не видно полного результата инструмента.",
      reasons: asArray(bestContent.qualityReasons).slice(0, 3),
      missing: asArray(bestContent.missingEvidence).slice(0, 3),
      matchType: exactToolMatches.length ? "tool_and_partial_content" : "partial_content"
    };
  }

  if (exactToolMatches.length && sourceHasReadableBusinessText(source)) {
    return {
      status: "partial",
      label: "проверить содержание",
      summary: "Название похоже на нужный инструмент, но содержание нужно сверить с поддоменом.",
      reasons: ["найден инструмент из этой строки карты"],
      missing: [
        item.description ? `проверить описание: ${item.description}` : "проверить описание поддомена",
        item.expectedResult ? `проверить результат: ${item.expectedResult}` : "проверить результат инструмента"
      ].slice(0, 2),
      matchType: "tool_title"
    };
  }

  return null;
}

function compactEvidence(source, quality) {
  return {
    id: source.id || "",
    title: source.title || source.fileUrl || "Источник",
    fileUrl: source.fileUrl || "",
    type: source.type || "",
    quality,
    contentPreview: cleanText(source.aiSummary || source.contentText).slice(0, 360)
  };
}

function architectureItemEvidence(item, sources) {
  const entries = sources
    .filter((source) => !source.sourceMeta?.referenceCatalog)
    .map((source) => ({
      source,
      quality: assessEvidenceForItem(source, item)
    }))
    .filter((entry) => entry.quality);

  return {
    confirmedArtifacts: entries
      .filter((entry) => entry.quality.status === "sufficient")
      .map((entry) => compactEvidence(entry.source, entry.quality)),
    incompleteArtifacts: entries
      .filter((entry) => entry.quality.status === "partial" && entry.quality.matchType !== "partial_content")
      .map((entry) => compactEvidence(entry.source, entry.quality)),
    draftSources: entries
      .filter((entry) => entry.quality.status === "partial" && entry.quality.matchType === "partial_content")
      .map((entry) => compactEvidence(entry.source, entry.quality))
  };
}

function architectureItemStatusFromEvidence(evidence) {
  if (evidence.confirmedArtifacts.length) {
    return { code: "covered", label: "подтверждено", percent: 100 };
  }

  if (evidence.incompleteArtifacts.length) {
    return { code: "review", label: "проверить содержание", percent: 45 };
  }

  if (evidence.draftSources.length) {
    return { code: "draft", label: "есть данные, артефакт не собран", percent: 25 };
  }

  return { code: "missing", label: "нет данных", percent: 0 };
}

function buildArchitectureItem({ architectureLayer, domain, subdomain }) {
  return {
    layerCode: architectureLayer.layerId || architectureLayer.layerCode,
    layerId: architectureLayer.layerId,
    layerName: architectureLayer.name,
    parentDomain: domain.title,
    domain: subdomain.title,
    subdomain: subdomain.title,
    description: subdomain.description || domain.description || "",
    action: subdomain.action || domain.action || "",
    expectedResult: subdomain.expectedResult || domain.expectedResult || "",
    toolHints: subdomain.toolHints || domain.toolHints || ""
  };
}

function buildArchitectureCoverage({ architectureLayer, sources }) {
  const domains = (architectureLayer.domains || []).map((domain) => {
    const subdomains = (domain.subdomains || []).map((subdomain) => {
      const item = buildArchitectureItem({ architectureLayer, domain, subdomain });
      const evidence = architectureItemEvidence(item, sources);
      const status = architectureItemStatusFromEvidence(evidence);

      return {
        ...subdomain,
        parentDomain: domain.title,
        recommendedTools: splitToolHints(subdomain.toolHints),
        coverageStatus: status.code,
        coverageLabel: status.label,
        coveragePercent: status.percent,
        evidence
      };
    });
    const percent = subdomains.length
      ? Math.round(subdomains.reduce((sum, item) => sum + Number(item.coveragePercent || 0), 0) / subdomains.length)
      : 0;

    return {
      ...domain,
      subdomains,
      confirmed: subdomains.filter((item) => item.coverageStatus === "covered").length,
      review: subdomains.filter((item) => item.coverageStatus === "review").length,
      draft: subdomains.filter((item) => item.coverageStatus === "draft").length,
      missing: subdomains.filter((item) => item.coverageStatus === "missing").length,
      percent
    };
  });
  const subdomains = domains.flatMap((domain) => domain.subdomains || []);
  const total = subdomains.length;
  const confirmed = subdomains.filter((item) => item.coverageStatus === "covered").length;
  const review = subdomains.filter((item) => item.coverageStatus === "review").length;
  const draft = subdomains.filter((item) => item.coverageStatus === "draft").length;
  const missing = subdomains.filter((item) => item.coverageStatus === "missing").length;
  const percent = total
    ? Math.round(subdomains.reduce((sum, item) => sum + Number(item.coveragePercent || 0), 0) / total)
    : 0;

  return { total, confirmed, review, draft, missing, percent, domains };
}

function decorateCatalogTool(tool = {}) {
  return {
    id: tool.id || tool.slug || tool.name || "",
    title: tool.title || tool.name || "Инструмент",
    description: tool.description || "",
    layerKeys: tool.layer_keys || tool.layerKeys || [],
    category: tool.category || "",
    priority: tool.priority || "",
    url: tool.url || tool.link || ""
  };
}

function buildLayerSnapshot({ architectureLayer, index, sources, observations, answers, catalogTools }) {
  const canonicalLayerKey = canonicalArchitectureLayerId(architectureLayer.layerId || architectureLayer.layerCode);
  const layerObservations = (observations || []).filter((item) =>
    canonicalArchitectureLayerId(item.layer || item.layerKey || item.layer_code) === canonicalLayerKey
  );
  const answer = (answers || []).find((item) =>
    canonicalArchitectureLayerId(item.subject_key || item.subjectKey || item.layerKey) === canonicalLayerKey
  );
  const layerTools = (catalogTools || [])
    .filter((tool) => (tool.layer_keys || tool.layerKeys || [])
      .some((toolLayerKey) => canonicalArchitectureLayerId(toolLayerKey) === canonicalLayerKey))
    .slice(0, 3)
    .map(decorateCatalogTool);
  const architectureCoverage = buildArchitectureCoverage({ architectureLayer, sources });
  const status = architectureCoverage.total > 0 && architectureCoverage.confirmed >= architectureCoverage.total
    ? "ready"
    : architectureCoverage.confirmed > 0 || architectureCoverage.review > 0 || architectureCoverage.draft > 0 || layerObservations.length > 0
      ? "in_progress"
      : "missing";

  return {
    order: index + 1,
    layerKey: canonicalLayerKey,
    canonicalLayerKey,
    classKey: architectureLayer.classId || "",
    title: architectureLayer.name,
    shortDescription: architectureLayer.description || "",
    role: architectureLayer.description || "",
    priorityReason: architectureLayer.action || "",
    architecture: {
      layerId: architectureLayer.layerId,
      description: architectureLayer.description || "",
      action: architectureLayer.action || "",
      expectedResult: architectureLayer.expectedResult || "",
      domainCount: architectureLayer.domainCount || architectureCoverage.domains.length,
      subdomainCount: architectureLayer.subdomainCount || architectureCoverage.total,
      domains: architectureCoverage.domains,
      coverage: {
        total: architectureCoverage.total,
        confirmed: architectureCoverage.confirmed,
        review: architectureCoverage.review,
        draft: architectureCoverage.draft,
        missing: architectureCoverage.missing,
        percent: architectureCoverage.percent
      }
    },
    architectureProgress: {
      total: architectureCoverage.total,
      confirmed: architectureCoverage.confirmed,
      review: architectureCoverage.review,
      draft: architectureCoverage.draft,
      missing: architectureCoverage.missing,
      percent: architectureCoverage.percent
    },
    maturityScore: Number.isFinite(Number(answer?.score)) ? Number(answer.score) : null,
    observationCount: layerObservations.length,
    status,
    requiredArtifacts: [],
    toolCount: layerTools.length,
    recommendedTools: layerTools,
    toolGap: layerTools.length ? null : "Для этого слоя пока нет привязанных инструментов в каталоге."
  };
}

function buildSummary(layers) {
  const totalLayers = layers.length;
  const completedLayers = layers.filter((layer) => layer.status === "ready").length;
  const totalArchitectureItems = layers.reduce((sum, layer) => sum + Number(layer.architectureProgress?.total || 0), 0);
  const confirmedArchitectureItems = layers.reduce((sum, layer) => sum + Number(layer.architectureProgress?.confirmed || 0), 0);
  const reviewArchitectureItems = layers.reduce((sum, layer) => sum + Number(layer.architectureProgress?.review || 0), 0);
  const draftArchitectureItems = layers.reduce((sum, layer) => sum + Number(layer.architectureProgress?.draft || 0), 0);
  const missingArchitectureItems = layers.reduce((sum, layer) => sum + Number(layer.architectureProgress?.missing || 0), 0);
  const percent = totalArchitectureItems > 0
    ? Math.round((confirmedArchitectureItems / totalArchitectureItems) * 100)
    : 0;

  return {
    totalLayers,
    completedLayers,
    artifactProgress: {
      ready: confirmedArchitectureItems,
      total: totalArchitectureItems,
      percent
    },
    architectureProgress: {
      confirmed: confirmedArchitectureItems,
      review: reviewArchitectureItems,
      draft: draftArchitectureItems,
      missing: missingArchitectureItems,
      total: totalArchitectureItems,
      percent
    }
  };
}

function findNextOpenSubdomain(layers) {
  for (const layer of layers) {
    if (layer.status === "ready") {
      continue;
    }

    for (const domain of layer.architecture?.domains || []) {
      for (const subdomain of domain.subdomains || []) {
        if (subdomain.coverageStatus !== "covered") {
          return { layer, domain, subdomain };
        }
      }
    }
  }

  return null;
}

function buildNextRequest(layers) {
  const next = findNextOpenSubdomain(layers);
  if (!next) {
    return {
      status: "complete",
      title: "Архитектура собрана",
      text: "По текущей карте все поддомены подтверждены источниками. Дальше можно переходить к диагностике, приоритетам и управленческим решениям.",
      layer: null,
      artifact: null,
      architectureItem: null,
      route: "/mini-app/ceo"
    };
  }

  const recommendedTool = next.subdomain.recommendedTools?.[0] || next.subdomain.title || "";

  return {
    status: "needs_subdomain",
    title: recommendedTool ? `Заполнить инструмент: ${recommendedTool}` : `Собрать данные: ${next.subdomain.title}`,
    text: [
      `Следующий участок карты: ${next.layer.title} / ${next.domain.title} / ${next.subdomain.title}.`,
      "Нужен конкретный артефакт или факт по компании, который прямо отвечает на этот поддомен."
    ].join(" "),
    layer: {
      layerKey: next.layer.layerKey,
      title: next.layer.title,
      order: next.layer.order
    },
    artifact: null,
    architectureItem: {
      domain: next.domain.title,
      subdomain: next.subdomain.title,
      recommendedTool,
      status: next.subdomain.coverageStatus,
      label: next.subdomain.coverageLabel,
      description: next.subdomain.description || "",
      action: next.subdomain.action || "",
      expectedResult: next.subdomain.expectedResult || ""
    },
    route: "/mini-app/tools"
  };
}

function buildJourneyRows(layer) {
  return (layer.architecture?.domains || []).flatMap((domain) =>
    (domain.subdomains || []).map((subdomain) => ({
      item: {
        layerCode: layer.layerKey,
        layerName: layer.title,
        parentDomain: domain.title,
        domain: subdomain.title,
        subdomain: subdomain.title,
        description: subdomain.description || "",
        action: subdomain.action || "",
        expectedResult: subdomain.expectedResult || "",
        toolHints: (subdomain.recommendedTools || []).join("; "),
        evidence: subdomain.evidence
      },
      status: {
        code: subdomain.coverageStatus,
        label: subdomain.coverageLabel,
        percent: subdomain.coveragePercent
      }
    }))
  );
}

function buildJourney(layers) {
  const journeyLayers = layers.map((layer) => {
    const rows = buildJourneyRows(layer);

    return {
      index: layer.order,
      layerCode: layer.layerKey,
      layerName: layer.title,
      percent: layer.architectureProgress?.percent || 0,
      total: rows.length,
      covered: rows.filter((row) => row.status.code === "covered").length,
      review: rows.filter((row) => row.status.code === "review").length,
      draft: rows.filter((row) => row.status.code === "draft").length,
      missing: rows.filter((row) => row.status.code === "missing").length,
      issueCount: rows.filter((row) => row.status.code !== "covered").length,
      rows
    };
  });
  const currentLayer = journeyLayers.find((layer) => layer.issueCount > 0) || journeyLayers[0] || null;
  const currentRow =
    currentLayer?.rows.find((row) => row.status.code === "review") ||
    currentLayer?.rows.find((row) => row.status.code === "draft") ||
    currentLayer?.rows.find((row) => row.status.code === "missing") ||
    currentLayer?.rows[0] ||
    null;
  const completedLayers = journeyLayers.filter((layer) => layer.percent >= 100 && layer.total > 0).length;
  const coveredItems = journeyLayers.reduce((sum, layer) => sum + layer.covered, 0);
  const totalItems = journeyLayers.reduce((sum, layer) => sum + layer.total, 0);

  return {
    layers: journeyLayers,
    currentLayer,
    currentRow,
    completedLayers,
    coveredItems,
    totalItems,
    percent: totalItems ? Math.round((coveredItems / totalItems) * 100) : 0,
    currentAction: buildJourneyAction(currentRow)
  };
}

function buildJourneyAction(row) {
  if (!row) {
    return {
      title: "Добавить источники по компании",
      text: "Пока нет карты поддоменов или источников, которые можно проверить.",
      action: "source",
      button: "Добавить источник"
    };
  }

  const itemName = row.item.subdomain || row.item.parentDomain || "текущий поддомен";
  const toolHint = row.item.toolHints ? ` Подходящий инструмент: ${row.item.toolHints}.` : "";

  if (row.status.code === "review") {
    return {
      title: `Проверить содержание: ${itemName}`,
      text: `Источник найден, но внутри пока не хватает данных, чтобы подтвердить этот поддомен.${toolHint}`,
      action: "source",
      button: "Добавить источник"
    };
  }

  if (row.status.code === "draft") {
    return {
      title: `Оформить артефакт: ${itemName}`,
      text: `Полезные данные уже встречаются, но нужен отдельный артефакт или явный факт по этому поддомену.${toolHint}`,
      action: "source",
      button: "Добавить источник"
    };
  }

  return {
    title: `Заполнить инструмент: ${itemName}`,
    text: `По этому поддомену пока нет подтвержденных данных.${toolHint}`,
    action: "source",
    button: "Добавить источник"
  };
}

export function buildBusinessArchitectureSnapshot({
  sources = [],
  artifacts = [],
  answers = [],
  observations = [],
  catalogTools = []
} = {}) {
  const normalizedSources = [...sources, ...artifacts].map(normalizeSource);
  const orderedLayers = [
    ...LAYER_ORDER
      .map((layerId) => ARCHITECTURE_TREE.find((layer) => layer.layerId === layerId))
      .filter(Boolean),
    ...ARCHITECTURE_TREE.filter((layer) => !LAYER_ORDER.includes(layer.layerId))
  ];
  const layers = orderedLayers.map((architectureLayer, index) => buildLayerSnapshot({
    architectureLayer,
    index,
    sources: normalizedSources,
    observations,
    answers,
    catalogTools
  }));
  const summary = buildSummary(layers);

  return {
    mode: "evidence_first_business_build",
    title: "Архитектура бизнеса",
    summary: "Карта показывает, какие участки бизнеса уже подтверждены фактами и документами, а какие ещё нужно собрать.",
    storage: {
      title: "Источники и материалы",
      route: "/mini-app/documents"
    },
    ...summary,
    nextRequest: buildNextRequest(layers),
    layers,
    journey: buildJourney(layers),
    updatedAt: new Date().toISOString()
  };
}
