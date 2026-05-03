import { ConversationEvaluator } from "./conversation-evaluator.js";
import { ImprovementCollector } from "./improvement-collector.js";

function firstRow(rows) {
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeLimit(value, fallback = 30, max = 100) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallback;
  }
  return Math.min(max, Math.floor(numeric));
}

function inFilter(values = []) {
  const unique = [...new Set(values.map((value) => trimString(value)).filter(Boolean))];
  return unique.length ? `in.(${unique.join(",")})` : "";
}

function indexById(rows = []) {
  return new Map(rows.map((row) => [row.id, row]));
}

function groupBy(rows = [], key) {
  const map = new Map();
  for (const row of rows) {
    const value = row?.[key];
    if (!value) {
      continue;
    }
    const items = map.get(value) || [];
    items.push(row);
    map.set(value, items);
  }
  return map;
}

function normalizeTelegramId(value) {
  return String(value ?? "").trim();
}

function appUserName(user = {}) {
  const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
  if (fullName) {
    return fullName;
  }
  if (user.username) {
    return `@${user.username}`;
  }
  return `Telegram ${user.telegram_user_id}`;
}

function latestByGroup(rows = [], key) {
  const groups = groupBy(rows, key);
  const result = new Map();
  for (const [groupKey, items] of groups.entries()) {
    const sorted = [...items].sort((left, right) => String(right.created_at || "").localeCompare(String(left.created_at || "")));
    result.set(groupKey, sorted[0]);
  }
  return result;
}

function matchesSearch(conversation, query) {
  if (!query) {
    return true;
  }

  const haystack = [
    conversation.company?.name,
    conversation.thread?.telegram_chat_id,
    conversation.appUser?.username,
    conversation.appUser?.first_name,
    conversation.appUser?.last_name,
    conversation.appUser?.access_status,
    conversation.latestMessage?.text,
    conversation.activeCase?.summary
  ].join(" ").toLowerCase();

  return haystack.includes(query.toLowerCase());
}

function isServiceThread(thread) {
  return thread?.external_id === "miniapp_compat_store_v1" ||
    thread?.telegram_chat_id === "miniapp:compat-store";
}

function pickConversationSummary({ thread, company, activeCase, latestMessage, messages = [], latestEvaluation }) {
  const userMessages = messages.filter((message) => message.role === "user");
  const assistantMessages = messages.filter((message) => message.role === "assistant");

  return {
    id: thread.id,
    thread,
    company: company || null,
    activeCase: activeCase || null,
    latestMessage: latestMessage || null,
    latestEvaluation: latestEvaluation || null,
    counters: {
      messages: messages.length,
      userMessages: userMessages.length,
      assistantMessages: assistantMessages.length
    },
    updatedAt: thread.updated_at || thread.created_at || ""
  };
}

function pickAccessUserSummary({ user }) {
  const updatedAt = user.updated_at || user.access_requested_at || user.created_at || "";
  const accessStatus = user.access_status || "pending";

  return {
    id: `app_user:${user.telegram_user_id}`,
    kind: "access_user",
    isPlaceholder: true,
    appUser: user,
    thread: {
      id: `app_user:${user.telegram_user_id}`,
      external_id: `app_user:${user.telegram_user_id}`,
      telegram_chat_id: String(user.telegram_user_id),
      created_at: user.created_at || updatedAt,
      updated_at: updatedAt
    },
    company: {
      name: appUserName(user)
    },
    activeCase: null,
    latestMessage: {
      role: "system",
      text: `Пользователь есть в списке доступа: ${accessStatus}. Сохранённого диалога пока нет.`,
      created_at: updatedAt
    },
    latestEvaluation: null,
    counters: {
      messages: 0,
      userMessages: 0,
      assistantMessages: 0
    },
    updatedAt
  };
}

export class AdminAnalyticsService {
  constructor({ syncClient, evaluator = new ConversationEvaluator(), improvementCollector = null }) {
    this.syncClient = syncClient;
    this.evaluator = evaluator;
    this.improvementCollector = improvementCollector || new ImprovementCollector({ syncClient });
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

  async findMany(table, query = {}) {
    return this.syncClient.request(`/rest/v1/${table}`, { query });
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

  async safeFindMany(table, query = {}) {
    try {
      return await this.findMany(table, query);
    } catch {
      return [];
    }
  }

  async fetchByIds(table, ids, select = "*") {
    const filter = inFilter(ids);
    if (!filter) {
      return [];
    }

    return this.safeFindMany(table, {
      id: filter,
      select
    });
  }

  async resolveThread(threadId) {
    const value = trimString(threadId);
    if (!value) {
      return null;
    }

    return await this.findOne("threads", {
      id: `eq.${value}`,
      select: "*"
    }).catch(async () => null) ||
      await this.findOne("threads", {
        external_id: `eq.${value}`,
        select: "*"
      }).catch(async () => null) ||
      await this.findOne("threads", {
        telegram_chat_id: `eq.${value}`,
        select: "*"
      }).catch(async () => null);
  }

  async resolveAccessUserConversation(threadId) {
    const match = trimString(threadId).match(/^app_user:(\d+)$/);
    if (!match) {
      return null;
    }

    const user = await this.findOne("app_users", {
      telegram_user_id: `eq.${match[1]}`,
      select: "*"
    }).catch(() => null);

    if (!user) {
      return null;
    }

    return {
      ...pickAccessUserSummary({ user }),
      messages: [],
      observations: [],
      goals: [],
      symptoms: [],
      hypotheses: [],
      constraints: [],
      situations: [],
      actionWaves: [],
      snapshots: [],
      miniAppEvalLogs: []
    };
  }

  async listConversations({ limit = 30, search = "" } = {}) {
    const normalizedLimit = normalizeLimit(limit);
    const [threads, appUsers] = await Promise.all([
      this.safeFindMany("threads", {
        select: "*",
        order: "updated_at.desc",
        limit: normalizedLimit
      }),
      this.safeFindMany("app_users", {
        select: "*",
        order: "updated_at.desc",
        limit: normalizedLimit * 2
      })
    ]);
    const visibleThreads = threads.filter((thread) => !isServiceThread(thread));

    const threadIds = visibleThreads.map((thread) => thread.id);
    const companyIds = visibleThreads.map((thread) => thread.company_id);
    const caseIds = visibleThreads.map((thread) => thread.active_case_id).filter(Boolean);

    const [companies, cases, messages, evaluations] = await Promise.all([
      this.fetchByIds("companies", companyIds),
      this.fetchByIds("cases", caseIds),
      this.safeFindMany("messages", {
        thread_id: inFilter(threadIds),
        select: "*",
        order: "created_at.desc",
        limit: normalizedLimit * 6
      }),
      this.safeFindMany("admin_conversation_evaluations", {
        thread_id: inFilter(threadIds),
        select: "*",
        order: "created_at.desc",
        limit: normalizedLimit * 3
      })
    ]);

    const companyById = indexById(companies);
    const caseById = indexById(cases);
    const messagesByThread = groupBy(messages, "thread_id");
    const latestMessageByThread = latestByGroup(messages, "thread_id");
    const latestEvaluationByThread = latestByGroup(evaluations, "thread_id");

    const threadTelegramIds = new Set(
      visibleThreads.map((thread) => normalizeTelegramId(thread.telegram_chat_id)).filter(Boolean)
    );
    const userPlaceholders = appUsers
      .filter((user) => !threadTelegramIds.has(normalizeTelegramId(user.telegram_user_id)))
      .map((user) => pickAccessUserSummary({ user }));

    const conversations = [
      ...visibleThreads
      .map((thread) => pickConversationSummary({
        thread,
        company: companyById.get(thread.company_id),
        activeCase: caseById.get(thread.active_case_id),
        latestMessage: latestMessageByThread.get(thread.id),
        messages: messagesByThread.get(thread.id) || [],
        latestEvaluation: latestEvaluationByThread.get(thread.id)
      })),
      ...userPlaceholders
    ]
      .filter((conversation) => matchesSearch(conversation, trimString(search)));
    conversations.sort((left, right) => String(right.updatedAt || "").localeCompare(String(left.updatedAt || "")));

    return {
      conversations,
      count: conversations.length
    };
  }

  async getConversation({ threadId }) {
    const accessUserConversation = await this.resolveAccessUserConversation(threadId);
    if (accessUserConversation) {
      return accessUserConversation;
    }

    const thread = await this.resolveThread(threadId);
    if (!thread) {
      const error = new Error("Conversation not found.");
      error.status = 404;
      throw error;
    }

    const [company, activeCase, messages, latestEvaluation] = await Promise.all([
      thread.company_id ? this.findOne("companies", { id: `eq.${thread.company_id}`, select: "*" }).catch(() => null) : null,
      thread.active_case_id ? this.findOne("cases", { id: `eq.${thread.active_case_id}`, select: "*" }).catch(() => null) : null,
      this.safeFindMany("messages", {
        thread_id: `eq.${thread.id}`,
        select: "*",
        order: "created_at.asc"
      }),
      this.findOne("admin_conversation_evaluations", {
        thread_id: `eq.${thread.id}`,
        select: "*",
        order: "created_at.desc"
      }).catch(() => null)
    ]);

    const caseId = activeCase?.id || thread.active_case_id || "";
    const [
      observations,
      goals,
      symptoms,
      hypotheses,
      constraints,
      situations,
      actionWaves,
      snapshots,
      miniAppEvalLogs
    ] = caseId
      ? await Promise.all([
          this.safeFindMany("observations", { case_id: `eq.${caseId}`, select: "*", order: "created_at.desc", limit: 50 }),
          this.safeFindMany("goals", { case_id: `eq.${caseId}`, select: "*", order: "created_at.desc", limit: 20 }),
          this.safeFindMany("symptoms", { case_id: `eq.${caseId}`, select: "*", order: "created_at.desc", limit: 50 }),
          this.safeFindMany("hypotheses", { case_id: `eq.${caseId}`, select: "*", order: "created_at.desc", limit: 50 }),
          this.safeFindMany("constraints", { case_id: `eq.${caseId}`, select: "*", order: "created_at.desc", limit: 20 }),
          this.safeFindMany("situations", { case_id: `eq.${caseId}`, select: "*", order: "created_at.desc", limit: 20 }),
          this.safeFindMany("action_waves", { case_id: `eq.${caseId}`, select: "*", order: "created_at.desc", limit: 20 }),
          this.safeFindMany("snapshots", { case_id: `eq.${caseId}`, select: "*", order: "created_at.desc", limit: 20 }),
          this.safeFindMany("mini_app_eval_logs", { case_id: `eq.${caseId}`, select: "*", order: "created_at.desc", limit: 20 })
        ])
      : [[], [], [], [], [], [], [], [], []];

    return {
      thread,
      company,
      activeCase,
      messages,
      latestEvaluation,
      observations,
      goals,
      symptoms,
      hypotheses,
      constraints,
      situations,
      actionWaves,
      snapshots,
      miniAppEvalLogs
    };
  }

  async saveConversationEvaluation({ detail, evaluation }) {
    const row = await this.insertOne("admin_conversation_evaluations", {
      workspace_id: detail.thread?.workspace_id || detail.activeCase?.workspace_id || detail.company?.workspace_id || null,
      company_id: detail.thread?.company_id || detail.company?.id || null,
      case_id: detail.activeCase?.id || detail.thread?.active_case_id || null,
      thread_id: detail.thread.id,
      evaluator_version: evaluation.evaluatorVersion,
      score: evaluation.score,
      status: evaluation.status,
      summary: evaluation.summary,
      strengths: evaluation.strengths,
      issues: evaluation.issues,
      improvement_suggestions: evaluation.improvementSuggestions,
      metrics: evaluation.metrics
    });

    await this.improvementCollector.collectFromEvaluation(row);
    return row;
  }

  async evaluateConversation({ threadId, persist = true } = {}) {
    const detail = await this.getConversation({ threadId });
    if (detail.isPlaceholder || !detail.messages?.length) {
      const error = new Error("У этого пользователя пока нет сохранённого диалога, поэтому оценивать ещё нечего.");
      error.status = 400;
      throw error;
    }

    const evaluation = this.evaluator.evaluateConversation(detail);
    const savedEvaluation = persist
      ? await this.saveConversationEvaluation({ detail, evaluation })
      : null;

    return {
      conversation: {
        thread: detail.thread,
        company: detail.company,
        activeCase: detail.activeCase
      },
      evaluation,
      savedEvaluation
    };
  }

  async listEvaluations({ limit = 50 } = {}) {
    const evaluations = await this.safeFindMany("admin_conversation_evaluations", {
      select: "*",
      order: "created_at.desc",
      limit: normalizeLimit(limit, 50, 200)
    });

    const [threads, companies] = await Promise.all([
      this.fetchByIds("threads", evaluations.map((evaluation) => evaluation.thread_id)),
      this.fetchByIds("companies", evaluations.map((evaluation) => evaluation.company_id))
    ]);

    const threadById = indexById(threads);
    const companyById = indexById(companies);

    return {
      evaluations: evaluations.map((evaluation) => ({
        ...evaluation,
        thread: threadById.get(evaluation.thread_id) || null,
        company: companyById.get(evaluation.company_id) || null
      })),
      count: evaluations.length
    };
  }

  async listImprovements({ limit = 100, status = "" } = {}) {
    const query = {
      select: "*",
      order: "last_seen_at.desc",
      limit: normalizeLimit(limit, 100, 300)
    };
    if (trimString(status)) {
      query.status = `eq.${trimString(status)}`;
    }

    const improvements = await this.safeFindMany("admin_improvements", query);
    improvements.sort((left, right) => {
      const frequencyDelta = Number(right.frequency || 0) - Number(left.frequency || 0);
      if (frequencyDelta !== 0) {
        return frequencyDelta;
      }
      return String(right.last_seen_at || "").localeCompare(String(left.last_seen_at || ""));
    });

    return {
      improvements,
      count: improvements.length
    };
  }

  async collectImprovements({ limit = 100 } = {}) {
    const evaluations = await this.safeFindMany("admin_conversation_evaluations", {
      select: "*",
      order: "created_at.desc",
      limit: normalizeLimit(limit, 100, 300)
    });
    const improvements = [];

    for (const evaluation of evaluations) {
      improvements.push(...await this.improvementCollector.collectFromEvaluation(evaluation));
    }

    return {
      scannedEvaluations: evaluations.length,
      improvements
    };
  }
}
