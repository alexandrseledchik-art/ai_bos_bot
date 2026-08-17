export const TELEGRAM_CHAT_BASE_URL = "https://t.me/ai_bos_bot";
export const ENTRY_START_PAYLOAD_STORAGE_KEY = "ai-boss-entry-start-payload-v1";

export function resolveEntryStartPayload(search = "", storage = null) {
  const params = new URLSearchParams(search);
  const source = String(params.get("utm_source") || params.get("source") || "").toLowerCase();
  const medium = String(params.get("utm_medium") || "").toLowerCase();
  const book = String(params.get("book") || "").toLowerCase();
  let payload = "";

  if (source === "book_qr" || (source === "book" && medium === "qr")) {
    payload = "book_qr";
  } else if (source === "book" || book === "business-assembly") {
    payload = "book";
  }

  try {
    if (payload) storage?.setItem(ENTRY_START_PAYLOAD_STORAGE_KEY, payload);
    return payload || storage?.getItem(ENTRY_START_PAYLOAD_STORAGE_KEY) || "";
  } catch {
    return payload;
  }
}

export function buildTelegramChatUrl({ search = "", storage = null, startPayload = "" } = {}) {
  const payload = startPayload || resolveEntryStartPayload(search, storage);
  return payload
    ? `${TELEGRAM_CHAT_BASE_URL}?start=${encodeURIComponent(payload)}`
    : TELEGRAM_CHAT_BASE_URL;
}
