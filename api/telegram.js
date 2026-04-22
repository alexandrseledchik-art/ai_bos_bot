import { getServices } from "../src/create-services.js";
import { extractTelegramTextMessage } from "../src/infrastructure/telegram/telegram-api.js";

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
  const { config, conversationService, telegramApi } = getServices();

  if (!config.telegramToken) {
    return json({ ok: false, error: "TELEGRAM_BOT_TOKEN is missing" }, { status: 500 });
  }

  if (!validateWebhookSecret(request, config.telegramWebhookSecret)) {
    return json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const update = await request.json();
  const payload = extractTelegramTextMessage(update);

  if (!payload) {
    return json({ ok: true, ignored: true });
  }

  const result = await conversationService.handleUserMessage({
    telegramChatId: String(payload.chatId),
    text: payload.text,
    userMeta: payload.userMeta
  });

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
