import { AdminAnalyticsService } from "../application/admin-analytics-service.js";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
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

  if (raw.startsWith("in.(") && raw.endsWith(")")) {
    const allowed = raw.slice(4, -1).split(",").map((item) => item.trim());
    return allowed.includes(normalizeComparable(row[key]));
  }

  return normalizeComparable(row[key]) === raw;
}

function filterRows(rows, query = {}) {
  let filtered = [...rows];
  for (const [key, value] of Object.entries(query)) {
    if (["select", "limit", "order"].includes(key) || value === undefined || value === null || value === "") {
      continue;
    }
    filtered = filtered.filter((row) => matchesFilter(row, key, value));
  }

  if (query.order) {
    const [field, direction = "asc"] = String(query.order).split(".");
    filtered.sort((left, right) => {
      const result = normalizeComparable(left[field]).localeCompare(normalizeComparable(right[field]));
      return direction === "desc" ? -result : result;
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

  const fields = String(select).split(",").map((field) => field.trim()).filter(Boolean);
  return rows.map((row) => Object.fromEntries(fields.map((field) => [field, row[field]])));
}

function parseTable(pathname) {
  const match = String(pathname || "").match(/^\/rest\/v1\/([^/?]+)/);
  return match?.[1] || "";
}

class FakeSyncClient {
  constructor(seed) {
    this.enabled = true;
    this.tables = clone(seed);
  }

  async request(pathname, { method = "GET", query = {}, body } = {}) {
    const table = parseTable(pathname);
    const rows = this.tables[table] || [];

    if (method === "GET") {
      return projectRows(filterRows(rows, query), query.select);
    }

    if (method === "POST") {
      const now = new Date().toISOString();
      const row = {
        id: `${table}_${rows.length + 1}`,
        ...(body || {}),
        created_at: body?.created_at || now,
        updated_at: body?.updated_at || now
      };
      rows.push(row);
      this.tables[table] = rows;
      return projectRows([row], query.select);
    }

    if (method === "PATCH") {
      const updated = [];
      const now = new Date().toISOString();
      this.tables[table] = rows.map((row) => {
        if (!filterRows([row], query).length) {
          return row;
        }
        const next = {
          ...row,
          ...(body || {}),
          updated_at: now
        };
        updated.push(next);
        return next;
      });
      return projectRows(updated, query.select);
    }

    throw new Error(`Unsupported fake request: ${method} ${pathname}`);
  }
}

function createSeed() {
  return {
    workspaces: [
      { id: "workspace-1", name: "AI-BOSS", slug: "aiboss", created_at: "2026-05-01T10:00:00.000Z" }
    ],
    companies: [
      {
        id: "company-1",
        workspace_id: "workspace-1",
        name: "Александр Селедчик",
        telegram_chat_id: "miniapp:1",
        created_at: "2026-05-01T10:00:00.000Z",
        updated_at: "2026-05-01T10:00:00.000Z"
      }
    ],
    cases: [
      {
        id: "case-1",
        workspace_id: "workspace-1",
        company_id: "company-1",
        summary: "Рост консалтинга до 2M в месяц",
        kind: "diagnostic_case",
        mode: "diagnostic_mode",
        status: "active",
        created_at: "2026-05-01T10:00:00.000Z",
        updated_at: "2026-05-01T10:00:00.000Z"
      }
    ],
    threads: [
      {
        id: "thread-1",
        external_id: "thread_external_1",
        workspace_id: "workspace-1",
        company_id: "company-1",
        active_case_id: "case-1",
        telegram_chat_id: "123",
        entry_state: {},
        created_at: "2026-05-01T10:00:00.000Z",
        updated_at: "2026-05-01T10:03:00.000Z"
      }
    ],
    messages: [
      {
        id: "message-1",
        thread_id: "thread-1",
        role: "user",
        text: "Хочу вывести свой консалтинг на 2M выручки в месяц.",
        created_at: "2026-05-01T10:00:00.000Z"
      },
      {
        id: "message-2",
        thread_id: "thread-1",
        role: "assistant",
        text: "Похоже, главное ограничение в финансах.",
        created_at: "2026-05-01T10:01:00.000Z"
      },
      {
        id: "message-3",
        thread_id: "thread-1",
        role: "user",
        text: "Почему именно финансы?",
        created_at: "2026-05-01T10:02:00.000Z"
      }
    ],
    observations: [],
    goals: [],
    symptoms: [],
    hypotheses: [],
    constraints: [],
    situations: [],
    action_waves: [],
    snapshots: [],
    mini_app_eval_logs: [],
    admin_conversation_evaluations: [],
    admin_improvements: []
  };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function run() {
  const syncClient = new FakeSyncClient(createSeed());
  const service = new AdminAnalyticsService({ syncClient });

  const conversations = await service.listConversations({ limit: 10 });
  assert(conversations.count === 1, "expected one conversation");
  assert(conversations.conversations[0].counters.messages === 3, "expected message counters");

  const detail = await service.getConversation({ threadId: "thread-1" });
  assert(detail.messages.length === 3, "expected conversation messages");

  const result = await service.evaluateConversation({ threadId: "thread-1", persist: true });
  assert(result.evaluation.score < 100, "expected evaluator to find issues");
  assert(result.savedEvaluation?.id, "expected persisted evaluation");
  assert(syncClient.tables.admin_conversation_evaluations.length === 1, "expected evaluation row");
  assert(syncClient.tables.admin_improvements.length > 0, "expected collected improvements");

  const improvements = await service.listImprovements();
  assert(improvements.count > 0, "expected improvements list");

  console.log("Admin analytics checks passed.");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
