import crypto from "node:crypto";

function parseInitData(initData) {
  const params = new URLSearchParams(String(initData || ""));
  const hash = params.get("hash") || "";

  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  return {
    params,
    hash,
    dataCheckString
  };
}

function timingSafeHexEqual(leftHex, rightHex) {
  const left = Buffer.from(String(leftHex || ""), "hex");
  const right = Buffer.from(String(rightHex || ""), "hex");

  if (left.length !== right.length || left.length === 0) {
    return false;
  }

  return crypto.timingSafeEqual(left, right);
}

function createWebAppSecret(botToken) {
  return crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
}

function calculateWebAppHash(dataCheckString, botToken) {
  return crypto
    .createHmac("sha256", createWebAppSecret(botToken))
    .update(dataCheckString)
    .digest("hex");
}

export function assertFreshAuthDate(authDate, maxAgeSeconds = 86400) {
  const timestampSeconds = Number(authDate || 0);

  if (!Number.isFinite(timestampSeconds) || timestampSeconds <= 0) {
    throw new Error("Telegram WebApp initData is missing auth_date.");
  }

  if (Number(maxAgeSeconds || 0) <= 0) {
    return true;
  }

  const ageSeconds = Math.floor(Date.now() / 1000) - timestampSeconds;

  if (ageSeconds < 0) {
    throw new Error("Telegram WebApp initData auth_date is in the future.");
  }

  if (ageSeconds > maxAgeSeconds) {
    throw new Error("Telegram WebApp initData is expired.");
  }

  return true;
}

export function parseTelegramWebAppUser(initData) {
  const { params } = parseInitData(initData);
  const rawUser = params.get("user");

  if (!rawUser) {
    throw new Error("Telegram WebApp initData is missing user.");
  }

  let user;
  try {
    user = JSON.parse(rawUser);
  } catch {
    throw new Error("Telegram WebApp initData user is invalid JSON.");
  }

  if (!user?.id) {
    throw new Error("Telegram WebApp initData user is missing id.");
  }

  return {
    id: Number(user.id),
    username: user.username || "",
    firstName: user.first_name || "",
    lastName: user.last_name || "",
    languageCode: user.language_code || ""
  };
}

export function verifyTelegramWebAppInitData(initData, botToken, { maxAgeSeconds = 86400 } = {}) {
  if (!botToken) {
    throw new Error("TELEGRAM_BOT_TOKEN is required to verify Telegram WebApp initData.");
  }

  const { params, hash, dataCheckString } = parseInitData(initData);

  if (!hash) {
    throw new Error("Telegram WebApp initData is missing hash.");
  }

  const expectedHash = calculateWebAppHash(dataCheckString, botToken);
  if (!timingSafeHexEqual(hash, expectedHash)) {
    throw new Error("Telegram WebApp initData hash is invalid.");
  }

  assertFreshAuthDate(params.get("auth_date"), maxAgeSeconds);

  return {
    ok: true,
    user: parseTelegramWebAppUser(initData),
    authDate: Number(params.get("auth_date"))
  };
}

export function createSignedTelegramWebAppInitDataForTest({ botToken, user, authDate = Math.floor(Date.now() / 1000) }) {
  const params = new URLSearchParams();
  params.set("auth_date", String(authDate));
  params.set("query_id", "test-query-id");
  params.set("user", JSON.stringify(user));

  const dataCheckString = [...params.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  params.set("hash", calculateWebAppHash(dataCheckString, botToken));
  return params.toString();
}
