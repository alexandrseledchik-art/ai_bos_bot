const LEADING_PHRASES = [
  /^привет[!.]?\s+/i,
  /^здравствуйте[!.]?\s+/i,
  /^понял[,.!:\s-]+/i,
  /^вижу[,.!:\s-]+/i,
];

export function normalizeReplyText(text: string) {
  let normalized = text.trim();

  for (const pattern of LEADING_PHRASES) {
    normalized = normalized.replace(pattern, "");
  }

  normalized = normalized.trim();

  if (!normalized) {
    return normalized;
  }

  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}
