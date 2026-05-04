function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

export function isVoiceCapabilityQuestion(text) {
  const normalized = normalizeText(text);
  return /голосов|голосом|voice|аудио/.test(normalized) &&
    /принима|поддерж|умеешь|можно|работаешь|разбираешь/.test(normalized);
}

export function isFileCapabilityQuestion(text) {
  const normalized = normalizeText(text);
  return /файл|документ|таблиц|excel|xlsx|pdf|скрин|изображен|фото/.test(normalized) &&
    /принима|поддерж|умеешь|можно|работаешь|разбираешь|загруз/.test(normalized);
}

export function buildVoiceCapabilityReply({ voiceEnabled }) {
  if (voiceEnabled) {
    return "Да, принимаю. Можешь прислать голосом — я разберу и продолжу по делу. Если удобно, просто надиктуй, что сейчас происходит и где именно буксует результат.";
  }

  return "Пока нет: в этом окружении транскрибация голосовых не настроена. Если хочешь, напиши ту же мысль текстом в одной-двух фразах, и я сразу продолжу.";
}

export function buildFileCapabilityReply() {
  return "Да, файлы принимаю. Сейчас надёжно читаю текстовые файлы: txt, md, csv, json. Excel, PDF, фото и скрины тоже можно прислать, но их содержимое я пока не извлекаю автоматически — лучше добавить подпись, ссылку на документ или короткую выжимку, что именно нужно разобрать.";
}

export function describeTelegramPayloadForLog(payload = {}) {
  if (!payload) {
    return "";
  }

  if (payload.kind === "text") {
    return payload.text || "";
  }

  if (payload.kind === "voice") {
    return `[Голосовое сообщение${payload.durationSeconds ? `, ${payload.durationSeconds} сек.` : ""}]`;
  }

  if (payload.kind === "audio") {
    return `[Аудиофайл: ${payload.fileName || "без названия"}]`;
  }

  if (["document", "photo", "video"].includes(payload.kind)) {
    const label = payload.kind === "photo" ? "Изображение" : payload.kind === "video" ? "Видео" : "Файл";
    const caption = payload.caption ? ` Подпись: ${payload.caption}` : "";
    return `[${label}: ${payload.fileName || "без названия"}]${caption}`;
  }

  return `[Telegram message: ${payload.kind || "unknown"}]`;
}
