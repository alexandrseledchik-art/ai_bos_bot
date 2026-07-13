import crypto from "node:crypto";

export const WEB_SESSION_COOKIE = "aiboss_web_session";

function requireSecret(secret) {
  const normalized = String(secret || "").trim();
  if (normalized.length < 24) {
    throw new Error("WEB_SESSION_SECRET must contain at least 24 characters.");
  }
  return normalized;
}

function encode(value) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function decode(value) {
  try {
    return JSON.parse(Buffer.from(String(value || ""), "base64url").toString("utf8"));
  } catch {
    throw new Error("Web access token is invalid.");
  }
}

function sign(encodedPayload, secret) {
  return crypto.createHmac("sha256", requireSecret(secret)).update(encodedPayload).digest("base64url");
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ""));
  const rightBuffer = Buffer.from(String(right || ""));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function normalizeTelegramUser(user = {}) {
  const id = String(user.id || user.telegramUserId || user.telegram_user_id || "").trim();
  if (!/^\d+$/.test(id)) {
    throw new Error("Telegram user id is required for web access.");
  }

  return {
    id: Number(id),
    username: String(user.username || "").trim(),
    firstName: String(user.firstName || user.first_name || "").trim(),
    lastName: String(user.lastName || user.last_name || "").trim(),
    languageCode: String(user.languageCode || user.language_code || "").trim()
  };
}

function createToken({ type, telegramUser, secret, ttlSeconds, now = Date.now() }) {
  const user = normalizeTelegramUser(telegramUser);
  const issuedAt = Math.floor(now / 1000);
  const payload = {
    v: 1,
    type,
    sub: String(user.id),
    user,
    iat: issuedAt,
    exp: issuedAt + Math.max(60, Number(ttlSeconds) || 60)
  };
  const encodedPayload = encode(payload);
  return `${encodedPayload}.${sign(encodedPayload, secret)}`;
}

function verifyToken(token, { type, secret, now = Date.now() }) {
  const [encodedPayload, signature, ...rest] = String(token || "").split(".");
  if (!encodedPayload || !signature || rest.length > 0 || !safeEqual(signature, sign(encodedPayload, secret))) {
    throw new Error("Web access token is invalid.");
  }

  const payload = decode(encodedPayload);
  const nowSeconds = Math.floor(now / 1000);
  if (payload.v !== 1 || payload.type !== type || !payload.sub || payload.exp <= nowSeconds) {
    throw new Error(payload.exp <= nowSeconds ? "Web access token has expired." : "Web access token is invalid.");
  }

  return {
    ...payload,
    user: normalizeTelegramUser(payload.user)
  };
}

export function createWebLoginToken({ telegramUser, secret, ttlSeconds = 600, now } = {}) {
  return createToken({ type: "login", telegramUser, secret, ttlSeconds, now });
}

export function verifyWebLoginToken(token, { secret, now } = {}) {
  return verifyToken(token, { type: "login", secret, now });
}

export function createWebSessionToken({ telegramUser, secret, ttlSeconds = 2592000, now } = {}) {
  return createToken({ type: "session", telegramUser, secret, ttlSeconds, now });
}

export function verifyWebSessionToken(token, { secret, now } = {}) {
  return verifyToken(token, { type: "session", secret, now });
}

export function readCookie(request, name = WEB_SESSION_COOKIE) {
  const cookieHeader = request.headers.get("cookie") || "";
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) {
      continue;
    }
    const key = part.slice(0, separator).trim();
    if (key === name) {
      return decodeURIComponent(part.slice(separator + 1).trim());
    }
  }
  return "";
}

export function serializeWebSessionCookie(token, { maxAgeSeconds = 2592000 } = {}) {
  return [
    `${WEB_SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    `Max-Age=${Math.max(0, Number(maxAgeSeconds) || 0)}`
  ].join("; ");
}

export function clearWebSessionCookie() {
  return serializeWebSessionCookie("", { maxAgeSeconds: 0 });
}

export function buildWebCabinetLoginUrl({ appBaseUrl, telegramUser, secret, ttlSeconds = 600 } = {}) {
  const base = String(appBaseUrl || "").trim().replace(/\/+$/, "");
  if (!/^https:\/\//i.test(base) || !String(secret || "").trim()) {
    return "";
  }

  try {
    const token = createWebLoginToken({ telegramUser, secret, ttlSeconds });
    return `${base}/api/platform/auth/exchange?token=${encodeURIComponent(token)}`;
  } catch {
    return "";
  }
}
