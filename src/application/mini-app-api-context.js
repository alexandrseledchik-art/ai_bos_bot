import { AccessControlService, buildAccessDeniedReply } from "./access-control-service.js";
import { MiniAppBootstrapService } from "./mini-app-bootstrap-service.js";
import { loadConfig } from "../config.js";
import { MiniAppCompatSyncClient } from "../infrastructure/storage/mini-app-compat-sync.js";
import { verifyTelegramWebAppInitData } from "../infrastructure/telegram/verify-webapp-init-data.js";

export function jsonResponse(payload, init = {}) {
  return new Response(JSON.stringify(payload), {
    headers: {
      "content-type": "application/json"
    },
    ...init
  });
}

function normalizeErrorMessage(error, fallback) {
  if (!error) {
    return fallback;
  }

  if (typeof error === "string") {
    return error;
  }

  if (typeof error.message === "string" && error.message.trim()) {
    return error.message;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export function readMiniAppInitData(request) {
  const headerValue = request.headers.get("x-telegram-init-data");
  if (headerValue) {
    return headerValue;
  }

  const url = new URL(request.url);
  return url.searchParams.get("initData") || "";
}

export async function readJsonBody(request) {
  const text = await request.text();
  if (!text.trim()) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Invalid JSON body.");
  }
}

export async function createMiniAppContext(request) {
  const config = loadConfig();
  const verification = verifyTelegramWebAppInitData(readMiniAppInitData(request), config.telegramToken, {
    maxAgeSeconds: config.telegramWebAppAuthMaxAgeSeconds
  });

  const syncClient = new MiniAppCompatSyncClient({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey
  });

  const accessControl = new AccessControlService({
    syncClient: config.accessControlEnabled ? syncClient : null,
    mode: config.accessControlMode,
    adminTelegramUserIds: config.adminTelegramUserIds
  });
  const accessDecision = await accessControl.checkTelegramAccess({ telegramUser: verification.user });

  if (!accessDecision.allowed) {
    const error = new Error(buildAccessDeniedReply(accessDecision));
    error.status = 403;
    error.accessStatus = accessDecision.status;
    throw error;
  }

  const bootstrapService = new MiniAppBootstrapService({ syncClient });
  const bootstrap = await bootstrapService.bootstrap({ telegramUser: verification.user });

  return {
    config,
    syncClient,
    telegramUser: verification.user,
    bootstrap,
    accessDecision
  };
}

export async function handleMiniAppRoute(request, allowedMethods, handler) {
  if (!allowedMethods.includes(request.method)) {
    return jsonResponse({ ok: false, error: "Method not allowed" }, { status: 405 });
  }

  try {
    const context = await createMiniAppContext(request);
    return await handler(context);
  } catch (error) {
    const message = normalizeErrorMessage(error, "Mini App request failed.");
    const status = error.status || (/initData|Telegram WebApp|hash|auth_date/i.test(message) ? 401 : 500);

    return jsonResponse(
      {
        ok: false,
        error: message,
        ...(error.accessStatus ? { accessStatus: error.accessStatus } : {})
      },
      { status }
    );
  }
}
