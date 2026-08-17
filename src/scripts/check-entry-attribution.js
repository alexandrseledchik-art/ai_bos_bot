import assert from "node:assert/strict";
import {
  buildTelegramChatUrl,
  ENTRY_START_PAYLOAD_STORAGE_KEY,
  resolveEntryStartPayload
} from "../../app-assets/src/entry-attribution.js";

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.get(key) || null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    }
  };
}

const qrStorage = memoryStorage();
assert.equal(
  buildTelegramChatUrl({
    search: "?utm_source=book&utm_medium=qr&utm_campaign=book_tools",
    storage: qrStorage
  }),
  "https://t.me/ai_bos_bot?start=book_qr"
);
assert.equal(qrStorage.getItem(ENTRY_START_PAYLOAD_STORAGE_KEY), "book_qr");
assert.equal(buildTelegramChatUrl({ storage: qrStorage }), "https://t.me/ai_bos_bot?start=book_qr");

const bookStorage = memoryStorage();
assert.equal(resolveEntryStartPayload("?utm_source=book&utm_medium=book_page", bookStorage), "book");
assert.equal(buildTelegramChatUrl({ storage: bookStorage }), "https://t.me/ai_bos_bot?start=book");

assert.equal(
  buildTelegramChatUrl({ search: "?utm_source=website&utm_medium=site" }),
  "https://t.me/ai_bos_bot"
);
assert.equal(
  buildTelegramChatUrl({
    search: "?utm_source=book&utm_medium=qr",
    startPayload: "tool_example-token"
  }),
  "https://t.me/ai_bos_bot?start=tool_example-token"
);

console.log("Entry attribution: book UTM is carried from the platform to Telegram.");
