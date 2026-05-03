const SEVERITY_RANK = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4
};

function firstRow(rows) {
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function compactEvidence(evidence = []) {
  return evidence.slice(-20);
}

function strongerSeverity(left, right) {
  return (SEVERITY_RANK[right] || 0) > (SEVERITY_RANK[left] || 0) ? right : left;
}

function evidenceKey(item) {
  return [
    item?.evaluationId || "",
    item?.threadId || "",
    item?.issueCode || ""
  ].join(":");
}

export class ImprovementCollector {
  constructor({ syncClient }) {
    this.syncClient = syncClient;
  }

  async findOne(table, query) {
    const rows = await this.syncClient.request(`/rest/v1/${table}`, {
      query: {
        ...query,
        limit: 1
      }
    });

    return firstRow(rows);
  }

  async insertOne(table, body, select = "*") {
    const rows = await this.syncClient.request(`/rest/v1/${table}`, {
      method: "POST",
      query: { select },
      prefer: "return=representation",
      body
    });

    return firstRow(rows);
  }

  async patchOne(table, id, body, select = "*") {
    const rows = await this.syncClient.request(`/rest/v1/${table}`, {
      method: "PATCH",
      query: {
        id: `eq.${id}`,
        select
      },
      prefer: "return=representation",
      body
    });

    return firstRow(rows);
  }

  buildEvidence({ evaluation, issue }) {
    return {
      evaluationId: evaluation.id || "",
      threadId: evaluation.thread_id || evaluation.threadId || "",
      caseId: evaluation.case_id || evaluation.caseId || "",
      issueCode: issue.code || "",
      score: evaluation.score ?? null,
      summary: evaluation.summary || "",
      createdAt: new Date().toISOString()
    };
  }

  async collectIssue({ evaluation, issue }) {
    const fingerprint = trimString(issue.fingerprint) || `${issue.category || "general"}:${issue.code || issue.title}`;
    if (!fingerprint) {
      return null;
    }

    const evidence = this.buildEvidence({ evaluation, issue });
    const existing = await this.findOne("admin_improvements", {
      fingerprint: `eq.${fingerprint}`,
      select: "*"
    });

    if (!existing) {
      return this.insertOne("admin_improvements", {
        workspace_id: evaluation.workspace_id || evaluation.workspaceId || null,
        company_id: evaluation.company_id || evaluation.companyId || null,
        case_id: evaluation.case_id || evaluation.caseId || null,
        source_type: "conversation_evaluation",
        fingerprint,
        category: issue.category || "general",
        severity: issue.severity || "medium",
        title: issue.title || "Улучшение",
        description: issue.description || "",
        suggestion: issue.suggestion || "",
        frequency: 1,
        status: "open",
        evidence: [evidence],
        first_seen_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString()
      });
    }

    const currentEvidence = Array.isArray(existing.evidence) ? existing.evidence : [];
    const seen = new Set(currentEvidence.map(evidenceKey));
    const alreadyCounted = seen.has(evidenceKey(evidence));
    const nextEvidence = alreadyCounted ? currentEvidence : compactEvidence([...currentEvidence, evidence]);

    return this.patchOne("admin_improvements", existing.id, {
      workspace_id: existing.workspace_id || evaluation.workspace_id || evaluation.workspaceId || null,
      company_id: existing.company_id || evaluation.company_id || evaluation.companyId || null,
      case_id: existing.case_id || evaluation.case_id || evaluation.caseId || null,
      severity: strongerSeverity(existing.severity, issue.severity || "medium"),
      title: existing.title || issue.title || "Улучшение",
      description: existing.description || issue.description || "",
      suggestion: existing.suggestion || issue.suggestion || "",
      frequency: Number(existing.frequency || 0) + (alreadyCounted ? 0 : 1),
      evidence: nextEvidence,
      last_seen_at: new Date().toISOString()
    });
  }

  async collectFromEvaluation(evaluation) {
    const issues = Array.isArray(evaluation?.issues) ? evaluation.issues : [];
    const result = [];

    for (const issue of issues) {
      const improvement = await this.collectIssue({ evaluation, issue });
      if (improvement) {
        result.push(improvement);
      }
    }

    return result;
  }
}
