import { loadConfig } from "../config.js";

function parseArgs(argv) {
  const [command = "help", ...rest] = argv;
  const options = {};

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith("--")) {
      continue;
    }

    const key = token.slice(2);
    const next = rest[index + 1];
    if (!next || next.startsWith("--")) {
      options[key] = "true";
      continue;
    }

    options[key] = next;
    index += 1;
  }

  return { command, options };
}

function printUsage() {
  console.log(`
Usage:
  node src/scripts/workspace-membership.js list
  node src/scripts/workspace-membership.js grant --user-id <uuid> --workspace-id <uuid> [--role owner|member]
  node src/scripts/workspace-membership.js grant --user-id <uuid> --workspace-slug <slug> [--role owner|member]
`);
}

async function supabaseFetch(config, path, init = {}) {
  const response = await fetch(`${config.supabaseUrl}${path}`, {
    ...init,
    headers: {
      apikey: config.supabaseServiceRoleKey,
      Authorization: `Bearer ${config.supabaseServiceRoleKey}`,
      "Content-Type": "application/json",
      ...(init.headers || {})
    }
  });

  if (!response.ok) {
    throw new Error(`Supabase ${init.method || "GET"} ${path} failed: ${response.status} ${await response.text()}`);
  }

  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function listWorkspaces(config) {
  const rows = await supabaseFetch(
    config,
    "/rest/v1/workspaces?select=id,name,slug,created_at&order=created_at.desc"
  );

  console.log(JSON.stringify(rows, null, 2));
}

async function resolveWorkspaceId(config, options) {
  if (options["workspace-id"]) {
    return options["workspace-id"];
  }

  const slug = options["workspace-slug"];
  if (!slug) {
    throw new Error("Pass --workspace-id or --workspace-slug.");
  }

  const rows = await supabaseFetch(
    config,
    `/rest/v1/workspaces?select=id,name,slug&slug=eq.${encodeURIComponent(slug)}&limit=1`
  );

  if (!rows || rows.length === 0) {
    throw new Error(`Workspace with slug "${slug}" not found.`);
  }

  return rows[0].id;
}

async function grantMembership(config, options) {
  const userId = options["user-id"];
  if (!userId) {
    throw new Error("Pass --user-id <uuid>.");
  }

  const workspaceId = await resolveWorkspaceId(config, options);
  const role = options.role === "owner" ? "owner" : "member";

  const rows = await supabaseFetch(
    config,
    "/rest/v1/workspace_members?on_conflict=workspace_id,user_id",
    {
      method: "POST",
      headers: {
        Prefer: "resolution=merge-duplicates,return=representation"
      },
      body: JSON.stringify([
        {
          workspace_id: workspaceId,
          user_id: userId,
          role
        }
      ])
    }
  );

  console.log(JSON.stringify(rows, null, 2));
}

async function main() {
  const config = loadConfig();
  if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }

  const { command, options } = parseArgs(process.argv.slice(2));

  if (command === "list") {
    await listWorkspaces(config);
    return;
  }

  if (command === "grant") {
    await grantMembership(config, options);
    return;
  }

  printUsage();
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
