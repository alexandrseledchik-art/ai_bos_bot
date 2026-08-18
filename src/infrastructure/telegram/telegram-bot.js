import {
  buildAccessDeniedReply,
  buildAccessRequestAdminMessage
} from "../../application/access-control-service.js";
import {
  buildAccessApprovedUserMessage,
  handleAccessAdminCommand,
  looksLikeAdminCommand
} from "../../application/access-admin-commands.js";
import { extractTelegramMessagePayload, TelegramApiClient } from "./telegram-api.js";
import {
  buildPersistentPlatformReplyMarkup,
  buildPlatformCommandMessage,
  looksLikePlatformCommand
} from "./mini-app-webapp.js";
import {
  describeTelegramPayloadForLog
} from "./telegram-meta.js";
import { resolveTelegramPayloadToText } from "./resolve-telegram-input.js";
import { DEFAULT_WEB_ACCESS_TTL_SECONDS } from "../auth/web-session.js";

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
    webSessionSecret = "",
    webLoginTtlSeconds = DEFAULT_WEB_ACCESS_TTL_SECONDS,
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
    this.webSessionSecret = webSessionSecret;
    this.webLoginTtlSeconds = webLoginTtlSeconds;
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

  async resetPlatformMenuButton(chatId) {
    try {
      await this.api.setChatMenuButton({ chatId, menuButton: { type: "default" } });
    } catch (error) {
      console.warn("Telegram platform menu button reset skipped:", error.message);
    }
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
              accessControl: this.accessControl,
              onUserApproved: async (user) => {
                await this.resetPlatformMenuButton(user.telegram_user_id);
                await this.sendMessage(user.telegram_user_id, buildAccessApprovedUserMessage(user), {
                  replyMarkup: buildPersistentPlatformReplyMarkup({
                    appBaseUrl: this.appBaseUrl,
                    telegramUser: user,
                    webSessionSecret: this.webSessionSecret,
                    webLoginTtlSeconds: this.webLoginTtlSeconds
                  })
                });
              }
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

          await this.resetPlatformMenuButton(payload.chatId);

          if (payload.kind === "text" && looksLikePlatformCommand(payload.text)) {
            await this.sendMessage(payload.chatId, buildPlatformCommandMessage(), {
              replyMarkup: buildPersistentPlatformReplyMarkup({
                appBaseUrl: this.appBaseUrl,
                telegramUser: {
                  ...payload.userMeta,
                  id: payload.userMeta?.telegramUserId || payload.userMeta?.id || payload.chatId
                },
                webSessionSecret: this.webSessionSecret,
                webLoginTtlSeconds: this.webLoginTtlSeconds
              })
            });
            continue;
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

            result = await onMessage({
              telegramChatId: String(payload.chatId),
              text: resolved.text,
              userMeta: {
                ...(resolved.userMeta || {}),
                capabilities: {
                  voiceMessages: Boolean(this.audioTranscriber?.isEnabled),
                  files: true,
                  links: true
                }
              }
            });
          } finally {
            stopTyping();
          }

          if (result?.reply) {
            const isStart = payload.kind === "text" && /^\/start(?:@\w+)?(?:\s|$)/i.test(payload.text || "");
            await this.sendMessage(payload.chatId, result.reply, {
              replyMarkup: isStart
                ? buildPersistentPlatformReplyMarkup({
                    appBaseUrl: this.appBaseUrl,
                    telegramUser: {
                      ...payload.userMeta,
                      id: payload.userMeta?.telegramUserId || payload.userMeta?.id || payload.chatId
                    },
                    webSessionSecret: this.webSessionSecret,
                    webLoginTtlSeconds: this.webLoginTtlSeconds
                  })
                : null
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
