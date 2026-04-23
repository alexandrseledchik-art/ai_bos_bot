import { extractTelegramMessagePayload, TelegramApiClient } from "./telegram-api.js";
import { resolveTelegramPayloadToText } from "./resolve-telegram-input.js";

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class TelegramBotRunner {
  constructor({ token, apiBaseUrl, pollingTimeoutSeconds = 20, audioTranscriber = null }) {
    this.api = new TelegramApiClient({
      token,
      apiBaseUrl
    });
    this.pollingTimeoutSeconds = pollingTimeoutSeconds;
    this.offset = 0;
    this.audioTranscriber = audioTranscriber;
  }

  async getUpdates() {
    const updates = await this.api.getUpdates({
      offset: this.offset,
      timeoutSeconds: this.pollingTimeoutSeconds
    });
    return updates;
  }

  async sendMessage(chatId, text) {
    return this.api.sendMessage(chatId, text);
  }

  async start(onMessage) {
    while (true) {
      try {
        const updates = await this.getUpdates();

        for (const update of updates) {
          this.offset = update.update_id + 1;
          const payload = extractTelegramMessagePayload(update);

          if (!payload) {
            continue;
          }

          const stopTyping = this.api.startTyping(payload.chatId);
          let result;

          try {
            const resolved = await resolveTelegramPayloadToText({
              payload,
              telegramApi: this.api,
              audioTranscriber: this.audioTranscriber
            });

            if (resolved.replyOnly) {
              await this.sendMessage(payload.chatId, resolved.replyOnly);
              continue;
            }

            result = await onMessage({
              telegramChatId: String(payload.chatId),
              text: resolved.text,
              userMeta: resolved.userMeta
            });
          } finally {
            stopTyping();
          }

          if (result?.reply) {
            await this.sendMessage(payload.chatId, result.reply);
          }
        }
      } catch (error) {
        console.error("Telegram polling loop error:", error.message);
        await delay(3000);
      }
    }
  }
}
