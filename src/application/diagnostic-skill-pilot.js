function normalize(value) {
  return String(value || "").trim();
}

function unique(items, keyFn, maxItems = Infinity) {
  const result = [];
  const seen = new Set();
  for (const item of items || []) {
    const key = keyFn(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
    if (result.length >= maxItems) break;
  }
  return result;
}

function normalizeHypothesis(item, source) {
  const label = normalize(item?.label);
  if (!label) return null;
  return {
    id: normalize(item?.id),
    label,
    layer: normalize(item?.layer || item?.domains?.[0] || "unknown").toLowerCase(),
    score: Math.max(0, Math.min(1, Number(item?.score ?? item?.confidence ?? 0.5))),
    source
  };
}

function isGenericHypothesis(item) {
  return /пользователь видит локальную боль|ограничение находится в слое, который пока не назван/.test(normalize(item?.label).toLowerCase());
}

function rankHypotheses(items, context) {
  const text = diagnosticScopeText(context);
  const explicitLayers = new Set([
    ...(context.entryState?.businessLayers || []),
    ...(context.observationPacket?.businessLayers || []),
    ...(context.graphPacket?.businessLayers || [])
  ].map((item) => normalize(item).toLowerCase()));
  return items.map((item) => {
    let score = item.source === "diagnostic_spread" ? item.score : Math.min(item.score, 0.66);
    if (explicitLayers.has(item.layer)) score += 0.3;
    if (/целев|нецелев|смешан|сегмент|качеств[а-яё]* лид/.test(text) && item.layer === "commercial") score += 0.28;
    if (/повторн|возвращ|однораз|отток|удерж/.test(text) && item.layer === "product") score += 0.36;
    if (/распыл|направл|фокус|продукт[а-яё]* для|сегмент/.test(text) && item.layer === "strategy") score += 0.24;
    if (/срок|задерж|исполн|передач|проект/.test(text) && item.layer === "operations") score += 0.25;
    if (/марж|деньг|касс|прибыл|себестоим|чек/.test(text) && item.layer === "finance") score += 0.26;
    if (/парт[ннёер]|собственник[иов]*.*(?:разн|конфликт|цел)/.test(text) && item.layer === "owner_context") score += 0.28;
    if (/хаос|все ждут|ответственност[ьи] размыт|задач[иа] не довод/.test(text) && item.layer === "governance") score += 0.28;
    if (/спрос|заяв[а-яё]* стал[а-яё]* меньше|рынок/.test(text) && ["external_environment", "commercial"].includes(item.layer)) score += 0.2;
    return { ...item, score: Math.min(1, score) };
  });
}

function spreadAcrossLayers(items, maxItems = 4) {
  const sorted = [...items].sort((left, right) => right.score - left.score);
  const selected = [];
  const layers = new Set();
  for (const item of sorted) {
    if (layers.has(item.layer)) continue;
    selected.push(item);
    layers.add(item.layer);
    if (selected.length >= maxItems) return selected;
  }
  for (const item of sorted) {
    if (selected.some((selectedItem) => selectedItem.label.toLowerCase() === item.label.toLowerCase())) continue;
    selected.push(item);
    if (selected.length >= maxItems) break;
  }
  return selected;
}

function diagnosticScopeText(context) {
  return [
    context.userText,
    context.entryState?.claimedProblem,
    ...(context.entryState?.symptoms || [])
  ].map(normalize).filter(Boolean).join(" ").toLowerCase();
}

function fallbackHypotheses(context) {
  const text = diagnosticScopeText(context);
  const hypotheses = [];
  const add = (label, layer, score) => hypotheses.push({ id: "", label, layer, score, source: "diagnostic_spread" });

  if (/парт[ннёер]|собственник[иов]*.*(?:разн|конфликт|цел)|разн[аые]* цел[ие]/.test(text)) {
    add("Цели, горизонт и правила решений собственников могут противоречить друг другу", "owner_context", 0.76);
    add("Стратегические приоритеты могут меняться из-за отсутствия единого выбора", "strategy", 0.59);
    add("Права на решение и эскалацию могут быть не закреплены", "governance", 0.56);
  } else if (/спрос|рынок|конкурент|канал[ыо]* перестал/.test(text)) {
    add("Рыночный спрос или экономика каналов могли измениться", "external_environment", 0.74);
    add("Предложение может не совпадать с изменившимся спросом", "product", 0.6);
    add("Каналы и сегменты могут быть неверно выбраны для текущей среды", "commercial", 0.57);
  } else if (/не видят? ценност|ценност[ьи]|демк[иа].*не покуп|интересуются.*не покуп/.test(text)) {
    add("Продукт или обещание могут не давать клиенту достаточной причины купить", "product", 0.74);
    add("Продажа может не связывать ценность с задачей конкретного сегмента", "commercial", 0.61);
    add("Целевой сегмент может быть выбран слишком широко", "strategy", 0.55);
  } else if (/метрик|отч[её]т|спорят? по цифр|не видим реальн|непонятно где теря/.test(text)) {
    add("Система может не иметь единого набора метрик и источника правды", "data_analytics", 0.75);
    add("Правила управления могут не закреплять, какие цифры используются в решениях", "governance", 0.58);
    add("Инструменты могут не собирать данные в связную картину", "technology", 0.54);
  } else if (/crm|автоматиз|вручную в таблиц|перенос[яит]* данн|систем[ыа]* не связ/.test(text)) {
    add("Инструменты и интеграции могут съедать пропускную способность ручным трудом", "technology", 0.74);
    add("Сам процесс может быть не собран до автоматизации", "operations", 0.61);
    add("Данные могут не иметь единой структуры и владельца", "data_analytics", 0.55);
  } else if (/хаос.*решен|все ждут собственник|ответственност[ьи] размыт|задач[иа] не довод/.test(text)) {
    add("Права на решение, ответственность и контроль могут быть не собраны в управленческий цикл", "governance", 0.75);
    add("Цели и роль собственника могут поддерживать ручную централизацию", "owner_context", 0.62);
    add("Роли и точки передачи могут не работать в процессах", "operations", 0.56);
  } else if (/срок|задерж|исполн|передач|проект|достав/.test(text)) {
    add("Поток может застревать в процессе, точке передачи или правиле исполнения", "operations", 0.7);
    add("Продажа может создавать обещание, которое текущая модель исполнения не держит", "commercial", 0.56);
    add("Продукт может быть слишком сложным или нестандартным для стабильной доставки ценности", "product", 0.52);
    add("Решения и ответственность могут зависать между участниками потока", "governance", 0.5);
  } else if (/лид|заяв|продаж|конверс|сделк/.test(text)
    && !/собственник|парт[ннёер]/.test(text)
    && !/возвращ|повторн|однораз|отток|удерж/.test(text)) {
    add("В систему может попадать нецелевой или плохо сегментированный спрос", "commercial", 0.67);
    add("Поток может ломаться в этапах, передаче или правилах обработки", "operations", 0.61);
    add("Продукт или обещание могут не давать клиенту достаточной причины купить", "product", 0.56);
    add("Фокус на рынке или сегменте может быть выбран слишком широко", "strategy", 0.53);
  } else if (/марж|деньг|касс|прибыл|выруч|чек/.test(text)
    && !/распыл|направл|фокус|продукт[а-яё]* для|сегмент/.test(text)
    && !/возвращ|повторн|однораз|отток|удерж/.test(text)) {
    add("Экономика клиента, сделки или канала может не сходиться", "finance", 0.67);
    add("Коммерческий поток может давать выручку из невыгодных сегментов или продуктов", "commercial", 0.59);
    add("Себестоимость или модель исполнения может съедать результат после продажи", "operations", 0.56);
    add("Без разреза по продуктам, сегментам и каналам система может не видеть источник потерь", "data_analytics", 0.52);
  } else if (/собственник|партнер|команд|решен|управл|рол|ответств/.test(text)) {
    add("Цели, роли и правила решений собственников могут противоречить друг другу", "owner_context", 0.68);
    add("Права на решение и ответственность могут быть не закреплены в управлении", "governance", 0.63);
    add("Роли и точки передачи могут быть не собраны в рабочий процесс", "operations", 0.58);
    add("Приоритеты могут меняться из-за отсутствия единого стратегического выбора", "strategy", 0.53);
  } else if (/возвращ|повторн|отток|удерж/.test(text)) {
    add("Продукт может не давать достаточной ценности для повторной покупки", "product", 0.67);
    add("В продаже могут закладываться неверные ожидания или привлекаться не тот сегмент", "commercial", 0.6);
    add("Исполнение или сопровождение могут не доводить клиента до обещанного результата", "operations", 0.57);
  } else if (/рост|распыл|направл|фокус|стратег/.test(text)) {
    add("Бизнес может не сделать ясный выбор рынка, сегмента и источника преимущества", "strategy", 0.68);
    add("Спрос может не совпадать с выбранным сегментом и предложением", "commercial", 0.6);
    add("Продуктовый портфель может распылять ценность и ресурсы", "product", 0.55);
    add("Управленческий контур может не удерживать выбранные приоритеты", "governance", 0.52);
  } else {
    add("Может быть неясен стратегический фокус и выбор рынка", "strategy", 0.55);
    add("Может формироваться неправильный или слабый клиентский поток", "commercial", 0.52);
    add("Поток может застревать в процессах и передаче результата", "operations", 0.5);
  }
  return hypotheses;
}

function nextCheckForHypothesis(hypothesis, context) {
  const layer = hypothesis?.layer;
  const text = diagnosticScopeText(context);
  if (layer === "commercial") return "Разберите последние 30 обращений по сегменту, соответствию целевому клиенту и этапу потери. Это покажет, какой спрос действительно стоит передавать в продажи.";
  if (layer === "product") return "Сравните клиентов, которые вернулись, и тех, кто купил один раз: какой результат они ожидали, что реально получили и на каком шаге ценность разошлась с ожиданием.";
  if (layer === "strategy") return "Разложите выручку, валовую прибыль и загрузку по продуктам и сегментам, чтобы проверить, где бизнес создаёт результат, а где только распыляет ресурсы.";
  if (layer === "finance") return "Сделайте финансовый срез по продуктам и сегментам за два сопоставимых периода: выручка, прямые затраты и валовая маржа. Так станет видно, где именно исчезает результат.";
  if (layer === "operations") return "Возьмите последние 10 случаев и отметьте этап, владельца, норматив и фактическое время. Повторяющаяся точка задержки покажет реальное узкое место потока.";
  if (["owner_context", "governance"].includes(layer)) return "Соберите за две недели журнал зависших решений: тема, кто мог решить, у кого было право и сколько ждали. Это отделит личную перегрузку от конструкции управления.";
  if (layer === "external_environment") return "Сравните спрос по сегментам и каналам за сопоставимые периоды: объём, стоимость обращения и конверсию. Это отделит изменение рынка от внутреннего сбоя.";
  if (/заяв|лид/.test(text)) return "Разберите последние 30 обращений и зафиксируйте качество входа, этап потери и ответственного.";
  return "Проверьте эту версию на последних 10 реальных случаях и зафиксируйте повторяющийся факт, который её подтверждает или опровергает.";
}

function questionLooksLikeObservableSignal(question) {
  const text = normalize(question).toLowerCase();
  if (!text || /как вы думаете|в ч[её]м причина|что является причиной|какая версия|выберите причину/.test(text)) return false;
  return /сколько|когда|где|кто|как часто|по последн|что происходит|что видно|есть ли|за какое время|какой процент|каким правилом/.test(text);
}

function questionCandidates(context) {
  const graphQuestions = (context.graphPacket?.discriminatingSignals || []).map((item) => ({
    question: normalize(item?.question),
    informationGain: Number(item?.informationGain ?? 0.5),
    source: "causal_graph"
  }));
  const additional = [
    { question: normalize(context.dataSufficiency?.minimumQuestion), informationGain: 0.8, source: "data_sufficiency" },
    { question: normalize(context.referenceGate?.minimumQuestion), informationGain: 0.7, source: "reference_gate" },
    { question: normalize(context.graphPacket?.suggestedQuestion), informationGain: 0.65, source: "causal_graph" }
  ];
  return unique(
    [...graphQuestions, ...additional]
      .filter((item) => item.question)
      .sort((left, right) => {
        const signalDifference = Number(questionLooksLikeObservableSignal(right.question)) - Number(questionLooksLikeObservableSignal(left.question));
        return signalDifference || right.informationGain - left.informationGain;
      }),
    (item) => item.question.toLowerCase(),
    5
  );
}

function quantifyBusinessSignal(text) {
  const value = normalize(text).toLowerCase();
  const numbers = value.match(/\d[\d\s.,]*/g) || [];
  const hasBusinessMeasure = /%|₽|руб|дн|день|час|мин|месяц|недел|квартал|год|лид|заяв|сделк|клиент|проект|обращен|решен|продукт|сегмент|марж|конверс|выруч|прибыл|продаж|срок/.test(value);
  const hasRelation = numbers.length >= 2 || /(?:за|из|до|с)о?\s+(?:последн|прошл|недел|месяц|квартал|год|\d)|упал|сниз|вырос|составл|дошл|зависл|ждал|задерж/.test(value);
  return { strong: numbers.length > 0 && hasBusinessMeasure && hasRelation, numbers: numbers.length };
}

function fallbackObservableQuestion(context) {
  const text = normalize(context.userText).toLowerCase();
  if (/лид|заяв|продаж|конверс/.test(text)) {
    return "Возьмите последние 20 обращений: сколько из них соответствовали вашему целевому клиенту, сколько дошли до первого контакта и на каком шаге остановились остальные?";
  }
  if (/прибыл|марж|деньг|касс|выруч/.test(text)) {
    return "Какая одна цифра изменилась сильнее всего и за какой период: выручка, валовая маржа, постоянные расходы или остаток денег?";
  }
  if (/команд|собственник|операц|процесс|управл/.test(text)) {
    return "Назовите последний конкретный результат, который завис без вашего участия: где он остановился, кто должен был принять решение и сколько это заняло времени?";
  }
  return "Какой последний конкретный факт показывает эту проблему: что произошло, когда и как это повлияло на результат?";
}

function layerObservableQuestion(hypothesis, context) {
  const layer = hypothesis?.layer;
  const text = diagnosticScopeText(context);
  const currentText = normalize(context.userText).toLowerCase();
  const ownerDependency = /вс[её].*(?:держ|замыка)|собственник.*(?:влез|реш|контрол)|без (?:меня|собственника)|эскалац/.test(text);
  const partnerConflict = /парт[ннёер]|собственник[иов]*.*(?:разн|конфликт|цел)|разн[аые]* цел[ие]/.test(text);
  const specificCommercialEvidence = /лид|заяв|конверс|сделк|целев|нецелев|смешан/.test(text);
  const metaContinuation = /что (?:ты )?имеешь|не уверен|а дальше|почему|объясни/.test(currentText);

  if (ownerDependency && !partnerConflict && (layer === "owner_context" || metaContinuation || !specificCommercialEvidence)) {
    return "Какое последнее решение команда смогла принять без эскалации к собственнику, а какое всё равно пришлось нести ему?";
  }
  if ((context.history || []).length > 0) return "";
  const questions = {
    owner_context: partnerConflict
      ? "Есть ли у собственников единая логика приоритетов и правило, как разрешается разногласие по ключевому решению?"
      : "Какое последнее решение команда смогла принять без эскалации к собственнику, а какое всё равно пришлось нести ему?",
    external_environment: "Как за один и тот же период изменились спрос, стоимость обращения и конверсия по главным рынкам, сегментам и каналам?",
    strategy: "Если оставить один рынок или сегмент, который уже даёт лучший результ, что вы выберете и от каких направлений придётся отказаться?",
    product: "На каком сегменте клиенты ясно видят ценность и покупают, а где и какими словами чаще всего объясняют отказ?",
    commercial: "Возьмите последние 20 обращений: сколько из них описывает ваш целевой клиент, сколько дошли до контакта и на каком шаге остановились остальные?",
    operations: "На каком этапе исполнения последние 10 заказов чаще всего вышли за срок, потеряли владельца или не прошли контроль качества?",
    finance: "Какая одна цифра изменилась сильнее всего и за какой период: выручка, валовая маржа, себестоимость, скидки или остаток денег?",
    team: "На каких задачах команда чаще всего переходит к ручному героизму: из-за объёма, нехватки компетенций, исключений в процессе или слабого контроля?",
    governance: "В последнем зависшем решении где был сбой: в принятии решения, ответственности или контроле исполнения?",
    technology: "На каком шаге сотрудники чаще всего вручную переносят информацию между инструментами и сколько времени или ошибок это создаёт?",
    data_analytics: "Какая цифра по воронке, марже, загрузке или каналам сейчас расходится у двух отделов и из каких источников они её берут?"
  };

  const evidencePatterns = {
    owner_context: /собственник|парт[ннёер]/,
    external_environment: /рынок|спрос|конкурент/,
    strategy: /стратег|фокус|направл|распыл/,
    product: /продукт|ценност|не покуп/,
    commercial: /лид|заяв|конверс|сделк|целев|нецелев|смешан/,
    operations: /исполн|срок|процесс|качеств/,
    finance: /прибыл|марж|деньг|касс|выруч/,
    team: /команд|люд|выгора|компетен/,
    governance: /хаос|решен|ответств|контрол/,
    technology: /crm|автоматиз|инструмент|вручную.*данн/,
    data_analytics: /метрик|аналит|отч[её]т|цифр|не видим/
  };

  return evidencePatterns[layer]?.test(text) ? questions[layer] || "" : "";
}

function buildEvidenceGate(context, hypotheses) {
  const observedSignalsCount = (context.graphPacket?.observedSignals || []).filter(Boolean).length;
  const graphConfidence = Number(context.graphPacket?.graphConfidence ?? 0);
  const quantified = quantifyBusinessSignal(context.userText);
  const quantifiedSignal = quantified.strong;
  const sufficientByChecker = context.dataSufficiency?.canMakeDecision === true;
  const canSelectConstraint = Boolean(sufficientByChecker || (quantifiedSignal && hypotheses.length >= 2));
  const reasonCodes = [];
  if (sufficientByChecker) reasonCodes.push("data_sufficiency_allows_decision");
  if (quantifiedSignal) reasonCodes.push("quantified_business_signal");
  if (hypotheses.length < 2) reasonCodes.push("insufficient_competing_hypotheses");
  if (graphConfidence < 0.45) reasonCodes.push("low_graph_confidence");
  if (!canSelectConstraint) reasonCodes.push("one_more_observable_signal_required");
  return {
    observedSignalsCount,
    graphConfidence: Number(graphConfidence.toFixed(2)),
    quantifiedSignal,
    quantifiedValues: quantified.numbers,
    canSelectConstraint,
    reasonCodes
  };
}

function countQuestions(decision) {
  const text = normalize(decision?.response?.responseText || decision?.response?.nextStep);
  return (text.match(/\?/g) || []).length;
}

export class DiagnosticSkillPilot {
  build({ context = {}, selection = null } = {}) {
    if (selection?.primarySkill !== "business_diagnostic") return null;
    const hypotheses = spreadAcrossLayers(rankHypotheses([
      ...(context.graphPacket?.candidateStates || []).map((item) => normalizeHypothesis(item, "system_state")),
      ...(context.graphPacket?.candidateCauses || []).map((item) => normalizeHypothesis(item, "cause")),
      ...(context.entryState?.candidateConstraints || []).filter((item) => !isGenericHypothesis(item)).map((item) => normalizeHypothesis(item, "case_memory")),
      ...fallbackHypotheses(context)
    ].filter(Boolean), context));
    const questions = questionCandidates(context);
    const evidenceGate = buildEvidenceGate(context, hypotheses);
    const observableQuestion = questions.find((item) => questionLooksLikeObservableSignal(item.question));
    const primaryLayerQuestion = layerObservableQuestion(hypotheses[0], context);
    const requiredSignal = evidenceGate.canSelectConstraint
      ? ""
      : normalize(primaryLayerQuestion || observableQuestion?.question || fallbackObservableQuestion(context));
    return {
      schemaVersion: "skill_execution_v1",
      enabled: true,
      shadowMode: false,
      route: "business_diagnostic_pilot",
      runId: normalize(context.skillRun?.runId),
      runStatus: normalize(context.skillRun?.status),
      runTurn: Number(context.skillRun?.turnCount || 0) + 1,
      primarySkill: selection.primarySkill,
      supportingSkills: selection.supportingSkills || [],
      turnGoal: selection.turnGoal,
      completionCondition: selection.completionCondition,
      hypotheses,
      questionCandidates: questions,
      requiredSignal,
      evidenceGate,
      mustAskForSignal: !evidenceGate.canSelectConstraint,
      responsePolicy: {
        maxQuestions: 1,
        userProvidesFactsNotDiagnosis: true,
        allowConstraintSelection: evidenceGate.canSelectConstraint,
        allowNextStep: evidenceGate.canSelectConstraint
      },
      prohibitedActions: selection.prohibitedActions || []
    };
  }

  enforce({ packet = null, decision = null, context = {} } = {}) {
    if (!packet?.enabled || !decision) return decision;

    if (!packet.mustAskForSignal && decision.decision?.action === "answer") {
      const selectedConstraint = normalize(decision.entryState?.selectedConstraint || decision.memory?.constraint);
      const supportedIndex = packet.hypotheses.findIndex((item) => item.label === selectedConstraint);
      const scoreGap = supportedIndex > 0
        ? Number(packet.hypotheses[0]?.score || 0) - Number(packet.hypotheses[supportedIndex]?.score || 0)
        : 0;
      const scopeText = diagnosticScopeText(context);
      const hasStrongProductRetentionSignal = /повторн|возвращ|однораз|отток|удерж/.test(scopeText)
        && packet.hypotheses[0]?.layer === "product";
      const supportedByShortlist = supportedIndex === 0
        || (!hasStrongProductRetentionSignal && supportedIndex === 1 && scoreGap < 0.15);
      if (!supportedByShortlist && packet.hypotheses[0]) {
        const primary = packet.hypotheses[0];
        const alternative = packet.hypotheses[1];
        const nextCheck = nextCheckForHypothesis(primary, context);
        const hypotheses = [primary.label, alternative?.label].filter(Boolean);
        decision.entryState = { ...(decision.entryState || {}), selectedConstraint: primary.label };
        decision.memory = {
          ...(decision.memory || {}),
          constraint: primary.label,
          actionWave: {
            enabled: true,
            firstStep: nextCheck,
            notNow: "Не масштабировать ближайшее объяснение до подтверждения на фактах.",
            whyThisFirst: "Проверка отделяет ведущую гипотезу от ближайшей альтернативы."
          }
        };
        decision.response = {
          ...(decision.response || {}),
          whatIUnderstood: "Фактов уже хватает, чтобы выбрать рабочую гипотезу, но ещё не окончательный диагноз.",
          hypotheses,
          whyItMatters: "Выбранная версия должна объяснять наблюдаемый результат лучше альтернатив, а не просто совпадать с симптомом.",
          nextStep: nextCheck,
          responseText: `По текущим фактам рабочая гипотеза — ${primary.label.toLowerCase()}. Это пока не окончательный диагноз.\n\nБлижайшая альтернатива: ${alternative?.label?.toLowerCase() || "ограничение может находиться в соседнем слое системы"}.\n\nПервый шаг проверки: ${nextCheck}`
        };
      }
      return decision;
    }

    if (!packet.mustAskForSignal) return decision;

    const selectedConstraint = normalize(decision.entryState?.selectedConstraint || decision.memory?.constraint);
    const actionWaveEnabled = decision.memory?.actionWave?.enabled === true;
    const prematureAnswer = decision.decision?.action === "answer";
    if (!selectedConstraint && !actionWaveEnabled && !prematureAnswer) {
      if (decision.response) decision.response.nextStep = packet.requiredSignal;
      if (decision.entryState) decision.entryState.nextBestQuestion = packet.requiredSignal;
      return decision;
    }

    const hypotheses = packet.hypotheses.slice(0, 2).map((item) => item.label).filter(Boolean);
    const fieldSummary = hypotheses.length
      ? `Пока вижу несколько рабочих версий: ${hypotheses.join("; ")}.`
      : "Пока есть несколько возможных объяснений из разных частей системы.";

    decision.decision = {
      ...(decision.decision || {}),
      action: "clarify",
      signalSufficiency: "partial",
      confidence: Math.min(Number(decision.decision?.confidence ?? 0.65), 0.69),
      rationale: "Для выбора ограничения нужен ещё один наблюдаемый факт."
    };
    decision.entryState = {
      ...(decision.entryState || {}),
      selectedConstraint: "",
      nextBestQuestion: packet.requiredSignal,
      promotionReadiness: "keep_in_entry"
    };
    decision.memory = {
      ...(decision.memory || {}),
      constraint: "",
      actionWave: {
        enabled: false,
        firstStep: "",
        notNow: "Не переходить к изменению системы до проверки конкурирующих версий.",
        whyThisFirst: ""
      }
    };
    decision.response = {
      ...(decision.response || {}),
      whatIUnderstood: "Симптом уже виден, но его ближайшее объяснение пока нельзя считать корнем.",
      hypotheses,
      whyItMatters: "Если выбрать причину раньше фактов, можно исправлять локальный сбой и пропустить ограничение выше.",
      nextStep: packet.requiredSignal,
      responseText: `Симптом уже виден, но его ближайшее объяснение пока нельзя считать корнем.\n\n${fieldSummary}\n\n${packet.requiredSignal}`
    };
    return decision;
  }

  assess({ packet = null, decision = null } = {}) {
    if (!packet?.enabled) return null;
    const violations = [];
    const questionCount = countQuestions(decision);
    const selectedConstraint = normalize(decision?.entryState?.selectedConstraint || decision?.memory?.constraint);
    const actionWaveEnabled = decision?.memory?.actionWave?.enabled === true;
    if (questionCount > packet.responsePolicy.maxQuestions) violations.push("more_than_one_question");
    if (!packet.responsePolicy.allowConstraintSelection && selectedConstraint) violations.push("premature_constraint_selection");
    if (!packet.responsePolicy.allowNextStep && actionWaveEnabled) violations.push("premature_action_wave");
    return {
      schemaVersion: "skill_execution_review_v1",
      enabled: true,
      route: packet.route,
      status: violations.length ? "needs_review" : packet.mustAskForSignal ? "waiting_for_user" : "completed",
      criterionMet: violations.length === 0,
      questionCount,
      evidenceGate: packet.evidenceGate,
      hypothesisShortlist: packet.hypotheses.map(({ label, layer, score, source }) => ({ label, layer, score, source })),
      hypothesisLayers: [...new Set(packet.hypotheses.map((item) => item.layer).filter(Boolean))],
      selectedConstraintLayer: packet.hypotheses.find((item) => item.label === selectedConstraint)?.layer || "",
      requiredSignal: packet.requiredSignal,
      violations
    };
  }
}
