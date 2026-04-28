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

export function buildMiniAppReplyMarkup(invite, { appBaseUrl } = {}) {
  if (!invite?.route) {
    return null;
  }

  const url = buildMiniAppUrl(appBaseUrl, invite.route);
  if (!url) {
    return null;
  }

  return {
    inline_keyboard: [
      [
        {
          text: invite.label || "Открыть Кабинет AI-BOSS",
          web_app: {
            url
          }
        }
      ]
    ]
  };
}
