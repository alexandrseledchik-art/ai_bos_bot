export function getTelegramWebApp() {
  return window.Telegram?.WebApp || null;
}

export function getTelegramInitData() {
  const webApp = getTelegramWebApp();
  if (webApp?.initData) {
    return webApp.initData;
  }

  const url = new URL(window.location.href);
  return url.searchParams.get("initData") || "";
}

export function initializeTelegramShell() {
  const webApp = getTelegramWebApp();
  if (!webApp) {
    return {
      available: false,
      initData: getTelegramInitData()
    };
  }

  webApp.ready();
  webApp.expand();

  return {
    available: true,
    initData: getTelegramInitData(),
    colorScheme: webApp.colorScheme || "light"
  };
}
