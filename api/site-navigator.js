import { SiteNavigatorService } from "../src/application/site-navigator-service.js";
import { loadConfig } from "../src/config.js";

const ALLOWED_ORIGINS = new Set([
  "https://seledchik.ru",
  "https://www.seledchik.ru",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:8000",
  "http://127.0.0.1:8000"
]);
const RATE_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT = 12;
const rateBuckets = new Map();

function corsHeaders(origin) {
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
    vary: "Origin"
  };
}

function json(payload, status, origin) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...corsHeaders(origin)
    }
  });
}

function clientKey(request) {
  return String(request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown")
    .split(",")[0]
    .trim();
}

function isRateLimited(request) {
  const now = Date.now();
  const key = clientKey(request);
  const bucket = rateBuckets.get(key);
  if (!bucket || now - bucket.startedAt >= RATE_WINDOW_MS) {
    rateBuckets.set(key, { startedAt: now, count: 1 });
    return false;
  }
  bucket.count += 1;
  return bucket.count > RATE_LIMIT;
}

export async function handleSiteNavigatorRequest(request) {
  const origin = request.headers.get("origin") || "";
  if (!ALLOWED_ORIGINS.has(origin)) {
    return new Response(null, { status: 403 });
  }

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (request.method !== "POST") return json({ ok: false, error: "method" }, 405, origin);
  if (isRateLimited(request)) return json({ ok: false, error: "rate_limit" }, 429, origin);

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ ok: false, error: "json" }, 400, origin);
  }

  const question = String(payload?.question || "").trim();
  if (!question || question.length > 1600) {
    return json({ ok: false, error: "question" }, 400, origin);
  }

  try {
    const config = loadConfig();
    const service = new SiteNavigatorService({
      apiKey: config.openaiApiKey,
      baseUrl: config.openaiBaseUrl,
      model: config.reasoningModel,
      reasoningEffort: "low",
      appBaseUrl: config.appBaseUrl
    });
    const result = await service.answer({
      question,
      history: payload?.history,
      page: payload?.page
    });
    return json({ ok: true, ...result }, 200, origin);
  } catch (error) {
    console.error("Site navigator request failed:", error?.message || error);
    return json({ ok: false, error: "temporarily_unavailable" }, 503, origin);
  }
}

export default {
  fetch: handleSiteNavigatorRequest
};
