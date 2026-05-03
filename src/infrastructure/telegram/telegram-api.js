function buildUserMeta(message) {
  return {
    id: message.from?.id || message.chat?.id || "",
    telegramUserId: message.from?.id || message.chat?.id || "",
    username: message.from?.username || "",
    chatTitle: message.chat.title || message.chat.username || "",
    firstName: message.from?.first_name || "",
    lastName: message.from?.last_name || "",
    languageCode: message.from?.language_code || ""
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

function inferFileName(kind, media) {
  if (media?.file_name) {
    return media.file_name;
  }

  if (kind === "photo") {
    return "telegram-photo.jpg";
  }

  if (kind === "video") {
    return "telegram-video.mp4";
  }

  return "telegram-document";
}

function pickLargestPhoto(photos = []) {
  return [...photos].sort((left, right) => {
    const leftWeight = Number(left.file_size || 0) || Number(left.width || 0) * Number(left.height || 0);
    const rightWeight = Number(right.file_size || 0) || Number(right.width || 0) * Number(right.height || 0);
    return rightWeight - leftWeight;
  })[0] || null;
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

  const audioMedia = message.voice || message.audio || null;
  if (audioMedia?.file_id) {
    return {
      kind: message.voice ? "voice" : "audio",
      chatId: message.chat.id,
      userMeta: buildUserMeta(message),
      fileId: audioMedia.file_id,
      mimeType: audioMedia.mime_type || "",
      fileName: inferAudioFileName(message.voice ? "voice" : "audio", audioMedia),
      durationSeconds: Number(audioMedia.duration || 0)
    };
  }

  if (message.document?.file_id) {
    const media = message.document;
    return {
      kind: "document",
      chatId: message.chat.id,
      userMeta: buildUserMeta(message),
      fileId: media.file_id,
      fileUniqueId: media.file_unique_id || "",
      mimeType: media.mime_type || "",
      fileName: inferFileName("document", media),
      fileSize: Number(media.file_size || 0),
      caption: message.caption || ""
    };
  }

  const photo = pickLargestPhoto(message.photo);
  if (photo?.file_id) {
    return {
      kind: "photo",
      chatId: message.chat.id,
      userMeta: buildUserMeta(message),
      fileId: photo.file_id,
      fileUniqueId: photo.file_unique_id || "",
      mimeType: "image/jpeg",
      fileName: inferFileName("photo", photo),
      fileSize: Number(photo.file_size || 0),
      caption: message.caption || "",
      width: Number(photo.width || 0),
      height: Number(photo.height || 0)
    };
  }

  if (message.video?.file_id) {
    const media = message.video;
    return {
      kind: "video",
      chatId: message.chat.id,
      userMeta: buildUserMeta(message),
      fileId: media.file_id,
      fileUniqueId: media.file_unique_id || "",
      mimeType: media.mime_type || "video/mp4",
      fileName: inferFileName("video", media),
      fileSize: Number(media.file_size || 0),
      caption: message.caption || "",
      durationSeconds: Number(media.duration || 0)
    };
  }

  return null;
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

  async sendMessage(chatId, text, options = {}) {
    return this.api("sendMessage", {
      chat_id: chatId,
      text,
      ...(options.replyMarkup ? { reply_markup: options.replyMarkup } : {})
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
