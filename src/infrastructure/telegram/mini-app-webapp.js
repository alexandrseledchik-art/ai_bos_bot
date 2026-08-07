import { buildWebCabinetLoginUrl, DEFAULT_WEB_ACCESS_TTL_SECONDS } from "../auth/web-session.js";

function normalizeRoute(route) {
  const value = String(route || "/mini-app").trim();
  return value.startsWith("/") ? value : `/${value}`;
}

export function buildMiniAppUrl(appBaseUrl, route = "/mini-app") {
  const base = String(appBaseUrl || "").trim().replace(/\/+$/, "");
  if (!base || !/^https:\/\//i.test(base)) {
    return "";
  }

  return `${base}${normalizeRoute(route)}`;
}

export function buildMiniAppReplyMarkup(invite, {
  appBaseUrl,
  telegramUser = null,
  webSessionSecret = "",
  webLoginTtlSeconds = DEFAULT_WEB_ACCESS_TTL_SECONDS
} = {}) {
  if (!invite?.route) {
    return null;
  }

  const url = buildMiniAppUrl(appBaseUrl, invite.route);
  if (!url) {
    return null;
  }

  const webCabinetUrl = telegramUser && webSessionSecret
    ? buildWebCabinetLoginUrl({
        appBaseUrl,
        telegramUser,
        secret: webSessionSecret,
        ttlSeconds: webLoginTtlSeconds
      })
    : "";
  const miniAppButton = {
    text: invite.miniAppLabel || invite.label || "Открыть Кабинет AI-BOSS",
    web_app: { url }
  };
  const webCabinetButton = webCabinetUrl
    ? {
        text: invite.label || "Открыть кабинет",
        url: webCabinetUrl
      }
    : null;
  const inlineKeyboard = [];

  if (invite.webOnly) {
    if (!webCabinetButton) return null;
    inlineKeyboard.push([webCabinetButton]);
  } else if (invite.preferWebCabinet && webCabinetButton) {
    inlineKeyboard.push([webCabinetButton], [miniAppButton]);
  } else {
    inlineKeyboard.push([miniAppButton]);
    if (webCabinetButton) inlineKeyboard.push([
      {
        text: "Открыть в браузере",
        url: webCabinetUrl
      }
    ]);
  }

  return {
    inline_keyboard: inlineKeyboard
  };
}

export function buildPersistentPlatformReplyMarkup({
  appBaseUrl,
  telegramUser = null,
  webSessionSecret = "",
  webLoginTtlSeconds = DEFAULT_WEB_ACCESS_TTL_SECONDS,
  label = "Открыть платформу AI-BOSS"
} = {}) {
  if (!telegramUser || !webSessionSecret) {
    return null;
  }

  const url = buildWebCabinetLoginUrl({
    appBaseUrl,
    telegramUser,
    secret: webSessionSecret,
    ttlSeconds: webLoginTtlSeconds
  });
  if (!url) {
    return null;
  }

  return {
    inline_keyboard: [[{
      text: label,
      url
    }]]
  };
}

export function buildPersistentPlatformMenuButton({
  appBaseUrl,
  telegramUser = null,
  webSessionSecret = "",
  webLoginTtlSeconds = DEFAULT_WEB_ACCESS_TTL_SECONDS,
  text = "Платформа AI-BOSS"
} = {}) {
  const markup = buildPersistentPlatformReplyMarkup({
    appBaseUrl,
    telegramUser,
    webSessionSecret,
    webLoginTtlSeconds
  });
  const url = markup?.inline_keyboard?.[0]?.[0]?.url || "";
  if (!url) {
    return null;
  }

  return {
    type: "web_app",
    text,
    web_app: { url }
  };
}

export function buildMiniAppMenuButton(appBaseUrl, { route = "/mini-app", text = "Кабинет" } = {}) {
  const url = buildMiniAppUrl(appBaseUrl, route);
  if (!url) {
    return null;
  }

  return {
    type: "web_app",
    text,
    web_app: {
      url
    }
  };
}
