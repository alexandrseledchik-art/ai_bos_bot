import { getServices } from "../src/create-services.js";
import {
  buildAccessDeniedReply,
  buildAccessRequestAdminMessage
} from "../src/application/access-control-service.js";
import {
  buildAccessApprovedMiniAppInvite,
  buildAccessApprovedUserMessage,
  handleAccessAdminCommand,
  looksLikeAdminCommand
} from "../src/application/access-admin-commands.js";
import { MiniAppDiagnosticsService } from "../src/application/mini-app-diagnostics-service.js";
import { MiniAppBootstrapService } from "../src/application/mini-app-bootstrap-service.js";
import { ToolWorkflowService } from "../src/application/tool-workflow-service.js";
import { MiniAppCompatSyncClient } from "../src/infrastructure/storage/mini-app-compat-sync.js";
import { extractTelegramMessagePayload } from "../src/infrastructure/telegram/telegram-api.js";
import { buildMiniAppReplyMarkup } from "../src/infrastructure/telegram/mini-app-webapp.js";
import {
  buildFileCapabilityReply,
  buildVoiceCapabilityReply,
  describeTelegramPayloadForLog,
  isFileCapabilityQuestion,
  isVoiceCapabilityQuestion
} from "../src/infrastructure/telegram/telegram-meta.js";
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

async function recordAndSendTelegramReply({
  conversationService,
  telegramApi,
  payload,
  reply,
  userText = "",
  options = {}
}) {
  try {
    await conversationService.recordTelegramExchange({
      telegramChatId: String(payload.chatId),
      userText: userText || describeTelegramPayloadForLog(payload),
      assistantText: reply,
      userMeta: payload.userMeta || {}
    });
  } catch (error) {
    console.warn("Telegram exchange logging skipped:", error.message);
  }

  await telegramApi.sendMessage(payload.chatId, reply, options);
}

async function captureMiniAppChatHandoffFeedback({ config, payload, text }) {
  if (!config.supabaseUrl || !config.supabaseServiceRoleKey || !text) {
    return null;
  }

  try {
    const telegramUserId = payload.userMeta?.telegramUserId || payload.userMeta?.id || payload.chatId;
    const syncClient = new MiniAppCompatSyncClient({
      url: config.supabaseUrl,
      serviceRoleKey: config.supabaseServiceRoleKey
    });
    const appUsers = await syncClient.request("/rest/v1/app_users", {
      query: {
        telegram_user_id: `eq.${telegramUserId}`,
        select: "*",
        limit: 1
      }
    });
    const appUser = Array.isArray(appUsers) ? appUsers[0] : null;
    if (!appUser?.id) {
      return null;
    }

    const events = await syncClient.request("/rest/v1/mini_app_analytics_events", {
      query: {
        app_user_id: `eq.${appUser.id}`,
        event_name: "eq.constraint_rejection_chat_requested",
        order: "created_at.desc",
        select: "*",
        limit: 8
      }
    });
    const pendingEvent = (events || []).find((event) => {
      const metadata = event.metadata && typeof event.metadata === "object" ? event.metadata : {};
      return metadata.status !== "consumed";
    });
    if (!pendingEvent?.case_id || !pendingEvent?.workspace_id || !pendingEvent?.company_id) {
      return null;
    }

    const diagnosticsService = new MiniAppDiagnosticsService({ syncClient });

    return diagnosticsService.recordConstraintRejectionChatReply({
      bootstrap: {
        appUser,
        workspace: { id: pendingEvent.workspace_id },
        company: { id: pendingEvent.company_id },
        activeCase: { id: pendingEvent.case_id },
        companyProfile: {}
      },
      payload: { text }
    });
  } catch (error) {
    console.warn("Mini App chat handoff feedback skipped:", error.message);
    return null;
  }
}

async function handleActiveToolChat({ config, googleDrive, payload, text }) {
  if (!config.supabaseUrl || !config.supabaseServiceRoleKey || !text) return null;
  try {
    const syncClient = new MiniAppCompatSyncClient({
      url: config.supabaseUrl,
      serviceRoleKey: config.supabaseServiceRoleKey
    });
    const telegramUser = {
      id: payload.userMeta?.telegramUserId || payload.userMeta?.id || payload.chatId,
      username: payload.userMeta?.username || "",
      firstName: payload.userMeta?.firstName || "",
      lastName: payload.userMeta?.lastName || ""
    };
    const bootstrap = await new MiniAppBootstrapService({ syncClient }).bootstrap({ telegramUser });
    return new ToolWorkflowService({ syncClient, googleDrive }).handleTelegramInput({
      bootstrap,
      text,
      source: ["voice", "audio"].includes(payload.kind) ? "chat_voice" : "chat_text"
    });
  } catch (error) {
    console.warn("Tool chat workflow skipped:", error.message);
    return null;
  }
}

async function handleTelegramWebhook(request) {
  const { config, conversationService, telegramApi, audioTranscriber, accessControl, googleDrive } = getServices();

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

  if (payload.kind === "text" && looksLikeAdminCommand(payload.text)) {
    const reply = await handleAccessAdminCommand({
      text: payload.text,
      fromTelegramUserId: payload.userMeta?.telegramUserId || payload.userMeta?.id || payload.chatId,
      accessControl,
      onUserApproved: async (user) => {
        await telegramApi.sendMessage(user.telegram_user_id, buildAccessApprovedUserMessage(user), {
          replyMarkup: buildMiniAppReplyMarkup(buildAccessApprovedMiniAppInvite(), {
            appBaseUrl: config.appBaseUrl,
            telegramUser: user,
            webSessionSecret: config.webSessionSecret,
            webLoginTtlSeconds: config.webLoginTtlSeconds
          })
        });
      }
    });
    await telegramApi.sendMessage(payload.chatId, reply);
    return json({ ok: true, handled: "access-admin-command" });
  }

  const accessDecision = await accessControl.checkTelegramAccess({
    telegramUser: {
      ...payload.userMeta,
      id: payload.userMeta?.telegramUserId || payload.userMeta?.id || payload.chatId
    }
  });

  if (!accessDecision.allowed) {
    await recordAndSendTelegramReply({
      conversationService,
      telegramApi,
      payload,
      reply: buildAccessDeniedReply(accessDecision)
    });

    if (accessDecision.shouldNotifyAdmin && config.accessRequestNotifyChatId) {
      await telegramApi.sendMessage(
        config.accessRequestNotifyChatId,
        buildAccessRequestAdminMessage(accessDecision)
      );
    }

    return json({ ok: true, handled: "access-denied", accessStatus: accessDecision.status });
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
      await recordAndSendTelegramReply({
        conversationService,
        telegramApi,
        payload,
        reply: resolved.replyOnly
      });
      return json({ ok: true, handled: payload.kind });
    }

    if (isVoiceCapabilityQuestion(resolved.text)) {
      await recordAndSendTelegramReply({
        conversationService,
        telegramApi,
        payload,
        userText: resolved.text,
        reply: buildVoiceCapabilityReply({ voiceEnabled: Boolean(audioTranscriber?.isEnabled) })
      });
      return json({ ok: true, handled: "voice-capability-question" });
    }

    if (isFileCapabilityQuestion(resolved.text)) {
      await recordAndSendTelegramReply({
        conversationService,
        telegramApi,
        payload,
        userText: resolved.text,
        reply: buildFileCapabilityReply()
      });
      return json({ ok: true, handled: "file-capability-question" });
    }

    const toolChat = await handleActiveToolChat({
      config,
      googleDrive,
      payload,
      text: resolved.text
    });
    if (toolChat?.handled) {
      await recordAndSendTelegramReply({
        conversationService,
        telegramApi,
        payload,
        userText: resolved.text,
        reply: toolChat.reply
      });
      return json({ ok: true, handled: "tool-chat-workflow" });
    }

    const miniAppHandoff = await captureMiniAppChatHandoffFeedback({
      config,
      payload,
      text: resolved.text
    });

    result = await conversationService.handleUserMessage({
      telegramChatId: String(payload.chatId),
      text: resolved.text,
      userMeta: {
        ...(resolved.userMeta || {}),
        ...(miniAppHandoff ? { miniAppHandoff } : {})
      }
    });
  } finally {
    stopTyping();
  }

  if (result?.reply) {
    await telegramApi.sendMessage(payload.chatId, result.reply, {
      replyMarkup: buildMiniAppReplyMarkup(result.miniAppInvite, {
        appBaseUrl: config.appBaseUrl,
        telegramUser: {
          ...payload.userMeta,
          id: payload.userMeta?.telegramUserId || payload.userMeta?.id || payload.chatId
        },
        webSessionSecret: config.webSessionSecret,
        webLoginTtlSeconds: config.webLoginTtlSeconds
      })
    });
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
