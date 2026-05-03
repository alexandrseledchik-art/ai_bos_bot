function normalizeId(value) {
  return String(value || "").trim();
}

function parseAdminCommand(text = "") {
  const trimmed = String(text || "").trim();
  const match = trimmed.match(/^\/(admin|pending|approve|block|unblock|access)(?:@[\w_]+)?(?:(\d+)|\s+(.+))?$/i);

  if (!match) {
    return null;
  }

  const command = `/${match[1].toLowerCase()}`;
  const compactNumericArg = match[2] || "";
  const spacedRest = match[3] || "";
  const [argRaw, statusRaw] = spacedRest.trim().split(/\s+/);

  return {
    command,
    arg: normalizeId(compactNumericArg || argRaw),
    status: normalizeId(statusRaw).toLowerCase()
  };
}

function isAdminCommand(text = "") {
  return /^\/(admin|pending|approve|block|unblock|access)(?:@[\w_]+)?(?:$|\s|\d)/i.test(String(text).trim());
}

function formatUserLine(user) {
  const name = [user.first_name, user.last_name].filter(Boolean).join(" ").trim() || "Без имени";
  const username = user.username ? `@${user.username}` : "без username";
  return `${user.telegram_user_id} | ${user.access_status || "pending"} | ${name} | ${username}`;
}

function helpText() {
  return [
    "Админка AI-BOSS",
    "",
    "/admin users - список пользователей",
    "/pending - заявки на доступ",
    "/approve<telegram_id> - одобрить доступ",
    "/block<telegram_id> - заблокировать пользователя",
    "/unblock<telegram_id> - разблокировать и одобрить",
    "",
    "Можно и с пробелом: /approve 123456789.",
    "",
    "Кик из бота = перевести пользователя в blocked. После этого бот и Mini App его не пустят."
  ].join("\n");
}

export function looksLikeAdminCommand(text) {
  return isAdminCommand(text);
}

export async function handleAccessAdminCommand({ text, fromTelegramUserId, accessControl }) {
  const adminId = normalizeId(fromTelegramUserId);

  if (!accessControl?.isAdmin(adminId)) {
    return "Эта команда доступна только администратору AI-BOSS.";
  }

  if (!accessControl.enabled) {
    return "Админка доступа требует Supabase. Сейчас access-control хранилище не подключено.";
  }

  const parsed = parseAdminCommand(text);
  if (!parsed) {
    return helpText();
  }

  const { command, arg, status } = parsed;

  if (command === "/admin" || command === "/access") {
    if (arg === "users") {
      const normalizedStatus = ["pending", "approved", "blocked"].includes(status) ? status : "";
      const users = await accessControl.listUsers({ status: normalizedStatus, limit: 30 });
      if (!users.length) {
        return normalizedStatus ? `Пользователей со статусом ${normalizedStatus} пока нет.` : "Пользователей пока нет.";
      }

      return ["Пользователи AI-BOSS:", "", ...users.map(formatUserLine)].join("\n");
    }

    return helpText();
  }

  if (command === "/pending") {
    const users = await accessControl.listUsers({ status: "pending", limit: 30 });
    if (!users.length) {
      return "Заявок на доступ пока нет.";
    }

    return ["Заявки на доступ:", "", ...users.map(formatUserLine)].join("\n");
  }

  if (!arg) {
    return "Нужен Telegram ID пользователя. Например: /approve123456789 или /approve 123456789";
  }

  if (command === "/approve" || command === "/unblock") {
    const user = await accessControl.setUserStatus({
      telegramUserId: arg,
      status: "approved",
      decidedBy: adminId,
      note: command === "/unblock" ? "unblocked by admin" : "approved by admin"
    });

    return `Доступ одобрен: ${formatUserLine(user)}`;
  }

  if (command === "/block") {
    const user = await accessControl.setUserStatus({
      telegramUserId: arg,
      status: "blocked",
      decidedBy: adminId,
      note: "blocked by admin"
    });

    return `Пользователь заблокирован: ${formatUserLine(user)}`;
  }

  return helpText();
}
