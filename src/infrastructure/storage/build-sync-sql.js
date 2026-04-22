import { projectStateToRelationalRows } from "./state-projector.js";

function quote(value) {
  if (value === null || value === undefined) {
    return "null";
  }

  return `'${String(value).replace(/'/g, "''")}'`;
}

function quoteJson(value) {
  return `${quote(JSON.stringify(value || []))}::jsonb`;
}

function buildUpsert(table, columns, rows, updateColumns = columns.filter((column) => column !== "external_id")) {
  if (!rows.length) {
    return "";
  }

  const values = rows.map((row) => `(${columns.map((column) => row[column]).join(", ")})`).join(",\n");
  const updates = updateColumns.map((column) => `${column} = excluded.${column}`).join(",\n  ");

  return `
insert into public.${table} (${columns.join(", ")})
values
${values}
on conflict (external_id) do update
set
  ${updates};
`;
}

function filterResolved(rows, relationColumns) {
  return rows.filter((row) => relationColumns.every((column) => !/select id from public\.[^)]+external_id = null/.test(row[column])));
}

export function buildSupabaseSyncSql(state) {
  const projected = projectStateToRelationalRows(state);

  const companies = projected.companies.map((row) => ({
    external_id: quote(row.external_id),
    name: quote(row.name),
    telegram_chat_id: quote(row.telegram_chat_id),
    created_at: quote(row.created_at),
    updated_at: quote(row.updated_at)
  }));

  const cases = projected.cases.map((row) => ({
    external_id: quote(row.external_id),
    company_id: `(select id from public.companies where external_id = ${quote(row.company_external_id)})`,
    kind: quote(row.kind),
    mode: quote(row.mode),
    summary: quote(row.summary),
    status: quote(row.status),
    created_at: quote(row.created_at),
    updated_at: quote(row.updated_at)
  }));

  const threads = projected.threads.map((row) => ({
    external_id: quote(row.external_id),
    company_id: `(select id from public.companies where external_id = ${quote(row.company_external_id)})`,
    telegram_chat_id: quote(row.telegram_chat_id),
    active_case_id: row.active_case_external_id
      ? `(select id from public.cases where external_id = ${quote(row.active_case_external_id)})`
      : "null",
    entry_state: quoteJson(row.entry_state),
    created_at: quote(row.created_at),
    updated_at: quote(row.updated_at)
  }));

  const messages = projected.messages.map((row) => ({
    external_id: quote(row.external_id),
    thread_id: `(select id from public.threads where external_id = ${quote(row.thread_external_id)})`,
    role: quote(row.role),
    text: quote(row.text),
    created_at: quote(row.created_at)
  }));

  const goals = projected.goals.map((row) => ({
    external_id: quote(row.external_id),
    case_id: `(select id from public.cases where external_id = ${quote(row.case_external_id)})`,
    statement: quote(row.statement),
    confidence: Number(row.confidence ?? 0.6),
    created_at: quote(row.created_at)
  }));

  const symptoms = projected.symptoms.map((row) => ({
    external_id: quote(row.external_id),
    case_id: `(select id from public.cases where external_id = ${quote(row.case_external_id)})`,
    statement: quote(row.statement),
    evidence: quote(row.evidence),
    created_at: quote(row.created_at)
  }));

  const hypotheses = projected.hypotheses.map((row) => ({
    external_id: quote(row.external_id),
    case_id: `(select id from public.cases where external_id = ${quote(row.case_external_id)})`,
    statement: quote(row.statement),
    basis: quote(row.basis),
    confidence: Number(row.confidence ?? 0.5),
    created_at: quote(row.created_at)
  }));

  const constraints = projected.constraints.map((row) => ({
    external_id: quote(row.external_id),
    case_id: `(select id from public.cases where external_id = ${quote(row.case_external_id)})`,
    statement: quote(row.statement),
    confidence: Number(row.confidence ?? 0.5),
    created_at: quote(row.created_at)
  }));

  const situations = projected.situations.map((row) => ({
    external_id: quote(row.external_id),
    case_id: `(select id from public.cases where external_id = ${quote(row.case_external_id)})`,
    summary: quote(row.summary),
    source: quote(row.source),
    created_at: quote(row.created_at)
  }));

  const actionWaves = projected.action_waves.map((row) => ({
    external_id: quote(row.external_id),
    case_id: `(select id from public.cases where external_id = ${quote(row.case_external_id)})`,
    first_step: quote(row.first_step),
    not_now: quote(row.not_now),
    why_this_first: quote(row.why_this_first),
    created_at: quote(row.created_at)
  }));

  const toolRecommendations = projected.tool_recommendations.map((row) => ({
    external_id: quote(row.external_id),
    case_id: `(select id from public.cases where external_id = ${quote(row.case_external_id)})`,
    name: quote(row.name),
    reason: quote(row.reason),
    usage_moment: quote(row.usage_moment),
    created_at: quote(row.created_at)
  }));

  const artifacts = projected.artifacts.map((row) => ({
    external_id: quote(row.external_id),
    case_id: `(select id from public.cases where external_id = ${quote(row.case_external_id)})`,
    kind: quote(row.kind),
    title: quote(row.title),
    summary: quote(row.summary),
    path: quote(row.path),
    content: quote(row.content),
    created_at: quote(row.created_at)
  }));

  const snapshots = projected.snapshots.map((row) => ({
    external_id: quote(row.external_id),
    case_id: `(select id from public.cases where external_id = ${quote(row.case_external_id)})`,
    mode: quote(row.mode),
    action: quote(row.action),
    signal_sufficiency: quote(row.signal_sufficiency),
    understanding: quote(row.understanding),
    known_facts: quoteJson(row.known_facts),
    observations: quoteJson(row.observations),
    working_hypotheses: quoteJson(row.working_hypotheses),
    created_at: quote(row.created_at)
  }));

  const statements = [
    "begin;",
    buildUpsert("companies", ["external_id", "name", "telegram_chat_id", "created_at", "updated_at"], companies),
    buildUpsert(
      "cases",
      ["external_id", "company_id", "kind", "mode", "summary", "status", "created_at", "updated_at"],
      filterResolved(cases, ["company_id"])
    ),
    buildUpsert(
      "threads",
      ["external_id", "company_id", "telegram_chat_id", "active_case_id", "entry_state", "created_at", "updated_at"],
      filterResolved(threads, ["company_id"])
    ),
    buildUpsert("messages", ["external_id", "thread_id", "role", "text", "created_at"], filterResolved(messages, ["thread_id"])),
    buildUpsert("goals", ["external_id", "case_id", "statement", "confidence", "created_at"], filterResolved(goals, ["case_id"])),
    buildUpsert("symptoms", ["external_id", "case_id", "statement", "evidence", "created_at"], filterResolved(symptoms, ["case_id"])),
    buildUpsert(
      "hypotheses",
      ["external_id", "case_id", "statement", "basis", "confidence", "created_at"],
      filterResolved(hypotheses, ["case_id"])
    ),
    buildUpsert("constraints", ["external_id", "case_id", "statement", "confidence", "created_at"], filterResolved(constraints, ["case_id"])),
    buildUpsert("situations", ["external_id", "case_id", "summary", "source", "created_at"], filterResolved(situations, ["case_id"])),
    buildUpsert(
      "action_waves",
      ["external_id", "case_id", "first_step", "not_now", "why_this_first", "created_at"],
      filterResolved(actionWaves, ["case_id"])
    ),
    buildUpsert(
      "tool_recommendations",
      ["external_id", "case_id", "name", "reason", "usage_moment", "created_at"],
      filterResolved(toolRecommendations, ["case_id"])
    ),
    buildUpsert(
      "artifacts",
      ["external_id", "case_id", "kind", "title", "summary", "path", "content", "created_at"],
      filterResolved(artifacts, ["case_id"])
    ),
    buildUpsert(
      "snapshots",
      [
        "external_id",
        "case_id",
        "mode",
        "action",
        "signal_sufficiency",
        "understanding",
        "known_facts",
        "observations",
        "working_hypotheses",
        "created_at"
      ],
      filterResolved(snapshots, ["case_id"])
    ),
    "commit;"
  ];

  return `${statements.filter(Boolean).join("\n")}\n`;
}
