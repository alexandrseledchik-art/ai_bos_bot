export function extractTelegramTextMessage(update) {
  const message = update?.message || update?.edited_message || null;

  if (!message?.text) {
    return null;
  }

  return {
    chatId: message.chat.id,
    text: message.text,
    userMeta: {
      username: message.from?.username || "",
      chatTitle: message.chat.title || message.chat.username || "",
      firstName: message.from?.first_name || ""
    }
  };
}

export class TelegramApiClient {
  constructor({ token, apiBaseUrl }) {
    this.token = token;
    this.apiBaseUrl = apiBaseUrl;
  }

  async api(method, payload = {}) {
    const response = await fetch(`${this.apiBaseUrl}/bot${this.token}/${method}`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    const json = await response.json();

    if (!response.ok || !json.ok) {
      throw new Error(`Telegram API error for ${method}: ${JSON.stringify(json)}`);
    }

    return json.result;
  }

  async getUpdates({ offset, timeoutSeconds }) {
    return this.api("getUpdates", {
      timeout: timeoutSeconds,
      offset,
      allowed_updates: ["message"]
    });
  }

  async sendMessage(chatId, text) {
    return this.api("sendMessage", {
      chat_id: chatId,
      text
    });
  }

  async sendChatAction(chatId, action = "typing") {
    return this.api("sendChatAction", {
      chat_id: chatId,
      action
    });
  }

  startTyping(chatId, { intervalMs = 4000 } = {}) {
    let active = true;
    let timeoutId = null;

    const tick = async () => {
      if (!active) {
        return;
      }

      try {
        await this.sendChatAction(chatId, "typing");
      } catch {
        // Typing indicator should never break the main request flow.
      }

      if (!active) {
        return;
      }

      timeoutId = setTimeout(() => {
        void tick();
      }, intervalMs);

      if (typeof timeoutId?.unref === "function") {
        timeoutId.unref();
      }
    };

    void tick();

    return () => {
      active = false;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }

  async setWebhook({ url, secretToken = "" }) {
    return this.api("setWebhook", {
      url,
      ...(secretToken ? { secret_token: secretToken } : {})
    });
  }

  async deleteWebhook() {
    return this.api("deleteWebhook");
  }

  async getWebhookInfo() {
    return this.api("getWebhookInfo");
  }
}
