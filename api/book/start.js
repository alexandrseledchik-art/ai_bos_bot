import { loadConfig } from "../../src/config.js";

function redirect(location, status = 302) {
  return new Response(null, {
    status,
    headers: {
      location
    }
  });
}

function fallbackUrl(config) {
  const base = String(config.appBaseUrl || "https://aiboss.seledchik.ru").replace(/\/+$/, "");
  return `${base}/book?telegram=not_configured`;
}

async function resolveBotUsername(config) {
  if (!config.telegramToken) {
    return "";
  }

  const response = await fetch(`${config.telegramApiBaseUrl}/bot${config.telegramToken}/getMe`);
  if (!response.ok) {
    return "";
  }

  const payload = await response.json();
  return payload?.ok && payload?.result?.username ? String(payload.result.username) : "";
}

export default {
  async fetch(request) {
    const config = loadConfig();
    const url = new URL(request.url);
    const source = url.searchParams.get("source") || "book";
    const startPayload = encodeURIComponent(source.replace(/[^\w-]/g, "").slice(0, 48) || "book");

    try {
      const username = await resolveBotUsername(config);
      if (!username) {
        return redirect(fallbackUrl(config));
      }

      return redirect(`https://t.me/${username}?start=${startPayload}`);
    } catch {
      return redirect(fallbackUrl(config));
    }
  }
};
