function mapRows(items, mapper) {
  return items.map((item) => mapper(item));
}

export function projectStateToRelationalRows(state) {
  return {
    companies: mapRows(state.companies, (item) => ({
      external_id: item.id,
      name: item.name,
      telegram_chat_id: item.telegramChatId,
      created_at: item.createdAt,
      updated_at: item.updatedAt
    })),
    cases: mapRows(state.cases, (item) => ({
      external_id: item.id,
      company_external_id: item.companyId,
      kind: item.kind,
      mode: item.mode,
      summary: item.summary,
      status: item.status,
      created_at: item.createdAt,
      updated_at: item.updatedAt
    })),
    threads: mapRows(state.threads, (item) => ({
      external_id: item.id,
      company_external_id: item.companyId,
      telegram_chat_id: item.telegramChatId,
      active_case_external_id: item.activeCaseId,
      entry_state: item.entryState || {},
      created_at: item.createdAt,
      updated_at: item.updatedAt
    })),
    messages: mapRows(state.messages, (item) => ({
      external_id: item.id,
      thread_external_id: item.threadId,
      role: item.role,
      text: item.text,
      created_at: item.createdAt
    })),
    goals: mapRows(state.goals, (item) => ({
      external_id: item.id,
      case_external_id: item.caseId,
      statement: item.statement,
      confidence: item.confidence,
      created_at: item.createdAt
    })),
    symptoms: mapRows(state.symptoms, (item) => ({
      external_id: item.id,
      case_external_id: item.caseId,
      statement: item.statement,
      evidence: item.evidence,
      created_at: item.createdAt
    })),
    hypotheses: mapRows(state.hypotheses, (item) => ({
      external_id: item.id,
      case_external_id: item.caseId,
      statement: item.statement,
      basis: item.basis,
      confidence: item.confidence,
      created_at: item.createdAt
    })),
    constraints: mapRows(state.constraints, (item) => ({
      external_id: item.id,
      case_external_id: item.caseId,
      statement: item.statement,
      confidence: item.confidence,
      created_at: item.createdAt
    })),
    situations: mapRows(state.situations, (item) => ({
      external_id: item.id,
      case_external_id: item.caseId,
      summary: item.summary,
      source: item.source,
      created_at: item.createdAt
    })),
    action_waves: mapRows(state.actionWaves, (item) => ({
      external_id: item.id,
      case_external_id: item.caseId,
      first_step: item.firstStep,
      not_now: item.notNow,
      why_this_first: item.whyThisFirst,
      created_at: item.createdAt
    })),
    tool_recommendations: mapRows(state.toolRecommendations, (item) => ({
      external_id: item.id,
      case_external_id: item.caseId,
      name: item.name,
      reason: item.reason,
      usage_moment: item.usageMoment,
      created_at: item.createdAt
    })),
    artifacts: mapRows(state.artifacts, (item) => ({
      external_id: item.id,
      case_external_id: item.caseId,
      kind: item.kind,
      title: item.title,
      summary: item.summary,
      path: item.path,
      content: item.content || "",
      created_at: item.createdAt
    })),
    snapshots: mapRows(state.snapshots, (item) => ({
      external_id: item.id,
      case_external_id: item.caseId,
      mode: item.mode,
      action: item.action,
      signal_sufficiency: item.signalSufficiency,
      understanding: item.understanding,
      known_facts: item.knownFacts,
      observations: item.observations,
      working_hypotheses: item.workingHypotheses,
      created_at: item.createdAt
    }))
  };
}
