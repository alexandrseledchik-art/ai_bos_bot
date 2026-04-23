import { Blob } from "node:buffer";

function normalizeText(value) {
  return String(value || "").trim();
}

function uniqueStrings(items) {
  return [...new Set((items || []).map((item) => normalizeText(item)).filter(Boolean))];
}

function inferMimeType(fileName, fallbackMimeType = "") {
  const normalized = normalizeText(fileName).toLowerCase();
  if (fallbackMimeType) {
    return fallbackMimeType;
  }
  if (normalized.endsWith(".ogg") || normalized.endsWith(".oga")) {
    return "audio/ogg";
  }
  if (normalized.endsWith(".mp3")) {
    return "audio/mpeg";
  }
  if (normalized.endsWith(".wav")) {
    return "audio/wav";
  }
  if (normalized.endsWith(".m4a")) {
    return "audio/mp4";
  }
  if (normalized.endsWith(".webm")) {
    return "audio/webm";
  }
  return "application/octet-stream";
}

function shouldRetryWithAnotherModel(status) {
  return status === 400 || status === 415 || status === 422 || status >= 500;
}

export class AudioTranscriber {
  constructor({ apiKey, baseUrl, model, fallbackModels = [] }) {
    this.apiKey = apiKey;
    this.baseUrl = String(baseUrl || "").replace(/\/$/, "");
    this.model = model;
    this.fallbackModels = uniqueStrings(fallbackModels);
  }

  get isEnabled() {
    return Boolean(this.apiKey && this.baseUrl && this.model);
  }

  async transcribe({ buffer, fileName, mimeType = "" }) {
    if (!this.isEnabled) {
      throw new Error("Audio transcription is not configured");
    }

    const models = uniqueStrings([this.model, ...this.fallbackModels]);
    let lastError = null;

    for (let index = 0; index < models.length; index += 1) {
      const currentModel = models[index];
      const form = new FormData();
      form.append("model", currentModel);
      form.append("response_format", "text");
      form.append(
        "file",
        new Blob([buffer], { type: inferMimeType(fileName, mimeType) }),
        fileName || "voice-message.ogg"
      );

      const response = await fetch(`${this.baseUrl}/audio/transcriptions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`
        },
        body: form
      });

      const responseText = normalizeText(await response.text());
      if (response.ok) {
        if (!responseText) {
          throw new Error("Audio transcription returned empty text");
        }

        return {
          text: responseText,
          model: currentModel
        };
      }

      lastError = new Error(`OpenAI transcription error for ${currentModel}: ${responseText || response.status}`);
      if (!shouldRetryWithAnotherModel(response.status) || index === models.length - 1) {
        break;
      }
    }

    throw lastError || new Error("Audio transcription failed");
  }
}
