import { getServices } from "../create-services.js";

async function main() {
  const { config, telegramApi, accessControl } = getServices();

  if (!config.telegramToken) {
    throw new Error("TELEGRAM_BOT_TOKEN is missing.");
  }

  const menuButton = { type: "default" };
  await telegramApi.setChatMenuButton({ menuButton });

  const users = accessControl?.enabled
    ? await accessControl.listUsers({ limit: 1000 })
    : [];
  let resetUserCount = 0;

  for (const user of users) {
    if (!user?.telegram_user_id) continue;
    await telegramApi.setChatMenuButton({
      chatId: user.telegram_user_id,
      menuButton
    });
    resetUserCount += 1;
  }

  console.log(JSON.stringify({
    ok: true,
    action: "setChatMenuButton",
    type: menuButton.type,
    resetUserCount,
    note: "Telegram Web App menu buttons removed; the platform opens from /platform as a normal signed URL."
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
