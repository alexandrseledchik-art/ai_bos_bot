function normalizeText(value) {
  return String(value || "").trim();
}

function lowerText(value) {
  return normalizeText(value).toLowerCase();
}

function includesAny(text, patterns = []) {
  return patterns.some((pattern) => pattern.test(text));
}

function pickFirstMatch(text, patterns = []) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return normalizeText(match[1]);
    }
  }
  return "";
}

const SOLUTION_PATTERNS = [
  /(?:нам|мне|команде)?\s*(?:нужен|нужна|нужно|нужны)\s+([^,.!?]+)/i,
  /(?:хочу|надо|нужно)\s+(?:внедрить|поставить|купить|нанять|запустить|подключить|сделать)\s+([^,.!?]+)/i,
  /(?:давай|хочу|надо|нужно)\s+(?:найм[а-яё]*|искать)\s+([^,.!?]+)/i
];

const SOLUTION_MARKERS = [
  /crm/i,
  /amo\s?crm/i,
  /bitrix|битрикс/i,
  /дашборд|dashboard/i,
  /сквозн[а-яё]+\s+аналитик/i,
  /чат-?бот/i,
  /бот/i,
  /сайт|лендинг/i,
  /воронк[ау]/i,
  /регламент/i,
  /raci|рас[иi]|матриц[ауы]\s+ответственност/i,
  /операционн[а-яё]+\s+директор/i,
  /\bроп\b|руководител[ья]\s+продаж/i,
  /маркетолог/i,
  /продавц|менеджер/i,
  /нанять|найм/i,
  /инструмент|шаблон|таблиц[ау]/i
];

const INTERPRETATION_PATTERNS = [
  /команд[а-яё]*\s+не\s+тян/i,
  /команд[а-яё]*\s+слаб/i,
  /люд[а-яё]*\s+слаб/i,
  /продавц[а-яё]*\s+плох/i,
  /лиды?\s+плох/i,
  /маркетинг\s+не\s+работ/i,
  /продажи\s+не\s+работ/i,
  /у\s+нас\s+хаос/i,
  /нет\s+систем/i
];

const URGENT_PATTERNS = [
  /кассов[а-яё]+\s+разрыв.*(через|сегодня|завтра|недел|дн[яей]|до\s+\d)/i,
  /(через|сегодня|завтра|недел|дн[яей]|до\s+\d).*кассов[а-яё]+\s+разрыв/i,
  /ден[её]г\s+хватит\s+на/i,
  /деньги\s+заканч/i,
  /не\s+чем\s+платить/i,
  /зарплат[ау]\s+не\s+можем/i
];

const STRATEGIC_INTENT_PATTERNS = [
  /выйти\s+в\s+нов[а-яё]+\s+ниш/i,
  /нов[а-яё]+\s+рынок/i,
  /нов[а-яё]+\s+сегмент/i,
  /продать\s+бизнес/i,
  /выйти\s+из\s+операцион/i,
  /масштабировать/i
];

const LIGHT_TASK_PATTERNS = [
  /как\s+лучше\s+назвать/i,
  /как\s+назвать/i,
  /переимену/i,
  /сформулируй/i,
  /перепиши\s+короче/i,
  /улучши\s+текст/i
];

const PROBLEM_OR_SYMPTOM_PATTERNS = [
  /падает|просел|просела|просели|снижается|не\s+раст/i,
  /мало|много|нет\s+продаж|нет\s+прибыл|нет\s+денег/i,
  /лид|заяв|конверс|воронк|выручк|прибыл|марж|касс/i,
  /не\s+успева|перегруж|завис|теря|очеред/i
];

function detectCandidateLayers(text, integrityType, proposedSolution) {
  const layers = new Set();
  const haystack = `${text} ${proposedSolution}`.toLowerCase();

  if (/crm|битрикс|amo|дашборд|аналитик|данн|отч[её]т|таблиц/.test(haystack)) {
    layers.add("technology");
    layers.add("data_analytics");
  }
  if (/crm|битрикс|amo/.test(haystack)) {
    layers.add("commercial");
    layers.add("operating_model");
  }
  if (/лид|заяв|продаж|воронк|клиент|роп|менеджер/.test(haystack)) {
    layers.add("commercial");
    layers.add("operating_model");
  }
  if (/операцион|процесс|регламент|исполн|срок/.test(haystack)) {
    layers.add("operating_model");
    layers.add("governance_risks");
  }
  if (/команд|люд|нанять|найм|директор|роль|ответствен/.test(haystack)) {
    layers.add("people_organization");
    layers.add("governance_risks");
    layers.add("owner_context");
  }
  if (/прибыл|марж|касс|деньг|расход|выручк/.test(haystack)) {
    layers.add("finance");
    layers.add("commercial");
  }
  if (/ниш|рынок|сегмент|масштаб|стратег/.test(haystack)) {
    layers.add("strategy");
    layers.add("external_environment");
    layers.add("owner_context");
  }

  if (integrityType === "proposed_solution" && layers.size === 0) {
    layers.add("operating_model");
    layers.add("governance_risks");
  }
  if (integrityType === "problem_or_symptom" && layers.size === 0) {
    layers.add("data_analytics");
  }

  return [...layers].slice(0, 5);
}

function buildUnderlyingProblemCandidates(text, proposedSolution) {
  const haystack = `${text} ${proposedSolution}`.toLowerCase();

  if (/crm|битрикс|amo/.test(haystack)) {
    return [
      "теряются заявки или клиенты",
      "не видно воронку и статусы сделок",
      "нет ответственного за следующий шаг",
      "данные о продажах расходятся между людьми"
    ];
  }

  if (/операционн[а-яё]+\s+директор|роп|руководител|нанять|найм/.test(haystack)) {
    return [
      "собственник перегружен операционными решениями",
      "ответственность между ролями размыта",
      "процессы не удерживают рост",
      "решения зависают без владельца"
    ];
  }

  if (/дашборд|аналитик|отч[её]т|таблиц/.test(haystack)) {
    return [
      "нет единой картины цифр",
      "решения принимаются на ощущениях",
      "данные расходятся между источниками",
      "не видно, где поток теряет результат"
    ];
  }

  return [
    "какую боль это должно снять",
    "какой поток сейчас ломается",
    "какой результат должен измениться"
  ];
}

function buildMinimumQuestion(integrityType, proposedSolution, candidateLayers) {
  if (integrityType === "proposed_solution") {
    const object = proposedSolution ? `«${proposedSolution}»` : "это решение";
    return `Какую проблему должен решить ${object}: что сейчас теряется, зависает или не видно?`;
  }

  if (integrityType === "interpretation") {
    return "На каком конкретном участке это видно: где появляется задержка, ошибка, очередь или ручной контроль?";
  }

  if (integrityType === "urgent_problem") {
    return "Какой ближайший срок риска, текущий остаток денег, обязательства и ожидаемые поступления?";
  }

  if (integrityType === "strategic_intent") {
    return "Зачем это делать сейчас: рост, прибыль, снижение риска, выход собственника из операционки или проверка новой модели?";
  }

  if (candidateLayers.includes("commercial")) {
    return "Что сейчас известно по последним заявкам: источник, целевость, первый контакт и где они останавливаются?";
  }

  return "Какой один факт лучше всего покажет, где реальность расходится с ожидаемым результатом?";
}

function detectInterventionDepth(integrityType, text) {
  if (integrityType === "light_task") {
    return "light";
  }
  if (integrityType === "urgent_problem" || integrityType === "strategic_intent") {
    return "deep_ceo";
  }
  if (/касс|деньг|прибыл|марж|финанс|стратег|рынок|команд|нанять|директор|обязательств|риск/i.test(text)) {
    return "deep_ceo";
  }
  return "standard";
}

export function checkIntentIntegrity({ text, classification = {} } = {}) {
  const rawText = normalizeText(classification.cleanText || text);
  const normalized = lowerText(rawText);
  const proposedSolution = pickFirstMatch(rawText, SOLUTION_PATTERNS);
  const hasSolutionMarker = proposedSolution && includesAny(proposedSolution, SOLUTION_MARKERS);
  const hasWholeTextSolutionMarker = includesAny(rawText, SOLUTION_MARKERS);

  let integrityType = "unclear";
  let inputFrame = "unclear";
  let mustReframe = false;
  let isFalseFocusRisk = false;
  let confidence = 0.55;

  if (includesAny(rawText, LIGHT_TASK_PATTERNS)) {
    integrityType = "light_task";
    inputFrame = "small_execution_request";
    confidence = 0.82;
  } else if (classification.entryMode === "tool_discovery" || classification.entryMode === "specific_tool_request") {
    integrityType = "tool_request";
    inputFrame = "tool_first";
    confidence = 0.76;
  } else if (includesAny(rawText, URGENT_PATTERNS)) {
    integrityType = "urgent_problem";
    inputFrame = "urgent_problem";
    confidence = 0.84;
  } else if (includesAny(rawText, STRATEGIC_INTENT_PATTERNS)) {
    integrityType = "strategic_intent";
    inputFrame = "owner_intent";
    confidence = 0.78;
  } else if (hasSolutionMarker || (proposedSolution && hasWholeTextSolutionMarker)) {
    integrityType = "proposed_solution";
    inputFrame = "solution_first";
    mustReframe = true;
    isFalseFocusRisk = true;
    confidence = 0.82;
  } else if (includesAny(rawText, INTERPRETATION_PATTERNS)) {
    integrityType = "interpretation";
    inputFrame = "user_interpretation";
    mustReframe = true;
    isFalseFocusRisk = true;
    confidence = 0.74;
  } else if (includesAny(rawText, PROBLEM_OR_SYMPTOM_PATTERNS) || classification.type === "free_text_problem") {
    integrityType = "problem_or_symptom";
    inputFrame = "problem_first";
    confidence = 0.7;
  }

  const candidateLayers = detectCandidateLayers(normalized, integrityType, proposedSolution);
  const underlyingProblemCandidates = integrityType === "proposed_solution"
    ? buildUnderlyingProblemCandidates(rawText, proposedSolution)
    : [];
  const minimumQuestion = buildMinimumQuestion(integrityType, proposedSolution, candidateLayers);
  const interventionDepth = detectInterventionDepth(integrityType, rawText);

  return {
    integrityType,
    inputFrame,
    isFalseFocusRisk,
    mustReframe,
    proposedSolution,
    underlyingProblemCandidates,
    candidateLayers,
    minimumQuestion,
    interventionDepth,
    ownerEscalationLikely: interventionDepth === "deep_ceo" && integrityType !== "problem_or_symptom",
    confidence,
    reason: integrityType === "proposed_solution"
      ? "Пользователь принёс готовое решение или инструмент, поэтому сначала нужно понять, какую проблему оно должно решить."
      : integrityType === "interpretation"
        ? "Пользователь принёс интерпретацию причины, а не проверенный факт."
        : integrityType === "light_task"
          ? "Запрос маленький и не требует полного CEO-цикла."
          : "Формулировка может идти в обычный управленческий цикл."
  };
}
