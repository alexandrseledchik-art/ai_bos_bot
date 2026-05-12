function normalizeText(value) {
  return String(value || "").trim();
}

function readOutputText(response) {
  if (typeof response.output_text === "string" && response.output_text.trim()) {
    return response.output_text.trim();
  }

  for (const item of response.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && content.text) {
        return content.text.trim();
      }
    }
  }

  return "";
}

function fallbackReply({ text, context = {} }) {
  const page = context.page ? ` по разделу «${context.page}»` : "";
  const company = context.companyName ? ` компании «${context.companyName}»` : "";
  const lower = normalizeText(text).toLowerCase();

  if (/доступ|пользоват|разреш|заблок|approve|block/.test(lower)) {
    return "Доступ сейчас устроен просто: пользователь пишет боту, появляется в админке, а администратор ставит статус «доступ открыт», «ожидает доступа» или «заблокирован». Для командных ролей и прав по компаниям нужен следующий слой.";
  }

  if (/инструмент|слой|домен|поддомен|артефакт/.test(lower)) {
    return `Я смотрю контекст${page}${company}. Важно: инструмент нельзя заменять похожим файлом. Нужно открыть конкретный поддомен, проверить его описание, действие и ожидаемый результат, а потом посмотреть, есть ли в источниках артефакт или содержательные данные именно под эту строку.`;
  }

  return `Я вижу контекст${page}${company}. Могу помочь разобрать текущий вывод, слой, инструмент, доступы или следующий шаг. Если вопрос про решение, сначала отделю факт от версии и предложу один ближайший шаг.`;
}

function normalizeHistory(history) {
  if (!Array.isArray(history)) {
    return [];
  }

  return history
    .map((message) => ({
      role: message?.role === "user" ? "user" : "assistant",
      text: normalizeText(message?.text).slice(0, 1200)
    }))
    .filter((message) => message.text)
    .slice(-12);
}

function workspaceChatId(context = {}) {
  const page = normalizeText(context.page || "workspace").replace(/[^а-яёa-z0-9:_-]+/gi, "-").slice(0, 64) || "workspace";
  const companyId = normalizeText(context.companyId || context.selectedCompanyId || "");
  return `web:${page}:${companyId || "global"}`;
}

function cleanAssistantReply(value) {
  return normalizeText(value)
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .trim();
}

async function answerWithConversationCore({ conversationService, text, context = {} }) {
  if (!conversationService || typeof conversationService.handleUserMessage !== "function") {
    return "";
  }

  const result = await conversationService.handleUserMessage({
    telegramChatId: workspaceChatId(context),
    text,
    userMeta: {
      id: workspaceChatId(context),
      telegramUserId: workspaceChatId(context),
      username: "web_workspace",
      chatTitle: context.companyName || context.page || "Web AI-BOSS",
      source: "web_workspace_chat",
      activeCompanyId: context.companyId || context.selectedCompanyId || "",
      companyName: context.companyName || "",
      workspaceContext: context
    }
  });

  return cleanAssistantReply(result?.reply || "");
}

export async function answerWorkspaceQuestion({ config, conversationService = null, text, context = {}, history = [], systemHint = "" }) {
  const cleanText = normalizeText(text);
  if (!cleanText) {
    return "Напиши вопрос одним сообщением, и я отвечу по текущему контексту.";
  }

  try {
    const coreReply = await answerWithConversationCore({
      conversationService,
      text: cleanText,
      context
    });
    if (coreReply) {
      return coreReply;
    }
  } catch {
    // Если единое ядро временно недоступно, отвечаем через лёгкий web-fallback ниже.
  }

  if (!config?.openaiApiKey) {
    return fallbackReply({ text: cleanText, context });
  }

  const system = [
    "Ты AI-BOSS внутри web-кабинета.",
    "Ты должен держать тот же стиль поведения, что и Telegram-бот AI-BOSS: не быть справочником советов, а помогать отделить факт от версии, понять текущий контекст и выбрать один следующий разумный шаг.",
    "Отвечай по-русски, понятно и по-человечески.",
    "Не используй Markdown-разметку вроде **жирного текста**: web-чат показывает ответ как обычный текст.",
    "Не раскрывай внутренние рассуждения. Показывай короткое объяснение, на что опираешься.",
    "Если данных не хватает, задай один минимальный вопрос.",
    "Не предлагай переход в mini app и не создавай длинный план без запроса.",
    systemHint
  ].filter(Boolean).join("\n");

  const cleanHistory = normalizeHistory(history);
  const historyBlock = cleanHistory.length
    ? cleanHistory.map((message) => `${message.role === "user" ? "Пользователь" : "AI-BOSS"}: ${message.text}`).join("\n")
    : "Истории этого окна пока нет.";

  const user = [
    "Контекст страницы:",
    JSON.stringify(context, null, 2),
    "",
    "Предыдущие сообщения в этом web-чате:",
    historyBlock,
    "",
    "Вопрос:",
    cleanText
  ].join("\n");

  try {
    const response = await fetch(`${config.openaiBaseUrl}/responses`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.openaiApiKey}`
      },
      body: JSON.stringify({
        model: config.reasoningModel,
        reasoning: {
          effort: "low"
        },
        input: [
          {
            role: "system",
            content: [{ type: "input_text", text: system }]
          },
          {
            role: "user",
            content: [{ type: "input_text", text: user }]
          }
        ]
      })
    });

    if (!response.ok) {
      return fallbackReply({ text: cleanText, context });
    }

    const payload = await response.json();
    return cleanAssistantReply(readOutputText(payload)) || fallbackReply({ text: cleanText, context });
  } catch {
    return fallbackReply({ text: cleanText, context });
  }
}
