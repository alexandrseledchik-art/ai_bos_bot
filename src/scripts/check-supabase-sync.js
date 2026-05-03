import assert from "node:assert/strict";

import { SupabaseSyncClient } from "../infrastructure/storage/supabase-sync.js";

function parseTable(pathname) {
  return String(pathname || "").match(/^\/rest\/v1\/([^/?]+)/)?.[1] || "";
}

function normalize(value) {
  return String(value ?? "");
}

function matches(row, query = {}) {
  return Object.entries(query).every(([key, rawValue]) => {
    if (["select", "limit", "order", "on_conflict"].includes(key)) {
      return true;
    }
    const value = String(rawValue || "");
    if (value.startsWith("eq.")) {
      return normalize(row[key]) === value.slice(3);
    }
    return normalize(row[key]) === value;
  });
}

class FakeSupabaseSyncClient extends SupabaseSyncClient {
  constructor() {
    super({ url: "https://example.supabase.co", serviceRoleKey: "service-role" });
    this.tables = {
      companies: [
        {
          id: "company-existing",
          external_id: "company-old",
          workspace_id: "workspace-1",
          telegram_chat_id: "123",
          name: "Old Company"
        }
      ],
      threads: [
        {
          id: "thread-existing",
          external_id: "thread-old",
          telegram_chat_id: "123",
          company_id: "company-existing"
        }
      ]
    };
  }

  async request(pathname, { method = "GET", query = {}, body } = {}) {
    const table = parseTable(pathname);
    const rows = this.tables[table] || [];

    if (method === "GET") {
      return rows.filter((row) => matches(row, query)).slice(0, Number(query.limit || rows.length));
    }

    if (method === "PATCH") {
      const updated = [];
      this.tables[table] = rows.map((row) => {
        if (!matches(row, query)) {
          return row;
        }
        const next = { ...row, ...(body || {}) };
        updated.push(next);
        return next;
      });
      return updated;
    }

    if (method === "POST") {
      const incomingRows = Array.isArray(body) ? body : [body];
      const result = [];

      for (const incoming of incomingRows) {
        const externalMatch = rows.find((row) => normalize(row.external_id) === normalize(incoming.external_id));
        if (externalMatch) {
          Object.assign(externalMatch, incoming);
          result.push(externalMatch);
          continue;
        }

        const telegramMatch = rows.find((row) => normalize(row.telegram_chat_id) === normalize(incoming.telegram_chat_id));
        if (telegramMatch) {
          throw new Error(`${table}_telegram_chat_id_key duplicate telegram_chat_id`);
        }

        const created = {
          id: `${table}-${rows.length + 1}`,
          ...incoming
        };
        rows.push(created);
        result.push(created);
      }

      this.tables[table] = rows;
      return result;
    }

    throw new Error(`Unsupported fake request ${method} ${pathname}`);
  }
}

async function main() {
  const syncClient = new FakeSupabaseSyncClient();

  const [company] = await syncClient.upsertCompanyRows([
    {
      external_id: "company-new",
      telegram_chat_id: "123",
      name: "New Company",
      updated_at: "2026-05-03T10:00:00.000Z"
    }
  ]);

  assert.equal(company.id, "company-existing");
  assert.equal(company.external_id, "company-new");
  assert.equal(syncClient.tables.companies[0].name, "New Company");

  const [thread] = await syncClient.upsertThreadRows([
    {
      external_id: "thread-new",
      telegram_chat_id: "123",
      company_id: "company-existing",
      active_case_id: null,
      entry_state: { ok: true },
      updated_at: "2026-05-03T10:01:00.000Z"
    }
  ]);

  assert.equal(thread.id, "thread-existing");
  assert.equal(thread.external_id, "thread-new");
  assert.deepEqual(syncClient.tables.threads[0].entry_state, { ok: true });

  console.log("Supabase sync checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
