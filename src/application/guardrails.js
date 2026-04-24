import {
  BUSINESS_LAYERS,
  BUSINESS_LAYER_CLASSES,
  CONSTRAINT_TYPES,
  ENTRY_PROMOTION_STATES,
  FLOW_TYPES,
  SYSTEM_LAYERS,
  emptyEntryState
} from "../domain/entities.js";

function ensureArray(value, maxItems = 6) {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(value.map((item) => String(item || "").trim()).filter(Boolean))].slice(0, maxItems);
}

function ensureString(value, fallback = "") {
  return String(value || fallback).trim();
}

function clampConfidence(value, fallback = 0.55) {
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    return fallback;
  }
  return Math.max(0, Math.min(1, parsed));
}

function trimSentence(value) {
  return ensureString(value).replace(/[.?!…]+$/u, "");
}

function ensureSentence(value) {
  const normalized = ensureString(value);
  if (!normalized) {
    return "";
  }

  return /[.?!…:]$/u.test(normalized) ? normalized : `${normalized}.`;
}

function normalizeLayer(value, fallback = "management") {
  const normalized = ensureString(value, fallback).toLowerCase();
  return SYSTEM_LAYERS.includes(normalized) ? normalized : fallback;
}

function normalizeCandidateConstraints(value, maxItems = 5) {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set();
  const result = [];

  for (const item of value) {
    const label = ensureString(item?.label);
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
      layer: normalizeLayer(item?.layer),
      confidence: clampConfidence(item?.confidence, 0.45),
      whyPossible: ensureString(item?.whyPossible, "Эта версия пока выглядит правдоподобной гипотезой."),
      whatWouldDisprove: ensureString(
        item?.whatWouldDisprove,
        "Нужен вопрос или факт, который отделит эту версию от остальных."
      )
    });

    if (result.length >= maxItems) {
      break;
    }
  }

  return result;
}

function normalizeGraphRankedItems(value, maxItems = 5) {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set();
  const result = [];

  for (const item of value) {
    const id = ensureString(item?.id);
    const label = ensureString(item?.label);
    if (!id || !label || seen.has(id)) {
      continue;
    }

    seen.add(id);
    result.push({
      id,
      label,
      layer: normalizeLayer(item?.layer),
      domains: ensureArray(item?.domains, 6),
      score: clampConfidence(item?.score, 0.45),
      supportedBy: ensureArray(item?.supportedBy, 6),
      whyUseful: ensureString(item?.whyUseful)
    });

    if (result.length >= maxItems) {
      break;
    }
  }

  return result;
}

function normalizeDiscriminatingSignals(value, maxItems = 4) {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set();
  const result = [];

  for (const item of value) {
    const question = ensureString(item?.question);
    if (!question || seen.has(question)) {
      continue;
    }

    seen.add(question);
    result.push({
      signal: ensureString(item?.signal, question),
      question,
      separates: ensureArray(item?.separates, 4),
      whyUseful: ensureString(item?.whyUseful, "Этот сигнал лучше всего отделяет ближайшие конкурирующие версии."),
      informationGain: clampConfidence(item?.informationGain, 0.55)
    });

    if (result.length >= maxItems) {
      break;
    }
  }

  return result;
}

function normalizeGraphTrace(value, maxItems = 8) {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set();
  const result = [];

  for (const item of value) {
    const fromSignal = ensureString(item?.fromSignal);
    const viaState = ensureString(item?.viaState);
    const toCause = ensureString(item?.toCause);
    const key = `${fromSignal}:${viaState}:${toCause}`;

    if (!fromSignal || !viaState || !toCause || seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push({
      fromSignal,
      viaState,
      toCause,
      weight: clampConfidence(item?.weight, 0.45)
    });

    if (result.length >= maxItems) {
      break;
    }
  }

  return result;
}

function joinParagraphs(parts) {
  return parts
    .map((item) => ensureString(item))
    .filter(Boolean)
    .join("\n\n");
}

function humanizeConstraintLabel(value) {
  const normalized = trimSentence(value);
  if (!normalized) {
    return "";
  }

  if (/^[A-ZА-Я]{2,}/.test(normalized)) {
    return normalized;
  }

  return normalized.charAt(0).toLowerCase() + normalized.slice(1);
}

function humanizeClaimedCauseForAbout(value) {
  const normalized = trimSentence(value);
  if (!normalized) {
    return "";
  }

  if (/^нехватка\s+/i.test(normalized)) {
    return normalized.replace(/^нехватка\s+/i, "нехватку ");
  }

  return normalized;
}

function stripVisibleTemplateLabels(text) {
  return ensureString(text)
    .replace(/^что я понял:\s*/i, "")
    .replace(/^гипотезы:\s*/i, "")
    .replace(/^почему это важно:\s*/i, "")
    .replace(/^следующий шаг:\s*/i, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function looksMechanicalResponse(text) {
  const normalized = ensureString(text).toLowerCase();
  if (!normalized) {
    return true;
  }

  const patterns = [
    /^что я понял:/i,
    /^гипотезы:/i,
    /^почему это важно:/i,
    /^следующий шаг:/i,
    /сейчас вижу две рабочие версии/i,
    /сейчас вижу рабочую версию/i,
    /^похоже,\s*тебе нужен/i
  ];

  return patterns.some((pattern) => pattern.test(normalized));
}

function polishSurfaceText(text) {
  return ensureString(text)
    .replace(/чтобы не гадать/gi, "чтобы не перепутать симптом с конструкцией")
    .replace(/похоже,\s*ты\s*просто\s*открыл\s*чат\./gi, "Привет. Давай сразу зацепимся за реальный бизнес-сигнал.")
    .replace(/в юнит-экономика\s*\(unit economics\)/gi, "в юнит-экономике (unit economics)")
    .replace(/ломается в юнит-экономика\s*\(unit economics\)/gi, "ломается в юнит-экономике (unit economics)")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function inferUserLanguage(context) {
  const sample = [
    ensureString(context.userText),
    ...((Array.isArray(context.history) ? context.history : []).slice(-6).map((item) => ensureString(item?.text)))
  ]
    .join(" ")
    .replace(/\/[a-z0-9_]+/gi, " ")
    .trim();

  if (!sample) {
    return "ru";
  }

  const cyrillicCount = (sample.match(/[А-Яа-яЁё]/g) || []).length;
  const latinCount = (sample.match(/[A-Za-z]/g) || []).length;
  return cyrillicCount >= latinCount ? "ru" : "en";
}

function explainBusinessTerms(text, context) {
  let result = ensureString(text);
  const language = inferUserLanguage(context);

  if (language !== "ru") {
    return result;
  }

  const replacements = [
    {
      test: /ICP/i,
      alreadyExplained: /(ICP\s*[—-]|профиль\s+целевого\s+клиента)/i,
      replace: "профиль целевого клиента (ICP)"
    },
    {
      test: /JTBD/i,
      alreadyExplained: /(JTBD\s*[—-]|задач[а-я]+\s+клиента,\s+ради\s+которой\s+он\s+покупает)/i,
      replace: "задача клиента, ради которой он покупает (JTBD)"
    },
    {
      test: /\bSLA\b/i,
      alreadyExplained: /(SLA\s*[—-]|норматив\s+по\s+скорости\s+реакции)/i,
      replace: "норматив по скорости реакции (SLA)"
    },
    {
      test: /GTM/i,
      alreadyExplained: /(GTM\s*[—-]|модел[ья]\s+выхода\s+на\s+рынок)/i,
      replace: "модель выхода на рынок (GTM)"
    },
    {
      test: /unit economics/i,
      alreadyExplained: /(юнит-экономик|unit economics\s*[—-])/i,
      replace: "юнит-экономика (unit economics)"
    }
  ];

  for (const item of replacements) {
    if (item.test.test(result) && !item.alreadyExplained.test(result)) {
      result = result.replace(item.test, item.replace);
    }
  }

  result = result
    .replace(/\bв unit economics\b/gi, "в юнит-экономике (unit economics)")
    .replace(/в юнит-экономика\s*\(unit economics\)/gi, "в юнит-экономике (unit economics)")
    .replace(/ломается в юнит-экономика\s*\(unit economics\)/gi, "ломается в юнит-экономике (unit economics)")
    .replace(/\bhandoff\b/gi, "передачу лида дальше по этапам")
    .replace(/\bownership\b/gi, "закреплённую ответственность")
    .replace(/\brouting\b/gi, "маршрутизацию лида")
    .replace(/\bowner'?ов\b/gi, "закреплённых ответственных")
    .replace(/\bowner\b/gi, "ответственного");

  return result;
}

function isOpeningMessageContext(context) {
  const text = ensureString(context.userText).toLowerCase();
  const historyLength = Array.isArray(context.history) ? context.history.length : 0;
  if (/^\/start$/i.test(text)) {
    return true;
  }

  return historyLength <= 1 && /^(привет|здравствуй|здравствуйте|добрый день|добрый вечер)$/i.test(text);
}

function currentWordCount(context) {
  return ensureString(context.userText)
    .split(/\s+/)
    .filter(Boolean)
    .length;
}

function latestAssistantText(context) {
  const history = Array.isArray(context.history) ? context.history : [];
  const lastAssistant = [...history].reverse().find((item) => item.role === "assistant");
  return ensureString(lastAssistant?.text);
}

function latestAssistantQuestionText(context) {
  const text = latestAssistantText(context);
  if (!text.includes("?")) {
    return "";
  }

  const paragraphs = text
    .split(/\n+/)
    .map((item) => ensureString(item))
    .filter(Boolean);
  const questionParagraph = [...paragraphs].reverse().find((item) => item.includes("?")) || text;
  const questionEnd = questionParagraph.lastIndexOf("?");
  const uptoQuestion = questionParagraph.slice(0, questionEnd + 1);
  const sentenceBreak = Math.max(
    uptoQuestion.lastIndexOf(". "),
    uptoQuestion.lastIndexOf("! "),
    uptoQuestion.lastIndexOf(": ")
  );

  if (sentenceBreak >= 0) {
    return ensureString(uptoQuestion.slice(sentenceBreak + 2));
  }

  return ensureString(uptoQuestion);
}

function textLooksLikeLeadFlowUpstream(text) {
  return /icp|сегмент|целев|приоритет|квалификац|всё подряд|неразобран|смешанн|шум/i.test(
    ensureString(text).toLowerCase()
  );
}

function textLooksLikeLeadFlowLocal(text) {
  return /sla|владелец|ownership|кто отвечает|кто должен|очеред|сколько.*минут|сколько.*час|срок|перв[ао]й\s+(звон|ответ|контакт|касани)/i.test(
    ensureString(text).toLowerCase()
  );
}

function assistantAskedLocalLeadQuestion(context) {
  return textLooksLikeLeadFlowLocal(latestAssistantQuestionText(context));
}

function assistantAskedUpstreamLeadQuestion(context) {
  return textLooksLikeLeadFlowUpstream(latestAssistantQuestionText(context));
}

function openingNeedsGreeting(context, visibleResponse) {
  if (!isOpeningMessageContext(context)) {
    return false;
  }

  return !/привет|здравствуй|здравствуйте|добрый/i.test(ensureString(visibleResponse).toLowerCase());
}

function visibleResponseRepeatsLeadQuestionFamily(visibleResponse, context) {
  const previous = latestAssistantQuestionText(context);
  if (!previous || !visibleResponse) {
    return false;
  }

  const repeatedLocal = textLooksLikeLeadFlowLocal(previous) && textLooksLikeLeadFlowLocal(visibleResponse);
  const repeatedUpstream = textLooksLikeLeadFlowUpstream(previous) && textLooksLikeLeadFlowUpstream(visibleResponse);

  return repeatedLocal || repeatedUpstream;
}

function isShortFollowUpContext(context) {
  return currentWordCount(context) <= 5 && Array.isArray(context.history) && context.history.length > 0;
}

function observedSignalSet(context, entryState) {
  return new Set(
    ensureArray([
      ...(entryState?.observedSignals || []),
      ...(context.graphPacket?.observedSignals || [])
    ], 12)
      .map((item) => ensureString(item).toLowerCase())
      .filter(Boolean)
  );
}

function userAskedWhy(context) {
  return /почему|зачем|с чего|на каком основании/i.test(ensureString(context.userText).toLowerCase());
}

function userAskedHow(context) {
  return /как это|как понять|как проверить|что делать с этим|что с этим делать/i.test(
    ensureString(context.userText).toLowerCase()
  );
}

function userAskedHowToDefineICP(context) {
  return /как\s+(определить|понять|собрать|описать)\s+icp/i.test(
    ensureString(context.userText).toLowerCase()
  );
}

function userAskedWhatIsICP(context) {
  return /что\s+такое\s+icp|что\s+значит\s+icp|icp\s+это\s+что/i.test(
    ensureString(context.userText).toLowerCase()
  );
}

function userAskedMeaning(context) {
  return /что ты имеешь в виду|что именно ты имеешь в виду|в смысле|что ты хочешь сказать|объясни, что ты имеешь в виду/i.test(
    ensureString(context.userText).toLowerCase()
  );
}

function userAskedDirection(context) {
  return /почему мы идем именно сюда|почему ид[её]м именно сюда|почему ид[её]м сюда|почему именно этот вопрос|почему именно в эту сторону/i.test(
    ensureString(context.userText).toLowerCase()
  );
}

function userAskedRoadmap(context) {
  return /всю\s+схем|по\s+какой\s+схем|как\s+мы\s+пойд[её]м|в\s+какой\s+последовательност|какой\s+порядок|какая\s+логика\s+дальше|какой\s+план\s+проверки/i.test(
    ensureString(context.userText).toLowerCase()
  );
}

function userAskedNext(context) {
  return /^((ну )?ок|хорошо|ладно)[, ]*(и )?а дальше\??$|^что дальше\??$|^и дальше\??$|^что потом\??$/i.test(
    ensureString(context.userText).toLowerCase()
  );
}

function userExpressesDoubt(context) {
  return /не уверен|сомневаюсь|не думаю|не похоже|мне не очень верится|не факт|не уверен, что/i.test(
    ensureString(context.userText).toLowerCase()
  );
}

function latestLeadScenarioOpener(context, entryState, claimedCause) {
  const claimedCauseForAbout = humanizeClaimedCauseForAbout(claimedCause);

  if (latestTextSuggestsWarmInbound(context)) {
    return "Ок, это уже заметно сужает поле.";
  }

  if (latestTextSuggestsEarlyFunnelStage(context)) {
    return "Хорошо, это уже важная развилка: поломка сидит до первого касания.";
  }

  if (latestTextRestatesCapacityClaim(context) && claimedCause && assistantAskedLocalLeadQuestion(context)) {
    return `Слышу, что ты снова возвращаешь нас к версии про ${claimedCauseForAbout || claimedCause}. Я бы здесь как раз не покупал её раньше времени.`;
  }

  if (latestTextRestatesCapacityClaim(context) && claimedCause) {
    return `Слышу версию про ${claimedCauseForAbout || claimedCause}, но я бы пока не делал её несущей.`;
  }

  if (userLikelyClaimedCause(context, entryState) && claimedCause) {
    return `Я бы пока не спешил покупать версию про ${claimedCauseForAbout || claimedCause} как главную.`;
  }

  if (isShortFollowUpContext(context)) {
    return "Ок, это уже двигает картину вперёд.";
  }

  return ensureSentence(entryState.claimedProblem ? "Сейчас я бы смотрел на это так" : "Картина пока складывается так");
}

function buildSpreadLine(spread, context) {
  if (latestTextSuggestsWarmInbound(context)) {
    return `Тогда я бы держал три версии: ${spread[0]}; ${spread[1]}; ${spread[2]}.`;
  }

  if (latestTextRestatesCapacityClaim(context)) {
    return `Для меня здесь пока три версии: ${spread[0]}; ${spread[1]}; ${spread[2]}.`;
  }

  if (isShortFollowUpContext(context)) {
    return `Пока поле такое: ${spread[0]}; ${spread[1]}; ${spread[2]}.`;
  }

  return `Сейчас я бы держал три версии: ${spread[0]}; ${spread[1]}; ${spread[2]}.`;
}

function buildLeadScenarioField(spread, context, entryState) {
  const signals = observedSignalSet(context, entryState);
  const hasWarmInbound = signals.has("warm_inbound_demand") || latestTextSuggestsWarmInbound(context);
  const hasSlowFirstResponse = signals.has("slow_first_response") || latestTextSuggestsEarlyFunnelStage(context);
  const hasLeadOverload = signals.has("lead_overload");
  const strategicSplit = strategicSplitNeeded(context, entryState);

  if (strategicSplit) {
    return "Сейчас я бы уже держал не одну верхнюю версию, а две. Либо сам ICP и сегментация выбраны слишком широко, и рынок несёт вам лишний поток, либо сегмент в целом верный, но это не переведено в живые правила отбора, приоритета и передачи дальше.";
  }

  if (latestTextSuggestsWarmInbound(context)) {
    return "Тёплый поток отрезает только самую грубую версию про совсем случайный спрос. Но тёплый ещё не значит целевой. Для меня здесь остаются три версии: продавцы руками разбирают смешанный вход; ICP и приоритеты не переведены в живую обработку; или сам первый контур не держит ownership и очередь.";
  }

  if (latestTextLooksLikeLeadVolumeAndTiming(context) && hasSlowFirstResponse) {
    return "100 лидов в месяц на продавца и сутки до первого касания сами по себе ещё не объясняют корень. Для меня это скорее сигнал, что первый контур собран слабо: фильтрация, приоритет и ownership не держат живой поток как систему.";
  }

  if (latestTextRestatesCapacityClaim(context) && hasWarmInbound) {
    return "На тёплом потоке я бы пока не спорил про ресурс, а смотрел глубже: почему продавцы вообще тащат на себе разбор входа и не работает ли у вас вместо продаж ручная предквалификация.";
  }

  if (latestTextSuggestsEarlyFunnelStage(context)) {
    return "Это уже переносит проблему в сам вход, а не в переговоры или дожим. Значит сейчас важнее не спорить о ресурсе, а отделить слабую фильтрацию потока от поломки ownership и первого отклика.";
  }

  if (isShortFollowUpContext(context) && (hasWarmInbound || hasSlowFirstResponse || hasLeadOverload)) {
    return "Поле уже стало уже. Я бы здесь держал не весь список причин, а две главные развилки: поток плохо фильтруется до продавца, или сам первый контур не собран как работающая конструкция.";
  }

  return buildSpreadLine(spread, context);
}

function buildWhyAndQuestion(response, context) {
  const why = ensureSentence(response.whyItMatters);
  const next = ensureString(response.nextStep);

  if (userAskedWhy(context)) {
    return joinParagraphs([
      why,
      next
    ]);
  }

  if (userAskedHow(context)) {
    return joinParagraphs([
      `${why} Я бы сейчас не расползался в длинный план, а быстро отделил одну версию от другой.`,
      next
    ]);
  }

  return `${why} ${next}`.trim();
}

function buildLeadScenarioWhy(response, context, entryState) {
  if (strategicSplitNeeded(context, entryState)) {
    return "Одинаковые правила и похожая конверсия у команды ослабляют версию про конкретных людей. Значит сейчас важнее не спорить о менеджерах, а отделить ошибку в самой сегментации и ICP от ошибки перевода этих правил в живую коммерческую работу.";
  }

  if (latestTextSuggestsWarmInbound(context)) {
    return "Тёплый вход убирает только самую простую отговорку про слабый спрос. Теперь важно не перепутать локальный перегруз с тем, что до продавца вообще не работает фильтр, приоритет и нормальная квалификация.";
  }

  if (latestTextLooksLikeLeadVolumeAndTiming(context)) {
    return "При таком объёме и сроке очень легко усилить не ту проблему. Любое усиление контура имеет смысл только если сначала проверить, что продавцы действительно получают уже отфильтрованный и приоритизированный поток.";
  }

  if (latestTextSuggestsEarlyFunnelStage(context)) {
    return "Раз поломка сидит до первого касания, вопрос уже не только в самом объёме работ. Такие сбои часто создаются конструкцией входа: что вообще доходит до продавца, кто это держит и по каким правилам.";
  }

  if (latestTextRestatesCapacityClaim(context)) {
    return "Перегруз первого контура я вижу, но он вполне может быть следствием. Если продавцы тащат на себе разбор смешанного потока или ручную предквалификацию, простое усиление контура лечит симптом, а не саму конструкцию.";
  }

  if (isLeadFlowScenarioContext(context, entryState)) {
    return "Здесь опасно рано схлопнуться в локальную версию. Иначе легко принять ближайшую операционную боль за ограничение, которое на самом деле сидит в квалификации, сегментации или ownership.";
  }

  return ensureSentence(response.whyItMatters);
}

function buildLeadScenarioWhyAndQuestion(response, context, entryState) {
  const why = ensureSentence(buildLeadScenarioWhy(response, context, entryState));
  const next = ensureString(response.nextStep);

  if (userAskedWhy(context)) {
    return joinParagraphs([
      why,
      next
    ]);
  }

  if (userAskedHow(context)) {
    return joinParagraphs([
      `${why} Я бы здесь не расползался в длинный план, пока не отделил одну версию от другой.`,
      next
    ]);
  }

  return `${why} ${next}`.trim();
}

function buildMetaWhySurfaceResponse(response, entryState, context) {
  const claimedCause = ensureString(entryState.claimedCause);
  const claimedCauseForAbout = humanizeClaimedCauseForAbout(claimedCause);
  const spread = summarizeConstraintSpread(entryState.candidateConstraints || [], 3);
  const signals = observedSignalSet(context, entryState);
  const opening = claimedCause
    ? `Потому что версия про ${claimedCauseForAbout || claimedCause} здесь пока только одна из рабочих, а не самая сильная.`
    : "Потому что здесь рано фиксировать одну причину как главную.";

  const middle = isLeadFlowScenarioContext(context, entryState)
    ? strategicSplitNeeded(context, entryState)
      ? "Сейчас мне нужно не выбрать красивую верхнюю историю, а развести две сильные стратегические версии: сам ICP и сегментация заданы неверно, или они в целом верны, но не превращены в рабочее правило отбора, приоритета и передачи дальше."
      : signals.has("warm_inbound_demand")
      ? "На тёплом входе суточный провал до первого касания всё ещё не доказывает, что корень уже точно в ресурсе. Сначала мне нужно отделить локальный перегруз от версии, что поток плохо фильтруется и приоритеты до продавца просто не доведены."
      : "Сначала мне нужно отделить локальный перегруз от двух других версий: в продавцов летит смешанный поток, или ICP и приоритеты вообще не доведены до живой обработки."
    : spread.length >= 3
      ? `Сейчас мне важнее отделить ${spread[2]} от версий про ${spread[0]} и ${spread[1]}.`
      : ensureSentence(response.whyItMatters);

  return joinParagraphs([
    opening,
    middle,
    ensureString(response.nextStep)
  ]);
}

function isLeadFlowScenarioContext(context, entryState) {
  const text = ensureString(context.userText).toLowerCase();
  const observedSignals = ensureArray([
    ...(entryState?.observedSignals || []),
    ...(context.graphPacket?.observedSignals || [])
  ], 12);

  const persistentLeadSignals = new Set([
    "lead_overload",
    "slow_first_response",
    "team_overload_reported",
    "qualification_stage_exists",
    "qualification_stage_overloaded",
    "mixed_inbound_confirmed",
    "qualification_missing_confirmed",
    "priority_rules_missing",
    "qualification_rules_consistent",
    "conversion_uniform_across_team",
    "strategic_icp_doubt",
    "target_leads_confirmed",
    "warm_inbound_demand"
  ]);

  return observedSignals.some((item) => persistentLeadSignals.has(item)) ||
    (/заяв|лид|входящ/.test(text) && /не усп|люд|ответ|очеред|обработ|перегруж|продавц|менеджер|штат/.test(text));
}

function questionLooksUpstream(question) {
  return /icp|сегмент|целев|приоритет|квалификац|канал|рынк|обещан|неразобран|стратег/i.test(question);
}

function questionLooksLocal(question) {
  return /sla|владелец|кто отвечает|кто должен|очеред|сколько.*минут|сколько.*час|срок|перв[ао]й\s+(звон|ответ|контакт|касани)|ownership/i.test(question);
}

function questionLooksFieldSeparating(question) {
  return /целев|квалификац|всё подряд|неразобран|этап квалификац|сегмент|приоритет/i.test(question);
}

function questionLooksDirectFlowSplit(question) {
  return /все входящие|всё подряд|этап квалификац|неразобран|целевыми/i.test(question);
}

function questionAssumesQualificationMissing(question) {
  return /есть\s+ли\s+до\s+продавца\s+этап\s+квалификац|до\s+продавца\s+вообще\s+есть\s+слой|без\s+отдельной\s+квалификац|этап\s+квалификац.*отсеивает/i.test(
    question
  );
}

function isGenericPlaceholderConstraint(label) {
  return /пользователь видит локальную боль|сло[^,]*, который пока не назван прямо/i.test(
    ensureString(label).toLowerCase()
  );
}

function latestTextSuggestsWarmInbound(context) {
  const text = ensureString(context.userText).toLowerCase();
  return /т[её]пл|входящ/i.test(text);
}

function latestTextSuggestsEarlyFunnelStage(context) {
  const text = ensureString(context.userText).toLowerCase();
  return /до\s+первого\s+контакт|перв[ао]е?\s+касани/i.test(text);
}

function latestTextRestatesCapacityClaim(context) {
  const text = ensureString(context.userText).toLowerCase();
  return /люди\s+не\s+справ|не\s+хватает|перегруж|не\s+успева/i.test(text);
}

function latestTextLooksLikeLeadVolumeAndTiming(context) {
  const text = ensureString(context.userText).toLowerCase();
  return /\d/.test(text) && /(день|дня|час|минут|в месяц|в неделю|касани|контакт)/i.test(text);
}

function latestTextAlreadyResolvesUpstreamLayer(context) {
  const text = ensureString(context.userText).toLowerCase();
  return /icp|квалификац|предквалификац|приоритет|сегмент|маршрутиз|всё подряд|смешан|неразобран|целев/i.test(text);
}

function latestTextMentionsQualificationLayer(context) {
  const text = ensureString(context.userText).toLowerCase();
  return /есть\s+менеджер.*квалификац|есть\s+этап.*квалификац|на\s+этапе\s+квалификац|квалификац[ияи].*есть/i.test(text);
}

function latestTextResolvesQualificationMechanics(context) {
  const text = ensureString(context.userText).toLowerCase();
  return /всё\s+подряд|сам.*рук|вручную|целев|приоритет|размеченн|маркиров|отбира/i.test(text);
}

function latestTextMentionsUniformRules(context) {
  const text = ensureString(context.userText).toLowerCase();
  return /одни\s+и\s+те\s+же\s+правил|по\s+одн(?:им|ой)\s+и\s+тем\s+же\s+правил|правил[а-я]*\s+у\s+всех\s+одинаков|у\s+всех\s+одинаков[а-я]*\s+правил/i.test(text);
}

function latestTextMentionsUniformConversion(context) {
  const text = ensureString(context.userText).toLowerCase();
  return /конверси[яиюе].*у\s+всех.*одинаков|у\s+всех.*конверси[яиюе].*одинаков|конверси[яиюе].*плюс-минус\s+одинаков|плюс-минус\s+одинаков[а-я]*\s+конверси/i.test(text);
}

function latestTextRaisesStrategicIcpDoubt(context) {
  const text = ensureString(context.userText).toLowerCase();
  return /неправильн[а-я]*\s+.*icp|неверн[а-я]*\s+.*icp|ошиб[а-я]*\s+.*icp|неправильн[а-я]*\s+сегментац|неверн[а-я]*\s+сегментац|jtbd|job\s+to\s+be\s+done|утп/i.test(text);
}

function qualificationLayerExistsInContext(context, entryState) {
  const signals = observedSignalSet(context, entryState);
  return signals.has("qualification_stage_exists") || signals.has("qualification_stage_overloaded") || latestTextMentionsQualificationLayer(context);
}

function strategicSplitNeeded(context, entryState) {
  const signals = observedSignalSet(context, entryState);
  const text = ensureString(context.userText).toLowerCase();
  const qualificationPresent = signals.has("qualification_stage_exists") || latestTextMentionsQualificationLayer(context);
  const qualificationOverloaded =
    signals.has("qualification_stage_overloaded") ||
    signals.has("team_overload_reported") ||
    /зашива|перегруж|не успева/i.test(text);
  const rulesAligned = signals.has("qualification_rules_consistent") || latestTextMentionsUniformRules(context);
  const conversionAligned = signals.has("conversion_uniform_across_team") || latestTextMentionsUniformConversion(context);

  return latestTextRaisesStrategicIcpDoubt(context) ||
    signals.has("strategic_icp_doubt") ||
    (rulesAligned && conversionAligned) ||
    (qualificationPresent && qualificationOverloaded && rulesAligned);
}

function userExplicitlyClaimedStaffing(context) {
  const text = ensureString(context.userText).toLowerCase();
  return /не\s+хватает\s+(люд|продав|менеджер)|нехватк[аи]?\s+(люд|продав|менеджер)/i.test(text);
}

function leadFlowAllowsPureStaffingVersion(context, entryState) {
  const signals = observedSignalSet(context, entryState);
  const text = ensureString(context.userText).toLowerCase();
  const targetFlowConfirmed =
    signals.has("target_leads_confirmed") ||
    /почти\s+все\s+целев|все\s+лиды?\s+целев|в\s+основном\s+целев/i.test(text);
  const upstreamNoiseStillPossible =
    signals.has("mixed_inbound_confirmed") ||
    signals.has("qualification_missing_confirmed") ||
    signals.has("priority_rules_missing") ||
    /всё\s+подряд|смешан|неразобран|квалификац|предквалификац|приоритет/i.test(text);

  return targetFlowConfirmed && !upstreamNoiseStillPossible;
}

function shouldSuppressStaffingSurface(context, entryState) {
  return isLeadFlowScenarioContext(context, entryState) &&
    !leadFlowAllowsPureStaffingVersion(context, entryState) &&
    !userExplicitlyClaimedStaffing(context);
}

function sanitizeLeadFlowStaffingSurface(text, context, entryState) {
  let sanitized = ensureString(text);
  if (!shouldSuppressStaffingSurface(context, entryState)) {
    return sanitized;
  }

  sanitized = sanitized
    .replace(/я бы пока не спешил с версией про нехватк[ауеи]\s+(людей|продавцов|менеджеров)/gi, "я бы пока не фиксировал объяснение через чистую мощность")
    .replace(/нехватк[аиуые]?\s+(люд(?:ей|и)?|продавц(?:ов|а)?|менеджер(?:ов|а)?)/gi, "чистую нехватку мощности")
    .replace(/не хватает\s+(людей|продавцов|менеджеров)/gi, "не хватает чистой мощности")
    .replace(/проблема только в мощности команды/gi, "корень уже точно только в мощности")
    .replace(/усиление команды/gi, "усиление контура")
    .replace(/перегруз команды/gi, "перегруз первого контура")
    .replace(/вопрос уже не только в людях/gi, "вопрос уже не только в самом объёме работ");

  return sanitized.replace(/\s{2,}/g, " ").trim();
}

function shouldHoldLeadFlowInClarify(context, entryState) {
  if (!isLeadFlowScenarioContext(context, entryState)) {
    return false;
  }

  if (strategicSplitNeeded(context, entryState)) {
    return true;
  }

  if (latestTextAlreadyResolvesUpstreamLayer(context)) {
    return false;
  }

  return (
    latestTextSuggestsEarlyFunnelStage(context) ||
    latestTextSuggestsWarmInbound(context) ||
    latestTextRestatesCapacityClaim(context) ||
    latestTextLooksLikeLeadVolumeAndTiming(context)
  );
}

function buildLeadScenarioSpread(context, entryState) {
  const spread = [
    {
      label: "ICP или сегментация могут быть стратегически выбраны слишком широко, поэтому в систему изначально приходит лишний спрос",
      layer: "strategy",
      confidence: 0.63,
      whyPossible: "Если перегруз общий, а конверсия у команды похожая, корень может сидеть не в людях и не только в операционке, а в самой рамке сегмента и обещания рынку.",
      whatWouldDisprove: "Если сегмент выбран узко и корректно, а проблема остаётся только в переводе правил в квалификацию и handoff."
    },
    {
      label: "Входящий поток смешивает целевых и нецелевых лидов, поэтому продавцы тонут не в спросе, а в шуме",
      layer: "commercial",
      confidence: 0.62,
      whyPossible: "Большой поток может быть проблемой качества и фильтрации, а не только объёма.",
      whatWouldDisprove: "Если почти все последние лиды реально целевые и достойны быстрого ответа."
    },
    {
      label: "ICP, сегменты и правила приоритета не переведены из стратегии в живую коммерческую работу",
      layer: "strategy",
      confidence: 0.6,
      whyPossible: "Когда стратегия не превращена в ICP, квалификацию и маршрутизацию, продавцы забирают в работу всё подряд.",
      whatWouldDisprove: "Если сегменты и критерии приоритета уже жёстко работают в маркетинге, квалификации и handoff."
    },
    {
      label: "Даже хорошие правила не собраны в устойчивый контур исполнения: не закреплены ownership, handoff и контроль по входу",
      layer: "management",
      confidence: 0.56,
      whyPossible: "Даже при вменяемом ICP система может захлёбываться, если правило не превращено в управляемый контур с понятным владельцем и контролем исполнения.",
      whatWouldDisprove: "Если ownership, handoff и контроль по входу уже жёстко закреплены и одинаково держатся без ручного вмешательства."
    },
    {
      label: "Первый отклик и ownership не держатся как устойчивая операционная конструкция",
      layer: "operations",
      confidence: 0.58,
      whyPossible: "Даже хороший поток ломается, если первый контакт не закреплён, не разделён по приоритетам или живёт в общей очереди.",
      whatWouldDisprove: "Если ownership, SLA и маршрутизация уже работают стабильно по приоритетным лидам."
    },
    {
      label: "Продавцы тащат на себе разбор, квалификацию и сортировку входа вместо продажи",
      layer: "commercial",
      confidence: 0.54,
      whyPossible: "Перегруз часто создаётся не количеством людей, а тем, что в продажи попадает лишняя работа, которая должна отрезаться раньше.",
      whatWouldDisprove: "Если продавцы уже получают только готовый целевой поток, а перегруз всё равно остаётся."
    }
  ];

  if (leadFlowAllowsPureStaffingVersion(context, entryState)) {
    spread.push({
      label: "После фильтрации и приоритета мощности команды уже реально не хватает",
      layer: "people",
      confidence: 0.48,
      whyPossible: "Эта версия имеет смысл только когда поток уже целевой, а лишняя работа до продавца действительно снята.",
      whatWouldDisprove: "Если часть перегруза всё ещё уходит после квалификации, маршрутизации или выноса лишней ручной работы из продавцов."
    });
  }

  return spread;
}

function ensureMultiLayerSpread(candidateConstraints, context, entryState) {
  let constraints = normalizeCandidateConstraints(candidateConstraints, 5);
  const uniqueLayers = new Set(constraints.map((item) => item.layer));

  if (isLeadFlowScenarioContext(context, entryState)) {
    const specificConstraints = constraints.filter((item) => !isGenericPlaceholderConstraint(item.label));
    constraints = normalizeCandidateConstraints([...buildLeadScenarioSpread(context, entryState), ...specificConstraints], 5);
  } else if (uniqueLayers.size < 3 && context.classification.type === "free_text_problem") {
    constraints = normalizeCandidateConstraints([...constraints, ...inferGenericConstraints(context)], 5);
  }

  return constraints;
}

function pickBestNextQuestion(context, entryState, graphAnalysis) {
  const current = ensureString(entryState.nextBestQuestion);
  const candidates = normalizeDiscriminatingSignals([
    ...(entryState.discriminatingSignals || []),
    ...(graphAnalysis?.discriminatingSignals || []),
    ...(context.graphPacket?.discriminatingSignals || [])
  ], 4);
  const signals = observedSignalSet(context, entryState);
  const hasWarmInbound = signals.has("warm_inbound_demand");
  const hasSlowFirstResponse = signals.has("slow_first_response");
  const upstreamResolved = latestTextAlreadyResolvesUpstreamLayer(context);
  const qualificationLayerExists = qualificationLayerExistsInContext(context, entryState);
  const previousAssistantWasLocal = assistantAskedLocalLeadQuestion(context);
  const previousAssistantWasUpstream = assistantAskedUpstreamLeadQuestion(context);
  const strategicSplit = strategicSplitNeeded(context, entryState);

  if (isLeadFlowScenarioContext(context, entryState)) {
    if (strategicSplit) {
      return "Тогда мне нужен не выбор версии, а факт из системы: где у вас уже жёстко закреплены правила отбора и приоритета — в рекламе, в квалификации, в маршрутизации дальше, а где команда до сих пор решает это вручную?";
    }

    if (qualificationLayerExists && !latestTextResolvesQualificationMechanics(context)) {
      return hasWarmInbound
        ? "Если этап квалификации уже есть, тогда вопрос не в его наличии, а в его роли: он получает уже размеченный тёплый поток или сам руками решает, кто вообще целевой и кому идти первым?"
        : "Если этап квалификации уже есть, тогда вопрос не в его наличии, а в его роли: он получает уже размеченный поток или сам руками решает, кто вообще целевой, кого отсеять и кому идти первым?";
    }

    if (latestTextSuggestsWarmInbound(context) && !upstreamResolved) {
      return "Тёплый ещё не значит целевой. До продавца у вас есть слой квалификации и приоритета, который отделяет ICP-лид от просто входящего интереса, или в работу идёт всё подряд?";
    }

    if (latestTextLooksLikeLeadVolumeAndTiming(context) && hasSlowFirstResponse && !upstreamResolved) {
      return "При таком объёме и сроке меня больше интересует не штат сам по себе, а фильтрация входа. До продавца у вас есть квалификация и приоритет, или в работу попадает всё подряд?";
    }

    if (latestTextSuggestsEarlyFunnelStage(context) && !upstreamResolved) {
      return "До первого контакта у вас вообще есть слой квалификации и приоритета, который отсеивает слабый поток раньше продавца, или продавцы сами разбирают всё подряд?";
    }

    if (latestTextRestatesCapacityClaim(context) && !upstreamResolved) {
      if (hasWarmInbound) {
        return "Возьми последние 20 тёплых входящих и скажи по факту: сколько из них продавец мог взять в работу сразу, а сколько ему всё равно пришлось руками квалифицировать и решать, стоит ли вести дальше?";
      }
      return "Возьми последние 20 входящих и скажи по факту: сколько из них дошли до продавца уже с понятным приоритетом, а сколько команда сначала руками разбирала и решала, кто вообще целевой?";
    }

    if (previousAssistantWasLocal && latestTextRestatesCapacityClaim(context) && !upstreamResolved) {
      return hasWarmInbound
        ? "Скажу жёстче: продавцы у вас работают уже с отобранным тёплым ICP-потоком, или они сначала сами руками отделяют живых клиентов от всего остального?"
        : "Скажу жёстче: в продавцов у вас попадает уже отобранный целевой поток, или они сначала руками разбирают всё подряд?";
    }

    if (previousAssistantWasUpstream && !upstreamResolved) {
      return hasWarmInbound
        ? "Тогда уточню уже в лоб: тёплый вход у вас почти весь считается целевым, или без отдельной квалификации в продажи всё равно попадает смешанный поток?"
        : "Тогда уточню в лоб: в продажи у вас идёт уже целевой поток или без отдельной квалификации команда сначала вручную разбирает всё подряд?";
    }

    const directFlowSplitQuestion = candidates.find((item) => questionLooksDirectFlowSplit(item.question));
    if (directFlowSplitQuestion) {
      return directFlowSplitQuestion.question;
    }

    const fieldSeparatingQuestion = candidates.find((item) => questionLooksFieldSeparating(item.question));
    if (fieldSeparatingQuestion) {
      return fieldSeparatingQuestion.question;
    }

    const upstreamQuestion = candidates.find((item) => questionLooksUpstream(item.question));
    if (upstreamQuestion) {
      return upstreamQuestion.question;
    }

    const localQuestion = candidates.find(
      (item) => !questionLooksLocal(item.question) && !(qualificationLayerExists && questionAssumesQualificationMissing(item.question))
    );
    if (localQuestion) {
      return localQuestion.question;
    }
  }

  return current || candidates[0]?.question || ensureString(context.graphPacket?.suggestedQuestion);
}

function summarizeConstraintSpread(constraints, maxItems = 3) {
  return (constraints || [])
    .slice(0, maxItems)
    .map((item) => humanizeConstraintLabel(item?.label))
    .filter(Boolean);
}

function summarizeRenderableConstraintSpread(entryState, maxItems = 3) {
  const specificConstraints = (entryState?.candidateConstraints || [])
    .filter((item) => !isGenericPlaceholderConstraint(item?.label))
    .map((item) => humanizeConstraintLabel(item?.label))
    .filter(Boolean);

  if (specificConstraints.length >= 2) {
    return specificConstraints.slice(0, maxItems);
  }

  const graphLabels = [
    ...((entryState?.candidateCauses || []).map((item) => humanizeConstraintLabel(item?.label))),
    ...((entryState?.candidateStates || []).map((item) => humanizeConstraintLabel(item?.label)))
  ].filter(Boolean);

  return [...new Set([...specificConstraints, ...graphLabels])].slice(0, maxItems);
}

function explainSpread(spread) {
  if (spread.length >= 3) {
    return `Для меня здесь пока живы три версии: ${spread[0]}; ${spread[1]}; ${spread[2]}.`;
  }

  if (spread.length === 2) {
    return `Для меня здесь пока живы две версии: ${spread[0]} и ${spread[1]}.`;
  }

  if (spread.length === 1) {
    return `Сейчас у меня на столе сильнее всего лежит версия, что ${spread[0]}.`;
  }

  return "";
}

function describeVersion(label) {
  const normalized = humanizeConstraintLabel(label);
  if (!normalized) {
    return "";
  }

  return `версию, что ${normalized}`;
}

function describeVersionFrom(label) {
  const normalized = humanizeConstraintLabel(label);
  if (!normalized) {
    return "";
  }

  return `версии, что ${normalized}`;
}

function buildWebsiteSurfaceResponse(response) {
  return joinParagraphs([
    `${ensureSentence(response.whatIUnderstood)} ${ensureSentence(response.whyItMatters)}`,
    ensureString(response.nextStep)
  ]);
}

function buildVagueSurfaceResponse(response, context) {
  const understood = ensureSentence(response.whatIUnderstood);
  const language = inferUserLanguage(context);

  if (isOpeningMessageContext(context) && language === "ru") {
    const greeting = `Привет${context.userMeta?.firstName ? `, ${ensureString(context.userMeta.firstName)}` : ""}.`;
    return joinParagraphs([
      `${greeting} Ты попал в бизнес-диагноста. Здесь мы не заполняем анкету и не бросаемся советами вслепую: я помогаю понять, где у бизнеса главное ограничение и что действительно стоит делать первым.`,
      "Обычно логика такая: сначала я быстро сужаю поле по 2-4 коротким ответам, потом собираю 2-3 рабочие версии причины, отделяю симптом от корня и вывожу тебя к первой внятной гипотезе и следующему шагу. В простом кейсе это занимает примерно 3-7 сообщений, в сложном — чуть дольше.",
      "Общаться со мной можно так, как тебе удобнее: текстом, голосом или ссылкой на сайт, если хочешь начать с внешнего разбора.",
      ensureString(response.nextStep)
    ]);
  }

  const opening = isOpeningMessageContext(context)
    ? (understood.toLowerCase().startsWith("привет")
        ? ""
        : `Привет${context.userMeta?.firstName ? `, ${ensureString(context.userMeta.firstName)}` : ""}. `)
    : "";

  return joinParagraphs([
    `${opening}${understood} ${ensureSentence(response.whyItMatters)}`,
    ensureString(response.nextStep)
  ]);
}

function buildDiagnosticClarifySurfaceResponse(response, entryState, context) {
  const claimedCause = ensureString(entryState.claimedCause);
  const constraints = Array.isArray(entryState.candidateConstraints) ? entryState.candidateConstraints.slice(0, 5) : [];
  const strongestAlternative = humanizeConstraintLabel(constraints[0]?.label);
  const secondAlternative = humanizeConstraintLabel(constraints[1]?.label);
  const thirdAlternative = humanizeConstraintLabel(constraints[2]?.label);
  const spread = summarizeRenderableConstraintSpread(entryState, 3);

  if (isLeadFlowScenarioContext(context, entryState) && spread.length >= 3) {
    const opening = latestLeadScenarioOpener(context, entryState, claimedCause);

    return joinParagraphs([
      opening,
      buildLeadScenarioField(spread, context, entryState),
      buildLeadScenarioWhyAndQuestion(response, context, entryState)
    ]);
  }

  if (userLikelyClaimedCause(context, entryState) && claimedCause && spread.length >= 3) {
    return joinParagraphs([
      `Я бы пока не спешил делать версию про ${claimedCause} главной.`,
      buildSpreadLine(spread, context),
      buildWhyAndQuestion(response, context)
    ]);
  }

  if (userLikelyClaimedCause(context, entryState) && claimedCause) {
    const alternatives = [strongestAlternative, secondAlternative].filter(Boolean);
    const alternativesLine = alternatives.length >= 2
      ? `Здесь легко перепутать это с тем, что ${alternatives[0]} или что ${alternatives[1]}.`
      : ensureSentence(response.whyItMatters);

    return joinParagraphs([
      `Я бы пока не фиксировал причину в том, что ${claimedCause}. Это пока версия, а не доказанное ограничение системы.`,
      alternativesLine,
      buildWhyAndQuestion(response, context)
    ]);
  }

  if (spread.length >= 3) {
    return joinParagraphs([
      ensureSentence(response.whatIUnderstood),
      buildSpreadLine(spread, context),
      buildWhyAndQuestion(response, context)
    ]);
  }

  if (strongestAlternative && secondAlternative) {
    return joinParagraphs([
      ensureSentence(response.whatIUnderstood),
      `Сейчас сильнее всего выглядят версии, что ${strongestAlternative} или что ${secondAlternative}${thirdAlternative ? `, а рядом остаётся и версия, что ${thirdAlternative}` : ""}.`,
      buildWhyAndQuestion(response, context)
    ]);
  }

  return joinParagraphs([
    ensureSentence(response.whatIUnderstood),
    buildWhyAndQuestion(response, context)
  ]);
}

function buildMeaningSurfaceResponse(response, entryState) {
  const spread = summarizeRenderableConstraintSpread(entryState, 3);
  const nextQuestion = ensureString(entryState.nextBestQuestion, response.nextStep);

  return joinParagraphs([
    "Имею в виду вот что: ты описываешь боль на поверхности, но это ещё не диагноз.",
    explainSpread(spread) || "У меня здесь пока больше одной рабочей версии, поэтому я не хочу притворяться, что причина уже доказана.",
    `Поэтому я и иду в этот вопрос: ${nextQuestion}`
  ]);
}

function buildHowToDefineIcpSurfaceResponse(entryState) {
  const spread = summarizeRenderableConstraintSpread(entryState, 2);
  const focus = spread.length
    ? `В твоём кейсе я бы смотрел на это не как на термин, а как на фильтр: ${spread[0]}${spread[1] ? `, а рядом проверить ${spread[1]}` : ""}.`
    : "В твоём кейсе я бы смотрел на это не как на термин, а как на фильтр между целевым спросом и шумом.";

  return joinParagraphs([
    "Профиль целевого клиента (ICP) лучше определять не из головы и не красивым портретом, а по факту лучших сделок. Я бы взял последние 20-30 лидов, которые быстрее всего дошли до денег, и посмотрел, что у них повторяется: сегмент, размер, задача, бюджет, срочность и кто принимает решение.",
    `${focus} Потом сравни это с теми лидами, которые сейчас забивают квалификацию: кого менеджер отсеивает, на ком вязнет и кто съедает время без движения дальше. Если хочешь, я следующим сообщением дам тебе короткий шаблон на 5 полей, по которому профиль целевого клиента можно собрать за 15 минут.`
  ]);
}

function buildWhatIsIcpSurfaceResponse(entryState) {
  const spread = summarizeRenderableConstraintSpread(entryState, 2);
  const focus = spread.length
    ? `В твоём кейсе это важно не как красивый термин, а как правило отбора: ${spread[0]}${spread[1] ? `, а рядом проверить ${spread[1]}` : ""}.`
    : "В твоём кейсе это важно не как красивый термин, а как правило отбора между целевым спросом и шумом.";

  return joinParagraphs([
    "Если совсем по-простому, профиль целевого клиента (ICP) — это правило, кто для вас свой клиент, а кто только создаёт шум на входе. Не портрет «идеального клиента», а рабочий фильтр: кому даём приоритет, а кого должны отрезать раньше.",
    `${focus} То есть вопрос не в слове, а в том, превращается ли это правило в рекламу, квалификацию, приоритет и маршрутизацию.`
  ]);
}

function buildDirectionSurfaceResponse(response, entryState) {
  const spread = summarizeRenderableConstraintSpread(entryState, 3);
  const nextQuestion = ensureString(entryState.nextBestQuestion, response.nextStep);
  if (ensureArray(entryState?.candidateConstraints, 6).some((item) => /icp|сегментац/i.test(ensureString(item?.label))) &&
    ensureArray(entryState?.candidateConstraints, 6).some((item) => /правил|квалификац|приоритет|маршрутиз|передач/i.test(ensureString(item?.label)))) {
    return joinParagraphs([
      "Потому что я сейчас держу не одну верхнюю версию, а две.",
      "Либо сам ICP и сегментация выбраны неверно, и вы кормите систему лишним потоком ещё на входе. Либо сегмент в целом верный, но он не доведён до рабочих правил отбора, приоритета и передачи дальше.",
      nextQuestion
    ]);
  }

  const contrast = spread.length >= 2
    ? `Он быстрее всего отделяет ${describeVersion(spread[0])} от ${describeVersionFrom(spread[1])}${spread[2] ? ` и не даёт потерять из виду ${describeVersionFrom(spread[2])}` : ""}.`
    : "Он быстрее всего отделяет рабочие версии друг от друга.";

  return joinParagraphs([
    "Потому что я сейчас не выбираю красивое объяснение, а ищу вопрос с максимальным информационным выигрышем.",
    contrast,
    nextQuestion
  ]);
}

function buildNextSurfaceResponse(response, entryState, context) {
  const nextQuestion = ensureString(entryState.nextBestQuestion, response.nextStep);
  const spread = summarizeRenderableConstraintSpread(entryState, 2);
  if (isLeadFlowScenarioContext(context, entryState) && strategicSplitNeeded(context, entryState)) {
    return joinParagraphs([
      "Дальше я бы шёл не линейно, а через две верхние версии.",
      "Сначала отделю ошибку в самой сегментации и ICP от ошибки перевода этих правил в живую работу команды. После этого уже станет видно, мы лечим стратегию входа или конструкцию первого контура.",
      nextQuestion
    ]);
  }

  const bridge = isLeadFlowScenarioContext(context, entryState)
    ? "Дальше я бы не расширял тему, а добил одну развилку во входящем контуре."
    : "Дальше я бы не расползался в новый список идей, а добил ту развилку, на которой мы уже стоим.";

  const focus = spread.length >= 2
    ? `Сейчас мне важно отделить ${describeVersion(spread[0])} от ${describeVersionFrom(spread[1])}.`
    : "Сейчас мне важно добрать один факт, который реально меняет картину.";

  return joinParagraphs([
    bridge,
    focus,
    nextQuestion
  ]);
}

function buildDoubtSurfaceResponse(response, entryState) {
  const nextQuestion = ensureString(entryState.nextBestQuestion, response.nextStep);
  const spread = summarizeRenderableConstraintSpread(entryState, 2);
  const focus = spread.length >= 2
    ? `Я как раз не прошу сейчас верить мне на слово. Мне нужно быстро отделить ${describeVersion(spread[0])} от ${describeVersionFrom(spread[1])}.`
    : "Я как раз не прошу сейчас верить мне на слово. Мне нужен один факт, который либо подтвердит ход мысли, либо сломает его.";

  return joinParagraphs([
    "Это нормально. На этом месте я бы тоже не покупал вывод без проверки.",
    focus,
    nextQuestion
  ]);
}

function buildAnswerSurfaceResponse(response, entryState) {
  const selectedConstraint = humanizeConstraintLabel(entryState.selectedConstraint);
  const firstParagraph = selectedConstraint
    ? `${ensureSentence(response.whatIUnderstood)} Похоже, сейчас главный рычаг в том, что ${selectedConstraint}.`
    : ensureSentence(response.whatIUnderstood);

  return joinParagraphs([
    firstParagraph,
    `${ensureSentence(response.whyItMatters)} ${ensureString(response.nextStep)}`
  ]);
}

function buildRoadmapSurfaceResponse(response, entryState, context) {
  const nextQuestion = ensureString(entryState.nextBestQuestion, response.nextStep);

  if (isLeadFlowScenarioContext(context, entryState) && strategicSplitNeeded(context, entryState)) {
    return joinParagraphs([
      "Да. Я бы здесь шёл через две верхние версии параллельно, а не через одну линейную ветку.",
      "Первая версия: сам ICP и сегментация выбраны слишком широко, поэтому лишний поток создаётся ещё до квалификации. Вторая версия: сегмент в целом верный, но он не доведён до живых правил отбора, приоритета и передачи дальше, поэтому команда всё равно тонет на входе.",
      `Сначала я отделяю одно от другого. ${nextQuestion}`
    ]);
  }

  if (isLeadFlowScenarioContext(context, entryState)) {
    return joinParagraphs([
      "Да. Схема тут простая: сначала отделяю проблему качества входа от проблемы конструкции первого контура.",
      "Если поток смешанный или плохо отфильтрован, копаем в сегментацию, квалификацию и приоритет. Если поток уже чистый, а вход всё равно ломается, тогда смотрим ownership, очередь и уже потом мощность.",
      nextQuestion
    ]);
  }

  return joinParagraphs([
    "Да. Я бы здесь шёл не через длинный список вопросов, а через развилки, которые быстрее всего отделяют одну рабочую версию от другой.",
    ensureSentence(response.whyItMatters),
    nextQuestion
  ]);
}

function visibleResponseMissesDepth(visibleResponse, entryState, context) {
  if (!visibleResponse || !entryState?.nextBestQuestion) {
    return false;
  }

  if (openingNeedsGreeting(context, visibleResponse)) {
    return true;
  }

  if (userAskedHowToDefineICP(context) && /ideal\s+customer\s+profile|это\s+профиль\s+клиента/i.test(visibleResponse)) {
    return true;
  }

  if (!isLeadFlowScenarioContext(context, entryState)) {
    return false;
  }

  if (
    !leadFlowAllowsPureStaffingVersion(context, entryState) &&
    !userExplicitlyClaimedStaffing(context) &&
    /нехватк[аи]?\s+(люд|продав|менеджер)|не\s+хватает\s+(люд|продав|менеджер)/i.test(visibleResponse)
  ) {
    return true;
  }

  const nextQuestion = ensureString(entryState.nextBestQuestion);
  if (!questionLooksUpstream(nextQuestion)) {
    return false;
  }

  if (!questionLooksUpstream(visibleResponse)) {
    return true;
  }

  if (textLooksLikeLeadFlowLocal(visibleResponse) && !latestTextAlreadyResolvesUpstreamLayer(context)) {
    return true;
  }

  if (visibleResponseRepeatsLeadQuestionFamily(visibleResponse, context) && latestTextRestatesCapacityClaim(context)) {
    return true;
  }

  return false;
}

function buildSurfaceResponse(decision, context) {
  const response = decision.response || {};
  const entryState = decision.entryState || emptyEntryState();
  const routeType = context.classification.type;
  const action = ensureString(decision.decision?.action);
  const visibleResponse = explainBusinessTerms(
    sanitizeLeadFlowStaffingSurface(
      polishSurfaceText(stripVisibleTemplateLabels(response.responseText)),
      context,
      entryState
    ),
    context
  );
  let reply = "";

  if (isOpeningMessageContext(context)) {
    reply = buildVagueSurfaceResponse(response, context);
    return explainBusinessTerms(reply, context);
  }

  if (routeType === "free_text_problem" && userAskedMeaning(context)) {
    reply = buildMeaningSurfaceResponse(response, entryState);
    return explainBusinessTerms(reply, context);
  }

  if (routeType === "free_text_problem" && userAskedWhatIsICP(context)) {
    reply = buildWhatIsIcpSurfaceResponse(entryState);
    return explainBusinessTerms(reply, context);
  }

  if (routeType === "free_text_problem" && userAskedHowToDefineICP(context)) {
    reply = buildHowToDefineIcpSurfaceResponse(entryState);
    return explainBusinessTerms(reply, context);
  }

  if (routeType === "free_text_problem" && userAskedDirection(context)) {
    reply = buildDirectionSurfaceResponse(response, entryState);
    return explainBusinessTerms(reply, context);
  }

  if (routeType === "free_text_problem" && userAskedRoadmap(context)) {
    reply = buildRoadmapSurfaceResponse(response, entryState, context);
    return explainBusinessTerms(reply, context);
  }

  if (routeType === "free_text_problem" && userAskedWhy(context)) {
    reply = buildMetaWhySurfaceResponse(response, entryState, context);
    return explainBusinessTerms(reply, context);
  }

  if (routeType === "free_text_problem" && userAskedNext(context)) {
    reply = buildNextSurfaceResponse(response, entryState, context);
    return explainBusinessTerms(reply, context);
  }

  if (routeType === "free_text_problem" && userExpressesDoubt(context)) {
    reply = buildDoubtSurfaceResponse(response, entryState);
    return explainBusinessTerms(reply, context);
  }

  if (
    routeType === "free_text_problem" &&
    isLeadFlowScenarioContext(context, entryState) &&
    (strategicSplitNeeded(context, entryState) || shouldHoldLeadFlowInClarify(context, entryState))
  ) {
    reply = buildDiagnosticClarifySurfaceResponse(response, entryState, context);
    return explainBusinessTerms(reply, context);
  }

  if (visibleResponse && !looksMechanicalResponse(visibleResponse) && !visibleResponseMissesDepth(visibleResponse, entryState, context)) {
    return explainBusinessTerms(visibleResponse, context);
  }

  if (decision.selectedMode === "website_screening_mode") {
    reply = buildWebsiteSurfaceResponse(response);
    return explainBusinessTerms(reply, context);
  }

  if (action === "answer" || action === "diagnose") {
    reply = buildAnswerSurfaceResponse(response, entryState);
    return explainBusinessTerms(reply, context);
  }

  if (routeType === "free_text_problem") {
    reply = buildDiagnosticClarifySurfaceResponse(response, entryState, context);
    return explainBusinessTerms(reply, context);
  }

  reply = buildVagueSurfaceResponse(response, context);
  return explainBusinessTerms(reply, context);
}

function inferGenericConstraints(context) {
  const text = ensureString(context.userText).toLowerCase();
  const constraints = [];

  if (/заяв|лид/.test(text) && /не усп|люд|ответ|очеред|обработ|продавц|менеджер|штат/.test(text)) {
    constraints.push(
      {
        label: "Поток перегружен нецелевыми или слабо квалифицированными лидами",
        layer: "commercial",
        confidence: 0.58,
        whyPossible: "Большой входящий поток может создавать ложное ощущение, что проблема только в ресурсе, если значимая доля лидов не проходит по ICP.",
        whatWouldDisprove: "Если окажется, что почти все последние лиды были целевыми и достойными быстрого ответа."
      },
      {
        label: "Нет маршрутизации и отдельной роли первого ответа на входящие",
        layer: "management",
        confidence: 0.57,
        whyPossible: "Даже хорошие лиды теряются, когда первый ответ лежит в общей очереди без владельца и SLA.",
        whatWouldDisprove: "Если входящие уже распределяются по роли, SLA соблюдается, а очередь всё равно растёт."
      },
      {
        label: "Продавцы тащат на себе разбор, квалификацию и сортировку входа вместо продажи",
        layer: "commercial",
        confidence: 0.54,
        whyPossible: "Если до продавца нет отдельного слоя отбора и приоритета, перегруз быстро выглядит как проблема штата, хотя корень сидит в конструкции потока.",
        whatWouldDisprove: "Если продавцы уже получают только готовый целевой поток, а перегруз всё равно остаётся."
      }
    );
  } else if (/продаж|сделк|воронк/.test(text)) {
    constraints.push(
      {
        label: "Нет системной модели продаж и понятных стадий воронки",
        layer: "operations",
        confidence: 0.56,
        whyPossible: "Когда стадии и критерии перехода не описаны, симптомы расползаются по сделкам, команде и управлению.",
        whatWouldDisprove: "Если стадии, владельцы и критерии переходов уже описаны и реально используются."
      },
      {
        label: "Проблема сидит в качестве входа, а не в дожиме",
        layer: "commercial",
        confidence: 0.5,
        whyPossible: "Слабый ICP или квалификация могут делать продажи плохими при внешне нормальном объёме входящего потока.",
        whatWouldDisprove: "Если большинство входящих лидов целевые и проходят по ICP."
      }
    );
  } else if (/прибыл|марж|касс|деньг/.test(text)) {
    constraints.push(
      {
        label: "Экономика ломается в unit economics, а не в объёме продаж",
        layer: "finance",
        confidence: 0.57,
        whyPossible: "Падение прибыли часто связано с качеством спроса, скидками, себестоимостью или CAC, а не только с объёмом.",
        whatWouldDisprove: "Если unit economics по каналам и продуктам уже прозрачны и не показывают утечки."
      },
      {
        label: "Коммерческий вход даёт выручку, но не ту маржу, на которой бизнес должен расти",
        layer: "commercial",
        confidence: 0.49,
        whyPossible: "Бизнес может расти по выручке, но упираться в низкое качество спроса или слабое предложение.",
        whatWouldDisprove: "Если прибыльность по сегментам стабильна и причина явно в операционных расходах."
      }
    );
  } else {
    constraints.push(
      {
        label: "Пользователь видит локальную боль, но системное ограничение лежит уровнем выше",
        layer: "management",
        confidence: 0.48,
        whyPossible: "На входе пока больше жалоба, чем системная картина, поэтому ближайшее объяснение может оказаться ложным.",
        whatWouldDisprove: "Если одна и та же причина уже подтверждена несколькими независимыми фактами."
      },
      {
        label: "Ограничение находится в слое, который пока не назван прямо",
        layer: "operations",
        confidence: 0.44,
        whyPossible: "Симптом часто проявляется в одном контуре, а держится на другом.",
        whatWouldDisprove: "Если текущий симптом уже объясняет несколько других симптомов без противоречий."
      }
    );
  }

  return constraints;
}

function normalizeBusinessLayer(value, fallback = "commercial") {
  const normalized = ensureString(value, fallback).toLowerCase();
  return BUSINESS_LAYERS.includes(normalized) ? normalized : fallback;
}

function businessLayerToClass(layer) {
  const mapping = {
    owner_context: "A",
    external_environment: "A",
    strategy: "B",
    product: "B",
    commercial: "B",
    operations: "C",
    finance: "C",
    team: "D",
    governance: "D",
    technology: "D",
    data_analytics: "D"
  };

  return mapping[normalizeBusinessLayer(layer, "commercial")] || "B";
}

function systemLayerToBusinessLayer(layer) {
  const mapping = {
    strategy: "strategy",
    commercial: "commercial",
    operations: "operations",
    finance: "finance",
    people: "team",
    management: "governance"
  };

  return mapping[normalizeLayer(layer)] || "commercial";
}

function deriveBusinessLayers(context, entryState) {
  const text = ensureString(
    [
      context.userText,
      ...(entryState.symptoms || []),
      ...(entryState.candidateConstraints || []).map((item) => item?.label),
      ...(entryState.candidateStates || []).map((item) => item?.label),
      ...(entryState.candidateCauses || []).map((item) => item?.label)
    ].join(" ")
  ).toLowerCase();

  const layers = [
    ...(entryState.systemLayers || []).map((item) => systemLayerToBusinessLayer(item))
  ];

  if (/собственник|партнер|партн[её]р|горизонт|цель|роль\s+в\s+бизнесе/.test(text)) {
    layers.push("owner_context");
  }
  if (/рынок|спрос|конкуренц|макро|экосистем/.test(text)) {
    layers.push("external_environment");
  }
  if (/стратег|позиционир|выбор\s+рынка|источник\s+преимуществ/.test(text)) {
    layers.push("strategy");
  }
  if (/продукт|ценност|удержан|не\s+удерж|решени[ея]\s+проблем|product/.test(text)) {
    layers.push("product");
  }
  if (/icp|сегмент|канал|лид|заяв|gtm|коммерц|упаковк|квалификац|маршрутиз/.test(text)) {
    layers.push("commercial");
  }
  if (/операц|процесс|delivery|исполн|срыв|очеред|handoff|первый\s+ответ|контакт/.test(text)) {
    layers.push("operations");
  }
  if (/прибыл|марж|cash|деньг|кассов|экономик/.test(text)) {
    layers.push("finance");
  }
  if (/команд|люд|capacity|штат|рол/.test(text)) {
    layers.push("team");
  }
  if (/управл|govern|решени|контрол|owner|ритм|хаос/.test(text)) {
    layers.push("governance");
  }
  if (/техн|it|crm|автомат|система|инструмент/.test(text)) {
    layers.push("technology");
  }
  if (/данн|аналит|метрик|отч[её]т|не видно|прозрачност/.test(text)) {
    layers.push("data_analytics");
  }

  return ensureArray(layers, 11).map((item) => normalizeBusinessLayer(item)).filter((item, index, items) => items.indexOf(item) === index);
}

function deriveLayerClasses(businessLayers) {
  const ordered = ["A", "B", "C", "D"];
  const classes = ensureArray(businessLayers, 11).map((item) => businessLayerToClass(item));
  return ordered.filter((item) => classes.includes(item));
}

function deriveFlowTypes(context, entryState) {
  const text = ensureString(
    [
      context.userText,
      ...(entryState.symptoms || []),
      ...(entryState.observedSignals || []),
      ...(entryState.candidateConstraints || []).map((item) => item?.label)
    ].join(" ")
  ).toLowerCase();
  const scores = new Map(FLOW_TYPES.map((item) => [item, 0]));

  if (/рынок|спрос|интерес|нет\s+клиент/.test(text)) {
    scores.set("demand", scores.get("demand") + 3);
  }
  if (/лид|заяв|входящ|трафик|мало\s+входа|перегруз.*поток/.test(text)) {
    scores.set("leads", scores.get("leads") + 3);
  }
  if (/сделк|конверс|не\s+покуп|кп|встреч|дожим|воронк/.test(text)) {
    scores.set("deals", scores.get("deals") + 3);
  }
  if (/исполн|delivery|срыв|не\s+выполня|перегруз.*исполн|выполнение/.test(text)) {
    scores.set("delivery", scores.get("delivery") + 3);
  }
  if (/деньг|прибыл|марж|кассов|cash|экономик/.test(text)) {
    scores.set("cash", scores.get("cash") + 3);
  }
  if (/хаос|решени|собственник|всё\s+завис|управл|контрол/.test(text)) {
    scores.set("decisions", scores.get("decisions") + 3);
  }

  for (const item of entryState.businessLayers || []) {
    if (item === "commercial") {
      scores.set("leads", scores.get("leads") + 1);
      scores.set("deals", scores.get("deals") + 1);
    }
    if (item === "operations") {
      scores.set("delivery", scores.get("delivery") + 1);
      scores.set("deals", scores.get("deals") + 1);
    }
    if (item === "finance") {
      scores.set("cash", scores.get("cash") + 1);
    }
    if (item === "governance" || item === "owner_context") {
      scores.set("decisions", scores.get("decisions") + 1);
    }
  }

  return [...scores.entries()]
    .filter(([, score]) => score > 0)
    .sort((left, right) => right[1] - left[1])
    .map(([item]) => item)
    .slice(0, 2);
}

function deriveConstraintType(entryState) {
  const label = ensureString(
    entryState.selectedConstraint || entryState.candidateConstraints?.[0]?.label
  ).toLowerCase();
  const primaryFlow = ensureString(entryState.primaryFlow).toLowerCase();
  const businessLayers = entryState.businessLayers || [];

  if (/данн|аналит|метрик|видимост|прозрачност|не видно/.test(label) || businessLayers.includes("data_analytics")) {
    return "visibility";
  }
  if (/управл|контрол|ownership|owner|решени|govern|ритм/.test(label) || businessLayers.includes("governance") || businessLayers.includes("owner_context")) {
    return "control";
  }
  if (/мощност|capacity|штат|не хватает|ресурс/.test(label) || businessLayers.includes("team")) {
    return "capacity";
  }
  if (/icp|сегмент|квалификац|нецелев|приоритет|смешан|шум|качество\s+входа/.test(label)) {
    return "quality";
  }
  if (/процесс|воронк|этап|маршрутизац|handoff|первый\s+ответ|контакт|delivery|очеред/.test(label) || businessLayers.includes("operations")) {
    return "throughput";
  }
  if (primaryFlow === "demand" || businessLayers.includes("strategy") || businessLayers.includes("product") || businessLayers.includes("commercial")) {
    return "supply";
  }

  return "";
}

function deriveHigherLayerCheck(entryState) {
  const order = { A: 1, B: 2, C: 3, D: 4 };
  const classes = deriveLayerClasses(entryState.businessLayers || []);
  const currentConstraintLayer = ensureString(entryState.candidateConstraints?.[0]?.layer || "").toLowerCase();
  const currentClass = currentConstraintLayer ? businessLayerToClass(systemLayerToBusinessLayer(currentConstraintLayer)) : (classes[0] || "");
  const highestUnrejectedClass = classes[0] || currentClass || "";
  const betterExplainedAbove = Boolean(
    currentClass &&
    highestUnrejectedClass &&
    order[highestUnrejectedClass] < order[currentClass]
  );

  const whyNotHigher = betterExplainedAbove
    ? `Выше по системе ещё живы версии класса ${highestUnrejectedClass}, поэтому фиксировать корень в ${currentClass} рано.`
    : currentClass
      ? `Сейчас самый сильный неотброшенный слой — ${currentClass}; более верхние объяснения слабее или уже частично проверены.`
      : "";

  return {
    currentClass,
    betterExplainedAbove,
    highestUnrejectedClass,
    whyNotHigher
  };
}

function normalizeEntryState(rawEntryState, context, decision) {
  const fallback = emptyEntryState();
  const entryState = rawEntryState && typeof rawEntryState === "object" ? structuredClone(rawEntryState) : {};
  const routeType = context.classification.type;
  const screen = context.screening?.[0];
  const inferredConstraints = inferGenericConstraints(context);

  entryState.claimedProblem = ensureString(
    entryState.claimedProblem,
    routeType === "url_only" ? "Понять внешний контур сайта." : context.classification.cleanText
  );
  entryState.claimedCause = ensureString(entryState.claimedCause);
  entryState.knownFacts = ensureArray(entryState.knownFacts, 8);
  entryState.symptoms = ensureArray(entryState.symptoms, 10);
  entryState.observedSignals = ensureArray(entryState.observedSignals, 12);
  if (!entryState.symptoms.length && routeType !== "url_only") {
    entryState.symptoms = ensureArray([context.classification.cleanText], 10);
  }
  if (!entryState.observedSignals.length) {
    entryState.observedSignals = ensureArray(context.graphPacket?.observedSignals, 12);
  }
  entryState.systemLayers = ensureArray(entryState.systemLayers, 6)
    .map((item) => normalizeLayer(item))
    .filter((item, index, items) => items.indexOf(item) === index);
  entryState.candidateConstraints = normalizeCandidateConstraints(entryState.candidateConstraints, 5);
  entryState.candidateStates = normalizeGraphRankedItems(entryState.candidateStates, 5);
  entryState.candidateCauses = normalizeGraphRankedItems(entryState.candidateCauses, 5);
  if (entryState.candidateConstraints.length < 2 && routeType !== "url_only" && routeType !== "url_plus_problem") {
    entryState.candidateConstraints = normalizeCandidateConstraints(
      [...entryState.candidateConstraints, ...inferredConstraints],
      5
    );
  }
  if (!entryState.candidateStates.length) {
    entryState.candidateStates = normalizeGraphRankedItems(context.graphPacket?.candidateStates, 5);
  }
  if (!entryState.candidateCauses.length) {
    entryState.candidateCauses = normalizeGraphRankedItems(context.graphPacket?.candidateCauses, 5);
  }
  entryState.selectedConstraint = ensureString(entryState.selectedConstraint);
  entryState.graphTrace = normalizeGraphTrace(entryState.graphTrace, 8);
  entryState.discriminatingSignals = normalizeDiscriminatingSignals(entryState.discriminatingSignals, 4);
  entryState.graphConfidence = clampConfidence(
    entryState.graphConfidence,
    clampConfidence(context.graphPacket?.graphConfidence, 0.3)
  );
  entryState.hypothesisConflicts = ensureArray(entryState.hypothesisConflicts, 6);
  if (!entryState.graphTrace.length) {
    entryState.graphTrace = normalizeGraphTrace(context.graphPacket?.graphTrace, 8);
  }
  if (!entryState.discriminatingSignals.length) {
    entryState.discriminatingSignals = normalizeDiscriminatingSignals(context.graphPacket?.discriminatingSignals, 4);
  }
  if (!entryState.hypothesisConflicts.length) {
    entryState.hypothesisConflicts = ensureArray(context.graphPacket?.hypothesisConflicts, 6);
  }
  entryState.candidateConstraints = ensureMultiLayerSpread(entryState.candidateConstraints, context, entryState);
  entryState.businessLayers = ensureArray(entryState.businessLayers, 11)
    .map((item) => normalizeBusinessLayer(item))
    .filter((item, index, items) => items.indexOf(item) === index);
  if (!entryState.businessLayers.length) {
    entryState.businessLayers = deriveBusinessLayers(context, entryState);
  }
  entryState.layerClasses = ensureArray(entryState.layerClasses, 4)
    .map((item) => ensureString(item))
    .filter((item) => BUSINESS_LAYER_CLASSES.includes(item));
  if (!entryState.layerClasses.length) {
    entryState.layerClasses = deriveLayerClasses(entryState.businessLayers);
  }
  entryState.flowTypes = ensureArray(entryState.flowTypes, 6)
    .map((item) => ensureString(item))
    .filter((item) => FLOW_TYPES.includes(item));
  if (!entryState.flowTypes.length) {
    entryState.flowTypes = deriveFlowTypes(context, entryState);
  }
  entryState.primaryFlow = ensureString(entryState.primaryFlow, entryState.flowTypes[0] || "");
  if (entryState.primaryFlow && !FLOW_TYPES.includes(entryState.primaryFlow)) {
    entryState.primaryFlow = entryState.flowTypes[0] || "";
  }
  entryState.constraintType = ensureString(entryState.constraintType, deriveConstraintType(entryState));
  if (entryState.constraintType && !CONSTRAINT_TYPES.includes(entryState.constraintType)) {
    entryState.constraintType = deriveConstraintType(entryState);
  }
  entryState.higherLayerCheck = {
    currentClass: ensureString(entryState.higherLayerCheck?.currentClass),
    betterExplainedAbove: Boolean(entryState.higherLayerCheck?.betterExplainedAbove),
    highestUnrejectedClass: ensureString(entryState.higherLayerCheck?.highestUnrejectedClass),
    whyNotHigher: ensureString(entryState.higherLayerCheck?.whyNotHigher)
  };
  if (!entryState.higherLayerCheck.currentClass && !entryState.higherLayerCheck.highestUnrejectedClass) {
    entryState.higherLayerCheck = deriveHigherLayerCheck(entryState);
  }
  entryState.signalSufficiency = ensureString(
    entryState.signalSufficiency,
    ensureString(decision.decision?.signalSufficiency, fallback.signalSufficiency)
  );
  entryState.nextBestQuestion = ensureString(entryState.nextBestQuestion);
  if (!entryState.nextBestQuestion) {
    entryState.nextBestQuestion = ensureString(
      context.graphPacket?.suggestedQuestion,
      entryState.discriminatingSignals[0]?.question
    );
  }
  entryState.nextBestQuestion = ensureString(
    pickBestNextQuestion(context, entryState, decision.graphAnalysis),
    entryState.nextBestQuestion
  );
  entryState.nextBestStep = ensureString(entryState.nextBestStep, decision.response?.nextStep);
  entryState.whyThisStep = ensureString(
    entryState.whyThisStep,
    "Следующий шаг должен лучше разделить конкурирующие ограничения, а не подтвердить ближайшее объяснение."
  );
  entryState.promotionReadiness = ensureString(
    entryState.promotionReadiness,
    entryState.signalSufficiency === "enough" ? "ready_for_diagnostic_case" : fallback.promotionReadiness
  );

  if (!ENTRY_PROMOTION_STATES.includes(entryState.promotionReadiness)) {
    entryState.promotionReadiness = fallback.promotionReadiness;
  }

  if (screen) {
    entryState.knownFacts = ensureArray([...screen.knownFacts, ...entryState.knownFacts], 8);
    entryState.systemLayers = ensureArray(["commercial", "operations", ...entryState.systemLayers], 6);
    entryState.candidateConstraints = normalizeCandidateConstraints(
      [
        ...entryState.candidateConstraints,
        {
          label: "Сайт не доносит ценность и не переводит посетителя в следующий шаг",
          layer: "commercial",
          confidence: 0.62,
          whyPossible: "Во внешнем контуре уже видно обещание и CTA, а проблема может быть в силе оффера или конверсии.",
          whatWouldDisprove: "Если внешний скрининг показывает сильный оффер и конверсия ломается уже после сайта."
        }
      ],
      5
    );
    entryState.promotionReadiness = "ready_for_screening_case";
    entryState.nextBestQuestion = ensureString(
      entryState.nextBestQuestion,
      "Будем разбирать этот сайт как продукт/воронку или пойдём в диагностику бизнеса за ним?"
    );
  }

  return entryState;
}

function normalizeGraphAnalysis(rawGraphAnalysis, context, decision) {
  const graphAnalysis = rawGraphAnalysis && typeof rawGraphAnalysis === "object"
    ? structuredClone(rawGraphAnalysis)
    : {};
  const fallback = context.graphPacket || {};

  graphAnalysis.observedSignals = ensureArray(graphAnalysis.observedSignals, 12);
  if (!graphAnalysis.observedSignals.length) {
    graphAnalysis.observedSignals = ensureArray(fallback.observedSignals, 12);
  }
  graphAnalysis.candidateStates = normalizeGraphRankedItems(graphAnalysis.candidateStates, 5);
  if (!graphAnalysis.candidateStates.length) {
    graphAnalysis.candidateStates = normalizeGraphRankedItems(fallback.candidateStates, 5);
  }
  graphAnalysis.candidateCauses = normalizeGraphRankedItems(graphAnalysis.candidateCauses, 5);
  if (!graphAnalysis.candidateCauses.length) {
    graphAnalysis.candidateCauses = normalizeGraphRankedItems(fallback.candidateCauses, 5);
  }
  graphAnalysis.candidateInterventions = normalizeGraphRankedItems(graphAnalysis.candidateInterventions, 5);
  if (!graphAnalysis.candidateInterventions.length) {
    graphAnalysis.candidateInterventions = normalizeGraphRankedItems(fallback.candidateInterventions, 5);
  }
  graphAnalysis.discriminatingSignals = normalizeDiscriminatingSignals(graphAnalysis.discriminatingSignals, 4);
  if (!graphAnalysis.discriminatingSignals.length) {
    graphAnalysis.discriminatingSignals = normalizeDiscriminatingSignals(fallback.discriminatingSignals, 4);
  }
  graphAnalysis.graphTrace = normalizeGraphTrace(graphAnalysis.graphTrace, 8);
  if (!graphAnalysis.graphTrace.length) {
    graphAnalysis.graphTrace = normalizeGraphTrace(fallback.graphTrace, 8);
  }
  graphAnalysis.graphConfidence = clampConfidence(
    graphAnalysis.graphConfidence,
    clampConfidence(fallback.graphConfidence, 0.3)
  );
  graphAnalysis.hypothesisConflicts = ensureArray(graphAnalysis.hypothesisConflicts, 6);
  if (!graphAnalysis.hypothesisConflicts.length) {
    graphAnalysis.hypothesisConflicts = ensureArray(fallback.hypothesisConflicts, 6);
  }

  return graphAnalysis;
}

function userLikelyClaimedCause(context, entryState) {
  const claimedCause = ensureString(entryState.claimedCause).toLowerCase();
  if (!claimedCause) {
    return false;
  }

  const text = ensureString(context.userText).toLowerCase();
  return text.includes(claimedCause) || /не хватает|проблема в|из-за|потому что/.test(text);
}

export function applyGuardrails(rawDecision, context) {
  const decision = rawDecision && typeof rawDecision === "object" ? structuredClone(rawDecision) : {};
  const routeType = context.classification.type;
  const screen = context.screening?.[0];
  const routeModeMap = {
    url_only: "website_screening_mode",
    free_text_vague: "clarification_mode",
    free_text_problem: "diagnostic_mode"
  };

  decision.selectedMode = routeModeMap[routeType] || decision.selectedMode || "clarification_mode";
  if (routeType === "url_plus_problem" && decision.selectedMode === "diagnostic_mode") {
    decision.selectedMode = "website_screening_mode";
  }

  decision.decision = decision.decision || {};
  decision.decision.confidence = clampConfidence(decision.decision.confidence, 0.58);
  decision.decision.action = ensureString(decision.decision.action, "clarify");
  decision.decision.signalSufficiency = ensureString(decision.decision.signalSufficiency, "partial");
  decision.decision.rationale = ensureString(
    decision.decision.rationale,
    "Следующий шаг выбран по объему сигнала и типу входа."
  );

  decision.response = decision.response || {};
  decision.response.whatIUnderstood = ensureString(
    decision.response.whatIUnderstood,
    "Пока сигнал неполный, но направление запроса уже понятно."
  );
  decision.response.hypotheses = ensureArray(decision.response.hypotheses, 2);
  if (decision.response.hypotheses.length === 0) {
    decision.response.hypotheses = ["Нужно сузить запрос до главного ограничения."];
  }
  decision.response.whyItMatters = ensureString(
    decision.response.whyItMatters,
    "Без фокуса легко перепутать симптом и системное ограничение."
  );
  decision.response.nextStep = ensureString(
    decision.response.nextStep,
    "Скажи, где сейчас болит сильнее всего: прибыль, рост или управляемость?"
  );

  decision.guardrails = decision.guardrails || {};
  decision.guardrails.knownFacts = ensureArray(decision.guardrails.knownFacts, 8);
  decision.guardrails.observations = ensureArray(decision.guardrails.observations, 8);
  decision.guardrails.workingHypotheses = ensureArray(decision.guardrails.workingHypotheses, 8);
  decision.guardrails.canNotAssert = ensureArray(decision.guardrails.canNotAssert, 8);
  decision.guardrails.confidenceNote = ensureString(
    decision.guardrails.confidenceNote,
    "Часть выводов пока остаётся рабочими гипотезами."
  );

  if (screen) {
    decision.guardrails.knownFacts = ensureArray([
      ...screen.knownFacts,
      ...decision.guardrails.knownFacts
    ], 8);
    decision.guardrails.observations = ensureArray([
      ...screen.observations,
      ...decision.guardrails.observations
    ], 8);
    decision.guardrails.canNotAssert = ensureArray([
      "По одному сайту нельзя надежно судить о прибыли, кассе, команде и оргструктуре.",
      ...screen.canNotAssert,
      ...decision.guardrails.canNotAssert
    ], 8);
  }

  decision.graphAnalysis = normalizeGraphAnalysis(decision.graphAnalysis, context, decision);
  decision.entryState = normalizeEntryState(decision.entryState, context, decision);
  if (decision.graphAnalysis.observedSignals.length && !decision.entryState.observedSignals.length) {
    decision.entryState.observedSignals = decision.graphAnalysis.observedSignals;
  }
  if (decision.graphAnalysis.candidateStates.length && !decision.entryState.candidateStates.length) {
    decision.entryState.candidateStates = decision.graphAnalysis.candidateStates;
  }
  if (decision.graphAnalysis.candidateCauses.length && !decision.entryState.candidateCauses.length) {
    decision.entryState.candidateCauses = decision.graphAnalysis.candidateCauses;
  }
  if (decision.graphAnalysis.discriminatingSignals.length && !decision.entryState.discriminatingSignals.length) {
    decision.entryState.discriminatingSignals = decision.graphAnalysis.discriminatingSignals;
  }
  if (decision.graphAnalysis.graphTrace.length && !decision.entryState.graphTrace.length) {
    decision.entryState.graphTrace = decision.graphAnalysis.graphTrace;
  }
  if (decision.graphAnalysis.hypothesisConflicts.length && !decision.entryState.hypothesisConflicts.length) {
    decision.entryState.hypothesisConflicts = decision.graphAnalysis.hypothesisConflicts;
  }
  decision.entryState.graphConfidence = Math.max(
    Number(decision.entryState.graphConfidence || 0),
    Number(decision.graphAnalysis.graphConfidence || 0)
  );
  decision.entryState.signalSufficiency = decision.decision.signalSufficiency;

  if (routeType === "url_only" || routeType === "url_plus_problem") {
    decision.selectedMode = "website_screening_mode";
    decision.decision.action = "screen";
    decision.memory = decision.memory || {};
    decision.memory.caseKind = "preliminary_screening";
    decision.entryState.promotionReadiness = "ready_for_screening_case";
  }

  if (routeType === "free_text_vague" && decision.decision.signalSufficiency === "enough") {
    decision.decision.signalSufficiency = "partial";
    decision.decision.action = "clarify";
    decision.entryState.signalSufficiency = "partial";
    decision.entryState.promotionReadiness = "keep_in_entry";
  }

  if (
    routeType === "free_text_problem" &&
    userLikelyClaimedCause(context, decision.entryState) &&
    decision.entryState.candidateConstraints.length >= 2 &&
    decision.decision.signalSufficiency !== "enough"
  ) {
    const claimed = decision.entryState.claimedCause.toLowerCase();
    const selected = decision.entryState.selectedConstraint.toLowerCase();
    if (selected && (selected === claimed || selected.includes(claimed) || claimed.includes(selected))) {
      decision.decision.action = "clarify";
      decision.entryState.selectedConstraint = "";
      decision.entryState.promotionReadiness = "keep_in_entry";
      decision.response.whyItMatters = ensureString(
        decision.response.whyItMatters,
        "Если принять пользовательскую причину за факт, можно усилить симптом и не дойти до настоящего ограничения."
      );
      decision.response.nextStep = ensureString(
        decision.entryState.nextBestQuestion,
        decision.response.nextStep
      );
    }
  }

  decision.memory = decision.memory || {};
  decision.memory.actionWave = decision.memory.actionWave || {};
  decision.memory.artifact = decision.memory.artifact || {};

  if (shouldHoldLeadFlowInClarify(context, decision.entryState)) {
    decision.selectedMode = "diagnostic_mode";
    decision.decision.action = "clarify";
    decision.decision.signalSufficiency = "partial";
    decision.entryState.signalSufficiency = "partial";
    decision.entryState.selectedConstraint = "";
    decision.entryState.promotionReadiness = "keep_in_entry";
    decision.memory.constraint = "";
    decision.memory.actionWave.enabled = false;
    decision.memory.actionWave.firstStep = "";
    decision.memory.actionWave.notNow = "";
    decision.memory.actionWave.whyThisFirst = "";
    decision.memory.artifact.shouldSave = false;
    decision.response.nextStep = ensureString(decision.entryState.nextBestQuestion, decision.response.nextStep);
    decision.response.whatIUnderstood = strategicSplitNeeded(context, decision.entryState)
      ? "Теперь уже видно не одну, а две верхние версии: либо сам ICP и сегментация заданы неверно, либо они в целом верны, но не превращены в живые правила отбора и маршрута."
      : latestTextSuggestsWarmInbound(context)
        ? "Тёплый вход уже сужает поле, но ещё не доказывает, что проблема только в скорости первого ответа или в чистой мощности команды."
        : latestTextRestatesCapacityClaim(context)
          ? "Перегруз команды виден, но сам по себе он ещё не доказывает, что узкое место именно в чистой мощности."
          : "Узкое место уже видно во входе в продажи, но причина всё ещё может лежать в разных слоях системы.";
    decision.response.whyItMatters = strategicSplitNeeded(context, decision.entryState)
      ? "Если слишком рано выбрать только операционную версию, можно пропустить более верхний разрыв: саму сегментацию спроса или несвязку между стратегией и живым маршрутом входа."
      : "Если сейчас схлопнуться в версию про найм или SLA, можно пропустить более глубокую поломку в квалификации, сегментации и конструкции первого контура.";
  }

  decision.memory.companyName = ensureString(decision.memory.companyName);
  decision.memory.caseKind = ensureString(
    decision.memory.caseKind,
    decision.selectedMode === "website_screening_mode" ? "preliminary_screening" : "diagnostic_case"
  );
  decision.memory.goal = ensureString(decision.memory.goal);
  decision.memory.symptoms = ensureArray(decision.memory.symptoms, 8);
  decision.memory.hypotheses = ensureArray(decision.memory.hypotheses, 5);
  decision.memory.constraint = ensureString(decision.memory.constraint, decision.entryState.selectedConstraint);
  decision.memory.situation = ensureString(decision.memory.situation);
  decision.memory.actionWave = decision.memory.actionWave || {};
  decision.memory.actionWave.enabled = Boolean(decision.memory.actionWave.enabled);
  decision.memory.actionWave.firstStep = ensureString(decision.memory.actionWave.firstStep, decision.entryState.nextBestStep);
  decision.memory.actionWave.notNow = ensureString(decision.memory.actionWave.notNow);
  decision.memory.actionWave.whyThisFirst = ensureString(
    decision.memory.actionWave.whyThisFirst,
    decision.entryState.whyThisStep
  );
  decision.memory.toolRecommendations = Array.isArray(decision.memory.toolRecommendations)
    ? decision.memory.toolRecommendations
        .slice(0, 3)
        .map((item) => ({
          name: ensureString(item?.name),
          reason: ensureString(item?.reason),
          usageMoment: ensureString(item?.usageMoment)
        }))
        .filter((item) => item.name && item.reason && item.usageMoment)
    : [];
  decision.memory.artifact = decision.memory.artifact || {};
  decision.memory.artifact.shouldSave = Boolean(decision.memory.artifact.shouldSave);
  decision.memory.artifact.title = ensureString(decision.memory.artifact.title);
  decision.memory.artifact.summary = ensureString(decision.memory.artifact.summary);
  decision.memory.artifact.kind = ensureString(
    decision.memory.artifact.kind,
    decision.selectedMode === "website_screening_mode" ? "screening" : "snapshot"
  );

  if (decision.selectedMode === "website_screening_mode") {
    decision.memory.caseKind = "preliminary_screening";
    if (!decision.memory.artifact.title && screen?.url) {
      decision.memory.artifact.title = `External screening: ${screen.url}`;
    }
    if (!decision.memory.artifact.summary) {
      decision.memory.artifact.summary = decision.response.whatIUnderstood;
    }
  }

  if (!decision.memory.goal) {
    decision.memory.goal = decision.entryState.claimedProblem;
  }
  if (!decision.memory.symptoms.length) {
    decision.memory.symptoms = decision.entryState.symptoms.slice(0, 8);
  }
  if (!decision.memory.hypotheses.length) {
    decision.memory.hypotheses = decision.entryState.candidateConstraints.map((item) => item.label).slice(0, 5);
  }
  if (decision.entryState.nextBestStep && !decision.memory.actionWave.firstStep) {
    decision.memory.actionWave.firstStep = decision.entryState.nextBestStep;
  }
  if (
    decision.entryState.whyThisStep &&
    !decision.memory.actionWave.whyThisFirst
  ) {
    decision.memory.actionWave.whyThisFirst = decision.entryState.whyThisStep;
  }

  if (
    !decision.memory.artifact.shouldSave &&
    (decision.selectedMode === "website_screening_mode" ||
      decision.entryState.promotionReadiness === "ready_for_diagnostic_case" ||
      decision.entryState.promotionReadiness === "promoted")
  ) {
    decision.memory.artifact.shouldSave = true;
  }

  if (
    decision.entryState.promotionReadiness === "keep_in_entry" &&
    decision.selectedMode !== "website_screening_mode"
  ) {
    decision.memory.artifact.shouldSave = false;
  }

  decision.guardrails.workingHypotheses = ensureArray([
    ...decision.guardrails.workingHypotheses,
    ...decision.entryState.candidateConstraints.map((item) => item.label),
    ...decision.graphAnalysis.candidateStates.map((item) => item.label),
    ...decision.graphAnalysis.candidateCauses.map((item) => item.label)
  ], 8);

  if (
    decision.entryState.candidateConstraints.length >= 2 &&
    decision.decision.action === "answer" &&
    decision.entryState.promotionReadiness === "keep_in_entry"
  ) {
    decision.decision.action = "clarify";
    decision.response.nextStep = ensureString(decision.entryState.nextBestQuestion, decision.response.nextStep);
  }

  if (decision.decision.action === "clarify" && routeType === "free_text_problem" && decision.entryState.nextBestQuestion) {
    decision.response.nextStep = decision.entryState.nextBestQuestion;
  }

  decision.response.responseText = buildSurfaceResponse(decision, context);

  return decision;
}
