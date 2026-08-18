import { loadConfig } from "../config.js";
import { TelegramApiClient } from "../infrastructure/telegram/telegram-api.js";

const description = [
  "AI-BOSS — ваш цифровой управленческий партнёр.",
  "Помогает собрать картину бизнеса, отделить симптом от причины, найти главное ограничение и понять, что делать первым."
].join(" ");

const shortDescription = "Цифровой управленческий партнёр: помогает увидеть картину бизнеса и выбрать первый шаг.";

async function main() {
  const config = loadConfig();
  if (!config.telegramToken) throw new Error("TELEGRAM_BOT_TOKEN is missing.");

  const telegramApi = new TelegramApiClient({
    token: config.telegramToken,
    apiBaseUrl: config.telegramApiBaseUrl
  });

  await telegramApi.api("setMyDescription", { description });
  await telegramApi.api("setMyShortDescription", { short_description: shortDescription });
  await telegramApi.api("setMyCommands", {
    commands: [
      { command: "start", description: "Начать работу с AI-BOSS" },
      { command: "platform", description: "Открыть платформу AI-BOSS" }
    ]
  });

  console.log(JSON.stringify({
    ok: true,
    description,
    shortDescription,
    commands: ["/start", "/platform"]
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
