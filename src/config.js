import fs from "node:fs";
import path from "node:path";

let envLoaded = false;

function stripQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function loadEnvFile(cwd) {
  if (envLoaded) {
    return;
  }

  const filePath = path.join(cwd, ".env");
  if (!fs.existsSync(filePath)) {
    envLoaded = true;
    return;
  }

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const equalsIndex = line.indexOf("=");
    if (equalsIndex === -1) {
      continue;
    }

    const key = line.slice(0, equalsIndex).trim();
    const value = stripQuotes(line.slice(equalsIndex + 1).trim());

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }

  envLoaded = true;
}

function resolveDataRoot(cwd) {
  const configuredRoot = process.env.DATA_ROOT || "";
  if (configuredRoot) {
    return path.isAbsolute(configuredRoot) ? configuredRoot : path.join(cwd, configuredRoot);
  }

  const isServerlessRuntime = Boolean(
    process.env.VERCEL || process.env.LAMBDA_TASK_ROOT || process.env.AWS_EXECUTION_ENV
  );

  if (isServerlessRuntime) {
    return path.join(process.env.TMPDIR || "/tmp", "aibosbot");
  }

  return path.join(cwd, "data");
}

export function loadConfig() {
  const cwd = process.cwd();
  loadEnvFile(cwd);
  const dataRoot = resolveDataRoot(cwd);

  return {
    dataRoot,
    dataFilePath: path.join(dataRoot, "state.json"),
    artifactDir: path.join(dataRoot, "artifacts"),
    telegramToken: process.env.TELEGRAM_BOT_TOKEN || "",
    telegramWebhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET || "",
    telegramApiBaseUrl: process.env.TELEGRAM_API_BASE_URL || "https://api.telegram.org",
    appBaseUrl: process.env.APP_BASE_URL || "",
    openaiApiKey: process.env.OPENAI_API_KEY || "",
    openaiBaseUrl: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
    reasoningModel: process.env.OPENAI_REASONING_MODEL || "gpt-5.4-mini",
    reasoningEffort: process.env.OPENAI_REASONING_EFFORT || "medium",
    pollingTimeoutSeconds: Number(process.env.TELEGRAM_POLLING_TIMEOUT_SECONDS || 20),
    screenTimeoutMs: Number(process.env.SCREEN_TIMEOUT_MS || 6000),
    maxHistoryMessages: Number(process.env.MAX_HISTORY_MESSAGES || 12),
    memoryBackend: process.env.MEMORY_BACKEND || "file",
    supabaseUrl: process.env.SUPABASE_URL || "",
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
    supabaseSyncTransport: process.env.SUPABASE_SYNC_TRANSPORT || "auto",
    enableSupabaseSync: (process.env.MEMORY_BACKEND || "file") === "supabase"
  };
}
