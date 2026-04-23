function buildVoiceFallbackReply() {
  return "Вижу голосовое, но не смог нормально разобрать речь. Попробуй отправить его ещё раз чуть короче или напиши мысль текстом в одной-двух фразах.";
}

function buildVoiceNotConfiguredReply() {
  return "Вижу голосовое. Сейчас транскрибация в этом окружении не настроена, поэтому я не смогу его разобрать. Можешь прислать ту же мысль текстом, и я сразу продолжу диагностику.";
}

export async function resolveTelegramPayloadToText({ payload, telegramApi, audioTranscriber }) {
  if (!payload || payload.kind === "text") {
    return {
      text: payload?.text || "",
      userMeta: payload?.userMeta || {}
    };
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
