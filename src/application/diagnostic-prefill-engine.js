import { BUSINESS_LAYERS_V1, getBusinessLayerByKey } from "../domain/business-layers.js";

const OFFICIAL_ANSWER_SOURCES = new Set([
  "user_explicit",
  "user_confirmed_inference",
  "user_corrected_inference"
]);

const OFFICIAL_ANSWER_STATUSES = new Set(["confirmed", "corrected"]);

const SIGNAL_RULES = {
  sales_not_growing: [
    {
      layerKey: "commercial",
      score: 2,
      confidence: 0.58,
      reason: "Есть симптом слабых продаж, значит стоит проверить, правильно ли формируется и проходит клиентский поток."
    },
    {
      layerKey: "strategy",
      score: 3,
      confidence: 0.5,
      reason: "Слабые продажи иногда идут не из воронки, а из размытости фокуса, сегмента или способа выигрывать."
    }
  ],
  lead_overload: [
    {
      layerKey: "commercial",
      score: 2,
      confidence: 0.68,
      reason: "Лидов много, но перегруз на входе часто означает слабую фильтрацию, приоритет или качество потока."
    },
    {
      layerKey: "operating_model",
      score: 2,
      confidence: 0.55,
      reason: "Если входящий поток не проходит дальше, возможно, ломается процесс первого контура обработки."
    }
  ],
  team_overload_reported: [
    {
      layerKey: "operating_model",
      score: 2,
      confidence: 0.62,
      reason: "Перегруз команды может быть следствием того, что поток плохо маршрутизируется и застревает в процессе."
    },
    {
      layerKey: "people_organization",
      score: 3,
      confidence: 0.48,
      reason: "Версия про ресурс команды возможна, но сама по себе перегрузка ещё не доказывает нехватку людей."
    }
  ],
  slow_first_response: [
    {
      layerKey: "operating_model",
      score: 2,
      confidence: 0.78,
      reason: "Долгий первый ответ указывает на сбой в прохождении потока: очередь, ответственность или срок реакции."
    },
    {
      layerKey: "governance_risks",
      score: 3,
      confidence: 0.52,
      reason: "Если срок реакции задан, но не выполняется, может быть слабый контур контроля исполнения."
    }
  ],
  mixed_inbound_confirmed: [
    {
      layerKey: "commercial",
      score: 1,
      confidence: 0.86,
      reason: "Если в работу идёт смешанный поток, коммерческий фильтр не отделяет целевых клиентов от шума."
    }
  ],
  warm_inbound_demand: [
    {
      layerKey: "commercial",
      score: 3,
      confidence: 0.53,
      reason: "Тёплый входящий поток полезен, но ещё не доказывает, что он целевой и правильно приоритизирован."
    }
  ],
  qualification_missing_confirmed: [
    {
      layerKey: "commercial",
      score: 1,
      confidence: 0.88,
      reason: "Отсутствие квалификации до продавца обычно означает, что система не фильтрует входящий поток до продаж."
    }
  ],
  qualification_stage_exists: [
    {
      layerKey: "commercial",
      score: 3,
      confidence: 0.55,
      reason: "Этап квалификации есть, значит проблема может быть не в наличии этапа, а в правилах его работы."
    }
  ],
  qualification_stage_overloaded: [
    {
      layerKey: "commercial",
      score: 2,
      confidence: 0.76,
      reason: "Если квалификация перегружена, вероятно, поток требует лучшего фильтра, приоритета или маршрутизации."
    },
    {
      layerKey: "operating_model",
      score: 2,
      confidence: 0.58,
      reason: "Перегруженная квалификация может быть операционным узким местом в первом контуре."
    }
  ],
  priority_rules_missing: [
    {
      layerKey: "commercial",
      score: 1,
      confidence: 0.84,
      reason: "Без правил приоритета команда обрабатывает разные лиды одинаково и теряет фокус на лучших возможностях."
    }
  ],
  qualification_rules_consistent: [
    {
      layerKey: "commercial",
      score: 3,
      confidence: 0.62,
      reason: "Правила есть и понимаются одинаково, но нужно проверить, стали ли они реальным маршрутом входящего потока."
    }
  ],
  conversion_uniform_across_team: [
    {
      layerKey: "commercial",
      score: 2,
      confidence: 0.68,
      reason: "Если конверсия у всех похожая, причина чаще лежит не в отдельных людях, а в потоке, правилах или сегментации."
    },
    {
      layerKey: "people_organization",
      score: 4,
      confidence: 0.51,
      reason: "Похожая конверсия у команды ослабляет версию, что проблема только в качестве отдельных менеджеров."
    }
  ],
  strategic_icp_doubt: [
    {
      layerKey: "strategy",
      score: 2,
      confidence: 0.8,
      reason: "Пользователь сам поднимает версию, что проблема может быть в выборе сегмента, профиля целевого клиента или задачи, ради которой клиент покупает."
    },
    {
      layerKey: "commercial",
      score: 2,
      confidence: 0.72,
      reason: "Если профиль целевого клиента или сегменты выбраны слишком широко, коммерческий контур получает лишний или плохо подходящий поток."
    }
  ],
  target_leads_confirmed: [
    {
      layerKey: "commercial",
      score: 4,
      confidence: 0.58,
      reason: "Если поток в основном целевой, версия про качество входа слабее, но это ещё требует подтверждения фактами."
    },
    {
      layerKey: "operating_model",
      score: 2,
      confidence: 0.61,
      reason: "Целевой поток при слабом прохождении указывает на процесс обработки, а не только на качество лидов."
    }
  ],
  owner_in_deals: [
    {
      layerKey: "owner_context",
      score: 2,
      confidence: 0.72,
      reason: "Если собственник остаётся в сделках, его роль может ограничивать развитие и передачу ответственности."
    },
    {
      layerKey: "governance_risks",
      score: 2,
      confidence: 0.7,
      reason: "Зависание решений на собственнике часто говорит о слабом управленческом контуре и ответственности."
    }
  ],
  deals_stuck: [
    {
      layerKey: "operating_model",
      score: 2,
      confidence: 0.72,
      reason: "Сделки, которые висят, часто указывают на неясные этапы процесса, ответственность или критерии перехода."
    }
  ],
  hiring_without_relief: [
    {
      layerKey: "people_organization",
      score: 2,
      confidence: 0.66,
      reason: "Найм без облегчения нагрузки показывает, что ресурс команды не превращается в устойчивую мощность системы."
    },
    {
      layerKey: "operating_model",
      score: 2,
      confidence: 0.62,
      reason: "Если люди добавлены, но легче не стало, возможно, проблема в конструкции процесса, а не только в количестве людей."
    }
  ],
  low_profit: [
    {
      layerKey: "finance",
      score: 2,
      confidence: 0.78,
      reason: "Если выручка есть, а прибыль не остаётся, финансовый слой требует проверки маржи, расходов и экономики сделки."
    }
  ]
};

function isOfficialAnswer(answer) {
  return OFFICIAL_ANSWER_SOURCES.has(answer?.source) && OFFICIAL_ANSWER_STATUSES.has(answer?.status);
}

function asTimestamp(value) {
  const time = Date.parse(value || "");
  return Number.isFinite(time) ? time : 0;
}

function getDisplayConfidence(confidence) {
  if (confidence >= 0.75) {
    return "вероятная оценка, подтвердите";
  }
  if (confidence >= 0.5) {
    return "предположение системы";
  }
  return "internal";
}

function addCandidate(candidates, rule, observation) {
  if (!getBusinessLayerByKey(rule.layerKey)) {
    return;
  }

  const current = candidates.get(rule.layerKey);
  const evidence = {
    id: observation.id,
    statement: observation.statement,
    normalizedSignal: observation.normalized_signal,
    createdAt: observation.created_at
  };

  if (!current) {
    candidates.set(rule.layerKey, {
      layerKey: rule.layerKey,
      score: rule.score,
      confidence: rule.confidence,
      reasons: [rule.reason],
      evidence: [evidence],
      sourceSignals: [observation.normalized_signal]
    });
    return;
  }

  current.score = Math.min(Number(current.score), Number(rule.score));
  current.confidence = Math.min(0.95, Math.max(current.confidence, rule.confidence) + 0.04);
  current.reasons = [...new Set([...current.reasons, rule.reason])].slice(0, 3);
  current.evidence.push(evidence);
  current.sourceSignals = [...new Set([...current.sourceSignals, observation.normalized_signal])];
}

function hasNewEvidenceAfterRejection(candidate, rejectedAnswer) {
  const rejectedAt = asTimestamp(rejectedAnswer?.updated_at || rejectedAnswer?.created_at);
  return candidate.evidence.some((item) => asTimestamp(item.createdAt) > rejectedAt);
}

export class DiagnosticPrefillEngine {
  generate({ observations = [], existingAnswers = [], companyProfile = null, problemContext = null } = {}) {
    const officialLayerKeys = new Set(existingAnswers.filter(isOfficialAnswer).map((answer) => answer.subject_key));
    const rejectedByLayer = new Map(
      existingAnswers
        .filter((answer) => answer.status === "rejected")
        .map((answer) => [answer.subject_key, answer])
    );
    const candidates = new Map();

    for (const observation of observations) {
      if (observation.status && observation.status !== "active") {
        continue;
      }

      const rules = SIGNAL_RULES[observation.normalized_signal] || [];
      for (const rule of rules) {
        addCandidate(candidates, rule, observation);
      }
    }

    const requestText = `${companyProfile?.current_request || ""} ${problemContext?.request_text || ""}`.toLowerCase();
    if (/продаж|лид|конверси|заявк/.test(requestText) && candidates.has("commercial")) {
      const candidate = candidates.get("commercial");
      candidate.confidence = Math.min(0.95, candidate.confidence + 0.05);
      candidate.reasons = [
        ...candidate.reasons,
        "Текущий запрос пользователя связан с продажами, лидами или конверсией, поэтому коммерческий слой получает больший вес."
      ].slice(0, 3);
    }

    return [...candidates.values()]
      .filter((candidate) => !officialLayerKeys.has(candidate.layerKey))
      .filter((candidate) => {
        const rejectedAnswer = rejectedByLayer.get(candidate.layerKey);
        return !rejectedAnswer || hasNewEvidenceAfterRejection(candidate, rejectedAnswer);
      })
      .map((candidate) => {
        const layer = getBusinessLayerByKey(candidate.layerKey);
        const confidence = Number(candidate.confidence.toFixed(2));
        return {
          ...candidate,
          confidence,
          displayConfidence: getDisplayConfidence(confidence),
          selectedDescription: layer?.levels?.[Number(candidate.score) - 1] || "",
          evidenceObservationIds: candidate.evidence.map((item) => item.id).filter(Boolean)
        };
      })
      .filter((candidate) => candidate.confidence >= 0.5)
      .sort((left, right) => right.confidence - left.confidence);
  }
}

export function getPrefillDisplayConfidence(confidence) {
  return getDisplayConfidence(Number(confidence || 0));
}

export function getOfficialAnswerSources() {
  return [...OFFICIAL_ANSWER_SOURCES];
}

export function getOfficialAnswerStatuses() {
  return [...OFFICIAL_ANSWER_STATUSES];
}

export function getLayerTitlesByKey() {
  return Object.fromEntries(BUSINESS_LAYERS_V1.map((layer) => [layer.key, layer.title]));
}
