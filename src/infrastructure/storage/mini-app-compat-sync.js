import crypto from "node:crypto";

import { SupabaseSyncClient } from "./supabase-sync.js";

const STORE_KEY = "mini_app_compat_v1";
const STORE_THREAD_EXTERNAL_ID = "miniapp_compat_store_v1";
const STORE_WORKSPACE_SLUG = "mini-app-compat-store";
const STORE_COMPANY_EXTERNAL_ID = "miniapp_compat_store_company";

const COMPAT_TABLES = new Set([
  "company_profiles",
  "problem_contexts",
  "observations",
  "diagnostic_runs",
  "diagnostic_answers",
  "maturity_scores",
  "constraint_hypotheses",
  "next_steps",
  "tools",
  "tool_recommendations",
  "document_sources",
  "document_snapshots",
  "artifacts",
  "consultation_briefs",
  "mini_app_analytics_events",
  "mini_app_eval_logs"
]);

function firstRow(rows) {
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

function parseRestTable(pathname) {
  const match = String(pathname || "").match(/^\/rest\/v1\/([^/?]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

function isMetaQueryKey(key) {
  return ["select", "limit", "order", "on_conflict"].includes(key);
}

function normalizeComparable(value) {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value);
}

function matchesFilter(row, key, filterValue) {
  const raw = String(filterValue || "");

  if (raw.startsWith("eq.")) {
    return normalizeComparable(row[key]) === raw.slice(3);
  }

  if (raw.startsWith("neq.")) {
    return normalizeComparable(row[key]) !== raw.slice(4);
  }

  if (raw.startsWith("in.(") && raw.endsWith(")")) {
    const allowed = raw.slice(4, -1).split(",").map((item) => item.trim());
    return allowed.includes(normalizeComparable(row[key]));
  }

  if (raw === "is.null") {
    return row[key] === null || row[key] === undefined;
  }

  return normalizeComparable(row[key]) === raw;
}

function filterRows(rows, query = {}) {
  let filtered = [...rows];

  for (const [key, value] of Object.entries(query || {})) {
    if (isMetaQueryKey(key) || value === undefined || value === null || value === "") {
      continue;
    }
    filtered = filtered.filter((row) => matchesFilter(row, key, value));
  }

  if (query.order) {
    const [field, direction = "asc"] = String(query.order).split(".");
    filtered.sort((left, right) => {
      const leftValue = normalizeComparable(left[field]);
      const rightValue = normalizeComparable(right[field]);
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

function projectRows(rows, select = "*") {
  if (!select || select === "*") {
    return rows;
  }

  const fields = String(select)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return rows.map((row) => Object.fromEntries(fields.map((field) => [field, row[field]])));
}

function buildRow(body) {
  const now = new Date().toISOString();
  return {
    id: body.id || crypto.randomUUID(),
    ...body,
    created_at: body.created_at || now,
    updated_at: body.updated_at || now
  };
}

function conflictKeys(query = {}) {
  return String(query.on_conflict || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export class MiniAppCompatSyncClient extends SupabaseSyncClient {
  async request(pathname, options = {}) {
    const table = parseRestTable(pathname);
    if (COMPAT_TABLES.has(table)) {
      return this.requestCompatTable(table, options);
    }

    return super.request(pathname, options);
  }

  async findStoreThread() {
    return firstRow(await super.request("/rest/v1/threads", {
      query: {
        external_id: `eq.${STORE_THREAD_EXTERNAL_ID}`,
        select: "*",
        limit: 1
      }
    }));
  }

  async ensureStoreThread() {
    const existing = await this.findStoreThread();
    if (existing) {
      return existing;
    }

    const workspace = firstRow(await super.request("/rest/v1/workspaces", {
      method: "POST",
      query: {
        on_conflict: "slug",
        select: "*"
      },
      prefer: "resolution=merge-duplicates,return=representation",
      body: {
        name: "Mini App compatibility store",
        slug: STORE_WORKSPACE_SLUG
      }
    }));

    const company = firstRow(await super.request("/rest/v1/companies", {
      method: "POST",
      query: {
        on_conflict: "external_id",
        select: "*"
      },
      prefer: "resolution=merge-duplicates,return=representation",
      body: {
        external_id: STORE_COMPANY_EXTERNAL_ID,
        workspace_id: workspace.id,
        name: "Mini App compatibility store",
        telegram_chat_id: "miniapp:compat-store"
      }
    }));

    return firstRow(await super.request("/rest/v1/threads", {
      method: "POST",
      query: {
        on_conflict: "external_id",
        select: "*"
      },
      prefer: "resolution=merge-duplicates,return=representation",
      body: {
        external_id: STORE_THREAD_EXTERNAL_ID,
        workspace_id: workspace.id,
        company_id: company.id,
        telegram_chat_id: "miniapp:compat-store",
        entry_state: {
          [STORE_KEY]: {}
        }
      }
    }));
  }

  async loadStore() {
    await this.ensureStoreThread();
    const thread = await this.findStoreThread();
    const entryState = thread?.entry_state && typeof thread.entry_state === "object"
      ? thread.entry_state
      : {};

    return {
      thread,
      entryState,
      store: entryState[STORE_KEY] && typeof entryState[STORE_KEY] === "object"
        ? entryState[STORE_KEY]
        : {}
    };
  }

  async saveStore(thread, entryState, store) {
    const nextEntryState = {
      ...entryState,
      [STORE_KEY]: store
    };

    const rows = await super.request("/rest/v1/threads", {
      method: "PATCH",
      query: {
        id: `eq.${thread.id}`,
        select: "*"
      },
      prefer: "return=representation",
      body: {
        entry_state: nextEntryState,
        updated_at: new Date().toISOString()
      }
    });

    return firstRow(rows);
  }

  async requestCompatTable(table, { method = "GET", query = {}, body } = {}) {
    const { thread, entryState, store } = await this.loadStore();
    const rows = Array.isArray(store[table]) ? [...store[table]] : [];

    if (method === "GET") {
      return projectRows(filterRows(rows, query), query.select);
    }

    if (method === "POST") {
      const incomingRows = Array.isArray(body) ? body : [body];
      const keys = conflictKeys(query);
      const result = [];

      for (const incoming of incomingRows) {
        const existingIndex = keys.length
          ? rows.findIndex((row) => keys.every((key) => normalizeComparable(row[key]) === normalizeComparable(incoming[key])))
          : -1;

        if (existingIndex >= 0) {
          rows[existingIndex] = {
            ...rows[existingIndex],
            ...incoming,
            updated_at: new Date().toISOString()
          };
          result.push(rows[existingIndex]);
        } else {
          const created = buildRow(incoming || {});
          rows.push(created);
          result.push(created);
        }
      }

      store[table] = rows;
      await this.saveStore(thread, entryState, store);
      return projectRows(result, query.select);
    }

    if (method === "PATCH") {
      const result = [];
      const now = new Date().toISOString();
      const nextRows = rows.map((row) => {
        if (!filterRows([row], query).length) {
          return row;
        }

        const updated = {
          ...row,
          ...(body || {}),
          updated_at: now
        };
        result.push(updated);
        return updated;
      });

      store[table] = nextRows;
      await this.saveStore(thread, entryState, store);
      return projectRows(result, query.select);
    }

    throw new Error(`Mini App compatibility store does not support ${method} /rest/v1/${table}.`);
  }
}
