import { getServices } from "../src/create-services.js";
import { extractTelegramMessagePayload } from "../src/infrastructure/telegram/telegram-api.js";
import { buildVoiceCapabilityReply, isVoiceCapabilityQuestion } from "../src/infrastructure/telegram/telegram-meta.js";
import { resolveTelegramPayloadToText } from "../src/infrastructure/telegram/resolve-telegram-input.js";

function json(payload, init = {}) {
  return new Response(JSON.stringify(payload), {
    headers: {
      "content-type": "application/json"
    },
    ...init
  });
}

function validateWebhookSecret(request, expectedSecret) {
  if (!expectedSecret) {
    return true;
  }

  return request.headers.get("x-telegram-bot-api-secret-token") === expectedSecret;
}

async function handleTelegramWebhook(request) {
  const { config, conversationService, telegramApi, audioTranscriber } = getServices();

  if (!config.telegramToken) {
    return json({ ok: false, error: "TELEGRAM_BOT_TOKEN is missing" }, { status: 500 });
  }

  if (!validateWebhookSecret(request, config.telegramWebhookSecret)) {
    return json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const update = await request.json();
  const payload = extractTelegramMessagePayload(update);

  if (!payload) {
    return json({ ok: true, ignored: true });
  }

  const stopTyping = telegramApi.startTyping(payload.chatId);
  let result;

  try {
    const resolved = await resolveTelegramPayloadToText({
      payload,
      telegramApi,
      audioTranscriber
    });

    if (resolved.replyOnly) {
      await telegramApi.sendMessage(payload.chatId, resolved.replyOnly);
      return json({ ok: true, handled: payload.kind });
    }

    if (isVoiceCapabilityQuestion(resolved.text)) {
      await telegramApi.sendMessage(
        payload.chatId,
        buildVoiceCapabilityReply({ voiceEnabled: Boolean(audioTranscriber?.isEnabled) })
      );
      return json({ ok: true, handled: "voice-capability-question" });
    }

    result = await conversationService.handleUserMessage({
      telegramChatId: String(payload.chatId),
      text: resolved.text,
      userMeta: resolved.userMeta
    });
  } finally {
    stopTyping();
  }

  if (result?.reply) {
    await telegramApi.sendMessage(payload.chatId, result.reply);
  }

  return json({ ok: true });
}

export default {
  async fetch(request) {
    if (request.method === "GET") {
      return json({ ok: true, route: "telegram-webhook" });
    }

    if (request.method !== "POST") {
      return json({ ok: false, error: "Method not allowed" }, { status: 405 });
    }

    try {
      return await handleTelegramWebhook(request);
    } catch (error) {
      return json(
        {
          ok: false,
          error: error.message
        },
        { status: 500 }
      );
    }
  }
};
