import {
  buildAccessDeniedReply,
  buildAccessRequestAdminMessage
} from "../../application/access-control-service.js";
import { handleAccessAdminCommand, looksLikeAdminCommand } from "../../application/access-admin-commands.js";
import { extractTelegramMessagePayload, TelegramApiClient } from "./telegram-api.js";
import { buildMiniAppReplyMarkup } from "./mini-app-webapp.js";
import {
  buildFileCapabilityReply,
  buildVoiceCapabilityReply,
  describeTelegramPayloadForLog,
  isFileCapabilityQuestion,
  isVoiceCapabilityQuestion
} from "./telegram-meta.js";
import { resolveTelegramPayloadToText } from "./resolve-telegram-input.js";

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class TelegramBotRunner {
  constructor({
    token,
    apiBaseUrl,
    pollingTimeoutSeconds = 20,
    audioTranscriber = null,
    appBaseUrl = "",
    accessControl = null,
    accessRequestNotifyChatId = ""
  }) {
    this.api = new TelegramApiClient({
      token,
      apiBaseUrl
    });
    this.pollingTimeoutSeconds = pollingTimeoutSeconds;
    this.offset = 0;
    this.audioTranscriber = audioTranscriber;
    this.appBaseUrl = appBaseUrl;
    this.accessControl = accessControl;
    this.accessRequestNotifyChatId = accessRequestNotifyChatId;
  }

  async getUpdates() {
    const updates = await this.api.getUpdates({
      offset: this.offset,
      timeoutSeconds: this.pollingTimeoutSeconds
    });
    return updates;
  }

  async sendMessage(chatId, text, options = {}) {
    return this.api.sendMessage(chatId, text, options);
  }

  async recordAndSendReply({ payload, reply, userText = "", onMessage, options = {} }) {
    try {
      if (typeof onMessage.recordTelegramExchange === "function") {
        await onMessage.recordTelegramExchange({
          telegramChatId: String(payload.chatId),
          userText: userText || describeTelegramPayloadForLog(payload),
          assistantText: reply,
          userMeta: payload.userMeta || {}
        });
      }
    } catch (error) {
      console.warn("Telegram exchange logging skipped:", error.message);
    }

    await this.sendMessage(payload.chatId, reply, options);
  }

  async start(onMessage) {
    while (true) {
      try {
        const updates = await this.getUpdates();

        for (const update of updates) {
          this.offset = update.update_id + 1;
          const payload = extractTelegramMessagePayload(update);

          if (!payload) {
            continue;
          }

          if (payload.kind === "text" && looksLikeAdminCommand(payload.text)) {
            const reply = await handleAccessAdminCommand({
              text: payload.text,
              fromTelegramUserId: payload.userMeta?.telegramUserId || payload.userMeta?.id || payload.chatId,
              accessControl: this.accessControl
            });
            await this.sendMessage(payload.chatId, reply);
            continue;
          }

          if (this.accessControl) {
            const accessDecision = await this.accessControl.checkTelegramAccess({
              telegramUser: {
                ...payload.userMeta,
                id: payload.userMeta?.telegramUserId || payload.userMeta?.id || payload.chatId
              }
            });

            if (!accessDecision.allowed) {
              await this.recordAndSendReply({
                payload,
                reply: buildAccessDeniedReply(accessDecision),
                onMessage
              });

              if (accessDecision.shouldNotifyAdmin && this.accessRequestNotifyChatId) {
                await this.sendMessage(
                  this.accessRequestNotifyChatId,
                  buildAccessRequestAdminMessage(accessDecision)
                );
              }

              continue;
            }
          }

          const stopTyping = this.api.startTyping(payload.chatId);
          let result;

          try {
            const resolved = await resolveTelegramPayloadToText({
              payload,
              telegramApi: this.api,
              audioTranscriber: this.audioTranscriber
            });

            if (resolved.replyOnly) {
              await this.recordAndSendReply({
                payload,
                reply: resolved.replyOnly,
                onMessage
              });
              continue;
            }

            if (isVoiceCapabilityQuestion(resolved.text)) {
              await this.recordAndSendReply({
                payload,
                userText: resolved.text,
                reply: buildVoiceCapabilityReply({ voiceEnabled: Boolean(this.audioTranscriber?.isEnabled) }),
                onMessage
              });
              continue;
            }

            if (isFileCapabilityQuestion(resolved.text)) {
              await this.recordAndSendReply({
                payload,
                userText: resolved.text,
                reply: buildFileCapabilityReply(),
                onMessage
              });
              continue;
            }

            result = await onMessage({
              telegramChatId: String(payload.chatId),
              text: resolved.text,
              userMeta: resolved.userMeta
            });
          } finally {
            stopTyping();
          }

          if (result?.reply) {
            await this.sendMessage(payload.chatId, result.reply, {
              replyMarkup: buildMiniAppReplyMarkup(result.miniAppInvite, {
                appBaseUrl: this.appBaseUrl
              })
            });
          }
        }
      } catch (error) {
        console.error("Telegram polling loop error:", error.message);
        await delay(3000);
      }
    }
  }
}
