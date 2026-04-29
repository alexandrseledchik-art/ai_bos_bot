function normalizeId(value) {
  return String(value || "").trim();
}

function isAdminCommand(text = "") {
  return /^\/(admin|pending|approve|block|unblock|access)\b/i.test(String(text).trim());
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
    "/approve <telegram_id> - одобрить доступ",
    "/block <telegram_id> - заблокировать пользователя",
    "/unblock <telegram_id> - разблокировать и одобрить",
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

  const [commandRaw, argRaw, statusRaw] = String(text || "").trim().split(/\s+/);
  const command = commandRaw.toLowerCase();
  const arg = normalizeId(argRaw);

  if (command === "/admin" || command === "/access") {
    if (argRaw === "users") {
      const status = ["pending", "approved", "blocked"].includes(statusRaw) ? statusRaw : "";
      const users = await accessControl.listUsers({ status, limit: 30 });
      if (!users.length) {
        return status ? `Пользователей со статусом ${status} пока нет.` : "Пользователей пока нет.";
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
    return "Нужен Telegram ID пользователя. Например: /approve 123456789";
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
