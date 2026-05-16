import {
  adminJsonResponse,
  handleAdminRoute,
  readAdminJsonBody
} from "../../src/application/admin-api-context.js";
import {
  buildAccessApprovedMiniAppInvite,
  buildAccessApprovedUserMessage
} from "../../src/application/access-admin-commands.js";
import { answerWorkspaceQuestion } from "../../src/application/workspace-chat-service.js";
import { getServices } from "../../src/create-services.js";
import {
  buildMiniAppMenuButton,
  buildMiniAppReplyMarkup
} from "../../src/infrastructure/telegram/mini-app-webapp.js";
import { TelegramApiClient } from "../../src/infrastructure/telegram/telegram-api.js";

function adminPath(request) {
  const url = new URL(request.url);
  const directPath = url.pathname
    .replace(/^\/api\/admin\/?/, "")
    .replace(/\/$/, "");

  if (directPath === "rpc") {
    return (url.searchParams.get("path") || "").replace(/^\/+/, "").replace(/\/+$/, "");
  }

  return directPath;
}

function readPathParam(value) {
  try {
    return decodeURIComponent(value || "");
  } catch {
    return value || "";
  }
}

function routeNotFound(path) {
  return adminJsonResponse(
    {
      ok: false,
      error: `Admin API route not found: ${path || "/"}`
    },
    { status: 404 }
  );
}

async function dispatchAdminRoute(request) {
  const path = adminPath(request);
  const url = new URL(request.url);

  if (path === "health") {
    return handleAdminRoute(request, ["GET"], async () => adminJsonResponse({ ok: true }));
  }

  if (path === "chat") {
    return handleAdminRoute(request, ["POST"], async ({ config }) => {
      const payload = await readAdminJsonBody(request);
      const { conversationService } = getServices();
      const reply = await answerWorkspaceQuestion({
        config,
        conversationService,
        text: payload.text,
        context: payload.context || {},
        history: payload.history || [],
        systemHint: "Контекст: админка качества, диалоги, оценки, улучшения и управление доступами."
      });

      return adminJsonResponse({ ok: true, reply });
    });
  }

  if (path === "telegram/miniapp-menu") {
    return handleAdminRoute(request, ["POST"], async ({ config }) => {
      if (!config.telegramToken) {
        return adminJsonResponse(
          {
            ok: false,
            error: "TELEGRAM_BOT_TOKEN is not configured."
          },
          { status: 503 }
        );
      }

      const payload = await readAdminJsonBody(request);
      const menuButton = buildMiniAppMenuButton(config.appBaseUrl, {
        route: payload.route || "/mini-app",
        text: payload.text || "Кабинет"
      });

      if (!menuButton) {
        return adminJsonResponse(
          {
            ok: false,
            error: "APP_BASE_URL must be configured as HTTPS."
          },
          { status: 503 }
        );
      }

      const telegramApi = new TelegramApiClient({
        token: config.telegramToken,
        apiBaseUrl: config.telegramApiBaseUrl
      });

      await telegramApi.setChatMenuButton({ menuButton });

      return adminJsonResponse({
        ok: true,
        menuButton: {
          text: menuButton.text,
          url: menuButton.web_app.url
        }
      });
    });
  }

  if (path === "users") {
    return handleAdminRoute(request, ["GET"], async ({ accessControl }) => {
      const users = await accessControl.listUsers({
        status: url.searchParams.get("status") || "",
        limit: url.searchParams.get("limit") || 100
      });

      return adminJsonResponse({ ok: true, users });
    });
  }

  const userAccessMatch = path.match(/^users\/([^/]+)\/access$/);
  if (userAccessMatch) {
    return handleAdminRoute(request, ["POST", "PATCH"], async ({ accessControl, config }) => {
      const payload = await readAdminJsonBody(request);
      const user = await accessControl.setUserStatus({
        telegramUserId: readPathParam(userAccessMatch[1]),
        status: payload.status,
        decidedBy: config.adminTelegramUserIds?.[0] || "",
        note: payload.note || ""
      });

      let notification = null;
      if (user.access_status === "approved" && payload.notifyUser !== false) {
        if (!config.telegramToken) {
          notification = {
            ok: false,
            error: "TELEGRAM_BOT_TOKEN is not configured."
          };
        } else {
          try {
            const telegramApi = new TelegramApiClient({
              token: config.telegramToken,
              apiBaseUrl: config.telegramApiBaseUrl
            });
            await telegramApi.sendMessage(user.telegram_user_id, buildAccessApprovedUserMessage(), {
              replyMarkup: buildMiniAppReplyMarkup(buildAccessApprovedMiniAppInvite(), {
                appBaseUrl: config.appBaseUrl
              })
            });
            notification = { ok: true };
          } catch (error) {
            notification = {
              ok: false,
              error: error?.message || "unknown notification error"
            };
          }
        }
      }

      return adminJsonResponse({ ok: true, user, notification });
    });
  }

  if (path === "conversations") {
    return handleAdminRoute(request, ["GET"], async ({ adminAnalytics }) => {
      const result = await adminAnalytics.listConversations({
        limit: url.searchParams.get("limit") || 30,
        search: url.searchParams.get("search") || ""
      });

      return adminJsonResponse({ ok: true, ...result });
    });
  }

  const conversationEvaluateMatch = path.match(/^conversations\/([^/]+)\/evaluate$/);
  if (conversationEvaluateMatch) {
    return handleAdminRoute(request, ["POST"], async ({ adminAnalytics }) => {
      const payload = await readAdminJsonBody(request);
      const result = await adminAnalytics.evaluateConversation({
        threadId: readPathParam(conversationEvaluateMatch[1]),
        persist: payload.persist !== false
      });

      return adminJsonResponse({ ok: true, ...result });
    });
  }

  const conversationMatch = path.match(/^conversations\/([^/]+)$/);
  if (conversationMatch) {
    return handleAdminRoute(request, ["GET"], async ({ adminAnalytics }) => {
      const conversation = await adminAnalytics.getConversation({
        threadId: readPathParam(conversationMatch[1])
      });

      return adminJsonResponse({ ok: true, conversation });
    });
  }

  if (path === "evaluations") {
    return handleAdminRoute(request, ["GET"], async ({ adminAnalytics }) => {
      const result = await adminAnalytics.listEvaluations({
        limit: url.searchParams.get("limit") || 50
      });

      return adminJsonResponse({ ok: true, ...result });
    });
  }

  if (path === "improvements") {
    return handleAdminRoute(request, ["GET"], async ({ adminAnalytics }) => {
      const result = await adminAnalytics.listImprovements({
        limit: url.searchParams.get("limit") || 100,
        status: url.searchParams.get("status") || ""
      });

      return adminJsonResponse({ ok: true, ...result });
    });
  }

  if (path === "improvements/collect") {
    return handleAdminRoute(request, ["POST"], async ({ adminAnalytics }) => {
      const payload = await readAdminJsonBody(request);
      const result = await adminAnalytics.collectImprovements({
        limit: payload.limit || 100
      });

      return adminJsonResponse({ ok: true, ...result });
    });
  }

  return routeNotFound(path);
}

export default {
  async fetch(request) {
    return dispatchAdminRoute(request);
  }
};
