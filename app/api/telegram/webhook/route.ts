import { ENTRY_OFFER_TEXT } from "@/lib/formatting/entry-offer";
import { extractImageContext } from "@/lib/images/extract-image-context";
import { runTelegramDecisionEngine } from "@/lib/pipeline/run-telegram-decision-engine";
import { getCaseById, getCaseSnapshotById } from "@/lib/persistence/repository";
import {
  getTelegramFileBlob,
  sendTelegramChatAction,
  sendTelegramTextMessage,
} from "@/lib/telegram/bot-api";
import { transcribeAudio } from "@/lib/transcription/transcribe-audio";
import { extractWebsiteContext } from "@/lib/website/extract-website-context";

type TelegramUser = {
  id?: number;
  username?: string;
  first_name?: string;
  last_name?: string;
};

type TelegramPhotoSize = {
  file_id: string;
  width: number;
  height: number;
};

type TelegramDocument = {
  file_id: string;
  mime_type?: string;
};

type TelegramMessage = {
  message_id?: number;
  chat?: { id?: number };
  from?: TelegramUser;
  text?: string;
  caption?: string;
  voice?: { file_id: string };
  audio?: { file_id: string };
  photo?: TelegramPhotoSize[];
  document?: TelegramDocument;
};

type TelegramUpdate = {
  message?: TelegramMessage;
};

function getText(message: TelegramMessage) {
  return message.text?.trim() || message.caption?.trim() || "";
}

function getBestImageFileId(message: TelegramMessage) {
  if (message.photo?.length) {
    return [...message.photo].sort((a, b) => b.width * b.height - a.width * a.height)[0]?.file_id ?? null;
  }

  if (message.document?.mime_type?.startsWith("image/")) {
    return message.document.file_id;
  }

  return null;
}

function blobToDataUrl(blob: Blob, mimeType = "application/octet-stream") {
  return blob.arrayBuffer().then((buffer) => {
    const base64 = Buffer.from(buffer).toString("base64");
    return `data:${mimeType};base64,${base64}`;
  });
}

export async function POST(request: Request) {
  let chatId: number | null = null;
  let replyToMessageId: number | null = null;

  try {
    const update = (await request.json()) as TelegramUpdate;
    const message = update.message;

    if (!message?.chat?.id || !message.from?.id) {
      return Response.json({ ok: true });
    }

    chatId = message.chat.id;
    replyToMessageId = message.message_id ?? null;

    const text = getText(message);

    if (text === "/start") {
      await sendTelegramTextMessage({
        chatId,
        text: ENTRY_OFFER_TEXT,
        replyToMessageId,
      });

      return Response.json({ ok: true });
    }

    if (text.startsWith("/start case_")) {
      const caseId = text.replace("/start case_", "").trim();
      const caseRecord = caseId ? await getCaseById(caseId) : null;
      const snapshot =
        caseRecord?.latestSnapshotId ? await getCaseSnapshotById(caseRecord.latestSnapshotId) : null;

      const continueText = snapshot
        ? `Открыл сохранённый кейс.\n\nПоследний зафиксированный результат:\n${snapshot.replyText}\n\nПродолжайте следующим сообщением в этом чате — я подхвачу контекст и продолжу разбор.`
        : "Открыл сохранённый кейс. Продолжайте следующим сообщением в этом чате, и я подхвачу предыдущий контекст.";

      await sendTelegramTextMessage({
        chatId,
        text: continueText,
        replyToMessageId,
      });

      return Response.json({ ok: true });
    }

    const urls = text.match(/https?:\/\/\S+/gi) ?? [];

    let voiceTranscript: string | null = null;
    let imageContext: string | null = null;
    let websiteContext: Record<string, unknown> | null = null;

    await sendTelegramChatAction({ chatId, action: "typing" });

    if (message.voice?.file_id || message.audio?.file_id) {
      const fileId = message.voice?.file_id ?? message.audio?.file_id;
      if (!fileId) {
        throw new Error("Voice/audio file id is missing.");
      }
      const file = await getTelegramFileBlob(fileId);
      voiceTranscript = await transcribeAudio({
        file: file.blob,
        filename: file.filePath.split("/").pop() ?? "audio.ogg",
      });
    }

    const imageFileId = getBestImageFileId(message);
    if (imageFileId) {
      const file = await getTelegramFileBlob(imageFileId);
      const mimeType = message.document?.mime_type ?? "image/jpeg";
      const dataUrl = await blobToDataUrl(file.blob, mimeType);
      imageContext = await extractImageContext({ imageUrl: dataUrl });
    }

    if (urls[0]) {
      websiteContext = await extractWebsiteContext({ url: urls[0] });
    }

    const effectiveText = voiceTranscript || text;
    if (!effectiveText && !imageContext && !websiteContext) {
      await sendTelegramTextMessage({
        chatId,
        text: "Опишите задачу текстом, голосом, ссылкой или изображением, и я помогу сузить проблему.",
        replyToMessageId,
      });

      return Response.json({ ok: true });
    }

    const result = await runTelegramDecisionEngine({
      telegramUserId: message.from.id,
      telegramChatId: message.chat.id,
      telegramMessageId: message.message_id ?? null,
      telegramUsername: message.from.username ?? null,
      firstName: message.from.first_name ?? null,
      lastName: message.from.last_name ?? null,
      text,
      caption: message.caption ?? null,
      voiceTranscript,
      imageContext,
      websiteContext,
    });

    await sendTelegramTextMessage({
      chatId,
      text: result.replyText,
      replyToMessageId,
    });

    return Response.json({
      ok: true,
      snapshotId: result.snapshotId,
      caseId: result.caseId,
    });
  } catch (error) {
    console.error("telegram_webhook_error", error);

    if (chatId) {
      try {
        await sendTelegramTextMessage({
          chatId,
          text: "Сервис временно не смог обработать сообщение. Лучше повторить запрос чуть позже, чем получить неточный разбор.",
          replyToMessageId,
        });
      } catch (telegramError) {
        console.error("telegram_send_error", telegramError);
      }
    }

    return Response.json({ ok: true });
  }
}
