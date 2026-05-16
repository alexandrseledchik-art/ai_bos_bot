import { loadConfig } from "../config.js";
import { buildMiniAppMenuButton } from "../infrastructure/telegram/mini-app-webapp.js";
import { TelegramApiClient } from "../infrastructure/telegram/telegram-api.js";

async function main() {
  const config = loadConfig();

  if (!config.telegramToken) {
    throw new Error("TELEGRAM_BOT_TOKEN is missing.");
  }

  if (!config.appBaseUrl) {
    throw new Error("APP_BASE_URL is missing.");
  }

  const menuButton = buildMiniAppMenuButton(config.appBaseUrl, {
    route: "/mini-app",
    text: "Кабинет"
  });

  if (!menuButton) {
    throw new Error("Mini App menu button URL is invalid. APP_BASE_URL must be HTTPS.");
  }

  const telegramApi = new TelegramApiClient({
    token: config.telegramToken,
    apiBaseUrl: config.telegramApiBaseUrl
  });

  await telegramApi.setChatMenuButton({ menuButton });

  console.log(JSON.stringify({
    ok: true,
    action: "setChatMenuButton",
    text: menuButton.text,
    url: menuButton.web_app.url
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
