import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadConfig } from "../config.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultAvatarPath = path.resolve(
  scriptDir,
  "../../app-assets/brand/ai-boss-bot-avatar-v1.jpg"
);

async function main() {
  const config = loadConfig();
  if (!config.telegramToken) throw new Error("TELEGRAM_BOT_TOKEN is missing.");

  const avatarPath = path.resolve(process.argv[2] || defaultAvatarPath);
  const avatar = await fs.readFile(avatarPath);
  const form = new FormData();
  form.set("photo", JSON.stringify({
    type: "static",
    photo: "attach://avatar"
  }));
  form.set("avatar", new Blob([avatar], { type: "image/jpeg" }), "ai-boss-bot-avatar.jpg");

  const response = await fetch(
    `${config.telegramApiBaseUrl}/bot${config.telegramToken}/setMyProfilePhoto`,
    { method: "POST", body: form }
  );
  const result = await response.json();
  if (!response.ok || !result.ok) {
    throw new Error(`Telegram avatar update failed: ${JSON.stringify(result)}`);
  }

  console.log(JSON.stringify({
    ok: true,
    action: "setMyProfilePhoto",
    avatarPath
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
