import { getServices } from "../create-services.js";

function buildWebhookUrl(baseUrl) {
  const normalized = String(baseUrl || "").replace(/\/+$/g, "");
  return `${normalized}/api/telegram`;
}

async function main() {
  const { config, telegramApi } = getServices();

  if (!config.telegramToken) {
    throw new Error("TELEGRAM_BOT_TOKEN is missing.");
  }

  if (!config.appBaseUrl) {
    throw new Error("APP_BASE_URL is missing.");
  }

  const webhookUrl = buildWebhookUrl(config.appBaseUrl);
  const result = await telegramApi.setWebhook({
    url: webhookUrl,
    secretToken: config.telegramWebhookSecret
  });
  const info = await telegramApi.getWebhookInfo();

  console.log("Telegram webhook configured.");
  console.log(JSON.stringify({ result, info, webhookUrl }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
