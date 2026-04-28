import assert from "node:assert/strict";
import miniAppRoute from "../../api/mini-app/[...path].js";
import { MiniAppBootstrapService } from "../application/mini-app-bootstrap-service.js";
import {
  createSignedTelegramWebAppInitDataForTest,
  verifyTelegramWebAppInitData
} from "../infrastructure/telegram/verify-webapp-init-data.js";

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

  filterRows(rows, query = {}) {
    let filtered = [...rows];

    for (const [key, value] of Object.entries(query || {})) {
      if (["select", "limit", "order", "on_conflict"].includes(key)) {
        continue;
      }

      const match = String(value).match(/^eq\.(.*)$/);
      if (match) {
        filtered = filtered.filter((row) => String(row[key]) === match[1]);
      }
    }

    if (query.order) {
      const [field, direction] = String(query.order).split(".");
      filtered.sort((left, right) => {
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

  async request(pathname, { method = "GET", query = {}, body } = {}) {
    const table = this.parseTable(pathname);
    const rows = this.getTable(table);

    if (method === "GET") {
      return this.projectRows(this.filterRows(rows, query), query.select);
    }

    if (method !== "POST") {
      throw new Error(`Unsupported fake method ${method}`);
    }

    const conflictKeys = String(query.on_conflict || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    const incomingRows = Array.isArray(body) ? body : [body];
    const result = [];

    for (const incoming of incomingRows) {
      let existing = null;
      if (conflictKeys.length > 0) {
        existing = rows.find((row) => conflictKeys.every((key) => row[key] === incoming[key]));
      }

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
  const botToken = "123456:test-token";
  const user = {
    id: 424242,
    username: "phase_one_user",
    first_name: "Phase",
    last_name: "One",
    language_code: "ru"
  };
  const initData = createSignedTelegramWebAppInitDataForTest({ botToken, user });

  const verification = verifyTelegramWebAppInitData(initData, botToken);
  assert.equal(verification.user.id, user.id);
  assert.equal(verification.user.firstName, "Phase");

  assert.throws(
    () => verifyTelegramWebAppInitData(initData.replace("phase_one_user", "tampered"), botToken),
    /hash is invalid/
  );

  const syncClient = new FakeSupabaseClient();
  const service = new MiniAppBootstrapService({ syncClient });
  const firstBootstrap = await service.bootstrap({ telegramUser: verification.user });
  Object.assign(firstBootstrap.companyProfile, {
    user_role: "Собственник",
    current_request: "Хочу вывести консалтинг на 2M выручки в месяц",
    onboarding_status: "draft"
  });
  const secondBootstrap = await service.bootstrap({ telegramUser: verification.user });

  assert.equal(firstBootstrap.appUser.id, secondBootstrap.appUser.id);
  assert.equal(firstBootstrap.workspace.id, secondBootstrap.workspace.id);
  assert.equal(firstBootstrap.company.id, secondBootstrap.company.id);
  assert.equal(firstBootstrap.activeCase.id, secondBootstrap.activeCase.id);
  assert.equal(firstBootstrap.activeCase.kind, "diagnostic_case");
  assert.equal(firstBootstrap.activeCase.status, "active");
  assert.equal(secondBootstrap.onboardingStatus, "completed");
  assert.equal(secondBootstrap.companyProfile.onboarding_status, "completed");

  process.env.TELEGRAM_BOT_TOKEN = botToken;
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";

  const invalidResponse = await miniAppRoute.fetch(
    new Request("https://aibosbot.test/api/mini-app/bootstrap?initData=invalid")
  );
  assert.equal(invalidResponse.status, 401);

  console.log("Mini App Phase 1 checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
