import { emptyState } from "../../domain/entities.js";

function mergeWithEmptyState(value) {
  return {
    ...emptyState(),
    ...(value && typeof value === "object" ? value : {})
  };
}

export class SupabasePrimaryMemoryStore {
  constructor({ syncClient, stateKey = "project_state", logger = console }) {
    this.syncClient = syncClient;
    this.stateKey = stateKey;
    this.logger = logger;
  }

  async init() {
    if (!this.syncClient?.enabled) {
      throw new Error("Supabase primary state requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
    }

    await this.ensureStateRow();
  }

  async ensureStateRow() {
    const rows = await this.syncClient.request("/rest/v1/runtime_states", {
      query: {
        key: `eq.${this.stateKey}`,
        select: "key"
      }
    });

    if (rows.length > 0) {
      return;
    }

    await this.writeRawState(emptyState());
  }

  async readState() {
    await this.init();
    const rows = await this.syncClient.request("/rest/v1/runtime_states", {
      query: {
        key: `eq.${this.stateKey}`,
        select: "state"
      }
    });

    return mergeWithEmptyState(rows[0]?.state);
  }

  async writeState(state) {
    await this.init();
    await this.writeRawState(mergeWithEmptyState(state));
    await this.projectRelationalStateBestEffort(state);
  }

  async update(mutator) {
    const state = await this.readState();
    const result = await mutator(state);
    await this.writeRawState(mergeWithEmptyState(state));
    await this.projectRelationalStateBestEffort(state);
    return result;
  }

  async saveArtifactDocument({ artifactId }) {
    return `supabase://runtime-artifacts/${artifactId}`;
  }

  async writeRawState(state) {
    await this.syncClient.request("/rest/v1/runtime_states", {
      method: "POST",
      query: {
        on_conflict: "key"
      },
      prefer: "resolution=merge-duplicates,return=representation",
      body: {
        key: this.stateKey,
        state,
        updated_at: new Date().toISOString()
      }
    });
  }

  async projectRelationalStateBestEffort(state) {
    try {
      const summary = await this.syncClient.syncState(state);
      this.logger.log("Supabase relational projection complete.", summary);
    } catch (error) {
      this.logger.warn("Supabase relational projection skipped:", error.message);
    }
  }
}
