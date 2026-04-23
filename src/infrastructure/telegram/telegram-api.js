function buildUserMeta(message) {
  return {
    username: message.from?.username || "",
    chatTitle: message.chat.title || message.chat.username || "",
    firstName: message.from?.first_name || ""
  };
}

function inferAudioFileName(kind, media) {
  if (media?.file_name) {
    return media.file_name;
  }

  if (kind === "voice") {
    return "voice-message.ogg";
  }

  return "audio-message.mp3";
}

export function extractTelegramMessagePayload(update) {
  const message = update?.message || update?.edited_message || null;

  if (!message) {
    return null;
  }

  if (message.text) {
    return {
      kind: "text",
      chatId: message.chat.id,
      text: message.text,
      userMeta: buildUserMeta(message)
    };
  }

  const media = message.voice || message.audio || null;
  if (!media?.file_id) {
    return null;
  }

  return {
    kind: message.voice ? "voice" : "audio",
    chatId: message.chat.id,
    userMeta: buildUserMeta(message),
    fileId: media.file_id,
    mimeType: media.mime_type || "",
    fileName: inferAudioFileName(message.voice ? "voice" : "audio", media),
    durationSeconds: Number(media.duration || 0)
  };
}

export function extractTelegramTextMessage(update) {
  const payload = extractTelegramMessagePayload(update);
  return payload?.kind === "text" ? payload : null;
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

  async getFile(fileId) {
    return this.api("getFile", {
      file_id: fileId
    });
  }

  async downloadFile(filePath) {
    const response = await fetch(`${this.apiBaseUrl}/file/bot${this.token}/${filePath}`);
    if (!response.ok) {
      throw new Error(`Telegram file download failed: ${response.status}`);
    }

    return Buffer.from(await response.arrayBuffer());
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
