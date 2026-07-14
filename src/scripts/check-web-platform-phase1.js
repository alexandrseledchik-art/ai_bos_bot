import assert from "node:assert/strict";
import fs from "node:fs";
import platformRoute from "../../api/platform/[...path].js";
import {
  buildWebCabinetLoginUrl,
  clearWebSessionCookie,
  createWebLoginToken,
  createWebSessionToken,
  readCookie,
  serializeWebSessionCookie,
  verifyWebLoginToken,
  verifyWebSessionToken
} from "../infrastructure/auth/web-session.js";
import { buildMiniAppReplyMarkup } from "../infrastructure/telegram/mini-app-webapp.js";

const secret = "phase-one-web-session-secret-123456";
const telegramUser = {
  id: 424242,
  username: "owner",
  firstName: "Александр",
  lastName: "Селедчик",
  languageCode: "ru"
};
const now = Date.UTC(2026, 6, 13, 10, 0, 0);

const loginToken = createWebLoginToken({ telegramUser, secret, ttlSeconds: 600, now });
const login = verifyWebLoginToken(loginToken, { secret, now: now + 1000 });
assert.equal(login.user.id, telegramUser.id);
assert.equal(login.type, "login");
assert.throws(
  () => verifyWebLoginToken(`${loginToken}broken`, { secret, now }),
  /invalid/
);
assert.throws(
  () => verifyWebLoginToken(loginToken, { secret, now: now + 601000 }),
  /expired/
);

const sessionToken = createWebSessionToken({ telegramUser, secret, ttlSeconds: 3600, now });
const session = verifyWebSessionToken(sessionToken, { secret, now: now + 1000 });
assert.equal(session.user.username, "owner");
assert.throws(() => verifyWebLoginToken(sessionToken, { secret, now }), /invalid/);

const cookie = serializeWebSessionCookie(sessionToken, { maxAgeSeconds: 3600 });
assert.match(cookie, /HttpOnly/);
assert.match(cookie, /Secure/);
assert.match(cookie, /SameSite=Lax/);
assert.equal(
  readCookie(new Request("https://aibosbot.test/app", { headers: { cookie } })),
  sessionToken
);
assert.match(clearWebSessionCookie(), /Max-Age=0/);

const loginUrl = buildWebCabinetLoginUrl({
  appBaseUrl: "https://aibosbot.test",
  telegramUser,
  secret
});
assert.match(loginUrl, /^https:\/\/aibosbot\.test\/api\/platform\/auth\/exchange\?token=/);

const replyMarkup = buildMiniAppReplyMarkup(
  { route: "/mini-app", label: "Открыть кабинет" },
  {
    appBaseUrl: "https://aibosbot.test",
    telegramUser,
    webSessionSecret: secret
  }
);
assert.equal(replyMarkup.inline_keyboard[0][0].web_app.url, "https://aibosbot.test/mini-app");
assert.equal(replyMarkup.inline_keyboard[1][0].text, "Открыть в браузере");
assert.match(replyMarkup.inline_keyboard[1][0].url, /\/api\/platform\/auth\/exchange/);

const onboardingMarkup = buildMiniAppReplyMarkup(
  { route: "/mini-app", label: "Открыть кабинет", preferWebCabinet: true, miniAppLabel: "Открыть внутри Telegram" },
  {
    appBaseUrl: "https://aibosbot.test",
    telegramUser,
    webSessionSecret: secret
  }
);
assert.equal(onboardingMarkup.inline_keyboard[0][0].text, "Открыть кабинет");
assert.match(onboardingMarkup.inline_keyboard[0][0].url, /\/api\/platform\/auth\/exchange/);
assert.equal(onboardingMarkup.inline_keyboard[1][0].text, "Открыть внутри Telegram");
assert.equal(onboardingMarkup.inline_keyboard[1][0].web_app.url, "https://aibosbot.test/mini-app");

process.env.WEB_SESSION_SECRET = secret;
process.env.TELEGRAM_WEBHOOK_SECRET = secret;
process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";

const unauthorized = await platformRoute.fetch(
  new Request("https://aibosbot.test/api/platform/bootstrap")
);
assert.equal(unauthorized.status, 401);

const invalidExchange = await platformRoute.fetch(
  new Request("https://aibosbot.test/api/platform/auth/exchange?token=invalid")
);
assert.equal(invalidExchange.status, 302);
assert.equal(invalidExchange.headers.get("location"), "/app?auth=invalid");

for (const file of [
  "app/index.html",
  "app-assets/styles.css",
  "app-assets/src/main.js",
  "app-assets/src/api-client.js",
  "api/platform/[...path].js",
  "src/application/platform-api-context.js"
]) {
  assert.equal(fs.existsSync(file), true, `${file} must exist`);
}

const vercel = JSON.parse(fs.readFileSync("vercel.json", "utf8"));
assert.equal(vercel.rewrites.some((item) => item.source === "/api/platform/:first/:rest*"), true);
assert.equal(vercel.rewrites.some((item) => item.source === "/app/:path*"), true);

const mainJs = fs.readFileSync("app-assets/src/main.js", "utf8");
const apiClientJs = fs.readFileSync("app-assets/src/api-client.js", "utf8");
assert.match(apiClientJs, /\/api\/platform\/bootstrap/);
assert.match(mainJs, /Архитектура бизнеса/);
assert.match(mainJs, /Спросить AI-BOSS/);

console.log("Web Platform Phase 1 checks passed.");
