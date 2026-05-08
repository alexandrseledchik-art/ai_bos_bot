import {
  createCompanyAnalysis,
  createLayerAnalysis,
  createToolResult,
  nowIso
} from "../domain/entities.js";
import {
  CONSULTANT_MVP_LAYERS,
  CONSULTANT_TOOL_TEMPLATES
} from "../domain/consultant-mvp-schema.js";
import {
  isBusinessArchitectureReferenceSource,
  matchBusinessArchitectureContentForSource,
  matchBusinessArchitectureToolsForSource
} from "../domain/business-architecture-tool-matcher.js";
import { analyzeDeepDiagnosticSources } from "./deep-diagnostic-analyzer.js";
import { assessDiagnosticExcellence } from "./diagnostic-excellence-assessor.js";

const CONFIDENCE_ORDER = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3
};

const UPPER_FRAME_LAYER_CODES = ["owner_context", "external_environment", "strategy"];
const SAFE_STABILIZATION_LAYER_CODES = ["finance", "team", "operations", "governance", "data_analytics"];

const OWNER_GOAL_SIGNALS = [
  "цель собственника",
  "личный доход",
  "на себя",
  "дивиден",
  "прибыл",
  "1 млн",
  "миллион",
  "выруч",
  "рост",
  "масштаб",
  "горизонт",
  "роль собственника"
];

const MARKET_STRATEGY_SIGNALS = [
  "рынок",
  "спрос",
  "конкурент",
  "сегмент",
  "позиционир",
  "ценностное предложение",
  "стратег",
  "где деньги",
  "где маржа",
  "клиентский поток",
  "модель роста",
  "за счёт чего выигры"
];

const EXPLICIT_UPPER_FRAME_SIGNALS = [
  "внешняя среда не проясн",
  "рынок и спрос",
  "стратегия не постро",
  "условия игры",
  "a-класс",
  "контур собственника",
  "не выбрала точную модель роста",
  "не выбран фокус",
  "прибыльный и управляемый поток"
];

const SOLUTION_FIRST_SIGNALS = [
  "нужна crm",
  "нужен crm",
  "внедрить crm",
  "настроить crm",
  "купить crm",
  "нужен raci",
  "нужна матрица ответственности",
  "нужно нанять",
  "нужен продавец",
  "нужен маркетолог",
  "нужен операционный директор",
  "нужен регламент",
  "нужен дашборд"
];

const PROBLEM_CONTEXT_SIGNALS = [
  "падает",
  "не успе",
  "теря",
  "нет продаж",
  "мало продаж",
  "прибыл",
  "кассов",
  "разрыв",
  "марж",
  "застр",
  "хаос",
  "конфликт",
  "не хватает",
  "не понятно",
  "непонятно",
  "сбой",
  "ручн",
  "перегруз"
];

function cleanText(value) {
  return String(value || "").trim();
}

function normalizeText(value) {
  return cleanText(value).toLowerCase();
}

function unique(items, maxItems = 20) {
  return [...new Set((items || []).map((item) => cleanText(item)).filter(Boolean))].slice(0, maxItems);
}

function splitSentences(value) {
  return cleanText(value)
    .split(/(?<=[.!?。]|[.!?])\s+|\n+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function compactSnippet(value, maxLength = 220) {
  const text = cleanText(value).replace(/\s+/g, " ");
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trim()}…` : text;
}

function humanizeFactForOutput(value) {
  const text = compactSnippet(value, 180)
    .replace(/[“”]/g, "\"")
    .replace(/"{2,}/g, "\"")
    .replace(/,{2,}/g, ",")
    .replace(/,+$/g, "")
    .trim();
  const parts = text
    .replace(/^["']|["']$/g, "")
    .split(",")
    .map((item) => item.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean);

  if (
    parts.length >= 4 &&
    /сегмент|профиль|выруч|роль|запрос|продукт|марж|канал|клиент/i.test(text) &&
    parts.every((part) => part.length <= 48)
  ) {
    return `в источнике есть таблица с полями: ${parts.slice(0, 8).join(", ")}`;
  }

  if (/^сегмент\s+[a-zа-я]/i.test(text.replace(/^["']/, ""))) {
    return `описан клиентский сегмент: ${text.replace(/^["']|["']$/g, "")}`;
  }

  if (/ikigai|икигай/i.test(text)) {
    return `есть артефакт про смысл и фокус бизнеса: ${text.replace(/\.$/, "")}`;
  }

  return text;
}

function joinHumanFacts(facts, maxItems = 2) {
  return (facts || [])
    .slice(0, maxItems)
    .map(humanizeFactForOutput)
    .filter(Boolean)
    .join("; ");
}

function hasAnyTextSignal(text, signals) {
  const normalized = normalizeText(text);
  return signals.some((signal) => normalized.includes(normalizeText(signal)));
}

function layerByCode(layerAnalyses, layerCode) {
  return layerAnalyses.find((item) => item.layerCode === layerCode) || null;
}

function layersByCode(layerAnalyses, layerCodes) {
  return layerCodes
    .map((layerCode) => layerByCode(layerAnalyses, layerCode))
    .filter(Boolean);
}

function totalFacts(layerAnalyses, layerCodes) {
  return layersByCode(layerAnalyses, layerCodes)
    .reduce((sum, item) => sum + (item.facts || []).length, 0);
}

function totalMissingFields(layerAnalyses, layerCodes) {
  return layersByCode(layerAnalyses, layerCodes)
    .reduce((sum, item) => sum + (item.missingFields || []).length, 0);
}

function sourceToText(source) {
  return [
    source.title,
    source.aiSummary,
    source.contentText
  ].filter(Boolean).join("\n");
}

function sourceEvidenceText(source) {
  return [
    source.aiSummary,
    source.contentText
  ].filter(Boolean).join("\n");
}

function shouldPreserveRelatedLayers(source) {
  return source.type === "deep_diagnostic" || Boolean(source.sourceMeta?.deepDiagnostic);
}

function sourceToolMatches(source) {
  return Array.isArray(source?.sourceMeta?.toolMatches) ? source.sourceMeta.toolMatches : [];
}

function sourceContentMatches(source) {
  return Array.isArray(source?.sourceMeta?.contentMatches) ? source.sourceMeta.contentMatches : [];
}

function classifySource(source) {
  if (isBusinessArchitectureReferenceSource(source)) {
    return {
      toolMatches: [],
      contentMatches: [],
      relatedLayers: []
    };
  }

  const toolMatches = matchBusinessArchitectureToolsForSource({
    title: source.title,
    fileUrl: source.fileUrl
  });
  const contentMatches = matchBusinessArchitectureContentForSource({
    contentText: source.contentText,
    aiSummary: source.aiSummary
  });
  const relatedLayers = toolMatches.length
    ? unique(toolMatches.map((match) => match.layerId), 11)
    : unique(contentMatches.map((match) => match.layerId), 11);

  return {
    toolMatches,
    contentMatches,
    relatedLayers: relatedLayers.length ? relatedLayers : detectLayersForText(sourceToText(source))
  };
}

function buildCompanyContextSource(company) {
  const parts = [
    company.description ? `Описание: ${company.description}` : "",
    company.ownerGoal ? `Цель собственника: ${company.ownerGoal}` : "",
    company.currentRequest ? `Текущий запрос: ${company.currentRequest}` : "",
    company.industry ? `Отрасль: ${company.industry}` : ""
  ].filter(Boolean);

  if (!parts.length) {
    return null;
  }

  return {
    id: `company_context_${company.id}`,
    companyId: company.id,
    type: "company_context",
    title: "Профиль компании",
    contentText: parts.join("\n"),
    aiSummary: "",
    relatedLayers: []
  };
}

function detectLayersForText(text) {
  const normalized = normalizeText(text);
  const matched = CONSULTANT_MVP_LAYERS
    .filter((layer) => layer.keywords.some((keyword) => normalized.includes(keyword)))
    .map((layer) => layer.code);

  return unique(matched, 11);
}

const FIELD_ALIASES = {
  "цель собственника": ["цель собственника", "цель владельца", "личная цель", "что хочет собственник"],
  "горизонт": ["горизонт", "период", "через 1 год", "через 3 года", "через 5 лет"],
  "роль собственника": ["роль собственника", "роль владельца", "выход из операционки", "операционк"],
  "ограничения": ["ограничения", "лимит", "красные линии", "нельзя", "не готов"],
  "правила принятия решений": ["правила принятия решений", "как принимаются решения", "decision", "решения принимает"],
  "рынок": ["рынок", "объём рынка", "объем рынка", "tam", "sam", "som"],
  "спрос": ["спрос", "динамика спроса", "сезонность", "заявки"],
  "конкуренты": ["конкуренты", "конкурентная среда", "анализ конкурентов"],
  "внешние ограничения": ["внешние ограничения", "регулятор", "закон", "санкции"],
  "значимые изменения": ["значимые изменения", "изменения рынка", "тренды", "тренд"],
  "возможности / угрозы": ["возможности", "угрозы", "swot"],
  "где играем": ["где играем", "сегмент", "ниша", "рынок"],
  "за счёт чего выигрываем": ["за счёт чего выигрываем", "за счет чего выигрываем", "отличие", "преимущество"],
  "от чего отказываемся": ["от чего отказываемся", "не берем", "не берём", "отказываемся"],
  "главный фокус": ["главный фокус", "фокус", "приоритет"],
  "тип роста": ["тип роста", "модель роста", "рост"],
  "проблема клиента": ["проблема клиента", "боль клиента", "задача клиента"],
  "ценность": ["ценность", "польза", "ценностное предложение"],
  "причина купить": ["причина купить", "почему покупает", "почему клиент покупает"],
  "доказательство результата": ["доказательство результата", "кейсы", "результат подтвержден", "результат подтверждён"],
  "формат результата": ["формат результата", "результат для клиента", "выходной артефакт"],
  "icp": ["icp", "портрет клиента", "идеальный клиент", "профиль клиента"],
  "критерии качественного лида": ["критерии качественного лида", "качественный лид", "квалификация лида"],
  "каналы": ["каналы", "источники лидов", "канал продаж", "канал привлечения"],
  "сегменты": ["сегменты", "сегмент"],
  "путь клиента до покупки": ["путь клиента до покупки", "customer journey", "путь клиента"],
  "признаки нецелевого потока": ["нецелевой поток", "нецелевые лиды", "признаки нецелевого"],
  "целевой процесс": ["целевой процесс", "процесс должен", "эталонный процесс"],
  "этапы": ["этапы", "шаги процесса", "стадии"],
  "sla": ["sla", "срок реакции", "срок выполнения"],
  "пропускная способность": ["пропускная способность", "мощность", "capacity"],
  "узкие места": ["узкие места", "бутылочное горлышко", "застревает"],
  "критерии качества": ["критерии качества", "качество выполнения", "стандарт качества"],
  "выручка": ["выручка", "оборот", "revenue"],
  "маржа": ["маржа", "маржинальность", "валовая прибыль"],
  "структура затрат": ["структура затрат", "расходы", "затраты"],
  "денежный поток": ["денежный поток", "cash flow", "кэш флоу", "движение денег"],
  "кассовые риски": ["кассовые риски", "кассовый разрыв", "разрыв денег"],
  "финансовые ограничения": ["финансовые ограничения", "финансовый лимит", "лимит бюджета", "ограничение по деньгам"],
  "роли": ["роли", "должности", "кто что делает"],
  "зоны ответственности": ["зоны ответственности", "ответственность", "raci"],
  "нагрузка": ["нагрузка", "перегруз", "занятость"],
  "компетенции": ["компетенции", "навыки", "квалификация"],
  "узкие места команды": ["узкие места команды", "не хватает людей", "зависимость от человека"],
  "кто принимает решения": ["кто принимает решения", "decision rights", "право решения"],
  "кто отвечает за результат": ["кто отвечает за результат", "ответственный за результат", "accountable"],
  "ритм управления": ["ритм управления", "management cadence", "еженедельный ритм"],
  "контроль": ["контроль", "план-факт", "kpi", "okr"],
  "правила эскалации": ["правила эскалации", "эскалация", "когда поднимать вопрос"],
  "используемые инструменты": ["используемые инструменты", "инструменты", "сервисы"],
  "связность систем": ["связность систем", "интеграции", "системы связаны"],
  "ручной труд": ["ручной труд", "вручную", "ручной перенос"],
  "автоматизация": ["автоматизация", "автоматизировано"],
  "технические ограничения": ["технические ограничения", "технический лимит"],
  "ключевые метрики": ["ключевые метрики", "метрики", "kpi"],
  "источники данных": ["источники данных", "где лежат данные"],
  "отчётность": ["отчётность", "отчетность", "отчёт", "отчет"],
  "единая версия правды": ["единая версия правды", "source of truth", "одна версия правды"],
  "качество данных": ["качество данных", "данные неточные", "ошибка в данных"],
  "регулярность обновления": ["регулярность обновления", "как часто обновляется", "частота обновления"]
};

function looksLikeHeaderOnly(text) {
  const cleaned = cleanText(text);
  const parts = cleaned
    .split(/[,;|\t]+/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (parts.length < 4) {
    return false;
  }

  const hasSpecificValue = /[0-9]/.test(cleaned) || /₽|руб|%|млн|тыс|kpi|cash flow/i.test(cleaned);
  const hasSentenceSignal = /есть|нет|хочет|составляет|раст|пада|сниз|увелич|выбран|описан|зафиксирован|огранич/i.test(cleaned);

  return !hasSpecificValue && !hasSentenceSignal && parts.every((part) => part.length <= 42);
}

function hasSubstantiveSignal(text) {
  return /[0-9]/.test(text) ||
    /₽|руб|%|млн|тыс|есть|нет|хочет|составляет|раст|пада|сниз|увелич|выбран|описан|зафиксирован|огранич|ответствен|проблем|риск|марж|cash flow/i.test(text);
}

function fieldLooksPresent(field, text) {
  const normalized = normalizeText(text);
  const normalizedField = normalizeText(field);
  const aliases = FIELD_ALIASES[normalizedField] || [normalizedField];
  const directHit = aliases.some((alias) => normalized.includes(normalizeText(alias)));

  if (!directHit) {
    return false;
  }

  if (looksLikeHeaderOnly(text)) {
    return false;
  }

  if (hasSubstantiveSignal(text)) {
    return true;
  }

  const fieldTokens = normalizedField
    .split(/[^а-яa-z0-9]+/i)
    .map((item) => item.trim())
    .filter((item) => item.length >= 4);

  return fieldTokens.length <= 1 && directHit;
}

function evidenceForField(field, facts) {
  return (facts || []).find((fact) => fieldLooksPresent(field, fact)) || "";
}

function extractLayerFacts({ layer, sources }) {
  const facts = [];
  const sourceIds = new Set();

  for (const source of sources) {
    const evidenceText = sourceEvidenceText(source);
    const normalized = normalizeText(evidenceText);
    const toolMatches = sourceToolMatches(source);
    const contentMatches = sourceContentMatches(source);
    const toolLayerHit = toolMatches.some((match) => match.layerId === layer.code);
    const contentLayerHit = contentMatches.some((match) => match.layerId === layer.code);
    const explicitRelated = (source.relatedLayers || []).includes(layer.code);
    const keywordHit = !toolMatches.length && !contentMatches.length && layer.keywords.some((keyword) => normalized.includes(keyword));

    if (!evidenceText.trim()) {
      continue;
    }

    if (toolMatches.length && (!toolLayerHit || !contentLayerHit)) {
      continue;
    }

    if (!toolMatches.length && !contentLayerHit && !explicitRelated && !keywordHit) {
      continue;
    }

    const sentence = splitSentences(evidenceText).find((item) => {
      const normalizedSentence = normalizeText(item);
      return layer.keywords.some((keyword) => normalizedSentence.includes(keyword));
    }) || evidenceText;

    facts.push(compactSnippet(sentence));
    sourceIds.add(source.id);
  }

  return {
    facts: unique(facts, 8),
    sourceIds: [...sourceIds]
  };
}

function buildReferenceAndToolFields({ layer, facts }) {
  const filledFields = {};
  const missingFields = [];

  for (const field of layer.referenceFields) {
    const fieldEvidence = evidenceForField(field, facts);
    if (fieldEvidence) {
      filledFields[field] = compactSnippet(fieldEvidence, 180);
    } else {
      missingFields.push(field);
    }
  }

  const referenceModel = Object.fromEntries(
    layer.referenceFields.map((field) => [
      field,
      filledFields[field] || ""
    ])
  );

  return {
    referenceModel,
    filledFields,
    missingFields
  };
}

function confidenceForLayer(facts, filledFields, sourceIds) {
  if (facts.length >= 3 && Object.keys(filledFields).length >= 3 && sourceIds.length >= 2) {
    return "HIGH";
  }

  if (facts.length >= 1 || Object.keys(filledFields).length >= 1) {
    return "MEDIUM";
  }

  return "LOW";
}

function buildGaps(layer, missingFields, facts) {
  const gaps = [];

  if (!facts.length) {
    gaps.push(`По области "${layer.name}" пока нет фактов в данных компании.`);
  }

  if (missingFields.length) {
    gaps.push(`Не хватает точки сравнения: ${missingFields.slice(0, 4).join(", ")}.`);
  }

  return gaps;
}

function buildConclusion(layer, facts, missingFields) {
  if (!facts.length) {
    return `По области "${layer.name}" пока нельзя сделать честный вывод: не хватает фактов и понятной точки сравнения.`;
  }

  if (missingFields.length) {
    return `По области "${layer.name}" уже есть часть данных, но пока не до конца понятно, с чем сравнивать реальность.`;
  }

  return `По области "${layer.name}" есть базовые данные, поэтому можно делать первичный вывод.`;
}

function layerPriorityBoost(layerCode, companyText) {
  const text = normalizeText(companyText);
  const boosts = {
    owner_context: ["собственник", "цель", "решени", "приоритет"],
    external_environment: ["рынок", "спрос", "конкурент"],
    strategy: ["стратег", "ниша", "фокус", "рост"],
    product: ["продукт", "оффер", "куп", "ценност"],
    commercial: ["лид", "заявк", "продаж", "канал", "icp", "конверс"],
    operations: ["теря", "передач", "производств", "исполн", "срок", "процесс"],
    finance: ["прибыл", "выруч", "марж", "касс", "деньг"],
    team: ["команд", "менеджер", "нагруз", "сотрудник"],
    governance: ["ответствен", "контроль", "стык", "решени", "управлен"],
    technology: ["crm", "инструмент", "автоматизац", "таблиц"],
    data_analytics: ["данн", "метрик", "отчет", "причин отказ", "аналит"]
  };

  return (boosts[layerCode] || []).reduce((score, keyword) => score + Number(text.includes(keyword)), 0);
}

function detectUpperFramePriority({ companyText, layerAnalyses }) {
  const ownerGoalVisible = hasAnyTextSignal(companyText, OWNER_GOAL_SIGNALS);
  const marketOrStrategyVisible = hasAnyTextSignal(companyText, MARKET_STRATEGY_SIGNALS);
  const explicitlyUpper = hasAnyTextSignal(companyText, EXPLICIT_UPPER_FRAME_SIGNALS);
  const upperFacts = totalFacts(layerAnalyses, UPPER_FRAME_LAYER_CODES);
  const upperMissing = totalMissingFields(layerAnalyses, UPPER_FRAME_LAYER_CODES);

  return Boolean(
    (ownerGoalVisible && marketOrStrategyVisible && upperFacts >= 2) ||
    (explicitlyUpper && upperFacts >= 1) ||
    (ownerGoalVisible && explicitlyUpper && upperMissing >= 4)
  );
}

function detectSolutionFirstPriority(companyText) {
  const hasSolution = hasAnyTextSignal(companyText, SOLUTION_FIRST_SIGNALS);
  const hasProblemContext = hasAnyTextSignal(companyText, PROBLEM_CONTEXT_SIGNALS);

  return hasSolution && !hasProblemContext;
}

function buildSolutionFirstConstraint(companyText) {
  const mentionsCrm = hasAnyTextSignal(companyText, ["crm"]);
  const toolName = mentionsCrm ? "CRM" : "инструмент";

  return {
    layer: "",
    layerName: "Проблема за предложенным решением",
    title: `Сначала нужно определить проблему за запросом на ${toolName}`,
    explanation: `Запрос звучит как готовое решение, а не как диагностированная причина. Этот инструмент может быть полезен, но сначала нужно понять, какой разрыв он должен закрыть: качество лидов, обработку заявок, передачу ответственности, контроль, данные или управленческий ритм.`,
    cause: "Пока не доказано, какой управленческий или процессный разрыв стоит за предложенным решением.",
    effects: [
      "можно автоматизировать хаос вместо процесса",
      "можно потратить ресурс на инструмент, который не меняет ограничение",
      "можно закрепить неправильную логику продаж, операций или контроля"
    ],
    confidence: "LOW",
    mode: "solution_first",
    missingForHigh: [
      "какую проблему должен решить инструмент",
      "где сейчас теряется результат",
      "какой процесс или решение должен поддержать инструмент",
      "какой факт покажет, что проблема действительно в инструменте"
    ],
    relatedLayers: [
      { layer: "commercial", layerName: "Коммерция", confidence: "LOW", missingFields: ["критерии качественного лида", "путь клиента до покупки"] },
      { layer: "operations", layerName: "Операции", confidence: "LOW", missingFields: ["целевой процесс", "этапы"] },
      { layer: "governance", layerName: "Управление", confidence: "LOW", missingFields: ["кто принимает решения", "кто отвечает за результат"] },
      { layer: "technology", layerName: "Технологии", confidence: "LOW", missingFields: ["целевая архитектура инструментов"] },
      { layer: "data_analytics", layerName: "Данные и аналитика", confidence: "LOW", missingFields: ["ключевые метрики", "источники данных"] }
    ],
    rejectedAlternatives: [
      {
        layer: "technology",
        layerName: "Технологии",
        reason: `Пока рано считать корнем сами технологии: сначала нужно доказать, что ${toolName} закрывает реальный разрыв, а не просто переносит хаос в систему.`
      }
    ],
    parallelActions: []
  };
}

function buildParallelActions({ layerAnalyses, companyText }) {
  const text = normalizeText(companyText);
  const actions = [];
  const addAction = (action) => {
    if (!actions.some((item) => item.layer === action.layer)) {
      actions.push(action);
    }
  };

  const finance = layerByCode(layerAnalyses, "finance");
  if (finance?.facts.length || hasAnyTextSignal(text, ["финанс", "марж", "cash flow", "кэш", "дебитор", "выруч", "прибыл", "деньг"])) {
    addAction({
      layer: "finance",
      layerName: "Финансы",
      title: "Запустить управленческую финансовую отчётность",
      description: "Назначить ответственного за короткий срез: выручка, маржа, расходы, cash flow, дебиторка и кассовые риски.",
      why: "Это не подменяет выбор стратегии, а даёт факты, без которых нельзя понять, какой рост реально выгоден и безопасен.",
      resultFormat: "Таблица или отчёт по деньгам и марже в разрезе клиентов, услуг или заявок."
    });
  }

  const team = layerByCode(layerAnalyses, "team");
  if (team?.facts.length || hasAnyTextSignal(text, ["роль", "должност", "команд", "кто что делает", "нагруз", "ответствен"])) {
    addAction({
      layer: "team",
      layerName: "Команда",
      title: "Описать фактические роли и профили должностей",
      description: "Зафиксировать, кто что реально делает сейчас, где пересечения, перегруз и размытая ответственность.",
      why: "Это можно делать параллельно: карта ролей не закрепляет стратегию, а показывает, на чём фактически держится система.",
      resultFormat: "Карта текущих ролей: роль, задачи, зона ответственности, перегруз, зависимость от конкретного человека."
    });
  }

  const operations = layerByCode(layerAnalyses, "operations");
  if (operations?.facts.length || hasAnyTextSignal(text, ["заявк", "заказ", "процесс", "перевоз", "исполн", "операцион", "передач", "сбой"])) {
    addAction({
      layer: "operations",
      layerName: "Операции",
      title: "Описать текущий путь заявки или заказа",
      description: "Разобрать несколько последних заявок от входа до результата: кто принял, кто передал, где задержка, чем закончилось.",
      why: "Это даст факты о прохождении потока и не требует заранее выбирать финальную операционную модель.",
      resultFormat: "Карта 5-10 заявок с этапами, ответственными, задержками, потерями и итогом."
    });
  }

  const data = layerByCode(layerAnalyses, "data_analytics");
  if (data?.facts.length || hasAnyTextSignal(text, ["данн", "отчёт", "отчет", "аналит", "метрик", "дашборд", "единая картина"])) {
    addAction({
      layer: "data_analytics",
      layerName: "Данные и аналитика",
      title: "Определить одну версию правды по ключевым цифрам",
      description: "Понять, где лежат основные цифры, кто их обновляет и каким источникам можно доверять.",
      why: "Это снижает риск спорить об ощущениях вместо фактов и помогает проверять любые гипотезы быстрее.",
      resultFormat: "Список ключевых метрик, источников, ответственных и частоты обновления."
    });
  }

  const governance = layerByCode(layerAnalyses, "governance");
  if (governance?.facts.length || hasAnyTextSignal(text, ["управлен", "контроль", "решени", "plan", "review", "kpi", "ответствен"])) {
    addAction({
      layer: "governance",
      layerName: "Управление",
      title: "Собрать минимальный управленческий ритм",
      description: "Определить, какие цифры, решения, риски и ответственные смотрим каждую неделю.",
      why: "Это удерживает текущую работу в управлении, пока уточняется цель, рынок и стратегия роста.",
      resultFormat: "Еженедельный список вопросов: деньги, продажи, заявки, сбои, решения, ответственные, риски."
    });
  }

  return actions
    .sort((left, right) => {
      const leftIndex = SAFE_STABILIZATION_LAYER_CODES.indexOf(left.layer);
      const rightIndex = SAFE_STABILIZATION_LAYER_CODES.indexOf(right.layer);
      return (leftIndex === -1 ? 99 : leftIndex) - (rightIndex === -1 ? 99 : rightIndex);
    })
    .slice(0, 3);
}

function buildRejectedAlternatives(layerAnalyses) {
  const labels = {
    finance: "Финансы",
    operations: "Операции",
    team: "Команда",
    governance: "Управление",
    data_analytics: "Данные и аналитика",
    technology: "Технологии",
    commercial: "Коммерция"
  };

  return ["finance", "operations", "team", "governance", "data_analytics", "technology", "commercial"]
    .map((layerCode) => layerByCode(layerAnalyses, layerCode))
    .filter((item) => item && ((item.facts || []).length || (item.missingFields || []).length >= 4))
    .map((item) => ({
      layer: item.layerCode,
      layerName: labels[item.layerCode] || item.layerName,
      reason: `Область "${labels[item.layerCode] || item.layerName}" важна, но сейчас больше похожа на симптом или источник фактов. Сначала нужно понять общую рамку: цель собственника, рынок и стратегию.`
    }))
    .slice(0, 4);
}

function buildGeneralRejectedAlternatives(primary, alternatives = []) {
  return alternatives
    .filter((item) => item.layerCode !== primary.layerCode)
    .map((item) => ({
      layer: item.layerCode,
      layerName: item.layerName,
      score: item.score,
      reason: `Область "${item.layerName}" остаётся возможной версией, но сейчас объясняет запрос слабее: меньше прямых данных, ниже уверенность или меньше связи с текущей целью.`
    }));
}

function buildGeneralRelatedLayers(primary, alternatives = []) {
  return [primary, ...alternatives].map((item) => ({
    layer: item.layerCode,
    layerName: item.layerName,
    confidence: item.confidence,
    factsCount: (item.facts || []).length,
    facts: (item.facts || []).slice(0, 3),
    missingFields: item.missingFields || []
  }));
}

const PROBLEM_TITLES_BY_LAYER = {
  owner_context: "Не до конца зафиксирована рамка собственника",
  external_environment: "Не до конца понятна рыночная реальность",
  strategy: "Не выбран стратегический фокус",
  product: "Не до конца ясно, какую ценность и для кого упаковываем",
  commercial: "Не доказан подходящий клиентский поток",
  operations: "Не описан путь заявки или заказа до результата",
  finance: "Нет достаточной управленческой картины по деньгам",
  team: "Не ясны роли, нагрузка и зоны ответственности",
  governance: "Не закреплены правила решений и контроля",
  technology: "Не ясно, какие инструменты должны поддерживать поток",
  data_analytics: "Нет единой версии правды по ключевым цифрам"
};

function problemTitleForLayer(layerAnalysis) {
  return PROBLEM_TITLES_BY_LAYER[layerAnalysis.layerCode] || `Есть напряжение в области "${layerAnalysis.layerName}"`;
}

function problemWhyForLayer(layerAnalysis) {
  const missing = layerAnalysis.missingFields || [];
  const hasFacts = (layerAnalysis.facts || []).length > 0;

  if (!hasFacts) {
    return `Пока не хватает фактов по этой области. Без них нельзя честно понять, является ли она причиной проблемы или просто фоном.`;
  }

  if (missing.length) {
    return `Есть сигналы, но не хватает точки сравнения: ${missing.slice(0, 3).join(", ")}. Поэтому вывод по этой области пока рабочий, а не окончательный.`;
  }

  return "По этой области уже есть опоры в данных. Её стоит держать в поле зрения при выборе главного ограничения.";
}

function buildUpperFrameConstraint({ companyText, layerAnalyses }) {
  const upperLayers = layersByCode(layerAnalyses, UPPER_FRAME_LAYER_CODES);
  const parallelActions = buildParallelActions({ layerAnalyses, companyText });
  const rejectedAlternatives = buildRejectedAlternatives(layerAnalyses);
  const evidence = upperLayers.flatMap((item) => item.facts || []).slice(0, 4);
  const relatedLayers = upperLayers.map((item) => ({
    layer: item.layerCode,
    layerName: item.layerName,
    confidence: item.confidence,
    missingFields: item.missingFields || []
  }));

  const confidence = evidence.length >= 3 ? "MEDIUM" : "LOW";

  return {
    layer: "owner_context",
    layerName: "Условия игры",
    title: "Не собрана общая рамка: чего хочет собственник, где рынок и какая стратегия",
    explanation: [
      "Сейчас проблема выглядит не как поломка одной функции, а как нехватка общей рамки: что именно считается успехом для собственника, на каком рынке компания играет и за счёт чего собирается выигрывать.",
      "Пока это не прояснено, финансы, операции, команда и данные нельзя честно назвать корневой причиной: они могут быть следствиями того, что направление сверху ещё не выбрано.",
      parallelActions.length
        ? "При этом практические вещи не откладываем: можно параллельно собирать управленческую отчётность, роли, путь заявки и данные, которые снизят хаос."
        : ""
    ].filter(Boolean).join(" "),
    cause: "Пока не зафиксирована простая связка: цель собственника, горизонт, роль и ограничения плюс рыночные сегменты, спрос, маржа, конкуренция и отличие.",
    effects: [
      "Стратегия, ICP, продуктовая упаковка и модель роста остаются размытыми.",
      "Финансы показывают не только денежную проблему, но и нехватку фактов о том, какой поток действительно выгоден.",
      "Операции, команда и данные могут проседать из-за того, что не выбран клиентский поток и правила управления."
    ],
    confidence,
    missingForHigh: [
      "зафиксировать цель собственника, горизонт, роль, допустимый риск и ограничения",
      "выделить 5-7 рыночных или клиентских сегментов",
      "оценить сегменты по спросу, марже, повторяемости, конкуренции, кассовому риску и операционной сложности"
    ],
    selectionBasis: [
      "Сначала нужно понять, чего хочет собственник, где есть рынок и за счёт чего компания собирается выигрывать.",
      "По этим темам уже есть часть данных, но они пока не собраны в ясную рабочую рамку.",
      "Финансы, команда и процессы важны, но сейчас они могут быть следствием невыбранного направления."
    ],
    mode: "upper_frame",
    relatedLayers,
    evidence,
    rejectedAlternatives,
    parallelActions
  };
}

function buildKeyProblemAreas(layerAnalyses) {
  return layerAnalyses
    .filter((item) => item.facts.length || item.missingFields.length >= 4)
    .map((item) => ({
      title: problemTitleForLayer(item),
      layer: item.layerCode,
      layerName: item.layerName,
      whyImportant: problemWhyForLayer(item),
      evidence: item.facts.slice(0, 2),
      confidence: item.confidence
    }))
    .slice(0, 5);
}

function missingWhyForLayer(layerAnalysis) {
  const labels = {
    owner_context: "Эти данные нужны, чтобы понять, ради чего собственник строит бизнес и какие решения можно принимать ниже.",
    external_environment: "Эти данные нужны, чтобы не строить стратегию на ощущениях о рынке, спросе и конкурентах.",
    strategy: "Эти данные нужны, чтобы понять, где компания играет, за счёт чего выигрывает и от чего сознательно отказывается.",
    product: "Эти данные нужны, чтобы проверить, есть ли у клиента понятная причина купить именно этот продукт.",
    commercial: "Эти данные нужны, чтобы отличить проблему спроса, сегмента, канала и обработки заявок.",
    operations: "Эти данные нужны, чтобы увидеть, где поток задач или заказов реально застревает.",
    finance: "Эти данные нужны, чтобы понять, какой рост выгоден, безопасен и не создаёт кассовый риск.",
    team: "Эти данные нужны, чтобы увидеть, на ком держится система и где возникает перегруз.",
    governance: "Эти данные нужны, чтобы понять, кто принимает решения, кто отвечает за результат и где теряется контроль.",
    technology: "Эти данные нужны, чтобы понять, помогают ли инструменты потоку или просто автоматизируют хаос.",
    data_analytics: "Эти данные нужны, чтобы решения принимались по одной версии правды, а не по разным таблицам и ощущениям."
  };

  return labels[layerAnalysis.layerCode] || `Эти данные нужны, чтобы сравнить реальность со слоем "${layerAnalysis.layerName}" и не перепутать причину со следствием.`;
}

function buildPrioritizedMissingData({ layerAnalyses, probableConstraint }) {
  const priorityCodes = new Set();

  if (probableConstraint.mode === "upper_frame") {
    UPPER_FRAME_LAYER_CODES.forEach((code) => priorityCodes.add(code));
  } else if (probableConstraint.layer) {
    priorityCodes.add(probableConstraint.layer);
  }

  for (const item of probableConstraint.relatedLayers || []) {
    if (item.layer) {
      priorityCodes.add(item.layer);
    }
  }

  const prioritized = layerAnalyses
    .filter((item) => item.missingFields.length)
    .map((item) => ({
      item,
      score:
        (priorityCodes.has(item.layerCode) ? 10 : 0) +
        (item.facts || []).length * 2 +
        Math.min(item.missingFields.length, 6)
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, 6);

  return prioritized.map(({ item }) => ({
    layer: item.layerCode,
    layerName: item.layerName,
    missingFields: item.missingFields.slice(0, 6),
    whyNeeded: missingWhyForLayer(item)
  }));
}

function selectConstraint({ company, sources, layerAnalyses }) {
  const companyText = [
    company.description,
    company.ownerGoal,
    company.currentRequest,
    ...sources.map((source) => sourceToText(source))
  ].join("\n");

  if (detectSolutionFirstPriority(companyText)) {
    return buildSolutionFirstConstraint(companyText);
  }

  if (detectUpperFramePriority({ companyText, layerAnalyses })) {
    return buildUpperFrameConstraint({ companyText, layerAnalyses });
  }

  const ranked = layerAnalyses
    .map((item) => {
      const confidenceWeight = CONFIDENCE_ORDER[item.confidence] || 1;
      const score =
        item.facts.length * 2 +
        Math.max(0, 6 - item.missingFields.length) * 0.25 +
        confidenceWeight +
        layerPriorityBoost(item.layerCode, companyText);

      return { ...item, score };
    })
    .sort((left, right) => right.score - left.score);

  const primary = ranked[0] || null;
  if (!primary || primary.score <= 1) {
    return {
      layer: "",
      layerName: "",
      title: "Пока недостаточно данных для выбора главного ограничения",
      explanation: "В данных не хватает фактов, чтобы отличить причину от следствия.",
      cause: "Недостаточно подтверждённых фактов и понятных точек сравнения по ключевым областям.",
      effects: [],
      confidence: "LOW",
      missingForHigh: ["добавить факты по текущему запросу", "зафиксировать, с чем сравниваем реальность"]
    };
  }

  const alternatives = ranked.slice(1, 3).filter((item) => item.score > 1);
  const rejectedAlternatives = buildGeneralRejectedAlternatives(primary, alternatives);
  const relatedLayers = buildGeneralRelatedLayers(primary, alternatives);
  const safeParallelActions = buildParallelActions({ layerAnalyses, companyText })
    .filter((action) => action.layer !== primary.layerCode)
    .slice(0, 3);
  const explanation = [
    `Сильнее всего текущий запрос сейчас объясняет область "${primary.layerName}".`,
    primary.facts.length ? `В данных есть прямые опоры: ${joinHumanFacts(primary.facts, 2)}.` : "",
    alternatives.length
      ? `Другие возможные версии пока слабее: ${alternatives.map((item) => item.layerName).join(", ")}.`
      : "Других сильных версий пока не видно."
  ].filter(Boolean).join(" ");

  return {
    layer: primary.layerCode,
    layerName: primary.layerName,
    title: primary.layerName,
    explanation,
    cause: primary.missingFields.length
      ? `Не хватает понятной точки сравнения по полям: ${primary.missingFields.slice(0, 3).join(", ")}.`
      : `Данные указывают, что разрыв может быть в том, как результат проходит через эту область.`,
    effects: primary.gaps.slice(0, 3),
    confidence: primary.confidence,
    mode: "layer_hypothesis",
    relatedLayers,
    evidence: primary.facts.slice(0, 4),
    selectionBasis: [
      `Область "${primary.layerName}" сильнее других связана с текущим запросом.`,
      primary.facts.length
        ? `Есть прямые опоры в данных: ${joinHumanFacts(primary.facts, 2)}.`
        : "Прямых фактов ещё мало, но эта область лучше других связана с текущим запросом.",
      primary.missingFields.length
        ? `Главный пробел: не хватает ясности по ${primary.missingFields.slice(0, 3).join(", ")}.`
        : "Минимальная точка сравнения уже частично собрана."
    ],
    rejectedAlternatives,
    parallelActions: safeParallelActions,
    missingForHigh: primary.confidence === "HIGH"
      ? []
      : [
          "добавить 3-5 конкретных фактов по этой области",
          "сравнить фактический поток с понятной точкой сравнения",
          "проверить, не объясняется ли симптом слоем выше"
        ]
  };
}

function buildNextStep(constraint) {
  if (constraint.mode === "solution_first") {
    return {
      title: "Разобрать 5 последних ситуаций, где инструмент должен был бы помочь.",
      description: "Выписать для каждой ситуации: что произошло, где потерялся результат, кто участвовал, какая информация была нужна и какое решение не было принято вовремя.",
      why: "Это покажет, проблема действительно в инструменте или выше: в процессе, ответственности, данных, критериях качества потока или управлении.",
      expectedResult: "Станет понятно, какой разрыв нужно закрыть и нужен ли для этого именно инструмент.",
      successCriteria: "Есть 5 примеров с понятным местом потери результата и предварительным выводом: технология, процесс, ответственность, данные или коммерция.",
      basis: [
        "Пользователь принёс готовое решение, а не доказанную причину.",
        "Первым шагом нужно проверить, какой разрыв это решение должно закрыть.",
        "Этот шаг дешёвый, обратимый и быстро отделяет инструмент от реальной управленческой проблемы."
      ]
    };
  }

  if (constraint.mode === "upper_frame") {
    return {
      title: "Собрать одну страницу: цель собственника и 5-7 рыночных сегментов.",
      description: "Зафиксировать цель, горизонт, роль, риск и ограничения собственника; затем оценить 5-7 сегментов по спросу, марже, повторяемости, конкуренции, cash flow и операционной сложности.",
      why: "Это самый короткий способ понять, какой бизнес мы строим, на каких клиентах он должен зарабатывать и какие процессы, люди и деньги под это реально нужны.",
      expectedResult: "Появится рабочая картина: какие клиентские потоки стоит усиливать, какие отсекать и какие факты нужны для стратегии.",
      successCriteria: "Есть рамка собственника и сегментная таблица, по которым можно выбрать 1-2 приоритетных клиентских потока для проверки.",
      basis: [
        "Основная версия сейчас связана с тремя вопросами: чего хочет собственник, где есть рынок и какая стратегия выигрыша.",
        "Без этого нельзя понять, какие финансы, процессы, роли и инструменты действительно нужны.",
        "Шаг даёт точку сравнения для дальнейших решений и не требует сразу перестраивать бизнес."
      ]
    };
  }

  if (!constraint.layer) {
    return {
      title: "Добавить один конкретный факт по текущей компании",
      description: "Коротко описать ситуацию: что происходит, где видно напряжение, какая цифра или пример это подтверждает.",
      why: "Это минимальный шаг, чтобы AI-BOSS начал отличать симптом от причины.",
      expectedResult: "Появится первый слой, который можно проверять как возможное ограничение.",
      successCriteria: "Есть факт, связанный с конкретным процессом, метрикой, ролью или решением."
    };
  }

  const stepByLayer = {
    commercial: "Разобрать 10 последних лидов: источник, сегмент, запрос, качество, причина отказа и исход.",
    operations: "Описать путь 5 последних заявок от входа до передачи в исполнение.",
    governance: "Зафиксировать, кто принимает решение, кто отвечает за результат и где сейчас теряется контроль.",
    finance: "Собрать короткий срез денег: выручка, маржа, основные расходы, кассовый остаток и риск разрыва.",
    data_analytics: "Определить одну версию правды: где лежат ключевые цифры и каким данным можно доверять.",
    owner_context: "Зафиксировать цель собственника, горизонт и 3 правила принятия решений.",
    strategy: "Выбрать один стартовый сегмент и явно записать, от каких сегментов сейчас отказываемся.",
    product: "Сформулировать проблему клиента, обещанный результат и доказательство, почему клиент должен купить.",
    team: "Разложить текущую нагрузку по ролям: кто что делает, где перегруз и что держится на одном человеке.",
    technology: "Выписать, какие инструменты участвуют в текущем процессе и где есть ручной перенос данных.",
    external_environment: "Проверить 3-5 внешних факторов: спрос, конкуренты, изменения рынка и ограничения."
  };

  const description = stepByLayer[constraint.layer] || "Проверить один конкретный факт по выбранной области.";

  return {
    title: description,
    description,
    why: `Это самый короткий способ проверить, действительно ли область "${constraint.layerName}" объясняет текущий запрос, а не просто выглядит слабым местом.`,
    expectedResult: "Станет понятно, подтверждается ли текущая версия ограничения или нужно выбрать другую область.",
    successCriteria: "Есть факты, по которым можно сказать: гипотеза подтверждается, не подтверждается или требует уточнения.",
    basis: [
      `Следующий шаг проверяет основную версию: "${constraint.title}".`,
      "Он выбран как минимальная проверка, а не как полноценный проект изменений.",
      "Если шаг не подтвердит гипотезу, AI-BOSS должен пересобрать версию ограничения."
    ]
  };
}

export class CompanyAnalysisCore {
  analyze({ state, companyId }) {
    const company = state.companies.find((item) => item.id === companyId);
    if (!company) {
      throw new Error(`Company not found: ${companyId}`);
    }

    const companyContextSource = buildCompanyContextSource(company);
    const storedSources = (state.companySources || []).filter((source) => source.companyId === companyId);
    const sources = companyContextSource ? [companyContextSource, ...storedSources] : storedSources;

    for (const source of storedSources) {
      if (shouldPreserveRelatedLayers(source)) {
        source.relatedLayers = source.relatedLayers || [];
      } else {
        const classification = classifySource(source);
        source.relatedLayers = classification.relatedLayers;
        source.sourceMeta = {
          ...(source.sourceMeta || {}),
          toolMatches: classification.toolMatches,
          contentMatches: classification.contentMatches
        };
      }
      source.aiSummary = source.aiSummary || compactSnippet(source.contentText, 260);
      source.processingStatus = source.processingStatus || "processed";
      source.processedAt = source.processedAt || nowIso();
      source.updatedAt = nowIso();
    }

    const layerAnalyses = CONSULTANT_MVP_LAYERS.map((layer) => {
      const { facts, sourceIds } = extractLayerFacts({ layer, sources });
      const { referenceModel, filledFields, missingFields } = buildReferenceAndToolFields({ layer, facts });
      const confidence = confidenceForLayer(facts, filledFields, sourceIds);
      const gaps = buildGaps(layer, missingFields, facts);
      const conclusions = [buildConclusion(layer, facts, missingFields)];

      return {
        layerCode: layer.code,
        layerName: layer.name,
        facts,
        referenceModel,
        filledFields,
        missingFields,
        gaps,
        confidence,
        conclusions,
        sourceIds
      };
    });

    const toolResults = layerAnalyses.map((analysis) => {
      const template = CONSULTANT_TOOL_TEMPLATES.find((item) => item.layerCode === analysis.layerCode);
      return {
        toolTemplateId: template.id,
        layerCode: analysis.layerCode,
        filledData: analysis.filledFields,
        missingData: analysis.missingFields,
        confidence: analysis.confidence,
        sourceIds: analysis.sourceIds
      };
    });

    const keyProblemAreas = buildKeyProblemAreas(layerAnalyses);
    const probableConstraint = selectConstraint({ company, sources: storedSources, layerAnalyses });
    const nextStep = buildNextStep(probableConstraint);
    const deepDiagnostic = analyzeDeepDiagnosticSources(storedSources);
    const parallelActions = probableConstraint.parallelActions || [];
    const rejectedHypotheses = probableConstraint.rejectedAlternatives || [];
    const diagnosticChain = probableConstraint.relatedLayers || [];
    const missingData = buildPrioritizedMissingData({ layerAnalyses, probableConstraint });

    const summary = probableConstraint.mode === "upper_frame"
      ? "Главная версия сейчас такая: не собрана общая рамка, которая связывает цель собственника, рынок и стратегию."
      : probableConstraint.layer
      ? `Главная версия сейчас связана с областью "${probableConstraint.layerName}".`
      : "Пока данных недостаточно, чтобы выбрать главное ограничение.";

    const confidence = probableConstraint.confidence || "LOW";
    const analysis = createCompanyAnalysis({
      companyId,
      summary,
      layerSummary: layerAnalyses.map((item) => ({
        layer: item.layerCode,
        layerName: item.layerName,
        factsCount: item.facts.length,
        filledFieldsCount: Object.keys(item.filledFields).length,
        missingFieldsCount: item.missingFields.length,
        confidence: item.confidence,
        conclusion: item.conclusions[0] || ""
      })),
      filledToolsSummary: toolResults.map((item) => ({
        toolTemplateId: item.toolTemplateId,
        layer: item.layerCode,
        filledFieldsCount: Object.keys(item.filledData).length,
        missingFieldsCount: item.missingData.length,
        confidence: item.confidence
      })),
      missingData,
      keyProblemAreas,
      probableConstraint,
      reasoning: probableConstraint.explanation,
      nextStep,
      confidence,
      parallelActions,
      rejectedHypotheses,
      diagnosticChain,
      deepDiagnostic,
      sourceIds: storedSources.map((source) => source.id)
    });
    analysis.diagnosticQuality = assessDiagnosticExcellence({
      company,
      sources,
      layerAnalyses,
      analysis
    });

    state.layerAnalyses = [
      ...(state.layerAnalyses || []).filter((item) => item.companyId !== companyId),
      ...layerAnalyses.map((item) => createLayerAnalysis({ companyId, ...item }))
    ];
    state.toolResults = [
      ...(state.toolResults || []).filter((item) => item.companyId !== companyId),
      ...toolResults.map((item) => createToolResult({ companyId, ...item }))
    ];
    state.companyAnalyses = [...(state.companyAnalyses || []), analysis];

    company.analysisStatus = "analyzed";
    company.lastAnalysisId = analysis.id;
    company.updatedAt = nowIso();

    return {
      analysis,
      layerAnalyses: state.layerAnalyses.filter((item) => item.companyId === companyId),
      toolResults: state.toolResults.filter((item) => item.companyId === companyId)
    };
  }
}

export function detectConsultantLayersForText(text) {
  return detectLayersForText(text);
}

export function classifyConsultantSource(source) {
  return classifySource(source);
}
