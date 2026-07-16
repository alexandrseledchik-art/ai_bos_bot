import { loadConfig } from "../config.js";
import { TelegramApiClient } from "../infrastructure/telegram/telegram-api.js";

async function main() {
  const config = loadConfig();

  if (!config.telegramToken) {
    throw new Error("TELEGRAM_BOT_TOKEN is missing.");
  }

  const menuButton = { type: "default" };

  const telegramApi = new TelegramApiClient({
    token: config.telegramToken,
    apiBaseUrl: config.telegramApiBaseUrl
  });

  await telegramApi.setChatMenuButton({ menuButton });

  console.log(JSON.stringify({
    ok: true,
    action: "setChatMenuButton",
    type: menuButton.type,
    note: "Telegram Web App menu button removed; cabinet opens from signed message links."
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
