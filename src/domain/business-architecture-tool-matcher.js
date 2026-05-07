import { BUSINESS_ARCHITECTURE_ITEMS, BUSINESS_ARCHITECTURE_TOOLS } from "./business-architecture-knowledge.js";

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replaceAll("ё", "е")
    .replace(/[^а-яa-z0-9]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value) {
  const stopWords = new Set([
    "для",
    "или",
    "как",
    "что",
    "это",
    "при",
    "под",
    "над",
    "мой",
    "моя",
    "бизнес",
    "компании",
    "компания",
    "консалтинг",
    "александр",
    "селедчик",
    "управленческий",
    "собственник",
    "собственника",
    "клиент",
    "клиенты",
    "клиента",
    "клиентов",
    "клиентский",
    "клиентская",
    "клиентские",
    "решение",
    "решения",
    "варианты",
    "поиск",
    "продукт",
    "продукта",
    "продуктом",
    "компетенции",
    "компетенций",
    "компетенция",
    "цели",
    "цель",
    "инструмент",
    "методология",
    "документ",
    "карта",
    "канва",
    "матрица",
    "шаблон",
    "the",
    "and",
    "customer",
    "customers",
    "client",
    "clients",
    "with",
    "for",
    "map",
    "canvas",
    "matrix",
    "roadmap",
    "template"
  ]);

  return normalizeText(value)
    .split(" ")
    .filter((token) => token.length >= 4 && !stopWords.has(token));
}

function aliasParts(value) {
  const text = String(value || "");
  const parentheticalParts = [...text.matchAll(/\(([^)]+)\)/g)]
    .flatMap((match) => {
      const raw = match[1];
      const splitParts = raw.split(",").map((part) => part.trim()).filter(Boolean);
      return [
        raw,
        ...splitParts.filter((part) => /map|canvas|matrix|tam|sam|som|cjm|okr|kpi|raci|rapid|bhag/i.test(part))
      ];
    });

  return [
    text,
    text.replace(/\([^)]*\)/g, ""),
    ...text.split(/[|—–-]/g),
    ...parentheticalParts
  ];
}

function toolAliases(tool) {
  const rawParts = [
    ...aliasParts(tool.name),
    ...aliasParts(tool.linkLabel),
    tool.domain
  ];

  return [...new Set(rawParts.map(normalizeText).filter((part) => part.length >= 7))];
}

function scoreTool(tool, sourceText) {
  const aliases = toolAliases(tool);
  let score = 0;

  for (const alias of aliases) {
    if (sourceText.includes(alias)) {
      score = Math.max(score, alias.length >= 18 ? 12 : 8);
    }

    const aliasTokens = tokens(alias);
    if (!aliasTokens.length) {
      continue;
    }

    const matched = aliasTokens.filter((token) => sourceText.includes(token)).length;
    const required = aliasTokens.length === 1 ? 1 : Math.min(2, aliasTokens.length);
    if (matched >= required) {
      score = Math.max(score, 4 + matched);
    }
  }

  return score;
}

function contentForSource({ contentText = "", aiSummary = "" } = {}) {
  return normalizeText([contentText, aiSummary].filter(Boolean).join(" "));
}

function scoreArchitectureItem(item, sourceContent) {
  if (!sourceContent) {
    return 0;
  }

  const domain = normalizeText(item.domain || "");
  const domainTokens = tokens(item.domain || "");
  const toolHintTokens = tokens(item.toolHints || "");
  const referenceTokens = tokens([
    item.domain,
    item.description,
    item.action,
    item.expectedResult,
    item.toolHints
  ].filter(Boolean).join(" "));

  let score = 0;
  const domainExact = domain.length >= 7 && sourceContent.includes(domain);
  const matchedDomain = domainTokens.filter((token) => sourceContent.includes(token)).length;
  const matchedTools = toolHintTokens.filter((token) => sourceContent.includes(token)).length;
  const matchedReference = referenceTokens.filter((token) => sourceContent.includes(token)).length;
  const requiredDomain = domainTokens.length <= 1 ? 1 : Math.min(2, domainTokens.length);

  if (domainExact) {
    score += 8;
  }

  if (matchedDomain >= requiredDomain) {
    score += 5 + matchedDomain;
  }

  if (matchedTools >= 2) {
    score += 4;
  }

  score += Math.min(6, matchedReference);

  const enoughDomainEvidence = matchedDomain >= requiredDomain && matchedReference >= 3;
  const enoughToolEvidence = matchedTools >= 2 && matchedReference >= 3;
  const enoughExactEvidence = domainExact && matchedReference >= 2;

  return enoughDomainEvidence || enoughToolEvidence || enoughExactEvidence ? score : 0;
}

export function matchBusinessArchitectureContentForSource(source = {}, { limit = 20, threshold = 12 } = {}) {
  const sourceContent = contentForSource(source);
  if (!sourceContent) {
    return [];
  }

  return BUSINESS_ARCHITECTURE_ITEMS
    .map((item) => ({
      item,
      score: scoreArchitectureItem(item, sourceContent)
    }))
    .filter((entry) => entry.score >= threshold)
    .sort((left, right) =>
      right.score - left.score ||
      Number(left.item.number || 0) - Number(right.item.number || 0)
    )
    .slice(0, limit)
    .map(({ item, score }) => ({
      layerId: item.layerId,
      layer: item.layer,
      block: item.block,
      domain: item.domain,
      description: item.description,
      toolHints: item.toolHints,
      sourceRow: item.number,
      score
    }));
}

export function matchBusinessArchitectureToolsForSource({ title = "", fileUrl = "" } = {}, { limit = 8 } = {}) {
  const sourceText = normalizeText([title, fileUrl].filter(Boolean).join(" "));
  if (!sourceText) {
    return [];
  }

  const scored = BUSINESS_ARCHITECTURE_TOOLS
    .map((tool) => ({
      tool,
      score: scoreTool(tool, sourceText)
    }))
    .filter((item) => item.score > 0);
  const maxScore = Math.max(0, ...scored.map((item) => item.score));

  return scored
    .filter((item) => maxScore >= 8 ? item.score >= 8 : item.score > 0)
    .sort((left, right) =>
      right.score - left.score ||
      String(left.tool.status || "").localeCompare(String(right.tool.status || ""), "ru") ||
      String(left.tool.name || "").localeCompare(String(right.tool.name || ""), "ru")
    )
    .slice(0, limit)
    .map(({ tool, score }) => ({
      layerId: tool.layerId,
      layer: tool.layer,
      domain: tool.domain,
      name: tool.name,
      status: tool.status,
      linkLabel: tool.linkLabel,
      url: tool.url,
      sourceRow: tool.sourceRow,
      score
    }));
}
