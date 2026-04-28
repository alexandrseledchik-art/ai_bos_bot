import { calculateExpressMaturity } from "./maturity-calculator.js";

function slugify(value) {
  const slug = String(value || "workspace")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "workspace";
}

function compactName(user) {
  return [user.firstName, user.lastName].filter(Boolean).join(" ").trim() ||
    user.username ||
    `Telegram ${user.id}`;
}

function firstRow(rows) {
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isProfileComplete({ company, profile }) {
  return Boolean(
    trimString(company?.name) &&
    trimString(profile?.user_role) &&
    trimString(profile?.current_request)
  );
}

export class MiniAppBootstrapService {
  constructor({ syncClient }) {
    this.syncClient = syncClient;
  }

  assertEnabled() {
    if (!this.syncClient?.enabled) {
      throw new Error("Supabase is required for Mini App bootstrap.");
    }
  }

  async upsertOne(table, body, { onConflict, select = "*" } = {}) {
    const rows = await this.syncClient.request(`/rest/v1/${table}`, {
      method: "POST",
      query: {
        ...(onConflict ? { on_conflict: onConflict } : {}),
        select
      },
      prefer: "resolution=merge-duplicates,return=representation",
      body
    });

    return firstRow(rows);
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

  async findMany(table, query) {
    return this.syncClient.request(`/rest/v1/${table}`, {
      query
    });
  }

  async resolveAppUser(user) {
    return this.upsertOne(
      "users",
      {
        telegram_user_id: user.id,
        username: user.username || null,
        first_name: user.firstName || null,
        last_name: user.lastName || null
      },
      {
        onConflict: "telegram_user_id"
      }
    );
  }

  async resolveExistingWorkspace(appUser) {
    const existingCompany = await this.findOne("companies", {
      telegram_chat_id: `eq.miniapp:${appUser.telegram_user_id}`,
      select: "workspace_id"
    });

    if (!existingCompany?.workspace_id) {
      return null;
    }

    return this.findOne("workspaces", {
      id: `eq.${existingCompany.workspace_id}`,
      select: "*"
    });
  }

  async createWorkspace(user) {
    const name = `${compactName(user)} workspace`;
    const suffix = String(user.id);
    return this.upsertOne(
      "workspaces",
      {
        name,
        slug: `${slugify(name)}-${suffix}`
      },
      {
        onConflict: "slug"
      }
    );
  }

  async ensureWorkspaceMembership({ workspace, appUser }) {
    return {
      workspace_id: workspace.id,
      app_user_id: appUser.id,
      role: "owner"
    };
  }

  async resolveCompany({ workspace, user }) {
    const existingByWorkspace = await this.findOne("companies", {
      workspace_id: `eq.${workspace.id}`,
      select: "*"
    });

    if (existingByWorkspace) {
      return existingByWorkspace;
    }

    const telegramChatId = `miniapp:${user.id}`;
    return this.upsertOne(
      "companies",
      {
        external_id: `company_miniapp_${user.id}`,
        workspace_id: workspace.id,
        name: compactName(user),
        telegram_chat_id: telegramChatId
      },
      {
        onConflict: "external_id"
      }
    );
  }

  async resolveCompanyProfile({ workspace, company }) {
    const existing = await this.findOne("company_profiles", {
      company_id: `eq.${company.id}`,
      workspace_id: `eq.${workspace.id}`,
      select: "*"
    });

    if (existing) {
      if (existing.onboarding_status !== "completed" && isProfileComplete({ company, profile: existing })) {
        return this.upsertOne(
          "company_profiles",
          {
            workspace_id: workspace.id,
            company_id: company.id,
            onboarding_status: "completed"
          },
          {
            onConflict: "company_id"
          }
        );
      }

      return existing;
    }

    return this.upsertOne(
      "company_profiles",
      {
        workspace_id: workspace.id,
        company_id: company.id,
        onboarding_status: "draft"
      },
      {
        onConflict: "company_id"
      }
    );
  }

  async resolveActiveDiagnosticCase({ workspace, company, user }) {
    const existing = await this.findOne("cases", {
      company_id: `eq.${company.id}`,
      workspace_id: `eq.${workspace.id}`,
      kind: "eq.diagnostic_case",
      status: "eq.active",
      order: "updated_at.desc",
      select: "*"
    });

    if (existing) {
      return existing;
    }

    return this.upsertOne(
      "cases",
      {
        external_id: `case_miniapp_${user.id}_diagnostic`,
        company_id: company.id,
        workspace_id: workspace.id,
        kind: "diagnostic_case",
        mode: "diagnostic_mode",
        summary: "Mini App diagnostic case",
        status: "active"
      },
      {
        onConflict: "external_id"
      }
    );
  }

  async getExpressProgress(activeCase) {
    if (!activeCase?.id) {
      const emptyMaturity = calculateExpressMaturity([]);
      return {
        answeredCount: emptyMaturity.answeredCount,
        totalCount: emptyMaturity.totalCount,
        percent: emptyMaturity.progressPercent
      };
    }

    const run = await this.findOne("diagnostic_runs", {
      case_id: `eq.${activeCase.id}`,
      level: "eq.express",
      order: "updated_at.desc",
      select: "*"
    });

    if (!run?.id) {
      const emptyMaturity = calculateExpressMaturity([]);
      return {
        answeredCount: emptyMaturity.answeredCount,
        totalCount: emptyMaturity.totalCount,
        percent: emptyMaturity.progressPercent
      };
    }

    const answers = await this.findMany("diagnostic_answers", {
      diagnostic_run_id: `eq.${run.id}`,
      level: "eq.express",
      subject_type: "eq.layer",
      select: "*"
    });
    const maturity = calculateExpressMaturity(answers);

    return {
      answeredCount: maturity.answeredCount,
      totalCount: maturity.totalCount,
      percent: maturity.progressPercent
    };
  }

  buildDashboardSummary({ companyProfile, activeCase, expressProgress }) {
    return {
      onboardingStatus: companyProfile?.onboarding_status || "draft",
      activeCaseId: activeCase?.id || "",
      diagnosticProgress: {
        express: expressProgress?.percent || 0,
        basic: 0,
        deep: 0
      },
      expressProgress: expressProgress || {
        answeredCount: 0,
        totalCount: 11,
        percent: 0
      },
      currentConstraint: null,
      nextStep: null,
      recommendedTools: []
    };
  }

  async bootstrap({ telegramUser }) {
    this.assertEnabled();

    const appUser = await this.resolveAppUser(telegramUser);
    let workspace = await this.resolveExistingWorkspace(appUser);

    if (!workspace) {
      workspace = await this.createWorkspace(telegramUser);
    }

    await this.ensureWorkspaceMembership({ workspace, appUser });

    const company = await this.resolveCompany({ workspace, user: telegramUser });
    const companyProfile = await this.resolveCompanyProfile({ workspace, company });
    const activeCase = await this.resolveActiveDiagnosticCase({ workspace, company, user: telegramUser });
    const expressProgress = await this.getExpressProgress(activeCase);

    return {
      appUser,
      workspace,
      company,
      companyProfile,
      activeCase,
      onboardingStatus: companyProfile?.onboarding_status || "draft",
      dashboardSummary: this.buildDashboardSummary({ companyProfile, activeCase, expressProgress })
    };
  }
}
