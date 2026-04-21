export function normalizeTelegramReplyText(
  action: "capability" | "website_screening" | "tool_navigation" | "ask_question" | "diagnostic_result",
  text: string,
) {
  let normalized = text.trim();

  if (action !== "website_screening") {
    normalized = normalized.replace(
      /\n{2,}Что дальше:\s*\nЧтобы продолжить, уточните: какой запрос хотите разобрать дальше\?\s*\nНапишите запрос в 1–2 фразах\.?\s*$/i,
      "",
    );
  }

  normalized = normalized.replace(
    /^(?:Понял|Понимаю|Это понятно|Ясно)(?:[,:.!]\s*|\s+)/i,
    "",
  );

  normalized = normalized.replace(
    /^(?:Привет|Здравствуйте|Добрый день|Добрый вечер)(?:[,!.\s]+)+/i,
    "",
  );

  normalized = normalized.replace(/\n{3,}/g, "\n\n").trim();

  return normalized;
}
