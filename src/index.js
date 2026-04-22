import { getServices } from "./create-services.js";
import { TelegramBotRunner } from "./infrastructure/telegram/telegram-bot.js";

async function main() {
  const { config, conversationService } = getServices();

  if (!config.telegramToken) {
    console.log("TELEGRAM_BOT_TOKEN is missing. Run `npm run smoke` for a local demo.");
    return;
  }

  const bot = new TelegramBotRunner({
    token: config.telegramToken,
    apiBaseUrl: config.telegramApiBaseUrl,
    pollingTimeoutSeconds: config.pollingTimeoutSeconds
  });

  console.log("Business diagnostic bot is running.");
  await bot.start((payload) => conversationService.handleUserMessage(payload));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
