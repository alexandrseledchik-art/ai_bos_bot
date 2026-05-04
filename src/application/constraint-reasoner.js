import { BUSINESS_LAYERS_V1, getBusinessLayerByKey } from "../domain/business-layers.js";

export const CONSTRAINT_REASONER_POLICY = Object.freeze({
  selection: "deterministic_shortlist_only",
  llmScope: "explanation_only_after_selection",
  forbidden: "free_business_diagnosis_from_scratch"
});

const CLASS_PRIORITY = {
  A: 0.08,
  B: 0.12,
  C: 0.09,
  D: 0.02
};

const REQUEST_RELEVANCE_RULES = [
  {
    patterns: ["продаж", "лид", "заяв", "конверс", "ворон", "клиент", "сделк"],
    layers: {
      commercial: 1,
      product_value_proposition: 0.55,
      strategy: 0.48,
      operating_model: 0.42,
      data_analytics: 0.25
    }
  },
  {
    patterns: ["рост", "масштаб", "рынок", "сегмент", "фокус"],
    layers: {
      strategy: 1,
      commercial: 0.7,
      product_value_proposition: 0.5,
      external_environment: 0.4
    }
  },
  {
    patterns: ["марж", "прибыл", "деньг", "касс", "cash", "выруч"],
    layers: {
      finance: 1,
      commercial: 0.45,
      operating_model: 0.35,
      strategy: 0.3
    }
  },
  {
    patterns: ["собствен", "операцион", "управ", "хаос", "решени", "партнер", "партнёр"],
    layers: {
      owner_context: 0.9,
      governance_risks: 0.85,
      operating_model: 0.45,
      people_organization: 0.25
    }
  },
  {
    patterns: ["команд", "люд", "менедж", "сотруд", "перегруз", "не успев"],
    layers: {
      people_organization: 0.65,
      operating_model: 0.65,
      commercial: 0.55,
      governance_risks: 0.35
    }
  },
  {
    patterns: ["срок", "исполн", "delivery", "качест", "операц", "процесс"],
    layers: {
      operating_model: 1,
      governance_risks: 0.45,
      technology: 0.3,
      people_organization: 0.3
    }
  },
  {
    patterns: ["отчет", "отчёт", "аналит", "метрик", "цифр", "crm", "данн"],
    layers: {
      data_analytics: 1,
      technology: 0.45,
      commercial: 0.25,
      finance: 0.25
    }
  }
];

const LAYER_EXPLANATIONS = {
  owner_context: {
    title: "Контур собственника может задавать противоречивую рамку",
    whatItExplains: [
      "почему решения меняются быстрее, чем команда успевает их выполнить",
      "почему разные части бизнеса тянут систему в разные стороны"
    ],
    missingEvidence: [
      "есть ли единая цель и горизонт у собственника или партнёров",
      "кто реально принимает спорные решения",
      "какие решения сейчас чаще всего зависают"
    ],
    checks: [
      "сравнить цели собственника, партнёров и команды",
      "зафиксировать 3 решения, которые менялись или зависали за последний месяц"
    ]
  },
  external_environment: {
    title: "Внешняя среда может ограничивать сам поток спроса",
    whatItExplains: [
      "почему прежние каналы или модель перестали давать результат",
      "почему усилия внутри бизнеса не возвращают прежнюю динамику"
    ],
    missingEvidence: [
      "как изменился спрос в рынке",
      "какие каналы просели сильнее всего",
      "есть ли признаки, что проблема не внутри компании, а в рынке"
    ],
    checks: [
      "сравнить динамику спроса и каналов за 2-3 последних периода",
      "проверить, не изменились ли критерии выбора у клиента"
    ]
  },
  strategy: {
    title: "Стратегический фокус может быть слишком размытым",
    whatItExplains: [
      "почему ресурсы распыляются и не собираются в один сильный поток",
      "почему команда работает много, но результат не усиливается"
    ],
    missingEvidence: [
      "какой сегмент для бизнеса главный",
      "от каких клиентов, продуктов или направлений бизнес сознательно отказывается",
      "за счёт чего компания должна выигрывать"
    ],
    checks: [
      "выделить 3 главных сегмента и проверить, какой реально даёт лучший результат",
      "зафиксировать, от чего бизнес готов отказаться ради фокуса"
    ]
  },
  product_value_proposition: {
    title: "Ценность продукта может быть недостаточно сильной или ясной",
    whatItExplains: [
      "почему интерес есть, но покупка не происходит",
      "почему клиенту трудно понять, за что платить именно вам"
    ],
    missingEvidence: [
      "почему клиенты выбирают или не выбирают продукт",
      "какая боль у клиента самая сильная",
      "какие возражения чаще всего ломают сделку"
    ],
    checks: [
      "разобрать 10 последних отказов и найти повторяющуюся причину",
      "сравнить обещание продукта с реальной болью клиента"
    ]
  },
  commercial: {
    title: "Коммерческий вход может пропускать неправильный или плохо приоритизированный поток",
    whatItExplains: [
      "почему лидов может быть много, а продаж мало",
      "почему команда тратит силы не на продажу, а на разбор и фильтрацию входа",
      "почему локальное усиление продавцов может лечить симптом, а не конструкцию"
    ],
    missingEvidence: [
      "какая доля входящих лидов действительно целевая",
      "где профиль целевого клиента превращён в рабочее правило",
      "есть ли до продавца фильтр, приоритет и понятная передача лида"
    ],
    checks: [
      "разобрать 20 последних лидов по целевости, источнику и дальнейшему маршруту",
      "проверить, кто и по какому правилу решает, какой лид брать первым"
    ]
  },
  operating_model: {
    title: "Поток может застревать в операционной модели",
    whatItExplains: [
      "почему работа есть, но она не доходит до результата вовремя",
      "почему система зависит от ручного контроля и героизма"
    ],
    missingEvidence: [
      "на каком шаге поток реально застревает",
      "кто владеет каждым шагом процесса",
      "какой срок или правило чаще всего срывается"
    ],
    checks: [
      "нарисовать путь заявки или заказа от входа до результата",
      "отметить шаг, где чаще всего появляется очередь, ручное решение или задержка"
    ]
  },
  finance: {
    title: "Денежный поток может не превращаться в устойчивый результат",
    whatItExplains: [
      "почему выручка есть, но денег или прибыли не видно",
      "почему кассовый разрыв может быть следствием устройства продаж, цены или исполнения"
    ],
    missingEvidence: [
      "где теряется маржа",
      "какие расходы растут быстрее результата",
      "это финансовая причина или отражение проблем выше"
    ],
    checks: [
      "собрать короткий срез выручки, маржи, расходов и кассы за последний период",
      "связать денежную просадку с конкретным участком потока"
    ]
  },
  people_organization: {
    title: "Команда может не вытягивать текущую модель",
    whatItExplains: [
      "почему задачи зависают даже при понятном спросе и процессе",
      "почему рост сразу превращается в перегруз"
    ],
    missingEvidence: [
      "какая нагрузка приходится на ключевые роли",
      "где не хватает компетенции, а где не хватает ясного процесса",
      "что именно ломается при росте потока"
    ],
    checks: [
      "сопоставить нагрузку, роли и фактические очереди",
      "отделить нехватку людей от слабой маршрутизации или правил"
    ]
  },
  governance_risks: {
    title: "Управление может не удерживать решения и ответственность",
    whatItExplains: [
      "почему задачи теряются между людьми",
      "почему решения принимаются поздно или каждый раз заново"
    ],
    missingEvidence: [
      "кто принимает ключевые решения",
      "где ответственность размыта",
      "какой управленческий ритм реально держит исполнение"
    ],
    checks: [
      "выбрать 5 зависших решений и посмотреть, где они остановились",
      "сверить владельца результата, контроль и срок по каждому ключевому потоку"
    ]
  },
  technology: {
    title: "Инструменты могут тормозить поток и создавать ручную работу",
    whatItExplains: [
      "почему команда тратит время на переносы, дубли и поиск информации",
      "почему процесс не масштабируется без ошибок"
    ],
    missingEvidence: [
      "какая часть работы делается вручную",
      "где данные переносятся между системами",
      "какой инструмент реально ограничивает скорость"
    ],
    checks: [
      "найти 3 самых частых ручных переноса данных",
      "проверить, какие задержки создаёт не человек, а инструментальная связка"
    ]
  },
  data_analytics: {
    title: "Система может быть слепой к реальной причине",
    whatItExplains: [
      "почему команда спорит на ощущениях",
      "почему трудно выбрать приоритет и доказать, где ограничение"
    ],
    missingEvidence: [
      "какие метрики есть по проблемному потоку",
      "есть ли единая версия правды",
      "можно ли увидеть переходы, потери и очереди по этапам"
    ],
    checks: [
      "собрать минимальный набор метрик по текущему запросу",
      "проверить, где данные расходятся или отсутствуют"
    ]
  }
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizedText(...parts) {
  return parts
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function getProblemText({ problemContext, companyProfile }) {
  return normalizedText(
    problemContext?.request_text,
    companyProfile?.current_request,
    companyProfile?.industry
  );
}

function calculateRequestRelevance(text) {
  const relevance = Object.fromEntries(BUSINESS_LAYERS_V1.map((layer) => [layer.key, 0]));

  for (const rule of REQUEST_RELEVANCE_RULES) {
    if (!rule.patterns.some((pattern) => text.includes(pattern))) {
      continue;
    }

    for (const [layerKey, score] of Object.entries(rule.layers)) {
      relevance[layerKey] = Math.max(relevance[layerKey] || 0, score);
    }
  }

  return relevance;
}

function groupObservationsByLayer(observations = []) {
  const grouped = new Map();

  for (const observation of observations || []) {
    if (observation?.status && observation.status !== "active") {
      continue;
    }

    const layerKey = observation.layer;
    if (!getBusinessLayerByKey(layerKey)) {
      continue;
    }

    const existing = grouped.get(layerKey) || [];
    existing.push(observation);
    grouped.set(layerKey, existing);
  }

  return grouped;
}

function observationWeight(observation) {
  return clamp(Number(observation?.confidence ?? 0.5), 0.2, 1);
}

function buildSupportingObservations(observations = []) {
  return observations
    .slice()
    .sort((left, right) => observationWeight(right) - observationWeight(left))
    .slice(0, 5)
    .map((observation) => ({
      id: observation.id,
      statement: observation.statement || observation.normalized_signal || "Сигнал из диалога",
      normalizedSignal: observation.normalized_signal || "",
      confidence: Number(observation.confidence ?? 0.5)
    }));
}

function buildRankingReason(candidate) {
  const reasons = [];

  if (candidate.maturityScore !== null && candidate.maturityScore < 3) {
    reasons.push(`низкая оценка зрелости: ${candidate.maturityScore}/5`);
  }

  if (candidate.requestRelevance >= 0.5) {
    reasons.push("слой связан с текущим запросом пользователя");
  }

  if (candidate.observationCount > 0) {
    reasons.push(`есть сигналы из диалога: ${candidate.observationCount}`);
  }

  if (["A", "B", "C"].includes(candidate.classKey) && (candidate.requestRelevance > 0 || candidate.observationScore > 0)) {
    reasons.push("это верхний или проходной слой, который может объяснять проблемы ниже");
  }

  if (candidate.rejectionPenalty > 0) {
    reasons.push("предыдущая версия по этому слою была отклонена пользователем");
  }

  return reasons;
}

function extractRejectedLayersWithFeedback(observations = []) {
  const layers = new Set();

  for (const observation of observations || []) {
    if (observation?.normalized_signal !== "constraint_rejection_feedback") {
      continue;
    }

    const evidenceItems = Array.isArray(observation.evidence) ? observation.evidence : [];
    for (const item of evidenceItems) {
      const layerKey = item?.rejectedLayerKey;
      if (getBusinessLayerByKey(layerKey)) {
        layers.add(layerKey);
      }
    }
  }

  return layers;
}

function buildExplanation(candidate) {
  const layerPack = LAYER_EXPLANATIONS[candidate.layerKey] || LAYER_EXPLANATIONS.data_analytics;
  const confidenceText = candidate.confidence < 0.6
    ? "Данных пока хватает только для ранней версии: её нужно проверить, а не принимать как диагноз."
    : "Сигналов достаточно, чтобы проверить эту версию первой, но подтверждать её всё равно нужно фактами.";

  const evidenceText = candidate.supportingObservations.length > 0
    ? "Её поддерживают сигналы из диалога и текущая матрица зрелости."
    : "Пока она держится в основном на матрице и текущем запросе, поэтому ей особенно нужны факты.";

  return {
    title: layerPack.title,
    explanation: `Это гипотеза, не финальный диагноз. Сейчас наиболее полезно проверить область «${candidate.layerTitle}»: ${evidenceText} ${confidenceText}`,
    whatItExplains: layerPack.whatItExplains,
    missingEvidence: layerPack.missingEvidence,
    whatToCheckNext: layerPack.checks
  };
}

export class ConstraintReasoner {
  buildCandidates({ maturity, observations = [], problemContext = null, companyProfile = null } = {}) {
    const problemText = getProblemText({ problemContext, companyProfile });
    const requestRelevance = calculateRequestRelevance(problemText);
    const observationsByLayer = groupObservationsByLayer(observations);
    const rejectedLayersWithFeedback = extractRejectedLayersWithFeedback(observations);
    const observationWeightsByLayer = Object.fromEntries(
      BUSINESS_LAYERS_V1.map((layer) => {
        const layerObservations = observationsByLayer.get(layer.key) || [];
        const weight = layerObservations.reduce((sum, observation) => sum + observationWeight(observation), 0);
        return [layer.key, weight];
      })
    );
    const maxObservationWeight = Math.max(1, ...Object.values(observationWeightsByLayer));
    const maturityByLayer = new Map((maturity?.scores || []).map((score) => [score.layerKey, score]));

    return BUSINESS_LAYERS_V1.map((layer) => {
      const maturityItem = maturityByLayer.get(layer.key);
      const maturityScore = Number.isFinite(Number(maturityItem?.score)) ? Number(maturityItem.score) : null;
      const gapToThree = maturityScore === null ? 0.35 : clamp(3 - maturityScore, 0, 2);
      const normalizedGap = clamp(gapToThree / 2, 0, 1);
      const observationScore = clamp((observationWeightsByLayer[layer.key] || 0) / maxObservationWeight, 0, 1);
      const requestScore = requestRelevance[layer.key] || 0;
      const upperLayerBonus = ["A", "B", "C"].includes(layer.classKey) && (requestScore + observationScore) > 0.35
        ? CLASS_PRIORITY[layer.classKey]
        : 0;
      const dLayerPenalty = layer.classKey === "D" && (requestScore + observationScore) < 0.75 ? 0.04 : 0;
      const rejectionPenalty = rejectedLayersWithFeedback.has(layer.key) ? 0.18 : 0;
      const candidateScore = clamp(
        normalizedGap * 0.32 +
          requestScore * 0.28 +
          observationScore * 0.26 +
          upperLayerBonus -
          dLayerPenalty -
          rejectionPenalty,
        0,
        1
      );
      const supportingObservations = buildSupportingObservations(observationsByLayer.get(layer.key) || []);
      const answeredCount = Number(maturity?.answeredCount || 0);
      const baseConfidence = clamp(0.35 + candidateScore * 0.55, 0.35, 0.88);
      const confidence = answeredCount < 3
        ? Math.min(baseConfidence, 0.62)
        : supportingObservations.length === 0 && requestScore < 0.5
          ? Math.min(baseConfidence, 0.58)
          : baseConfidence;

      const candidate = {
        layerKey: layer.key,
        layerTitle: layer.title,
        classKey: layer.classKey,
        constraintType: layer.constraintType,
        maturityScore,
        gapToThree,
        requestRelevance: requestScore,
        observationScore,
        observationCount: supportingObservations.length,
        supportingObservations,
        rejectionPenalty,
        candidateScore: Number(candidateScore.toFixed(3)),
        confidence: Number(confidence.toFixed(2))
      };

      return {
        ...candidate,
        rankingReasons: buildRankingReason(candidate)
      };
    }).sort((left, right) => right.candidateScore - left.candidateScore);
  }

  buildDeterministicShortlist(input = {}) {
    return this.buildCandidates(input).map((candidate, index) => ({
      ...candidate,
      rank: index + 1,
      selectionSource: CONSTRAINT_REASONER_POLICY.selection,
      evidenceStrength: Number((candidate.observationScore * 0.55 + candidate.requestRelevance * 0.25 + Math.min(candidate.gapToThree / 2, 1) * 0.2).toFixed(3))
    }));
  }

  reason(input = {}) {
    const shortlist = this.buildDeterministicShortlist(input);
    const primary = shortlist[0] || null;

    if (!primary) {
      return {
        primary: null,
        alternatives: [],
        candidates: [],
        shortlist: [],
        policy: CONSTRAINT_REASONER_POLICY
      };
    }

    const explanation = buildExplanation(primary);
    const alternatives = shortlist.slice(1, 4).map((candidate) => ({
      layerKey: candidate.layerKey,
      layerTitle: candidate.layerTitle,
      classKey: candidate.classKey,
      constraintType: candidate.constraintType,
      confidence: candidate.confidence,
      candidateScore: candidate.candidateScore,
      whyAlternative: candidate.rankingReasons.length
        ? candidate.rankingReasons.join("; ")
        : "есть слабые сигналы, но объяснительная сила ниже"
    }));

    return {
      primary: {
        ...primary,
        ...explanation,
        isHypothesis: true,
        status: "suggested",
        selectionSource: CONSTRAINT_REASONER_POLICY.selection,
        llmScope: CONSTRAINT_REASONER_POLICY.llmScope,
        evidenceObservationIds: primary.supportingObservations.map((observation) => observation.id).filter(Boolean),
        confidenceLabel: primary.confidence < 0.6 ? "низкая уверенность" : "рабочая уверенность"
      },
      alternatives,
      candidates: shortlist,
      shortlist,
      policy: CONSTRAINT_REASONER_POLICY
    };
  }
}
