import { getServices } from "./create-services.js";
import { TelegramBotRunner } from "./infrastructure/telegram/telegram-bot.js";

async function main() {
  const { config, conversationService, audioTranscriber, accessControl } = getServices();

  if (!config.telegramToken) {
    console.log("TELEGRAM_BOT_TOKEN is missing. Run `npm run smoke` for a local demo.");
    return;
  }

  const bot = new TelegramBotRunner({
    token: config.telegramToken,
    apiBaseUrl: config.telegramApiBaseUrl,
    pollingTimeoutSeconds: config.pollingTimeoutSeconds,
    audioTranscriber,
    appBaseUrl: config.appBaseUrl,
    accessControl,
    accessRequestNotifyChatId: config.accessRequestNotifyChatId
  });

  console.log("Business diagnostic bot is running.");
  const handleMessage = (payload) => conversationService.handleUserMessage(payload);
  handleMessage.recordTelegramExchange = (payload) => conversationService.recordTelegramExchange(payload);
  await bot.start(handleMessage);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
