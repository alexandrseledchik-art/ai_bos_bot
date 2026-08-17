import assert from "node:assert/strict";

import {
  buildAccessApprovedMiniAppInvite,
  buildAccessApprovedUserMessage,
  handleAccessAdminCommand,
  looksLikeAdminCommand
} from "../application/access-admin-commands.js";
import { AccessControlService } from "../application/access-control-service.js";
import { MiniAppBootstrapService } from "../application/mini-app-bootstrap-service.js";

class FakeSupabaseClient {
  constructor() {
    this.enabled = true;
    this.tables = new Map();
    this.counter = 0;
  }

  getTable(name) {
    if (!this.tables.has(name)) {
      this.tables.set(name, []);
    }

    return this.tables.get(name);
  }

  nextId(table) {
    this.counter += 1;
    return `${table}_${this.counter}`;
  }

  parseTable(pathname) {
    const match = String(pathname || "").match(/^\/rest\/v1\/([^/?]+)/);
    if (!match) {
      throw new Error(`Unexpected path ${pathname}`);
    }

    return match[1];
  }

  matches(row, query = {}) {
    for (const [key, value] of Object.entries(query)) {
      if (["select", "limit", "order", "on_conflict"].includes(key)) {
        continue;
      }

      const filter = String(value || "");
      if (filter.startsWith("eq.") && String(row[key]) !== filter.slice(3)) {
        return false;
      }
    }

    return true;
  }

  filterRows(rows, query = {}) {
    let filtered = rows.filter((row) => this.matches(row, query));

    if (query.order) {
      const [field, direction = "asc"] = String(query.order).split(".");
      filtered = [...filtered].sort((left, right) => {
        const leftValue = String(left[field] || "");
        const rightValue = String(right[field] || "");
        return direction === "desc"
          ? rightValue.localeCompare(leftValue)
          : leftValue.localeCompare(rightValue);
      });
    }

    if (query.limit) {
      filtered = filtered.slice(0, Number(query.limit));
    }

    return filtered;
  }

  projectRows(rows, select) {
    if (!select || select === "*") {
      return rows;
    }

    const fields = String(select)
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    return rows.map((row) => Object.fromEntries(fields.map((field) => [field, row[field]])));
  }

  conflictKeys(query = {}) {
    return String(query.on_conflict || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  async request(pathname, { method = "GET", query = {}, body } = {}) {
    const table = this.parseTable(pathname);
    const rows = this.getTable(table);

    if (method === "GET") {
      return this.projectRows(this.filterRows(rows, query), query.select);
    }

    if (method === "PATCH") {
      const now = new Date().toISOString();
      const result = [];
      for (const row of rows) {
        if (!this.matches(row, query)) {
          continue;
        }

        Object.assign(row, body || {}, { updated_at: now });
        result.push(row);
      }

      return this.projectRows(result, query.select);
    }

    if (method !== "POST") {
      throw new Error(`Unsupported fake method ${method}`);
    }

    const incomingRows = Array.isArray(body) ? body : [body];
    const keys = this.conflictKeys(query);
    const result = [];

    for (const incoming of incomingRows) {
      const existing = keys.length
        ? rows.find((row) => keys.every((key) => String(row[key]) === String(incoming[key])))
        : null;

      if (existing) {
        Object.assign(existing, incoming, { updated_at: new Date().toISOString() });
        result.push(existing);
        continue;
      }

      const created = {
        id: incoming.id || this.nextId(table),
        ...incoming,
        created_at: incoming.created_at || new Date().toISOString(),
        updated_at: incoming.updated_at || new Date().toISOString()
      };
      rows.push(created);
      result.push(created);
    }

    return this.projectRows(result, query.select);
  }
}

async function main() {
  const syncClient = new FakeSupabaseClient();
  const accessControl = new AccessControlService({
    syncClient,
    mode: "approval",
    adminTelegramUserIds: ["111"]
  });

  assert.equal(looksLikeAdminCommand("/approve222"), true);
  assert.equal(looksLikeAdminCommand("/block222"), true);
  assert.equal(looksLikeAdminCommand("/unblock222"), true);
  assert.equal(looksLikeAdminCommand("/approve 222"), true);
  assert.equal(looksLikeAdminCommand("/approval 222"), false);
  assert.equal(looksLikeAdminCommand("/approveabc"), false);

  const firstDecision = await accessControl.checkTelegramAccess({
    telegramUser: {
      id: 222,
      username: "pending_user",
      firstName: "Pending",
      lastName: "User",
      languageCode: "ru"
    }
  });
  assert.equal(firstDecision.allowed, false);
  assert.equal(firstDecision.status, "pending");
  assert.equal(firstDecision.reason, "new_pending_request");
  assert.equal(firstDecision.shouldNotifyAdmin, true);

  const secondDecision = await accessControl.checkTelegramAccess({
    telegramUser: { id: 222, username: "pending_user" }
  });
  assert.equal(secondDecision.allowed, false);
  assert.equal(secondDecision.shouldNotifyAdmin, false);

  const nonAdminReply = await handleAccessAdminCommand({
    text: "/approve222",
    fromTelegramUserId: 222,
    accessControl
  });
  assert.match(nonAdminReply, /только администратору/i);

  const pendingReply = await handleAccessAdminCommand({
    text: "/pending",
    fromTelegramUserId: 111,
    accessControl
  });
  assert.match(pendingReply, /222/);
  assert.match(pendingReply, /pending/);

  const approvalNotifications = [];
  const approvedReply = await handleAccessAdminCommand({
    text: "/approve222",
    fromTelegramUserId: 111,
    accessControl,
    onUserApproved: async (user, context) => {
      approvalNotifications.push({ user, context });
    }
  });
  assert.match(approvedReply, /Доступ одобрен/);
  assert.equal(approvalNotifications.length, 1);
  assert.equal(approvalNotifications[0].user.telegram_user_id, 222);
  assert.equal(approvalNotifications[0].context.command, "/approve");
  assert.match(buildAccessApprovedUserMessage({ first_name: "Сергей" }), /Сергей, добро пожаловать в AI-BOSS/);
  assert.match(buildAccessApprovedUserMessage(), /«Платформа AI-BOSS» в меню бота/i);
  assert.match(buildAccessApprovedUserMessage(), /AI-BOSS — ваш цифровой управленческий партнёр/i);
  assert.deepEqual(buildAccessApprovedMiniAppInvite(), {
    route: "/app",
    label: "Создать кабинет компании",
    preferWebCabinet: true,
    webOnly: true
  });

  const approvedDecision = await accessControl.checkTelegramAccess({
    telegramUser: { id: 222, username: "pending_user" }
  });
  assert.equal(approvedDecision.allowed, true);
  assert.equal(approvedDecision.status, "approved");

  const blockedReply = await handleAccessAdminCommand({
    text: "/block222",
    fromTelegramUserId: 111,
    accessControl
  });
  assert.match(blockedReply, /заблокирован/i);

  const blockedDecision = await accessControl.checkTelegramAccess({
    telegramUser: { id: 222, username: "pending_user" }
  });
  assert.equal(blockedDecision.allowed, false);
  assert.equal(blockedDecision.status, "blocked");

  await handleAccessAdminCommand({
    text: "/unblock222",
    fromTelegramUserId: 111,
    accessControl
  });
  assert.equal((await accessControl.checkTelegramAccess({ telegramUser: { id: 222 } })).allowed, true);

  await handleAccessAdminCommand({
    text: "/block333",
    fromTelegramUserId: 111,
    accessControl
  });
  assert.equal((await accessControl.checkTelegramAccess({ telegramUser: { id: 333 } })).status, "blocked");

  const adminDecision = await accessControl.checkTelegramAccess({
    telegramUser: {
      id: 111,
      username: "admin"
    }
  });
  assert.equal(adminDecision.allowed, true);
  assert.equal(adminDecision.isAdmin, true);

  const bootstrapService = new MiniAppBootstrapService({ syncClient });
  const bootstrap = await bootstrapService.bootstrap({
    telegramUser: {
      id: 222,
      username: "pending_user",
      firstName: "Pending",
      lastName: "User"
    }
  });
  assert.equal(bootstrap.appUser.telegram_user_id, 222);
  assert.equal(syncClient.getTable("app_users").some((user) => user.telegram_user_id === 222), true);
  assert.equal(syncClient.getTable("workspace_app_members").length, 1);

  console.log("Access control checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
