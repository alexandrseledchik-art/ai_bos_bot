import { extractTelegramTextMessage, TelegramApiClient } from "./telegram-api.js";

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class TelegramBotRunner {
  constructor({ token, apiBaseUrl, pollingTimeoutSeconds = 20 }) {
    this.api = new TelegramApiClient({
      token,
      apiBaseUrl
    });
    this.pollingTimeoutSeconds = pollingTimeoutSeconds;
    this.offset = 0;
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
          const payload = extractTelegramTextMessage(update);

          if (!payload) {
            continue;
          }

          const result = await onMessage({
            telegramChatId: String(payload.chatId),
            text: payload.text,
            userMeta: payload.userMeta
          });

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
