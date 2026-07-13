import { AccessControlService, buildAccessDeniedReply } from "./access-control-service.js";
import { MiniAppBootstrapService } from "./mini-app-bootstrap-service.js";
import { loadConfig } from "../config.js";
import { verifyWebSessionToken, readCookie } from "../infrastructure/auth/web-session.js";
import { MiniAppCompatSyncClient } from "../infrastructure/storage/mini-app-compat-sync.js";

export function platformJson(payload, init = {}) {
  return new Response(JSON.stringify(payload), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(init.headers || {})
    }
  });
}

export async function createPlatformContext(request) {
  const config = loadConfig();
  if (!config.webSessionSecret) {
    const error = new Error("Web cabinet authentication is not configured.");
    error.status = 503;
    throw error;
  }

  const session = verifyWebSessionToken(readCookie(request), {
    secret: config.webSessionSecret
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
  const accessDecision = await accessControl.checkTelegramAccess({ telegramUser: session.user });

  if (!accessDecision.allowed) {
    const error = new Error(buildAccessDeniedReply(accessDecision));
    error.status = 403;
    error.accessStatus = accessDecision.status;
    throw error;
  }

  const bootstrap = await new MiniAppBootstrapService({ syncClient }).bootstrap({
    telegramUser: session.user
  });

  return {
    config,
    syncClient,
    session,
    telegramUser: session.user,
    accessDecision,
    bootstrap
  };
}

export async function handlePlatformRoute(request, allowedMethods, handler) {
  if (!allowedMethods.includes(request.method)) {
    return platformJson({ ok: false, error: "Method not allowed" }, { status: 405 });
  }

  try {
    return await handler(await createPlatformContext(request));
  } catch (error) {
    const status = error.status || (/token|session|authentication/i.test(error.message) ? 401 : 500);
    return platformJson({
      ok: false,
      error: error.message || "Web cabinet request failed.",
      ...(error.accessStatus ? { accessStatus: error.accessStatus } : {})
    }, { status });
  }
}
