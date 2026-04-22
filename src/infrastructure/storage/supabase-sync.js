import { projectStateToRelationalRows } from "./state-projector.js";

function chunk(items, size = 200) {
  const result = [];

  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }

  return result;
}

function ensureUrl(url) {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

export class SupabaseSyncClient {
  constructor({ url, serviceRoleKey }) {
    this.url = ensureUrl(url);
    this.serviceRoleKey = serviceRoleKey;
  }

  get enabled() {
    return Boolean(this.url && this.serviceRoleKey);
  }

  async request(pathname, { method = "GET", query = {}, body, prefer = "" } = {}) {
    const url = new URL(`${this.url}${pathname}`);

    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }

    const response = await fetch(url, {
      method,
      headers: {
        "content-type": "application/json",
        apikey: this.serviceRoleKey,
        authorization: `Bearer ${this.serviceRoleKey}`,
        ...(prefer ? { Prefer: prefer } : {})
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    }).catch((error) => {
      const details = [error.message];
      if (error.cause?.code) {
        details.push(`cause=${error.cause.code}`);
      }
      if (error.cause?.message) {
        details.push(`cause_message=${error.cause.message}`);
      }
      throw new Error(`Supabase fetch failed for ${method} ${url}: ${details.join(" ")}`);
    });

    if (!response.ok) {
      throw new Error(`Supabase ${method} ${pathname} failed: ${response.status} ${await response.text()}`);
    }

    if (response.status === 204) {
      return [];
    }

    return response.json();
  }

  async upsertRows(table, rows, select = "id,external_id") {
    if (!rows.length) {
      return [];
    }

    const results = [];

    for (const batch of chunk(rows)) {
      const response = await this.request(`/rest/v1/${table}`, {
        method: "POST",
        query: {
          on_conflict: "external_id",
          select
        },
        prefer: "resolution=merge-duplicates,return=representation",
        body: batch
      });
      results.push(...response);
    }

    return results;
  }

  async syncState(state) {
    if (!this.enabled) {
      throw new Error("Supabase sync is not configured. Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
    }

    const projected = projectStateToRelationalRows(state);

    const companyRows = projected.companies.map((row) => ({
      external_id: row.external_id,
      name: row.name,
      telegram_chat_id: row.telegram_chat_id,
      created_at: row.created_at,
      updated_at: row.updated_at
    }));

    const companies = await this.upsertRows("companies", companyRows);
    const companyIdByExternalId = new Map(companies.map((row) => [row.external_id, row.id]));

    const caseRows = projected.cases
      .map((row) => ({
        external_id: row.external_id,
        company_id: companyIdByExternalId.get(row.company_external_id),
        kind: row.kind,
        mode: row.mode,
        summary: row.summary,
        status: row.status,
        created_at: row.created_at,
        updated_at: row.updated_at
      }))
      .filter((row) => row.company_id);

    const cases = await this.upsertRows("cases", caseRows);
    const caseIdByExternalId = new Map(cases.map((row) => [row.external_id, row.id]));

    const threadRows = projected.threads
      .map((row) => ({
        external_id: row.external_id,
        company_id: companyIdByExternalId.get(row.company_external_id),
        telegram_chat_id: row.telegram_chat_id,
        active_case_id: row.active_case_external_id
          ? caseIdByExternalId.get(row.active_case_external_id) || null
          : null,
        entry_state: row.entry_state || {},
        created_at: row.created_at,
        updated_at: row.updated_at
      }))
      .filter((row) => row.company_id);

    const threads = await this.upsertRows("threads", threadRows);
    const threadIdByExternalId = new Map(threads.map((row) => [row.external_id, row.id]));

    const entityRows = {
      messages: projected.messages
        .map((row) => ({
          external_id: row.external_id,
          thread_id: threadIdByExternalId.get(row.thread_external_id),
          role: row.role,
          text: row.text,
          created_at: row.created_at
        }))
        .filter((row) => row.thread_id),
      goals: projected.goals
        .map((row) => ({
          external_id: row.external_id,
          case_id: caseIdByExternalId.get(row.case_external_id),
          statement: row.statement,
          confidence: row.confidence,
          created_at: row.created_at
        }))
        .filter((row) => row.case_id),
      symptoms: projected.symptoms
        .map((row) => ({
          external_id: row.external_id,
          case_id: caseIdByExternalId.get(row.case_external_id),
          statement: row.statement,
          evidence: row.evidence,
          created_at: row.created_at
        }))
        .filter((row) => row.case_id),
      hypotheses: projected.hypotheses
        .map((row) => ({
          external_id: row.external_id,
          case_id: caseIdByExternalId.get(row.case_external_id),
          statement: row.statement,
          basis: row.basis,
          confidence: row.confidence,
          created_at: row.created_at
        }))
        .filter((row) => row.case_id),
      constraints: projected.constraints
        .map((row) => ({
          external_id: row.external_id,
          case_id: caseIdByExternalId.get(row.case_external_id),
          statement: row.statement,
          confidence: row.confidence,
          created_at: row.created_at
        }))
        .filter((row) => row.case_id),
      situations: projected.situations
        .map((row) => ({
          external_id: row.external_id,
          case_id: caseIdByExternalId.get(row.case_external_id),
          summary: row.summary,
          source: row.source,
          created_at: row.created_at
        }))
        .filter((row) => row.case_id),
      action_waves: projected.action_waves
        .map((row) => ({
          external_id: row.external_id,
          case_id: caseIdByExternalId.get(row.case_external_id),
          first_step: row.first_step,
          not_now: row.not_now,
          why_this_first: row.why_this_first,
          created_at: row.created_at
        }))
        .filter((row) => row.case_id),
      tool_recommendations: projected.tool_recommendations
        .map((row) => ({
          external_id: row.external_id,
          case_id: caseIdByExternalId.get(row.case_external_id),
          name: row.name,
          reason: row.reason,
          usage_moment: row.usage_moment,
          created_at: row.created_at
        }))
        .filter((row) => row.case_id),
      artifacts: projected.artifacts
        .map((row) => ({
          external_id: row.external_id,
          case_id: caseIdByExternalId.get(row.case_external_id),
          kind: row.kind,
          title: row.title,
          summary: row.summary,
          path: row.path,
          content: row.content,
          created_at: row.created_at
        }))
        .filter((row) => row.case_id),
      snapshots: projected.snapshots
        .map((row) => ({
          external_id: row.external_id,
          case_id: caseIdByExternalId.get(row.case_external_id),
          mode: row.mode,
          action: row.action,
          signal_sufficiency: row.signal_sufficiency,
          understanding: row.understanding,
          known_facts: row.known_facts,
          observations: row.observations,
          working_hypotheses: row.working_hypotheses,
          graph_snapshot: row.graph_snapshot || {},
          created_at: row.created_at
        }))
        .filter((row) => row.case_id)
    };

    for (const [table, rows] of Object.entries(entityRows)) {
      await this.upsertRows(table, rows, "id,external_id");
    }

    return {
      companies: companyRows.length,
      cases: caseRows.length,
      threads: threadRows.length,
      messages: entityRows.messages.length,
      goals: entityRows.goals.length,
      symptoms: entityRows.symptoms.length,
      hypotheses: entityRows.hypotheses.length,
      constraints: entityRows.constraints.length,
      situations: entityRows.situations.length,
      action_waves: entityRows.action_waves.length,
      tool_recommendations: entityRows.tool_recommendations.length,
      artifacts: entityRows.artifacts.length,
      snapshots: entityRows.snapshots.length
    };
  }
}

export class ReplicatedMemoryStore {
  constructor({ fileStore, syncClient, fallbackSyncClient = null, logger = console }) {
    this.fileStore = fileStore;
    this.syncClient = syncClient;
    this.fallbackSyncClient = fallbackSyncClient;
    this.logger = logger;
  }

  async init() {
    await this.fileStore.init();
  }

  async readState() {
    return this.fileStore.readState();
  }

  async writeState(state) {
    await this.fileStore.writeState(state);
    await this.syncBestEffort(state);
  }

  async update(mutator) {
    const state = await this.fileStore.readState();
    const result = await mutator(state);
    await this.fileStore.writeState(state);
    await this.syncBestEffort(state);
    return result;
  }

  async saveArtifactDocument(payload) {
    return this.fileStore.saveArtifactDocument(payload);
  }

  async syncBestEffort(state) {
    if (!this.syncClient?.enabled && !this.fallbackSyncClient?.enabled) {
      return;
    }

    try {
      if (this.syncClient?.enabled) {
        const summary = await this.syncClient.syncState(state);
        this.logger.log("Supabase sync complete.", summary);
        return;
      }
    } catch (error) {
      this.logger.warn("Supabase REST sync skipped:", error.message);
    }

    if (!this.fallbackSyncClient?.enabled) {
      return;
    }

    try {
      const summary = await this.fallbackSyncClient.syncState(state);
      this.logger.log("Supabase CLI sync complete.", summary);
    } catch (error) {
      this.logger.warn("Supabase CLI sync skipped:", error.message);
    }
  }
}
