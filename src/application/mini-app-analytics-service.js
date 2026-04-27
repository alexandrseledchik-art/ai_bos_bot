function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function compactPayload(value) {
  if (!value || typeof value !== "object") {
    return {};
  }

  return JSON.parse(JSON.stringify(value));
}

export class MiniAppAnalyticsService {
  constructor({ syncClient }) {
    this.syncClient = syncClient;
  }

  async logEvent({ bootstrap, eventName, metadata = {} }) {
    if (!this.syncClient?.enabled || !bootstrap?.activeCase?.id || !trimString(eventName)) {
      return null;
    }

    try {
      const rows = await this.syncClient.request("/rest/v1/mini_app_analytics_events", {
        method: "POST",
        query: {
          select: "*"
        },
        prefer: "return=representation",
        body: {
          workspace_id: bootstrap.workspace.id,
          company_id: bootstrap.company.id,
          case_id: bootstrap.activeCase.id,
          app_user_id: bootstrap.appUser?.id || null,
          event_name: eventName,
          metadata: compactPayload(metadata)
        }
      });

      return Array.isArray(rows) ? rows[0] : null;
    } catch {
      return null;
    }
  }

  async saveEvalSnapshot({ bootstrap, snapshot }) {
    if (!this.syncClient?.enabled || !bootstrap?.activeCase?.id || !snapshot) {
      return null;
    }

    try {
      const rows = await this.syncClient.request("/rest/v1/mini_app_eval_logs", {
        method: "POST",
        query: {
          select: "*"
        },
        prefer: "return=representation",
        body: {
          workspace_id: bootstrap.workspace.id,
          company_id: bootstrap.company.id,
          case_id: bootstrap.activeCase.id,
          problem_context: snapshot.problem_context || "",
          observations_count: snapshot.observations_count || 0,
          suggested_answers_count: snapshot.suggested_answers_count || 0,
          confirmed_answers_count: snapshot.confirmed_answers_count || 0,
          selected_constraint: snapshot.selected_constraint || null,
          confidence: snapshot.confidence ?? null,
          next_step: snapshot.next_step || null,
          quality_flags: snapshot.quality_flags || [],
          trigger_event: snapshot.trigger_event || "snapshot",
          payload: compactPayload(snapshot.payload || {})
        }
      });

      return Array.isArray(rows) ? rows[0] : null;
    } catch {
      return null;
    }
  }
}
