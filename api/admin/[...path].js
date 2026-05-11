import {
  adminJsonResponse,
  handleAdminRoute,
  readAdminJsonBody
} from "../../src/application/admin-api-context.js";
import { answerWorkspaceQuestion } from "../../src/application/workspace-chat-service.js";

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
      const reply = await answerWorkspaceQuestion({
        config,
        text: payload.text,
        context: payload.context || {},
        history: payload.history || [],
        systemHint: "Контекст: админка качества, диалоги, оценки, улучшения и управление доступами."
      });

      return adminJsonResponse({ ok: true, reply });
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

      return adminJsonResponse({ ok: true, user });
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
