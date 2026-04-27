import { MiniAppBootstrapService } from "./mini-app-bootstrap-service.js";
import { loadConfig } from "../config.js";
import { SupabaseSyncClient } from "../infrastructure/storage/supabase-sync.js";
import { verifyTelegramWebAppInitData } from "../infrastructure/telegram/verify-webapp-init-data.js";

export function jsonResponse(payload, init = {}) {
  return new Response(JSON.stringify(payload), {
    headers: {
      "content-type": "application/json"
    },
    ...init
  });
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

  const syncClient = new SupabaseSyncClient({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey
  });

  const bootstrapService = new MiniAppBootstrapService({ syncClient });
  const bootstrap = await bootstrapService.bootstrap({ telegramUser: verification.user });

  return {
    config,
    syncClient,
    telegramUser: verification.user,
    bootstrap
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
    const message = error?.message || "Mini App request failed.";
    const status = /initData|Telegram WebApp|hash|auth_date/i.test(message) ? 401 : 500;

    return jsonResponse(
      {
        ok: false,
        error: message
      },
      { status }
    );
  }
}
