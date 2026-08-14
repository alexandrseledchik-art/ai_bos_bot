const ALLOWED_ORIGINS = new Set([
  "https://seledchik.ru",
  "https://www.seledchik.ru",
]);

const MATURITY_TITLES = [
  "Роль собственника",
  "Внешняя среда",
  "Стратегия",
  "Продукт",
  "Коммерция",
  "Операции",
  "Финансы",
  "Команда — зрелость",
  "Управление и риски",
  "Технологии и данные",
];

const COMPANY_TITLES = [
  "Роль и мандат",
  "Экономика",
  "Продукт и спрос",
  "Динамика бизнеса",
  "Команда",
  "Потенциал роста",
  "Готовность к изменениям",
];

const CSV_HEADERS = [
  "Дата и время", "Статус", "Имя", "Компания", "Контакт",
  "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "Реферер",
  "Оценка зрелости", "Этап зрелости", "Рекомендация",
  "Зона внимания 1", "Зона внимания 2", "Зона внимания 3",
  ...COMPANY_TITLES,
  ...MATURITY_TITLES,
  "Согласие", "Страница", "User-Agent",
];

const clean = (value: unknown, limit = 500) => String(value ?? "")
  .trim()
  .replace(/\s+/g, " ")
  .slice(0, limit);

const corsHeaders = (origin: string) => ({
  "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : "https://seledchik.ru",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Max-Age": "86400",
  "Vary": "Origin",
});

const json = (body: Record<string, unknown>, status: number, origin: string) => new Response(
  JSON.stringify(body),
  {
    status,
    headers: {
      ...corsHeaders(origin),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  },
);

const escapeHtml = (value: unknown) => clean(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;");

const sha256 = async (value: string) => {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((item) => item.toString(16).padStart(2, "0")).join("");
};

const csvCell = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;

async function rest(path: string, init: RequestInit = {}) {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  return fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      "apikey": key,
      "Authorization": `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

async function notifyTelegram(payload: Record<string, unknown>) {
  let token = Deno.env.get("DIAGNOSTIKA_BOT_TOKEN") ?? "";
  let chatId = Deno.env.get("DIAGNOSTIKA_MANAGER_CHAT_ID") ?? "";
  if (!token || !chatId) {
    try {
      const settingsResponse = await rest(
        "website_integration_settings?select=key,value&key=in.(diagnostika_bot_token,diagnostika_manager_chat_id)",
        { headers: { "Accept": "application/json" } },
      );
      if (settingsResponse.ok) {
        const settings = await settingsResponse.json() as Array<{ key: string; value: string }>;
        const values = Object.fromEntries(settings.map((item) => [item.key, item.value]));
        token ||= values.diagnostika_bot_token ?? "";
        chatId ||= values.diagnostika_manager_chat_id ?? "";
      }
    } catch {
      // A stored lead is still useful even if the optional notification is unavailable.
    }
  }
  if (!token || !chatId) return false;
  const weak = Array.isArray(payload.weak_areas) ? payload.weak_areas.map((item) => clean(item, 120)) : [];
  const attribution = typeof payload.attribution === "object" && payload.attribution !== null
    ? payload.attribution as Record<string, unknown>
    : {};
  const source = clean(attribution.source, 80) || "прямой переход";
  const text = [
    "<b>Новая диагностика бизнеса</b>",
    "",
    `<b>Имя:</b> ${escapeHtml(payload.name)}`,
    `<b>Компания:</b> ${escapeHtml(payload.company)}`,
    `<b>Контакт:</b> ${escapeHtml(payload.contact)}`,
    `<b>Источник:</b> ${escapeHtml(source)}`,
    "",
    `<b>Зрелость:</b> ${escapeHtml(payload.average)} из 5`,
    `<b>Этап:</b> ${escapeHtml(payload.maturity_stage)}`,
    `<b>Зоны внимания:</b> ${escapeHtml(weak.join(", "))}`,
    `<b>Рекомендация:</b> ${escapeHtml(payload.recommendation)}`,
  ].join("\n");
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function exportCsv(requestUrl: URL, serviceKey: string) {
  const token = requestUrl.searchParams.get("token") ?? "";
  const expected = await sha256(`diagnostika-export:${serviceKey}`);
  if (!token || token !== expected) return new Response("Not found", { status: 404 });
  const response = await rest(
    "website_diagnostic_leads?select=*&order=created_at.desc&limit=10000",
    { headers: { "Accept": "application/json" } },
  );
  if (!response.ok) return new Response("Export unavailable", { status: 502 });
  const rows = await response.json() as Array<Record<string, unknown>>;
  const lines = [CSV_HEADERS.map(csvCell).join(",")];
  for (const row of rows) {
    const attribution = typeof row.attribution === "object" && row.attribution !== null
      ? row.attribution as Record<string, unknown>
      : {};
    const weak = Array.isArray(row.weak_areas) ? row.weak_areas : [];
    const company = Array.isArray(row.company_answers) ? row.company_answers : [];
    const scores = Array.isArray(row.maturity_scores) ? row.maturity_scores : [];
    const values = [
      row.created_at, row.status, row.name, row.company, row.contact,
      attribution.source, attribution.medium, attribution.campaign, attribution.content, attribution.term, row.referrer,
      row.average, row.maturity_stage, row.recommendation,
      weak[0], weak[1], weak[2],
      ...Array.from({ length: 7 }, (_, index) => company[index] ?? ""),
      ...Array.from({ length: 10 }, (_, index) => scores[index] ?? ""),
      row.consent ? "Да" : "Нет", row.page, row.user_agent,
    ];
    lines.push(values.map(csvCell).join(","));
  }
  return new Response(`\uFEFF${lines.join("\r\n")}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("Origin") ?? "";
  if (request.method === "OPTIONS") {
    if (!ALLOWED_ORIGINS.has(origin)) return new Response(null, { status: 403 });
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  const url = new URL(request.url);
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (request.method === "GET") return exportCsv(url, serviceKey);
  if (request.method !== "POST") return json({ ok: false }, 405, origin);
  if (!ALLOWED_ORIGINS.has(origin)) return json({ ok: false, error: "origin" }, 403, origin);

  const length = Number(request.headers.get("Content-Length") ?? 0);
  if (length > 65_536) return json({ ok: false, error: "body" }, 413, origin);
  let source: Record<string, unknown>;
  try {
    source = await request.json();
  } catch {
    return json({ ok: false, error: "json" }, 400, origin);
  }
  if (clean(source.website, 40)) return json({ ok: false, error: "payload" }, 400, origin);
  if (source.consent !== true) return json({ ok: false, error: "consent" }, 400, origin);

  const id = clean(source.submissionId, 80);
  const name = clean(source.name, 120);
  const company = clean(source.company, 160);
  const contact = clean(source.contact, 180);
  const maturityScores = Array.isArray(source.maturityScores)
    ? source.maturityScores.map((value) => Number(value))
    : [];
  const companyAnswers = Array.isArray(source.companyAnswers)
    ? source.companyAnswers.slice(0, 7).map((value) => clean(value))
    : [];
  const weakAreas = Array.isArray(source.weakAreas)
    ? source.weakAreas.slice(0, 3).map((value) => clean(value, 120))
    : [];
  const average = Number(source.average);
  if (!/^[0-9a-f-]{32,36}$/i.test(id) || !name || !company || !contact) {
    return json({ ok: false, error: "required" }, 400, origin);
  }
  if (maturityScores.length !== 10 || maturityScores.some((value) => !Number.isInteger(value) || value < 1 || value > 5)) {
    return json({ ok: false, error: "scores" }, 400, origin);
  }
  if (![0, 7].includes(companyAnswers.length) || !Number.isFinite(average) || average < 1 || average > 5) {
    return json({ ok: false, error: "result" }, 400, origin);
  }
  const attributionSource = typeof source.attribution === "object" && source.attribution !== null
    ? source.attribution as Record<string, unknown>
    : {};
  const attribution = Object.fromEntries(
    ["source", "medium", "campaign", "content", "term"].map((key) => [key, clean(attributionSource[key], 160)]),
  );
  const payload = {
    id,
    status: "Новая",
    name,
    company,
    contact,
    attribution,
    average: Number(average.toFixed(1)),
    maturity_stage: clean(source.maturityStage, 220),
    recommendation: clean(source.recommendation, 220),
    weak_areas: weakAreas,
    maturity_scores: maturityScores,
    company_answers: companyAnswers,
    referrer: clean(source.referrer, 500),
    page: clean(source.page, 500),
    user_agent: clean(source.userAgent, 500),
    consent: true,
  };

  const insert = await rest("website_diagnostic_leads?on_conflict=id", {
    method: "POST",
    headers: { "Prefer": "resolution=ignore-duplicates,return=representation" },
    body: JSON.stringify(payload),
  });
  if (!insert.ok) return json({ ok: false, error: "storage" }, 502, origin);
  const inserted = await insert.json() as Array<Record<string, unknown>>;
  if (inserted.length === 0) return json({ ok: true, duplicate: true }, 200, origin);

  const telegram = await notifyTelegram(payload);
  if (telegram) {
    await rest(`website_diagnostic_leads?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Prefer": "return=minimal" },
      body: JSON.stringify({ telegram_sent: true }),
    });
  }
  return json({ ok: true, telegram }, 201, origin);
});
