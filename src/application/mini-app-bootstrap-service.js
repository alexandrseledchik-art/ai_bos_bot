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

  async resolveAppUser(user) {
    return this.upsertOne(
      "app_users",
      {
        telegram_user_id: user.id,
        username: user.username || null,
        first_name: user.firstName || null,
        last_name: user.lastName || null,
        language_code: user.languageCode || null
      },
      {
        onConflict: "telegram_user_id"
      }
    );
  }

  async resolveExistingWorkspace(appUser) {
    const membership = await this.findOne("workspace_app_members", {
      app_user_id: `eq.${appUser.id}`,
      select: "workspace_id,role"
    });

    if (!membership?.workspace_id) {
      const existingCompany = await this.findOne("companies", {
        telegram_chat_id: `eq.${appUser.telegram_user_id}`,
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

    return this.findOne("workspaces", {
      id: `eq.${membership.workspace_id}`,
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
    return this.upsertOne(
      "workspace_app_members",
      {
        workspace_id: workspace.id,
        app_user_id: appUser.id,
        role: "owner"
      },
      {
        onConflict: "workspace_id,app_user_id"
      }
    );
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

  buildDashboardSummary({ companyProfile, activeCase }) {
    return {
      onboardingStatus: companyProfile?.onboarding_status || "draft",
      activeCaseId: activeCase?.id || "",
      diagnosticProgress: {
        express: 0,
        basic: 0,
        deep: 0
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

    return {
      appUser,
      workspace,
      company,
      companyProfile,
      activeCase,
      onboardingStatus: companyProfile?.onboarding_status || "draft",
      dashboardSummary: this.buildDashboardSummary({ companyProfile, activeCase })
    };
  }
}
