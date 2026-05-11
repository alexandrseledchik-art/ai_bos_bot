import { CONSULTANT_MVP_LAYERS } from "../domain/consultant-mvp-schema.js";

const CLASS_LABELS = {
  A: "Главные ориентиры",
  B: "Создание ценности и спроса",
  C: "Превращение в результат",
  D: "Устойчивость и управляемость"
};

const LAYER_BY_CODE = new Map(CONSULTANT_MVP_LAYERS.map((layer) => [layer.code, layer]));
const LAYER_ORDER = new Map(CONSULTANT_MVP_LAYERS.map((layer, index) => [layer.code, index]));

function cleanText(value) {
  return String(value ?? "").trim();
}

function scoreValue(value) {
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function formatScore(value) {
  const score = scoreValue(value);
  return score === null ? "нет оценки" : score.toFixed(2).replace(/\.00$/, "");
}

function average(items) {
  const scores = items.map((item) => scoreValue(item.score)).filter((item) => item !== null);
  if (!scores.length) {
    return null;
  }

  return scores.reduce((sum, item) => sum + item, 0) / scores.length;
}

function latestDeepDiagnosticSource(sources = []) {
  return [...sources].reverse().find((source) => source.sourceMeta?.deepDiagnostic?.layerScores?.length) || null;
}

function sortLayers(items = []) {
  return [...items].sort((left, right) => (LAYER_ORDER.get(left.layerCode) ?? 99) - (LAYER_ORDER.get(right.layerCode) ?? 99));
}

function scoreStatus(score) {
  if (score === null || score === undefined) {
    return "нет оценки";
  }
  if (score < 1.5) {
    return "критично";
  }
  if (score < 2) {
    return "зона риска";
  }
  if (score < 3) {
    return "переходная зона";
  }
  return "рабочая опора";
}

function summarizeClass(classKey, layerScores) {
  const layers = sortLayers(layerScores.filter((item) => LAYER_BY_CODE.get(item.layerCode)?.classKey === classKey));
  const avg = average(layers);
  const weakLayers = layers.filter((item) => scoreValue(item.score) !== null && scoreValue(item.score) < 2);

  return {
    classKey,
    title: CLASS_LABELS[classKey],
    averageScore: avg,
    status: scoreStatus(avg),
    layers: layers.map((item) => ({
      layer: item.layerCode,
      layerName: item.layerName,
      score: item.score,
      status: item.status || scoreStatus(item.score)
    })),
    conclusion: buildClassConclusion(classKey, avg, weakLayers)
  };
}

function buildClassConclusion(classKey, avg, weakLayers) {
  const weakNames = weakLayers.map((item) => item.layerName).join(", ");
  if (avg === null) {
    return "По этому классу пока нет оценок.";
  }

  if (classKey === "A") {
    return weakLayers.length
      ? `Нужно прояснить главные ориентиры: ${weakNames}. Без этого легко начать чинить симптомы вместо причины.`
      : "Главные ориентиры выглядят достаточно понятными для следующего управленческого шага.";
  }

  if (classKey === "B") {
    return weakLayers.length
      ? `Есть риск размытого выбора ценности и спроса: ${weakNames}.`
      : "Создание ценности и спроса выглядит как рабочая зона, но её всё равно надо сверять с фактами.";
  }

  if (classKey === "C") {
    return weakLayers.length
      ? `Результат может теряться в исполнении или деньгах: ${weakNames}.`
      : "Поток результата выглядит относительно управляемым.";
  }

  return weakLayers.length
    ? `Устойчивость системы слабая: ${weakNames}. Эти зоны можно стабилизировать параллельно.`
    : "Управляемость и устойчивость выглядят как возможная опора.";
}

function upperFrameWeak(layerScores) {
  const map = new Map(layerScores.map((item) => [item.layerCode, scoreValue(item.score)]));
  return ["owner_context", "external_environment", "strategy"].some((layerCode) => {
    const score = map.get(layerCode);
    return score !== null && score !== undefined && score < 2;
  });
}

function buildStrengths(strongestSubdomains = [], layerScores = []) {
  const strongLayers = layerScores.filter((item) => scoreValue(item.score) !== null && scoreValue(item.score) >= 3);
  const items = [
    ...strongLayers.map((item) => ({
      layer: item.layerCode,
      layerName: item.layerName,
      title: item.layerName,
      score: item.score,
      why: "Слой выглядит как возможная опора по общей оценке."
    })),
    ...strongestSubdomains.slice(0, 6).map((item) => ({
      layer: item.layerCode,
      layerName: item.layerName,
      title: item.name,
      score: item.score,
      why: `Относительно сильный поддомен в слое "${item.layerName}".`
    }))
  ];

  return items.slice(0, 6);
}

function buildWeakZones(weakestSubdomains = [], layerScores = []) {
  const weakLayers = layerScores
    .filter((item) => scoreValue(item.score) !== null && scoreValue(item.score) < 2)
    .map((item) => ({
      layer: item.layerCode,
      layerName: item.layerName,
      title: item.layerName,
      score: item.score,
      why: "Низкая общая оценка слоя: зона может ограничивать систему или быть следствием более общей причины."
    }));

  const weakSubdomains = weakestSubdomains.slice(0, 10).map((item) => ({
    layer: item.layerCode,
    layerName: item.layerName,
    title: item.name,
    score: item.score,
    why: `Слабый поддомен в слое "${item.layerName}".`
  }));

  const seen = new Set();
  return [...weakLayers, ...weakSubdomains].filter((item) => {
    const key = `${item.layer}:${item.title}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  }).slice(0, 12);
}

function safeParallelActions(layerScores) {
  const weak = new Set(layerScores.filter((item) => scoreValue(item.score) !== null && scoreValue(item.score) < 2).map((item) => item.layerCode));
  const actions = [];

  if (weak.has("finance")) {
    actions.push({
      layer: "finance",
      layerName: "Финансы",
      title: "Запустить управленческую финансовую отчётность",
      why: "Это даст факты по марже, cash flow и цели собственника, не подменяя стратегический выбор."
    });
  }

  if (weak.has("team")) {
    actions.push({
      layer: "team",
      layerName: "Команда",
      title: "Описать фактические роли и профили должностей",
      why: "Это покажет, кто что реально делает, где перегруз и где ответственность размыта."
    });
  }

  if (weak.has("operations")) {
    actions.push({
      layer: "operations",
      layerName: "Операции",
      title: "Описать текущий путь заявки или заказа",
      why: "Это даст факты о прохождении потока без преждевременной регламентации всей системы."
    });
  }

  if (weak.has("data_analytics")) {
    actions.push({
      layer: "data_analytics",
      layerName: "Данные и аналитика",
      title: "Определить одну версию правды по ключевым цифрам",
      why: "Это снижает риск принимать решения на ощущениях и спорных данных."
    });
  }

  return actions.slice(0, 4);
}

function selectRootHypothesis(layerScores) {
  const weakUpper = upperFrameWeak(layerScores);
  const weakest = [...layerScores]
    .filter((item) => scoreValue(item.score) !== null)
    .sort((left, right) => scoreValue(left.score) - scoreValue(right.score))[0];

  if (weakUpper) {
    return {
      title: "Неясны цель собственника, рынок и стратегия",
      layer: "owner_context",
      confidence: "MEDIUM",
      why: "Эта версия лучше всего объясняет сразу несколько слабых зон: пока не до конца понятно, чего хочет собственник, на каком рынке компания выигрывает и какие решения из этого следуют. Поэтому финансы, операции, команда, управление и данные могут быть следствиями, а не главной причиной.",
      notRootYet: ["Финансы", "Операции", "Команда", "Данные и аналитика"]
    };
  }

  if (!weakest) {
    return {
      title: "Недостаточно данных для выбора ограничения",
      layer: "",
      confidence: "LOW",
      why: "В диагностике нет оценок, по которым можно построить причинную версию.",
      notRootYet: []
    };
  }

  return {
    title: weakest.layerName,
    layer: weakest.layerCode,
    confidence: scoreValue(weakest.score) < 2 ? "MEDIUM" : "LOW",
    why: `Самая слабая подтверждённая зона по матрице: ${weakest.layerName} (${formatScore(weakest.score)}). Нужно проверить, является ли она причиной или следствием.`,
    notRootYet: []
  };
}

function buildNextStep(rootHypothesis) {
  if (rootHypothesis.layer === "owner_context") {
    return {
      title: "Сформулировать цель собственника и выбрать 5-7 клиентских сегментов для проверки.",
      why: "Это быстрее всего покажет, где есть спрос, маржа, повторяемость, отличие от конкурентов и допустимый риск.",
      result: "Короткая таблица сегментов: кто клиент, какую задачу решает, почему покупает, какая маржа и повторяемость, что мешает продажам."
    };
  }

  if (!rootHypothesis.layer) {
    return {
      title: "Добавить диагностические данные или заполнить матрицу зрелости.",
      why: "Без оценок и фактов AI-BOSS не сможет отличить причину от следствия.",
      result: "Появится первый слой, который можно проверять как возможное ограничение."
    };
  }

  return {
    title: `Проверить слой "${rootHypothesis.title}" на 3-5 конкретных фактах.`,
    why: "Это минимальный шаг, чтобы понять, является ли слабая зона корнем или только симптомом.",
    result: "Подтверждение, опровержение или уточнение рабочей гипотезы."
  };
}

function buildMissingForConfidence(rootHypothesis) {
  if (rootHypothesis.layer === "owner_context") {
    return [
      "цель собственника в измеримом виде",
      "горизонт и допустимый риск",
      "карта рыночных/клиентских сегментов",
      "маржа, повторяемость и cash flow по сегментам",
      "конкуренты и причина выигрыша"
    ];
  }

  return [
    "3-5 подтверждённых фактов по выбранному слою",
    "минимальный эталон слоя",
    "проверка, не объясняется ли симптом слоем выше"
  ];
}

export function analyzeDeepDiagnosticSources(sources = []) {
  const source = latestDeepDiagnosticSource(sources);
  if (!source) {
    return null;
  }

  const diagnostic = source.sourceMeta.deepDiagnostic;
  const layerScores = sortLayers(diagnostic.layerScores || []);
  const classSummary = ["A", "B", "C", "D"].map((classKey) => summarizeClass(classKey, layerScores));
  const rootHypothesis = selectRootHypothesis(layerScores);
  const nextStep = buildNextStep(rootHypothesis);
  const parallelActions = safeParallelActions(layerScores);
  const strengths = buildStrengths(diagnostic.strongestSubdomains || [], layerScores);
  const weakZones = buildWeakZones(diagnostic.weakestSubdomains || [], layerScores);
  const averageScore = average(layerScores);

  return {
    sourceId: source.id,
    sourceTitle: source.title,
    importedAt: source.createdAt,
    overall: {
      averageScore,
      layerCount: layerScores.length,
      scoredSubdomainCount: diagnostic.summary?.scoredSubdomainCount || 0,
      conclusion: rootHypothesis.layer === "owner_context"
        ? "Диагностика показывает не одну локальную поломку. Сначала нужно прояснить главные ориентиры: чего хочет собственник, на каком рынке компания зарабатывает и за счёт чего собирается выигрывать."
        : "Диагностика показывает первичную карту зрелости. Главную причину нужно проверить на фактах, а не выбирать только по низкой оценке."
    },
    layerScores,
    classSummary,
    strengths,
    weakZones,
    rootHypothesis,
    consequences: rootHypothesis.layer === "owner_context"
      ? [
          "стратегия и ICP остаются размытыми",
          "финансы не показывают, какой поток действительно выгоден",
          "операции и команда могут строиться под неясную модель работы",
          "данные фиксируют хаос, но не всегда объясняют его источник"
        ]
      : [],
    parallelActions,
    nextStep,
    missingForConfidence: buildMissingForConfidence(rootHypothesis)
  };
}
