import { AdminAnalyticsService } from "./admin-analytics-service.js";
import { loadConfig } from "../config.js";
import { MiniAppCompatSyncClient } from "../infrastructure/storage/mini-app-compat-sync.js";

export function adminJsonResponse(payload, init = {}) {
  return new Response(JSON.stringify(payload), {
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store"
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

function readAdminToken(request) {
  const auth = request.headers.get("authorization") || "";
  if (/^bearer\s+/i.test(auth)) {
    return auth.replace(/^bearer\s+/i, "").trim();
  }

  const headerToken = request.headers.get("x-admin-token");
  if (headerToken) {
    return headerToken.trim();
  }

  const url = new URL(request.url);
  return (url.searchParams.get("token") || "").trim();
}

export async function readAdminJsonBody(request) {
  const raw = await request.text();
  if (!raw.trim()) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch {
    const error = new Error("Invalid JSON body.");
    error.status = 400;
    throw error;
  }
}

export function assertAdminRequest(request, config) {
  if (!config.adminDashboardToken) {
    const error = new Error("ADMIN_DASHBOARD_TOKEN is not configured.");
    error.status = 503;
    throw error;
  }

  const token = readAdminToken(request);
  if (token !== config.adminDashboardToken) {
    const error = new Error("Admin token is invalid or missing.");
    error.status = 401;
    throw error;
  }
}

export async function createAdminContext(request) {
  const config = loadConfig();
  assertAdminRequest(request, config);

  const syncClient = new MiniAppCompatSyncClient({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey
  });

  if (!syncClient.enabled) {
    const error = new Error("Supabase is required for admin analytics.");
    error.status = 503;
    throw error;
  }

  return {
    config,
    syncClient,
    adminAnalytics: new AdminAnalyticsService({ syncClient })
  };
}

export async function handleAdminRoute(request, allowedMethods, handler) {
  if (!allowedMethods.includes(request.method)) {
    return adminJsonResponse({ ok: false, error: "Method not allowed" }, { status: 405 });
  }

  try {
    const context = await createAdminContext(request);
    return await handler(context);
  } catch (error) {
    const status = error.status || 500;
    return adminJsonResponse(
      {
        ok: false,
        error: normalizeErrorMessage(error, "Admin request failed.")
      },
      { status }
    );
  }
}
