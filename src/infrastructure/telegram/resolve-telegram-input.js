function buildVoiceFallbackReply() {
  return "Вижу голосовое, но не смог нормально разобрать речь. Попробуй отправить его ещё раз чуть короче или напиши мысль текстом в одной-двух фразах.";
}

function buildVoiceNotConfiguredReply() {
  return "Вижу голосовое. Сейчас транскрибация в этом окружении не настроена, поэтому я не смогу его разобрать. Можешь прислать ту же мысль текстом, и я сразу продолжу диагностику.";
}

const MAX_TEXT_FILE_BYTES = 1024 * 1024;
const MAX_TEXT_FILE_CHARS = 12000;

const TEXT_FILE_EXTENSIONS = new Set([
  ".txt",
  ".md",
  ".markdown",
  ".csv",
  ".json",
  ".log",
  ".tsv",
  ".xml",
  ".yaml",
  ".yml"
]);

function getExtension(fileName = "") {
  const match = fileName.toLowerCase().match(/\.[a-z0-9]+$/);
  return match?.[0] || "";
}

function isTextLikeFile(payload) {
  const mimeType = String(payload?.mimeType || "").toLowerCase();
  const extension = getExtension(payload?.fileName || "");

  return (
    mimeType.startsWith("text/") ||
    mimeType === "application/json" ||
    mimeType === "application/xml" ||
    mimeType === "application/x-yaml" ||
    TEXT_FILE_EXTENSIONS.has(extension)
  );
}

function formatFileSize(size = 0) {
  const numericSize = Number(size || 0);
  if (!numericSize) {
    return "размер не указан";
  }

  if (numericSize < 1024 * 1024) {
    return `${Math.ceil(numericSize / 1024)} КБ`;
  }

  return `${(numericSize / 1024 / 1024).toFixed(1)} МБ`;
}

function trimFileText(text) {
  const normalized = String(text || "").replace(/^\uFEFF/, "").trim();
  if (normalized.length <= MAX_TEXT_FILE_CHARS) {
    return normalized;
  }

  return `${normalized.slice(0, MAX_TEXT_FILE_CHARS)}\n\n[Файл длинный, дальше текст обрезан.]`;
}

function buildFileContext(payload, fileText) {
  const caption = payload.caption ? `\nПодпись пользователя: ${payload.caption}` : "";

  return [
    `Пользователь прислал файл: ${payload.fileName || "без названия"}.`,
    `Тип файла: ${payload.mimeType || "не указан"}. Размер: ${formatFileSize(payload.fileSize)}.${caption}`,
    "Содержимое файла извлечено ниже. Используй его как источник информации, но не делай сильный диагноз без подтверждения пользователя.",
    "",
    "Содержимое файла:",
    fileText
  ].join("\n");
}

function buildUnsupportedFileContext(payload) {
  const kind = payload.kind === "photo" ? "изображение" : payload.kind === "video" ? "видео" : "файл";
  const caption = payload.caption ? `\nПодпись пользователя: ${payload.caption}` : "";
  const nextInstruction = payload.caption
    ? "Ответь коротко: подтверди, что файл получен, опирайся только на подпись пользователя и попроси ссылку, текстовый фрагмент или краткую выжимку, если для диагностики нужно содержимое файла."
    : "Ответь коротко: подтверди, что файл получен, объясни, что сейчас надёжно читаются текстовые файлы или ссылка/описание, и попроси пользователя дать один следующий источник информации: текст, ссылку на документ или краткое описание, что в файле важно для диагностики.";

  return [
    `Пользователь прислал ${kind}: ${payload.fileName || "без названия"}.`,
    `Тип файла: ${payload.mimeType || "не указан"}. Размер: ${formatFileSize(payload.fileSize)}.${caption}`,
    "Содержимое этого файла пока не извлечено автоматически.",
    nextInstruction
  ].join("\n");
}

function buildFileTooLargeReply(payload) {
  return `Файл получил: ${payload.fileName || "без названия"}. Он слишком большой для чтения прямо в чате (${formatFileSize(payload.fileSize)}). Пришли ссылку на документ, короткую выжимку или вставь самый важный фрагмент текстом — и я разберу его по сути.`;
}

async function resolveDocumentToText({ payload, telegramApi }) {
  if (!isTextLikeFile(payload)) {
    return {
      text: buildUnsupportedFileContext(payload),
      userMeta: {
        ...(payload.userMeta || {}),
        inputKind: payload.kind,
        fileReceived: true,
        fileContentExtracted: false,
        fileName: payload.fileName,
        mimeType: payload.mimeType
      }
    };
  }

  if (payload.fileSize > MAX_TEXT_FILE_BYTES) {
    return {
      replyOnly: buildFileTooLargeReply(payload)
    };
  }

  try {
    const file = await telegramApi.getFile(payload.fileId);
    if (!file?.file_path) {
      throw new Error("Telegram file path is missing");
    }

    const buffer = await telegramApi.downloadFile(file.file_path);
    const fileText = trimFileText(buffer.toString("utf8"));

    if (!fileText) {
      return {
        text: buildUnsupportedFileContext(payload),
        userMeta: {
          ...(payload.userMeta || {}),
          inputKind: payload.kind,
          fileReceived: true,
          fileContentExtracted: false,
          fileName: payload.fileName,
          mimeType: payload.mimeType
        }
      };
    }

    return {
      text: buildFileContext(payload, fileText),
      userMeta: {
        ...(payload.userMeta || {}),
        inputKind: payload.kind,
        fileReceived: true,
        fileContentExtracted: true,
        fileName: payload.fileName,
        mimeType: payload.mimeType
      }
    };
  } catch {
    return {
      text: buildUnsupportedFileContext(payload),
      userMeta: {
        ...(payload.userMeta || {}),
        inputKind: payload.kind,
        fileReceived: true,
        fileContentExtracted: false,
        fileName: payload.fileName,
        mimeType: payload.mimeType
      }
    };
  }
}

export async function resolveTelegramPayloadToText({ payload, telegramApi, audioTranscriber }) {
  if (!payload || payload.kind === "text") {
    return {
      text: payload?.text || "",
      userMeta: payload?.userMeta || {}
    };
  }

  if (["document", "photo", "video"].includes(payload.kind)) {
    return resolveDocumentToText({ payload, telegramApi });
  }

  if (!audioTranscriber?.isEnabled) {
    return {
      replyOnly: buildVoiceNotConfiguredReply()
    };
  }

  try {
    const file = await telegramApi.getFile(payload.fileId);
    if (!file?.file_path) {
      throw new Error("Telegram file path is missing");
    }

    const buffer = await telegramApi.downloadFile(file.file_path);
    const transcript = await audioTranscriber.transcribe({
      buffer,
      fileName: payload.fileName,
      mimeType: payload.mimeType
    });

    return {
      text: transcript.text,
      userMeta: {
        ...(payload.userMeta || {}),
        inputKind: payload.kind,
        transcribedFromAudio: true,
        transcriptionModel: transcript.model
      }
    };
  } catch {
    return {
      replyOnly: buildVoiceFallbackReply()
    };
  }
}
