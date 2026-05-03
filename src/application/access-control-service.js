function firstRow(rows) {
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

function normalizeStatus(value) {
  if (["approved", "pending", "blocked"].includes(value)) {
    return value;
  }

  return "pending";
}

function normalizeMode(value) {
  return value === "approval" ? "approval" : "open";
}

function normalizeTelegramId(value) {
  const normalized = String(value || "").trim();
  return normalized || "";
}

export function buildAccessDeniedReply(decision) {
  if (decision.status === "blocked") {
    return "Доступ к AI-BOSS закрыт. Если это ошибка, напиши Александру напрямую.";
  }

  return [
    "Я получил заявку на доступ к AI-BOSS.",
    "Сейчас вход закрыт для незнакомых пользователей, поэтому нужно подтверждение администратора.",
    "Как только доступ подтвердят, можно будет продолжить диагностику."
  ].join("\n\n");
}

export function buildAccessRequestAdminMessage(decision) {
  const user = decision.appUser || {};
  const name = [user.first_name, user.last_name].filter(Boolean).join(" ").trim() || "Без имени";
  const username = user.username ? `@${user.username}` : "username не указан";

  return [
    "Новая заявка на доступ к AI-BOSS",
    "",
    `Имя: ${name}`,
    `Username: ${username}`,
    `Telegram ID: ${user.telegram_user_id}`,
    "",
    `Одобрить: /approve${user.telegram_user_id}`,
    `Заблокировать: /block${user.telegram_user_id}`
  ].join("\n");
}

export class AccessControlService {
  constructor({
    syncClient,
    mode = "open",
    adminTelegramUserIds = []
  } = {}) {
    this.syncClient = syncClient;
    this.mode = normalizeMode(mode);
    this.adminTelegramUserIds = new Set(adminTelegramUserIds.map(normalizeTelegramId).filter(Boolean));
  }

  get enabled() {
    return Boolean(this.syncClient?.enabled);
  }

  isAdmin(telegramUserId) {
    return this.adminTelegramUserIds.has(normalizeTelegramId(telegramUserId));
  }

  normalizeTelegramUser(user = {}) {
    const id = normalizeTelegramId(user.id || user.telegramUserId || user.telegram_user_id);
    if (!id) {
      throw new Error("Telegram user id is required for access control.");
    }

    return {
      id,
      username: user.username || "",
      firstName: user.firstName || user.first_name || "",
      lastName: user.lastName || user.last_name || "",
      languageCode: user.languageCode || user.language_code || ""
    };
  }

  async findUserByTelegramId(telegramUserId) {
    if (!this.enabled) {
      return null;
    }

    return firstRow(await this.syncClient.request("/rest/v1/app_users", {
      query: {
        telegram_user_id: `eq.${normalizeTelegramId(telegramUserId)}`,
        select: "*",
        limit: 1
      }
    }));
  }

  async upsertUserProfile(telegramUser, accessStatus = null) {
    const body = {
      telegram_user_id: Number(telegramUser.id),
      username: telegramUser.username || null,
      first_name: telegramUser.firstName || null,
      last_name: telegramUser.lastName || null,
      language_code: telegramUser.languageCode || null,
      ...(accessStatus ? { access_status: accessStatus } : {})
    };

    return firstRow(await this.syncClient.request("/rest/v1/app_users", {
      method: "POST",
      query: {
        on_conflict: "telegram_user_id",
        select: "*"
      },
      prefer: "resolution=merge-duplicates,return=representation",
      body
    }));
  }

  async setUserStatus({ telegramUserId, status, decidedBy = "", note = "" }) {
    if (!this.enabled) {
      throw new Error("Access control requires Supabase.");
    }

    const normalizedTelegramUserId = normalizeTelegramId(telegramUserId);
    const normalizedStatus = normalizeStatus(status);
    let rows = await this.syncClient.request("/rest/v1/app_users", {
      method: "PATCH",
      query: {
        telegram_user_id: `eq.${normalizedTelegramUserId}`,
        select: "*"
      },
      prefer: "return=representation",
      body: {
        access_status: normalizedStatus,
        access_decided_at: new Date().toISOString(),
        access_decided_by: decidedBy ? Number(decidedBy) : null,
        access_note: note || null
      }
    });

    let user = firstRow(rows);
    if (!user) {
      rows = await this.syncClient.request("/rest/v1/app_users", {
        method: "POST",
        query: {
          on_conflict: "telegram_user_id",
          select: "*"
        },
        prefer: "resolution=merge-duplicates,return=representation",
        body: {
          telegram_user_id: Number(normalizedTelegramUserId),
          access_status: normalizedStatus,
          access_decided_at: new Date().toISOString(),
          access_decided_by: decidedBy ? Number(decidedBy) : null,
          access_note: note || null
        }
      });

      user = firstRow(rows);
    }

    return user;
  }

  async listUsers({ status = "", limit = 20 } = {}) {
    if (!this.enabled) {
      return [];
    }

    return this.syncClient.request("/rest/v1/app_users", {
      query: {
        ...(status ? { access_status: `eq.${normalizeStatus(status)}` } : {}),
        order: "updated_at.desc",
        limit,
        select: "*"
      }
    });
  }

  async checkTelegramAccess({ telegramUser }) {
    if (!this.enabled) {
      return {
        allowed: true,
        status: "approved",
        reason: "access_control_disabled",
        appUser: null,
        isAdmin: false,
        shouldNotifyAdmin: false
      };
    }

    const normalizedUser = this.normalizeTelegramUser(telegramUser);
    const admin = this.isAdmin(normalizedUser.id);
    const existing = await this.findUserByTelegramId(normalizedUser.id);
    const desiredStatus = admin || this.mode === "open" ? "approved" : "pending";
    const appUser = await this.upsertUserProfile(normalizedUser, existing ? null : desiredStatus);
    const status = normalizeStatus(appUser.access_status);

    if (admin && status !== "approved") {
      const approvedAdmin = await this.setUserStatus({
        telegramUserId: normalizedUser.id,
        status: "approved",
        decidedBy: normalizedUser.id,
        note: "auto-approved admin"
      });

      return {
        allowed: true,
        status: "approved",
        reason: "admin",
        appUser: approvedAdmin,
        isAdmin: true,
        shouldNotifyAdmin: false
      };
    }

    if (status === "blocked") {
      return {
        allowed: false,
        status,
        reason: "blocked",
        appUser,
        isAdmin: admin,
        shouldNotifyAdmin: false
      };
    }

    if (this.mode === "open" || status === "approved") {
      if (this.mode === "open" && status !== "approved") {
        const approved = await this.setUserStatus({
          telegramUserId: normalizedUser.id,
          status: "approved",
          decidedBy: "",
          note: "auto-approved in open mode"
        });

        return {
          allowed: true,
          status: "approved",
          reason: "open_mode",
          appUser: approved,
          isAdmin: admin,
          shouldNotifyAdmin: false
        };
      }

      return {
        allowed: true,
        status,
        reason: status === "approved" ? "approved" : "open_mode",
        appUser,
        isAdmin: admin,
        shouldNotifyAdmin: false
      };
    }

    return {
      allowed: false,
      status: "pending",
      reason: existing ? "pending" : "new_pending_request",
      appUser,
      isAdmin: admin,
      shouldNotifyAdmin: !existing
    };
  }
}
