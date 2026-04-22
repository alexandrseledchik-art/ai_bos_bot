const LEADING_PHRASES = [
  /^привет[!.]?\s+/i,
  /^здравствуйте[!.]?\s+/i,
  /^понял[,.!:\s-]+/i,
  /^вижу[,.!:\s-]+/i,
];

const TRAILING_FILLER_PATTERNS = [
  /\n*\s*Что дальше:\s*\n*\s*Чтобы продолжить, уточните:\s*какой запрос хотите разобрать дальше\??\s*\n*\s*Напишите запрос в 1[–-]2 фразах\.?\s*$/i,
  /\n*\s*Что дальше:\s*\n*\s*Чтобы продолжить, уточните:\s*какой запрос хотите разобрать дальше\??\s*$/i,
  /\n*\s*Что дальше:\s*$/i,
  /\n*\s*Чтобы продолжить, уточните:\s*какой запрос хотите разобрать дальше\??\s*$/i,
  /\n*\s*Напишите запрос в 1[–-]2 фразах\.?\s*$/i,
];

export function normalizeReplyText(text: string) {
  let normalized = text.trim();

  for (const pattern of LEADING_PHRASES) {
    normalized = normalized.replace(pattern, "");
  }

  for (const pattern of TRAILING_FILLER_PATTERNS) {
    normalized = normalized.replace(pattern, "");
  }

  normalized = normalized.trim();

  if (!normalized) {
    return normalized;
  }

  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}
