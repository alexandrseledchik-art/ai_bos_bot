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
