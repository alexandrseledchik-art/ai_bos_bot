import { AccessControlService } from "../../src/application/access-control-service.js";
import { handlePlatformRoute, platformJson } from "../../src/application/platform-api-context.js";
import { MiniAppBootstrapService } from "../../src/application/mini-app-bootstrap-service.js";
import { loadConfig } from "../../src/config.js";
import {
  clearWebSessionCookie,
  createWebSessionToken,
  serializeWebSessionCookie,
  verifyWebLoginToken
} from "../../src/infrastructure/auth/web-session.js";
import { MiniAppCompatSyncClient } from "../../src/infrastructure/storage/mini-app-compat-sync.js";

function platformPath(request) {
  const url = new URL(request.url);
  const directPath = url.pathname.replace(/^\/api\/platform\/?/, "").replace(/\/$/, "");
  return directPath === "rpc"
    ? (url.searchParams.get("path") || "").replace(/^\/+|\/+$/g, "")
    : directPath;
}

function redirect(location, headers = {}) {
  return new Response(null, {
    status: 302,
    headers: { location, ...headers }
  });
}

async function exchangeLoginToken(request) {
  const config = loadConfig();
  if (!config.webSessionSecret) {
    return redirect("/app?auth=unavailable");
  }

  try {
    const token = new URL(request.url).searchParams.get("token") || "";
    const login = verifyWebLoginToken(token, { secret: config.webSessionSecret });
    const syncClient = new MiniAppCompatSyncClient({
      url: config.supabaseUrl,
      serviceRoleKey: config.supabaseServiceRoleKey
    });
    const accessControl = new AccessControlService({
      syncClient: config.accessControlEnabled ? syncClient : null,
      mode: config.accessControlMode,
      adminTelegramUserIds: config.adminTelegramUserIds
    });
    const accessDecision = await accessControl.checkTelegramAccess({ telegramUser: login.user });
    if (!accessDecision.allowed) {
      return redirect(`/app?auth=${accessDecision.status || "denied"}`);
    }

    await new MiniAppBootstrapService({ syncClient }).bootstrap({ telegramUser: login.user });
    const sessionToken = createWebSessionToken({
      telegramUser: login.user,
      secret: config.webSessionSecret,
      ttlSeconds: config.webSessionTtlSeconds
    });

    return redirect("/app", {
      "set-cookie": serializeWebSessionCookie(sessionToken, {
        maxAgeSeconds: config.webSessionTtlSeconds
      }),
      "cache-control": "no-store"
    });
  } catch {
    return redirect("/app?auth=invalid");
  }
}

async function dispatch(request) {
  const path = platformPath(request);

  if (path === "auth/exchange" && request.method === "GET") {
    return exchangeLoginToken(request);
  }

  if (path === "auth/logout" && request.method === "POST") {
    return platformJson({ ok: true }, {
      headers: { "set-cookie": clearWebSessionCookie() }
    });
  }

  if (path === "bootstrap") {
    return handlePlatformRoute(request, ["GET"], async ({ bootstrap, config }) => platformJson({
      ok: true,
      alphaMode: config.miniAppAlphaMode,
      ...bootstrap
    }));
  }

  return platformJson({ ok: false, error: `Platform API route not found: ${path || "/"}` }, { status: 404 });
}

export default {
  fetch(request) {
    return dispatch(request);
  }
};
