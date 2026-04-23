import { DECISION_SCHEMA } from "../../domain/decision-schema.js";
import { buildReasoningPrompt } from "../../application/prompt-builder.js";

function normalizeText(value) {
  return String(value || "").trim();
}

function uniqueStrings(items, maxItems = 10) {
  return [...new Set((items || []).map((item) => normalizeText(item)).filter(Boolean))].slice(0, maxItems);
}

function uniqueConstraints(items, maxItems = 5) {
  const result = [];
  const seen = new Set();

  for (const item of items || []) {
    const label = normalizeText(item?.label);
    if (!label) {
      continue;
    }

    const key = label.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    result.push({
      label,
      layer: normalizeText(item?.layer || "management").toLowerCase(),
      confidence: Math.max(0, Math.min(1, Number(item?.confidence ?? 0.5))),
      whyPossible: normalizeText(item?.whyPossible),
      whatWouldDisprove: normalizeText(item?.whatWouldDisprove)
    });

    if (result.length >= maxItems) {
      break;
    }
  }

  return result;
}

function detectFocus(text) {
  const normalized = normalizeText(text).toLowerCase();

  if (/продать бизнес|exit|выход/.test(normalized)) {
    return "sale";
  }
  if (/прибыл|марж|деньг|касс/.test(normalized)) {
    return "profit";
  }
  if (/команд|операц|хаос|собственник|процесс|регламент|управл/.test(normalized)) {
    return "operations";
  }
  if (/рост|лид|трафик|воронк|продаж|заяв/.test(normalized)) {
    return "growth";
  }
  return "general";
}

function extractClaimedCause(text) {
  const normalized = normalizeText(text);
  const patterns = [
    /проблема в\s+([^,.!?]+)/i,
    /не хватает\s+([^,.!?]+)/i,
    /из-за\s+([^,.!?]+)/i,
    /потому что\s+([^,.!?]+)/i
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match?.[1]) {
      return normalizeText(match[1]);
    }
  }

  if (/лиды плох/i.test(normalized)) {
    return "лиды плохого качества";
  }
  if (/люд[а-я]* не хватает/i.test(normalized)) {
    return "не хватает людей";
  }
  if (/продавц[а-я]*\s+не\s+хватает/i.test(normalized)) {
    return "не хватает продавцов";
  }
  if (/менеджер[а-я]*\s+не\s+хватает/i.test(normalized)) {
    return "не хватает менеджеров";
  }
  if (/не успева[а-я]* обработ/i.test(normalized)) {
    return "команда не успевает обрабатывать входящий поток";
  }
  if (/долго отвеча/i.test(normalized)) {
    return "слишком долгий первый ответ";
  }

  return "";
}

function detectHardSignal(text) {
  return /\d|%|₽|руб|mrr|cac|ltv|маржа|конверс/i.test(normalizeText(text));
}

function suggestionPack(focus, text) {
  const normalized = normalizeText(text).toLowerCase();
  const common = {
    general: [
      {
        name: "Constraint map",
        reason: "Нужен, чтобы не спутать симптом с системным ограничением.",
        usageMoment: "После первых 2-3 симптомов."
      }
    ],
    profit: [
      {
        name: "P&L decomposition",
        reason: "Помогает увидеть, где прибыль теряется: цена, маржа, CAC или операционные расходы.",
        usageMoment: "Сразу после фиксации симптома."
      },
      {
        name: "Unit economics worksheet",
        reason: "Нужен, если выручка есть, а деньги не остаются.",
        usageMoment: "После первичной диагностики экономики."
      }
    ],
    operations: [
      {
        name: "Constraint map",
        reason: "Позволяет отделить перегруз собственника от системного ограничения процесса.",
        usageMoment: "Когда проблема связана с управляемостью."
      },
      {
        name: "Responsibility matrix",
        reason: "Помогает увидеть, где бизнес держится на одном человеке или на неясных ролях.",
        usageMoment: "После подтверждения операционного ограничения."
      }
    ],
    sale: [
      {
        name: "Exit readiness checklist",
        reason: "Подсвечивает, чего не хватает для прозрачной продажи бизнеса.",
        usageMoment: "На старте подготовки к сделке."
      }
    ]
  };

  if (focus === "growth") {
    const pack = [
      {
        name: "Funnel breakdown",
        reason: "Помогает увидеть, где именно ломается поток: качество входа, квалификация, первый ответ или дожим.",
        usageMoment: "Как только появляется вопрос про рост или продажи."
      }
    ];

    if (/заяв|лид/.test(normalized)) {
      pack.push(
        {
          name: "ICP and qualification audit",
          reason: "Нужен, чтобы не путать нехватку людей с перегрузом от нецелевых лидов.",
          usageMoment: "До решения о найме или расширении команды."
        },
        {
          name: "Inbound routing review",
          reason: "Показывает, нет ли потерь из-за общей очереди, слабой маршрутизации или неясной роли первого ответа.",
          usageMoment: "Когда лидов много, а команда не успевает."
        }
      );
    } else {
      pack.push({
        name: "Offer/message audit",
        reason: "Нужен, если есть трафик, но вход в разговор или заявку слабый.",
        usageMoment: "После первого диагностического сужения."
      });
    }

    return pack.slice(0, 3);
  }

  return common[focus] || common.general;
}

function interventionSuggestionsFromGraph(graphPacket) {
  return (graphPacket?.candidateInterventions || [])
    .slice(0, 3)
    .map((item) => ({
      name: item.label,
      reason: item.whyUseful || "Граф поднял это как сильную точку системного изменения.",
      usageMoment: "После подтверждения этой версии ограничения."
    }));
}

function mergeSuggestions(baseSuggestions, graphPacket) {
  const merged = new Map();

  for (const item of [...(baseSuggestions || []), ...interventionSuggestionsFromGraph(graphPacket)]) {
    const key = normalizeText(item?.name).toLowerCase();
    if (!key || merged.has(key)) {
      continue;
    }

    merged.set(key, {
      name: normalizeText(item?.name),
      reason: normalizeText(item?.reason),
      usageMoment: normalizeText(item?.usageMoment)
    });
  }

  return [...merged.values()].slice(0, 4);
}

function buildConstraint(label, layer, confidence, whyPossible, whatWouldDisprove) {
  return { label, layer, confidence, whyPossible, whatWouldDisprove };
}

function constraintsFromGraphPacket(graphPacket) {
  const stateConstraints = (graphPacket?.candidateStates || []).map((item) =>
    buildConstraint(
      item.label,
      item.layer,
      item.score ?? 0.5,
      `Эта версия поддержана графом сигналов: ${(item.supportedBy || []).join(", ") || "несколькими наблюдениями"}.`,
      graphPacket?.discriminatingSignals?.[0]?.question || "Нужен дополнительный сигнал, который отделит эту версию от соседних."
    )
  );

  const causeConstraints = (graphPacket?.candidateCauses || []).map((item) =>
    buildConstraint(
      item.label,
      item.layer,
      item.score ?? 0.5,
      `Граф поднял эту причину как более глубокое объяснение текущих симптомов.`,
      graphPacket?.discriminatingSignals?.[1]?.question || graphPacket?.discriminatingSignals?.[0]?.question || "Нужен вопрос, который проверит именно эту причину."
    )
  );

  return uniqueConstraints([...stateConstraints, ...causeConstraints], 5);
}

function isOpeningMessage(context) {
  const normalized = normalizeText(context.userText).toLowerCase();
  const historyLength = Array.isArray(context.history) ? context.history.length : 0;
  return historyLength === 0 && /^\/start$|^(привет|здравствуй|здравствуйте|добрый день|добрый вечер)$/i.test(normalized);
}

function isLeadOverloadScenario(text, graphPacket) {
  const normalized = normalizeText(text).toLowerCase();
  const observedSignals = graphPacket?.observedSignals || [];
  return observedSignals.includes("lead_overload") ||
    observedSignals.includes("slow_first_response") ||
    (/заяв|лид|входящ/.test(normalized) && /не усп|люд|ответ|очеред|обработ|перегруж/.test(normalized));
}

function questionLooksUpstream(question) {
  return /icp|сегмент|целев|приоритет|квалификац|канал|рынк|обещан|неразобран|стратег/i.test(question);
}

function claimedCauseLooksLocal(text) {
  const normalized = normalizeText(text).toLowerCase();
  return /не хватает|люд|продавц|перегруж|ответ|очеред|sla|звон/.test(normalized);
}

function pickGraphQuestion(graphPacket, text = "") {
  const discriminatingSignals = Array.isArray(graphPacket?.discriminatingSignals)
    ? graphPacket.discriminatingSignals
    : [];
  const leadOverload = isLeadOverloadScenario(text, graphPacket);

  if (leadOverload && claimedCauseLooksLocal(text)) {
    const upstreamSignal = discriminatingSignals.find((item) => questionLooksUpstream(item?.question || ""));
    if (upstreamSignal) {
      return normalizeText(upstreamSignal.question);
    }
  }

  return normalizeText(
    graphPacket?.suggestedQuestion || discriminatingSignals[0]?.question
  );
}

function buildGraphAnalysisPacket(graphPacket) {
  return {
    observedSignals: graphPacket?.observedSignals || [],
    candidateStates: graphPacket?.candidateStates || [],
    candidateCauses: graphPacket?.candidateCauses || [],
    candidateInterventions: graphPacket?.candidateInterventions || [],
    discriminatingSignals: graphPacket?.discriminatingSignals || [],
    graphTrace: graphPacket?.graphTrace || [],
    graphConfidence: Number(graphPacket?.graphConfidence ?? 0),
    hypothesisConflicts: graphPacket?.hypothesisConflicts || []
  };
}

function genericConstraintsByFocus(focus, text) {
  const normalized = normalizeText(text).toLowerCase();

  if (focus === "sale") {
    return [
      buildConstraint(
        "Бизнес всё ещё зависит от собственника сильнее, чем кажется из первого ответа",
        "management",
        0.53,
        "Зависимость часто проявляется не в словах, а в решениях, сделках и исключениях.",
        "Если операционные и коммерческие решения реально принимаются без собственника."
      ),
      buildConstraint(
        "Прозрачность цифр и документов слабее, чем нужно для сделки",
        "finance",
        0.56,
        "Даже хороший бизнес теряет в цене, когда buyer не видит быстро понятную картину.",
        "Если цифры, договоры и ключевые документы доступны сразу и без ручной сборки."
      ),
      buildConstraint(
        "Процессы и передаваемость бизнеса не оформлены как система",
        "operations",
        0.54,
        "Сделка тормозится, когда покупатель не понимает, как бизнес работает без ручного героизма.",
        "Если стадии, роли и операционный контур уже описаны и работают стабильно."
      )
    ];
  }

  if (focus === "profit") {
    return [
      buildConstraint(
        "Экономика ломается в unit economics, а не в объёме продаж",
        "finance",
        0.58,
        "Выручка может расти, но прибыль падать из-за цены, маржи, CAC или структуры каналов.",
        "Если unit economics по сегментам и каналам прозрачны и не показывают утечки."
      ),
      buildConstraint(
        "Коммерческий вход даёт выручку, но не ту маржу, на которой бизнес должен расти",
        "commercial",
        0.49,
        "Слабый сегмент спроса и неправильное предложение могут маскироваться под финансовую проблему.",
        "Если по целевым сегментам и продуктам маржа стабильно держится."
      ),
      buildConstraint(
        "Операционный контур съедает прибыль быстрее, чем кажется по верхнеуровневым цифрам",
        "operations",
        0.46,
        "Неэффективная модель выполнения может уничтожать результат после продажи.",
        "Если себестоимость и операционные затраты по этапам прозрачны и стабильны."
      )
    ];
  }

  if (focus === "operations") {
    return [
      buildConstraint(
        "Нет операционной модели с ясными ролями и точками принятия решений",
        "operations",
        0.58,
        "Когда роли и правила не описаны, симптомы расползаются по хаосу, перегрузу и провисаниям.",
        "Если роли, стадии и правила переходов уже описаны и реально используются."
      ),
      buildConstraint(
        "Бизнес зависим от ручного участия собственника сильнее, чем это видно с первого взгляда",
        "management",
        0.54,
        "Собственник часто закрывает системные разрывы, поэтому настоящая причина прячется за ручным вмешательством.",
        "Если ключевые решения и исключения действительно обрабатываются без собственника."
      ),
      buildConstraint(
        "Проблема не в людях как таковых, а в неясной ответственности и маршрутизации работы",
        "people",
        0.49,
        "Добавление людей редко помогает, если система не знает, кто и за что отвечает.",
        "Если очередь, handoff и ответственность уже прозрачны и не являются узким местом."
      )
    ];
  }

  if (/заяв|лид/.test(normalized) && /не усп|люд|ответ|очеред|обработ/.test(normalized)) {
    return [
      buildConstraint(
        "Поток перегружен нецелевыми или слабо квалифицированными лидами",
        "commercial",
        0.6,
        "Много лидов может означать не рост, а мусорный входящий поток, который забивает команду.",
        "Если окажется, что почти все последние лиды были целевыми и достойными быстрого ответа."
      ),
      buildConstraint(
        "ICP, сегменты и правила приоритета не переведены в реальную обработку входящего потока",
        "strategy",
        0.59,
        "Когда стратегия и ICP не превращены в правила квалификации и приоритета, команда захлёбывается не тем потоком.",
        "Если целевой сегмент формально и операционно определён, а лучшие лиды уже идут по отдельной логике."
      ),
      buildConstraint(
        "Нет маршрутизации и отдельной роли первого ответа на входящие",
        "operations",
        0.58,
        "Хорошие лиды теряются, когда первый ответ лежит в общей очереди и без владельца.",
        "Если входящие уже распределяются по роли, SLA соблюдается, а очередь всё равно растёт."
      ),
      buildConstraint(
        "Реально не хватает мощности на первичную обработку входящего потока",
        "people",
        0.54,
        "Если лиды целевые и поток уже организован, то ограничение действительно может быть в capacity команды.",
        "Если значимая часть перегруза уходит после квалификации или смены маршрутизации."
      )
    ];
  }

  if (focus === "growth") {
    return [
      buildConstraint(
        "Нет системной модели продаж и понятных стадий воронки",
        "operations",
        0.57,
        "Когда стадии и критерии перехода не описаны, бизнес спорит о симптомах вместо управления потоком.",
        "Если стадии, критерии и ответственность уже описаны и реально используются."
      ),
      buildConstraint(
        "Проблема сидит в качестве входа, а не в дожиме",
        "commercial",
        0.53,
        "Слабый ICP, трафик не той аудитории или плохая квалификация могут маскироваться под слабые продажи.",
        "Если большинство входящих лидов целевые и проходят по ICP."
      ),
      buildConstraint(
        "Управленческий контур продаж слабее, чем сама команда",
        "management",
        0.47,
        "Команда может выглядеть слабой, когда у неё нет ясных стадий, SLA, owner'ов и контроля.",
        "Если управленческий контур уже прозрачен и всё равно ломается только на людях."
      )
    ];
  }

  return [
    buildConstraint(
      "Пользователь видит локальную боль, но системное ограничение лежит уровнем выше",
      "management",
      0.48,
      "На входе пока больше жалоба, чем системная картина, поэтому ближайшее объяснение может оказаться ложным.",
      "Если одна и та же причина уже подтверждена несколькими независимыми фактами."
    ),
    buildConstraint(
      "Ограничение находится в слое, который пока не назван прямо",
      "operations",
      0.45,
      "Симптом часто проявляется в одном контуре, а держится на другом.",
      "Если текущий симптом уже объясняет несколько других симптомов без противоречий."
    )
  ];
}

function inferSystemLayers(text, focus, candidateConstraints, existingLayers = []) {
  const normalized = normalizeText(text).toLowerCase();
  const layers = [...existingLayers];

  if (/стратег|ца|icp|сегмент/.test(normalized)) {
    layers.push("strategy");
  }
  if (/лид|трафик|заяв|продаж|сделк|воронк/.test(normalized) || focus === "growth") {
    layers.push("commercial");
  }
  if (/процесс|этап|crm|handoff|обработ|очеред/.test(normalized)) {
    layers.push("operations");
  }
  if (/марж|прибыл|касс|деньг|эконом/.test(normalized) || focus === "profit") {
    layers.push("finance");
  }
  if (/люд|команд|рол/.test(normalized)) {
    layers.push("people");
  }
  if (/собственник|решени|контрол|sla|owner/.test(normalized) || focus === "sale") {
    layers.push("management");
  }

  for (const item of candidateConstraints) {
    layers.push(item.layer);
  }

  return uniqueStrings(layers, 6);
}

function buildNextQuestion(focus, text, candidateConstraints, graphPacket) {
  const normalized = normalizeText(text).toLowerCase();
  const graphQuestion = pickGraphQuestion(graphPacket, text);

  if (graphQuestion) {
    return graphQuestion;
  }

  if (/заяв|лид/.test(normalized) && /не усп|люд|ответ|очеред|обработ/.test(normalized)) {
    return "Из последних 20 заявок сколько вообще были целевыми и достойными быстрого ответа, а сколько отвалились бы уже на квалификации?";
  }

  if (focus === "sale") {
    return "Если завтра собственник выпадет из операционки на 2 недели, что в бизнесе реально продолжит работать, а что остановится первым?";
  }

  if (focus === "profit") {
    return "Если разложить прибыль по узлам, где ломается сильнее всего: цена, маржа, CAC, скидки или себестоимость выполнения?";
  }

  if (focus === "operations") {
    return "Где сейчас чаще всего образуется ручной героизм: в принятии решений, передаче задач, контроле этапов или в исключениях?";
  }

  if (focus === "growth") {
    return "Где поток ломается сильнее всего: качество входа, квалификация, первый ответ, переход в сделку или дожим?";
  }

  const alternative = candidateConstraints[1]?.label || "альтернативное системное ограничение";
  return `Какой один факт лучше всего отделит текущую версию причины от альтернативы "${alternative}"?`;
}

function buildEntryState(context, focus, signalSufficiency, selectedConstraint = "", promotionReadiness = "keep_in_entry") {
  const text = normalizeText(context.userText);
  const previous = context.entryState || {};
  const claimedCause = extractClaimedCause(text) || normalizeText(previous.claimedCause);
  const graphConstraints = constraintsFromGraphPacket(context.graphPacket);
  const candidateConstraints = uniqueConstraints([
    ...graphConstraints,
    ...genericConstraintsByFocus(focus, text),
    ...(previous.candidateConstraints || [])
  ]);
  const nextBestQuestion = buildNextQuestion(focus, text, candidateConstraints, context.graphPacket);

  const symptoms = uniqueStrings([
    ...(previous.symptoms || []),
    text
  ]);

  const knownFacts = uniqueStrings([
    ...(previous.knownFacts || []),
    claimedCause ? `Пользователь сам считает причиной: ${claimedCause}.` : ""
  ], 8);

  return {
    claimedProblem:
      context.classification?.type === "free_text_problem" || context.classification?.type === "url_plus_problem"
        ? text
        : normalizeText(previous.claimedProblem || text),
    claimedCause,
    knownFacts,
    symptoms,
    observedSignals: uniqueStrings([
      ...(previous.observedSignals || []),
      ...(context.graphPacket?.observedSignals || [])
    ], 12),
    systemLayers: inferSystemLayers(text, focus, candidateConstraints, previous.systemLayers || []),
    candidateConstraints,
    candidateStates: context.graphPacket?.candidateStates || previous.candidateStates || [],
    candidateCauses: context.graphPacket?.candidateCauses || previous.candidateCauses || [],
    selectedConstraint,
    graphTrace: context.graphPacket?.graphTrace || previous.graphTrace || [],
    discriminatingSignals: context.graphPacket?.discriminatingSignals || previous.discriminatingSignals || [],
    graphConfidence: Number(context.graphPacket?.graphConfidence ?? previous.graphConfidence ?? 0),
    hypothesisConflicts: uniqueStrings([
      ...(previous.hypothesisConflicts || []),
      ...(context.graphPacket?.hypothesisConflicts || [])
    ], 6),
    signalSufficiency,
    nextBestQuestion,
    nextBestStep: promotionReadiness === "ready_for_diagnostic_case"
      ? `Зафиксировать ограничение "${selectedConstraint}" и проверить его по одному узлу данных или процесса.`
      : "Сначала отделить локальную жалобу от системного ограничения.",
    whyThisStep:
      promotionReadiness === "ready_for_diagnostic_case"
        ? "Теперь есть достаточно сигнала, чтобы перейти от версии к рабочему ограничению и первой волне действий."
        : "Этот шаг лучше всего разделяет конкурирующие причины и не даёт принять ближайшее объяснение за истину.",
    promotionReadiness
  };
}

function buildWebsiteDecision(context, linkedProblem = false) {
  const screen = context.screening?.[0];
  const candidateConstraints = uniqueConstraints([
    buildConstraint(
      "Сайт не доносит ценность и не переводит посетителя в следующий шаг",
      "commercial",
      0.64,
      "Во внешнем контуре уже видно обещание и CTA, поэтому ограничение может быть в оффере или конверсии.",
      "Если сайт выглядит сильным, а проблема проявляется уже после заявки или продажи."
    ),
    buildConstraint(
      "Сайт только проявляет симптом, а реальное ограничение сидит глубже — в трафике, продажах или экономике",
      "operations",
      0.58,
      "По одному URL нельзя доказать внутренний диагноз бизнеса.",
      "Если внешняя конверсия действительно слабая и это подтверждается цифрами."
    )
  ]);

  return {
    selectedMode: "website_screening_mode",
    decision: {
      action: "screen",
      signalSufficiency: "partial",
      confidence: linkedProblem ? 0.69 : 0.7,
      rationale: linkedProblem
        ? "Есть и URL, и проблема, поэтому сначала нужно честно разделить внешний скрининг и внутренний диагноз."
        : "На входе только URL, значит честно доступен внешний скрининг сайта."
    },
    response: {
      whatIUnderstood: linkedProblem
        ? "Вижу и сайт, и бизнес-напряжение вокруг него. Значит сначала нужен внешний скрининг входа, и важно не перепутать его с внутренним диагнозом бизнеса."
        : "Вижу, что на входе только сайт. Значит сейчас можно честно разобрать внешний контур продукта и входа, но не внутренний бизнес-диагноз.",
      hypotheses: linkedProblem
        ? [
            "Проблема может быть во внешнем контуре: оффер, доверие, CTA или структура воронки.",
            "Либо сайт только проявляет симптом, а реальное ограничение лежит глубже: трафик, продажа или экономика."
          ]
        : [
            screen?.raw?.siteType
              ? `Сайт, похоже, работает как ${screen.raw.siteType}.`
              : "Сайт, вероятно, пытается быстро объяснить ценность и довести до следующего шага.",
            "Ограничение может быть в оффере, доверии или слабом переводе в следующий шаг."
          ],
      whyItMatters: linkedProblem
        ? "Если сразу назвать сайт корнем проблемы, можно промахнуться. Внешний скрининг и внутренний диагноз нужно разделить."
        : "По одному URL видно обещание, структуру входа и силу первого экрана, но не видно финансы, кассу, команду и реальное ограничение бизнеса.",
      nextStep: linkedProblem
        ? "Идём сначала в разбор сайта как продукта/воронки или сразу проверяем бизнес-проблему за ним через цифры и процесс?"
        : "Хочешь, я разберу этот сайт как продукт/воронку или будем диагностировать бизнес, который за ним стоит?",
      responseText: ""
    },
    guardrails: {
      knownFacts: screen?.knownFacts || [],
      observations: screen?.observations || [],
      workingHypotheses: candidateConstraints.map((item) => item.label),
      canNotAssert: screen?.canNotAssert || [],
      confidenceNote: "Это внешний скрининг, а не внутренний управленческий диагноз."
    },
    graphAnalysis: buildGraphAnalysisPacket(context.graphPacket),
    entryState: {
      claimedProblem: linkedProblem ? normalizeText(context.classification.cleanText) : "Понять, что можно увидеть по внешнему контуру сайта.",
      claimedCause: "",
      knownFacts: screen?.knownFacts || [],
      symptoms: linkedProblem ? [context.userText] : [],
      observedSignals: context.graphPacket?.observedSignals || [],
      systemLayers: ["commercial", "operations"],
      candidateConstraints,
      candidateStates: context.graphPacket?.candidateStates || [],
      candidateCauses: context.graphPacket?.candidateCauses || [],
      selectedConstraint: "",
      signalSufficiency: "partial",
      graphTrace: context.graphPacket?.graphTrace || [],
      discriminatingSignals: context.graphPacket?.discriminatingSignals || [],
      graphConfidence: Number(context.graphPacket?.graphConfidence ?? 0),
      hypothesisConflicts: context.graphPacket?.hypothesisConflicts || [],
      nextBestQuestion: linkedProblem
        ? "Разбираем сначала внешний контур сайта или пойдём в глубинную диагностику бизнеса за ним?"
        : "Разбирать сайт как продукт/воронку или переходить к диагнозу бизнеса за ним?",
      nextBestStep: "Сделать внешний скрининг и не превращать URL в внутренний диагноз бизнеса.",
      whyThisStep: "Сначала нужно отделить видимый внешний контур от того, чего по одному сайту доказать нельзя.",
      promotionReadiness: "ready_for_screening_case"
    },
    memory: {
      companyName: "",
      caseKind: "preliminary_screening",
      goal: linkedProblem
        ? "Проверить, связан ли внешний вход сайта с озвученной проблемой."
        : "Понять, что можно увидеть по внешнему контуру сайта.",
      symptoms: linkedProblem ? [context.userText] : [],
      hypotheses: candidateConstraints.map((item) => item.label).slice(0, 4),
      constraint: "",
      situation: linkedProblem
        ? "Пользователь прислал URL вместе с описанием проблемы."
        : "Вход начался с URL без явной бизнес-проблемы.",
      actionWave: {
        enabled: false,
        firstStep: "",
        notNow: "",
        whyThisFirst: ""
      },
      toolRecommendations: mergeSuggestions(suggestionPack("growth", context.userText), context.graphPacket),
      artifact: {
        shouldSave: true,
        title: linkedProblem
          ? `Linked screening: ${screen?.url || context.classification.urls[0]}`
          : `External screening: ${screen?.url || context.classification.urls[0]}`,
        summary: linkedProblem
          ? "Сохранён предварительный внешний скрининг сайта с привязкой к бизнес-проблеме."
          : "Сохранён внешний скрининг сайта с разделением на факты, наблюдения и гипотезы.",
        kind: "screening"
      }
    }
  };
}

function buildClarificationDecision(context, focus, claimedProblemText) {
  const entryState = buildEntryState(context, focus, "weak", "", "keep_in_entry");
  const greeting = isOpeningMessage(context)
    ? `Привет${context.userMeta?.firstName ? `, ${context.userMeta.firstName}` : ""}. `
    : "";
  const options = {
    profit: "Тебе сейчас важнее прибыль, понять где теряется маржа или увидеть, почему выручка не превращается в результат?",
    growth: "Тебе сейчас важнее найти, где ломается рост: качество входа, продажи или управляемость коммерческого контура?",
    operations: "Тебе сейчас важнее снять перегруз с себя, разложить роли или понять, где бизнес перестал быть управляемым?",
    sale: "Тебе сейчас ближе продать быстро, продать дороже или сначала упаковать бизнес так, чтобы не потерять в цене?",
    general: "Что тебе сейчас важнее: прибыль, рост или управляемость?"
  };

  return {
    selectedMode: "clarification_mode",
    decision: {
      action: "clarify",
      signalSufficiency: "weak",
      confidence: 0.72,
      rationale: "Запрос широкий, поэтому первый ход — не гадать о причине, а сузить управленческий контур."
    },
    response: {
      whatIUnderstood:
        `${greeting}Давай не расползаться по всему бизнесу сразу. Я бы сначала выбрал контур, где сейчас, скорее всего, сидит главное ограничение.`,
      hypotheses: [
        "Сейчас ограничение может сидеть в прибыли и экономике.",
        "Либо в росте и управляемости, а не в нехватке идей."
      ],
      whyItMatters:
        "Иначе получится красивый разговор про всё сразу, а не реальный ход к сути.",
      nextStep: options[focus] || options.general,
      responseText: ""
    },
    guardrails: {
      knownFacts: ["Пользователь описал задачу широко, без конкретного симптома."],
      observations: ["Запрос пока подходит для entry-state, а не для полноценного diagnostic-case."],
      workingHypotheses: entryState.candidateConstraints.map((item) => item.label),
      canNotAssert: ["Нельзя на таком входе уверенно назвать корневую причину."],
      confidenceNote: "Пока это настройка фокуса, а не диагноз."
    },
    graphAnalysis: buildGraphAnalysisPacket(context.graphPacket),
    entryState: {
      ...entryState,
      claimedProblem: claimedProblemText
    },
    memory: {
      companyName: "",
      caseKind: "diagnostic_case",
      goal: "Сузить управленческий контур и выбрать главный фокус.",
      symptoms: [],
      hypotheses: entryState.candidateConstraints.map((item) => item.label).slice(0, 4),
      constraint: "",
      situation: "Вход начался с расплывчатого описания запроса.",
      actionWave: {
        enabled: false,
        firstStep: "",
        notNow: "",
        whyThisFirst: ""
      },
      toolRecommendations: mergeSuggestions(suggestionPack(focus, context.userText), context.graphPacket),
      artifact: {
        shouldSave: false,
        title: "",
        summary: "",
        kind: "snapshot"
      }
    }
  };
}

function buildUnknownDecision(context) {
  const entryState = buildEntryState(context, "general", "weak", "", "keep_in_entry");

  return {
    selectedMode: "clarification_mode",
    decision: {
      action: "clarify",
      signalSufficiency: "weak",
      confidence: 0.68,
      rationale: "Сигнал слишком слабый, поэтому нужен один направляющий вопрос, а не имитация диагноза."
    },
    response: {
      whatIUnderstood:
        "Пока вижу напряжение, но ещё не вижу, где именно у системы рвётся контур.",
      hypotheses: [
        "Ограничение может быть в росте, деньгах или управляемости.",
        "За коротким сообщением, скорее всего, скрыта одна главная точка перегруза."
      ],
      whyItMatters:
        "Если сейчас сделать вид, что причина уже понятна, получится имитация диагноза, а не разбор.",
      nextStep: "Где у тебя сейчас самое сильное напряжение: в продажах, в деньгах после продажи или в управляемости?",
      responseText: ""
    },
    guardrails: {
      knownFacts: ["Пользователь дал слишком слабый сигнал для содержательного диагноза."],
      observations: ["Нужен один направляющий вопрос вместо общего списка вопросов."],
      workingHypotheses: entryState.candidateConstraints.map((item) => item.label),
      canNotAssert: ["Нельзя делать сильный вывод на таком входе."],
      confidenceNote: "Сейчас это только настройка направления."
    },
    graphAnalysis: buildGraphAnalysisPacket(context.graphPacket),
    entryState,
    memory: {
      companyName: "",
      caseKind: "diagnostic_case",
      goal: "Понять, в каком контуре находится главное ограничение.",
      symptoms: [],
      hypotheses: entryState.candidateConstraints.map((item) => item.label).slice(0, 4),
      constraint: "",
      situation: "Получен слишком общий или непонятный вход.",
      actionWave: {
        enabled: false,
        firstStep: "",
        notNow: "",
        whyThisFirst: ""
      },
      toolRecommendations: mergeSuggestions(suggestionPack("general", context.userText), context.graphPacket),
      artifact: {
        shouldSave: false,
        title: "",
        summary: "",
        kind: "snapshot"
      }
    }
  };
}

function buildProblemDecision(context) {
  const focus = detectFocus(context.userText);
  const hardSignal = detectHardSignal(context.userText);
  const candidateConstraints = genericConstraintsByFocus(focus, context.userText);
  const primaryConstraint = hardSignal ? candidateConstraints[0]?.label || "" : "";
  const promotionReadiness = hardSignal ? "ready_for_diagnostic_case" : "keep_in_entry";
  const entryState = {
    ...buildEntryState(context, focus, hardSignal ? "enough" : "partial", primaryConstraint, promotionReadiness),
    candidateConstraints: uniqueConstraints([
      ...candidateConstraints,
      ...(context.entryState?.candidateConstraints || [])
    ])
  };

  if (hardSignal) {
    return {
      selectedMode: "diagnostic_mode",
      decision: {
        action: "answer",
        signalSufficiency: "enough",
        confidence: 0.8,
        rationale: "Сигнала уже хватает, чтобы перейти от симптома к рабочему ограничению и первой волне."
      },
      response: {
        whatIUnderstood:
          "Здесь уже можно не кружить вокруг симптома. Сигнала хватает, чтобы выбрать рабочее ограничение и первый осмысленный ход.",
        hypotheses: [
          primaryConstraint,
          entryState.candidateConstraints[1]?.label || "Есть и соседняя версия, которую нужно держать в уме."
        ],
        whyItMatters:
          "Если попасть в рычаг правильно, начнут выравниваться сразу несколько симптомов, а не один локальный сбой.",
        nextStep: `Первый шаг: проверь ограничение "${primaryConstraint}" по одному узлу данных или процесса и не запускай параллельно полный список инициатив.`,
        responseText: ""
      },
      guardrails: {
        knownFacts: ["Пользователь дал достаточно конкретный симптом или количественный сигнал для перехода в diagnostic-case."],
        observations: ["Сигнала уже хватает, чтобы выбрать рабочее ограничение и первую волну."],
        workingHypotheses: entryState.candidateConstraints.map((item) => item.label),
        canNotAssert: ["Даже при хорошем сигнале это ещё рабочий диагноз, а не окончательная истина."],
        confidenceNote: "Ограничение выбрано как лучшая рабочая версия и требует следующей проверки."
      },
      graphAnalysis: buildGraphAnalysisPacket(context.graphPacket),
      entryState,
      memory: {
        companyName: "",
        caseKind: "diagnostic_case",
        goal: "Найти главное ограничение системы и выбрать первый ход с максимальным эффектом.",
        symptoms: entryState.symptoms,
        hypotheses: entryState.candidateConstraints.map((item) => item.label).slice(0, 4),
        constraint: primaryConstraint,
        situation: "Пользователь дал конкретный симптом и количественный сигнал.",
        actionWave: {
          enabled: true,
          firstStep:
            context.graphPacket?.candidateInterventions?.[0]?.label
              ? `Сначала проверь ограничение "${primaryConstraint}", а затем переходи к интервенции "${context.graphPacket.candidateInterventions[0].label}".`
              : `Проверить ограничение "${primaryConstraint}" по одному узлу данных или процесса.`,
          notNow: "Не добавлять сразу новые ресурсы и не запускать длинный список параллельных изменений.",
          whyThisFirst: "Это ограничение объясняет несколько симптомов и даёт самый сильный системный сдвиг на ближайшем шаге."
        },
        toolRecommendations: mergeSuggestions(suggestionPack(focus, context.userText), context.graphPacket),
        artifact: {
          shouldSave: true,
          title: "Primary constraint diagnostic snapshot",
          summary: "Сохранён первый диагностический вывод с candidate constraints, выбранным ограничением и первой волной.",
          kind: "diagnosis"
        }
      }
    };
  }

  const leadHypothesis = entryState.candidateConstraints[0]?.label || "Ограничение пока сидит глубже пользовательской формулировки.";
  const secondHypothesis = entryState.candidateConstraints[1]?.label || "Есть альтернативная системная причина, которую ещё нельзя отбрасывать.";

  return {
    selectedMode: "diagnostic_mode",
    decision: {
      action: "clarify",
      signalSufficiency: "partial",
      confidence: 0.74,
      rationale: "Проблема уже обозначена, но сейчас важнее не принять пользовательскую версию причины за факт, а развести конкурирующие ограничения."
    },
    response: {
      whatIUnderstood:
        "Симптом уже виден, но я бы пока не покупал ближайшую причину как главную.",
      hypotheses: [
        leadHypothesis,
        secondHypothesis
      ],
      whyItMatters:
        "Если слишком рано зафиксировать объяснение, можно лечить не то место и только усилить шум.",
      nextStep: entryState.nextBestQuestion,
      responseText: ""
    },
    guardrails: {
      knownFacts: entryState.knownFacts,
      observations: ["Вход подходит для diagnostic mode, но пока не для жёсткого диагноза."],
      workingHypotheses: entryState.candidateConstraints.map((item) => item.label),
      canNotAssert: ["Нельзя уверенно назвать корневую причину без вопроса, который разделит конкурирующие ограничения."],
      confidenceNote: "Следующий вопрос нужен не для анкеты, а для выбора главного ограничения."
    },
    graphAnalysis: buildGraphAnalysisPacket(context.graphPacket),
    entryState,
    memory: {
      companyName: "",
      caseKind: "diagnostic_case",
      goal: "Сузить проблему до главного ограничения системы.",
      symptoms: entryState.symptoms,
      hypotheses: entryState.candidateConstraints.map((item) => item.label).slice(0, 4),
      constraint: "",
      situation: "Пользователь описал проблему, но данных пока мало для жёсткого выбора ограничения.",
      actionWave: {
        enabled: false,
        firstStep: "",
        notNow: "",
        whyThisFirst: ""
      },
      toolRecommendations: mergeSuggestions(suggestionPack(focus, context.userText), context.graphPacket),
      artifact: {
        shouldSave: false,
        title: "",
        summary: "",
        kind: "snapshot"
      }
    }
  };
}

function buildHeuristicDecision(context) {
  const { classification, userText } = context;
  const focus = detectFocus(userText);

  if (classification.type === "url_only") {
    return buildWebsiteDecision(context, false);
  }

  if (classification.type === "url_plus_problem") {
    return buildWebsiteDecision(context, true);
  }

  if (classification.type === "free_text_vague") {
    return buildClarificationDecision(context, focus, normalizeText(classification.cleanText));
  }

  if (classification.type === "unknown") {
    return buildUnknownDecision(context);
  }

  return buildProblemDecision(context);
}

async function readStructuredOutput(response) {
  if (typeof response.output_text === "string" && response.output_text.trim()) {
    return JSON.parse(response.output_text);
  }

  for (const item of response.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && content.text) {
        return JSON.parse(content.text);
      }
    }
  }

  throw new Error("OpenAI response did not contain structured JSON text.");
}

export class OpenAIReasoningClient {
  constructor({ apiKey, baseUrl, model, reasoningEffort }) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.model = model;
    this.reasoningEffort = reasoningEffort;
  }

  async decide(context) {
    const prompt = buildReasoningPrompt(context);
    const response = await fetch(`${this.baseUrl}/responses`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.model,
        reasoning: {
          effort: this.reasoningEffort
        },
        input: [
          {
            role: "system",
            content: [
              {
                type: "input_text",
                text: prompt.system
              }
            ]
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: prompt.user
              }
            ]
          }
        ],
        text: {
          format: {
            type: "json_schema",
            name: "business_diagnostic_decision",
            strict: true,
            schema: DECISION_SCHEMA
          }
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI error ${response.status}: ${errorText}`);
    }

    const json = await response.json();
    return readStructuredOutput(json);
  }
}

export class HeuristicReasoningClient {
  async decide(context) {
    return buildHeuristicDecision(context);
  }
}

export class ReasoningClient {
  constructor(config) {
    this.primary = config.apiKey
      ? new OpenAIReasoningClient(config)
      : null;
    this.fallback = new HeuristicReasoningClient();
  }

  async decide(context) {
    if (!this.primary) {
      return this.fallback.decide(context);
    }

    try {
      return await this.primary.decide(context);
    } catch (error) {
      console.warn("Falling back to heuristic reasoning client:", error.message);
      return this.fallback.decide(context);
    }
  }
}
