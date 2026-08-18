export const CONVERSATION_EVALUATOR_VERSION = "conversation-evaluator-v1";

const SEVERITY_PENALTY = {
  critical: 30,
  high: 20,
  medium: 12,
  low: 6
};

const ISSUE_TEXT = {
  no_user_messages: {
    category: "input",
    severity: "critical",
    title: "Нет сообщений пользователя",
    description: "Диалог нельзя оценить: нет входного запроса или ответов пользователя.",
    suggestion: "Проверить, почему диалог попал в обработку без пользовательского входа."
  },
  no_assistant_messages: {
    category: "delivery",
    severity: "critical",
    title: "Нет ответа бота",
    description: "Пользователь что-то написал, но в истории нет ответа AI-BOSS.",
    suggestion: "Проверить webhook, обработку ошибок и отправку ответа в Telegram."
  },
  no_observations_after_context: {
    category: "observation",
    severity: "high",
    title: "Не зафиксированы наблюдения",
    description: "В диалоге уже есть контекст, но система не сохранила факты, сигналы или симптомы.",
    suggestion: "Усилить Observation Layer: после 2-3 содержательных ответов сохранять наблюдения, а не только текст переписки."
  },
  weak_diagnostic_artifacts: {
    category: "diagnosis",
    severity: "medium",
    title: "Мало диагностических артефактов",
    description: "Есть разговор, но мало сохраненных гипотез, симптомов, ограничений или шагов.",
    suggestion: "Проверить, на каком этапе цепочка симптом -> гипотеза -> ограничение -> следующий шаг не записывает результат."
  },
  missing_clear_next_action: {
    category: "next_step",
    severity: "high",
    title: "Нет понятного следующего действия",
    description: "Последний ответ не дает пользователю ясного шага: что нажать, что прислать или что сделать дальше.",
    suggestion: "В конце диагностического ответа всегда давать один простой следующий шаг."
  },
  weak_constraint_explanation: {
    category: "decision",
    severity: "medium",
    title: "Слабо объяснен выбор ограничения",
    description: "В диалоге есть версия ограничения, но не видно человеческого объяснения, почему выбрана именно она.",
    suggestion: "Добавлять блок: почему начинаем отсюда, что это может изменить и какие факты подтвердят или опровергнут версию."
  },
  premature_certainty: {
    category: "decision",
    severity: "medium",
    title: "Риск преждевременной уверенности",
    description: "Ответ звучит как финальный диагноз, хотя данных может быть недостаточно.",
    suggestion: "Формулировать ранние выводы как рабочую версию и явно показывать, что нужно проверить фактами."
  },
  internal_method_exposed: {
    category: "language",
    severity: "medium",
    title: "Видна внутренняя методика",
    description: "Бот говорит про внутренние слои или механику без прямого запроса пользователя.",
    suggestion: "Оставлять слои и внутреннюю карту внутри системы, а пользователю объяснять результат обычным языком."
  },
  internal_state_leak: {
    category: "language",
    severity: "high",
    title: "Утекли технические термины",
    description: "В ответе видны внутренние названия полей, движков или структур.",
    suggestion: "Добавить фильтр ответа перед отправкой: технические поля и названия внутренних модулей не должны попадать пользователю."
  },
  foreign_script_leak: {
    category: "language",
    severity: "high",
    title: "В ответ попал фрагмент на другом языке",
    description: "Русский диалог содержит слово или фрагмент из посторонней письменности.",
    suggestion: "Перед отправкой проверять письменность ответа и очищать случайные языковые вставки."
  },
  answer_too_long: {
    category: "language",
    severity: "low",
    title: "Ответ слишком длинный",
    description: "Ответ может быть перегружен для Telegram-диалога.",
    suggestion: "Сжимать ответ до одной мысли, одного объяснения и одного следующего шага."
  },
};

function text(value) {
  return String(value || "").trim();
}

function compactText(value, maxLength = 280) {
  const normalized = text(value).replace(/\s+/g, " ");
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1).trim()}…`;
}

function allMessageText(messages = [], role = "") {
  return messages
    .filter((message) => !role || message.role === role)
    .map((message) => text(message.text))
    .filter(Boolean)
    .join("\n");
}

function latestMessage(messages = [], role = "") {
  return [...messages].reverse().find((message) => !role || message.role === role) || null;
}

function countMatches(value, pattern) {
  return (String(value || "").match(pattern) || []).length;
}

function hasClearNextAction(value) {
  return /(\?|ответь|пришли|отправь|заполни|выбери|нажми|перейд|открой|давай|можем|следующий шаг|что сделать|вернуться|начать)/i.test(
    text(value)
  );
}

function userAskedAboutLayers(userText) {
  return /11\s+сло|сло[йеё]в|архитектурн|методик|как\s+ты\s+анализируешь/i.test(userText);
}

function hasInternalStateLeak(assistantText) {
  return /knownFacts|workingHypotheses|entryState|graphPacket|systemLayers|candidateConstraints|Diagnostic Engine|Decision Engine|Action Engine|ObservationExtractor/i.test(
    assistantText
  );
}

function hasForeignScriptLeak(value) {
  return /[\u0530-\u058f\u0590-\u05ff\u0600-\u06ff\u0900-\u097f\u10a0-\u10ff\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/u.test(
    text(value)
  );
}

function hasHumanWhy(value) {
  return /(почему|потому|поэтому|связ|влия|объясня|если начать|это важно|это может|проверим|факт)/i.test(text(value));
}

function addIssue(issues, code, evidence = {}) {
  const template = ISSUE_TEXT[code];
  if (!template) {
    return;
  }

  issues.push({
    code,
    fingerprint: `${template.category}:${code}`,
    category: template.category,
    severity: template.severity,
    title: template.title,
    description: template.description,
    suggestion: template.suggestion,
    evidence
  });
}

function summarizeIssues(issues) {
  if (!issues.length) {
    return "Диалог выглядит устойчиво: есть понятная логика, серьезных разрывов evaluator не нашел.";
  }

  const first = issues[0];
  const second = issues[1];
  if (!second) {
    return `Главный риск: ${first.title.toLowerCase()}.`;
  }

  return `Главные риски: ${first.title.toLowerCase()} и ${second.title.toLowerCase()}.`;
}

function statusByScore(score) {
  if (score >= 80) {
    return "good";
  }
  if (score >= 55) {
    return "watch";
  }
  return "critical";
}

function uniqueSuggestions(issues) {
  const seen = new Set();
  const result = [];

  for (const issue of issues) {
    if (!issue.suggestion || seen.has(issue.fingerprint)) {
      continue;
    }
    seen.add(issue.fingerprint);
    result.push({
      fingerprint: issue.fingerprint,
      category: issue.category,
      severity: issue.severity,
      title: issue.title,
      suggestion: issue.suggestion
    });
  }

  return result;
}

export class ConversationEvaluator {
  evaluateConversation(detail) {
    const messages = detail?.messages || [];
    const userMessages = messages.filter((message) => message.role === "user");
    const assistantMessages = messages.filter((message) => message.role === "assistant");
    const latestUser = latestMessage(messages, "user");
    const latestAssistant = latestMessage(messages, "assistant");
    const userText = allMessageText(messages, "user");
    const assistantText = allMessageText(messages, "assistant");
    const issues = [];
    const strengths = [];

    if (!userMessages.length) {
      addIssue(issues, "no_user_messages");
    }

    if (userMessages.length && !assistantMessages.length) {
      addIssue(issues, "no_assistant_messages");
    }

    const hasObservations = (detail?.observations || []).length > 0;
    const hasHypotheses = (detail?.hypotheses || []).length > 0;
    const hasConstraints = (detail?.constraints || []).length > 0;
    const hasActionWave = (detail?.actionWaves || []).length > 0;
    const hasSnapshots = (detail?.snapshots || []).length > 0;
    const hasMiniAppEval = (detail?.miniAppEvalLogs || []).length > 0;
    const hasMiniAppInvite = /кабинет|mini app|мини-?апп|mini-app/i.test(assistantText);
    const primarySkill = text(detail?.thread?.entryState?.lastSkillSelection?.primarySkill);
    const isDiagnosticRoute = !primarySkill || [
      "business_diagnostic",
      "diagnostic_interview",
      "constraint_prioritization",
      "maturity_assessment"
    ].includes(primarySkill);

    if (isDiagnosticRoute && userMessages.length >= 2 && !hasObservations) {
      addIssue(issues, "no_observations_after_context", {
        userMessages: userMessages.length
      });
    }

    if (isDiagnosticRoute && userMessages.length >= 3 && !hasHypotheses && !hasConstraints && !hasActionWave && !hasSnapshots && !hasMiniAppEval) {
      addIssue(issues, "weak_diagnostic_artifacts", {
        userMessages: userMessages.length
      });
    }

    const isOutcomeClosure = /^результат\s*:/i.test(text(latestUser?.text));
    if (latestAssistant && !isOutcomeClosure && !hasClearNextAction(latestAssistant.text)) {
      addIssue(issues, "missing_clear_next_action", {
        latestAssistant: compactText(latestAssistant.text, 220)
      });
    }

    if (isDiagnosticRoute && (hasConstraints || /ограничени|гипотез|главн/i.test(assistantText)) && !hasHumanWhy(assistantText)) {
      addIssue(issues, "weak_constraint_explanation");
    }

    if (/(?:главн(?:ое|ый)\s+ограничени[ея]\s*(?:—|:|это)|финальн[а-я\s]+диагноз|точно\s+причина)/i.test(assistantText) && !/гипотез|верси|провер/i.test(assistantText)) {
      addIssue(issues, "premature_certainty");
    }

    if (!userAskedAboutLayers(userText) && /11\s+сло[её]в|по\s+слоям/i.test(assistantText)) {
      addIssue(issues, "internal_method_exposed");
    }

    if (hasInternalStateLeak(assistantText)) {
      addIssue(issues, "internal_state_leak");
    }

    if (/[А-Яа-яЁё]/.test(userText) && hasForeignScriptLeak(assistantText)) {
      addIssue(issues, "foreign_script_leak");
    }

    const longestAssistant = Math.max(0, ...assistantMessages.map((message) => text(message.text).length));
    if (longestAssistant > 1600) {
      addIssue(issues, "answer_too_long", {
        longestAssistant
      });
    }

    if (hasObservations) {
      strengths.push("Система сохраняет наблюдения, а не только текст переписки.");
    }
    if (hasHypotheses || hasConstraints) {
      strengths.push("Есть диагностическая версия, с которой можно работать дальше.");
    }
    if (hasActionWave) {
      strengths.push("Диалог доведен до следующего практического шага.");
    }
    if (isOutcomeClosure) {
      strengths.push("Управленческий цикл закрыт фактическим результатом без искусственного нового вопроса.");
    }
    if (latestAssistant && hasClearNextAction(latestAssistant.text)) {
      strengths.push("Последний ответ содержит понятное приглашение к следующему действию.");
    }

    const penalty = issues.reduce((total, issue) => total + (SEVERITY_PENALTY[issue.severity] || 0), 0);
    const score = Math.max(0, Math.min(100, 100 - penalty));

    return {
      evaluatorVersion: CONVERSATION_EVALUATOR_VERSION,
      status: statusByScore(score),
      score,
      summary: summarizeIssues(issues),
      strengths,
      issues,
      improvementSuggestions: uniqueSuggestions(issues),
      metrics: {
        messagesCount: messages.length,
        userMessagesCount: userMessages.length,
        assistantMessagesCount: assistantMessages.length,
        assistantQuestionsCount: countMatches(assistantText, /\?/g),
        observationsCount: (detail?.observations || []).length,
        hypothesesCount: (detail?.hypotheses || []).length,
        constraintsCount: (detail?.constraints || []).length,
        actionWavesCount: (detail?.actionWaves || []).length,
        hasMiniAppInvite,
        longestAssistantMessageChars: longestAssistant,
        latestAssistantAt: latestAssistant?.created_at || latestAssistant?.createdAt || ""
      }
    };
  }
}
