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

function isServerlessRuntime() {
  return Boolean(
    process.env.VERCEL || process.env.LAMBDA_TASK_ROOT || process.env.AWS_EXECUTION_ENV
  );
}

function resolveDataRoot(cwd) {
  const configuredRoot = process.env.DATA_ROOT || "";
  if (configuredRoot) {
    return path.isAbsolute(configuredRoot) ? configuredRoot : path.join(cwd, configuredRoot);
  }

  if (isServerlessRuntime()) {
    return path.join(process.env.TMPDIR || "/tmp", "aibosbot");
  }

  return path.join(cwd, "data");
}

export function loadConfig() {
  const cwd = process.cwd();
  loadEnvFile(cwd);
  const dataRoot = resolveDataRoot(cwd);
  const serverlessRuntime = isServerlessRuntime();
  const hasSupabaseConfig = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
  const adminTelegramUserIds = (process.env.ADMIN_TELEGRAM_USER_IDS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const accessControlMode = process.env.ACCESS_CONTROL_MODE || "open";
  const accessRequestNotifyChatId = process.env.ACCESS_REQUEST_NOTIFY_CHAT_ID || "";
  const accessControlEnabled = accessControlMode === "approval" ||
    adminTelegramUserIds.length > 0 ||
    Boolean(accessRequestNotifyChatId);
  const memoryBackend = process.env.MEMORY_BACKEND ||
    (serverlessRuntime && hasSupabaseConfig ? "supabase" : "file");
  const supabaseStateMode = process.env.SUPABASE_STATE_MODE ||
    (serverlessRuntime ? "primary" : "replicated");

  return {
    dataRoot,
    dataFilePath: path.join(dataRoot, "state.json"),
    artifactDir: path.join(dataRoot, "artifacts"),
    isServerlessRuntime: serverlessRuntime,
    telegramToken: process.env.TELEGRAM_BOT_TOKEN || "",
    telegramWebhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET || "",
    telegramWebAppAuthMaxAgeSeconds: Number(process.env.TELEGRAM_WEBAPP_AUTH_MAX_AGE_SECONDS || 86400),
    webSessionSecret: process.env.WEB_SESSION_SECRET || process.env.TELEGRAM_WEBHOOK_SECRET || "",
    webLoginTtlSeconds: Number(process.env.WEB_LOGIN_TTL_SECONDS || 2592000),
    webSessionTtlSeconds: Number(process.env.WEB_SESSION_TTL_SECONDS || 2592000),
    telegramApiBaseUrl: process.env.TELEGRAM_API_BASE_URL || "https://api.telegram.org",
    accessControlEnabled,
    accessControlMode,
    adminTelegramUserIds,
    accessRequestNotifyChatId,
    adminDashboardToken: process.env.ADMIN_DASHBOARD_TOKEN || "",
    appBaseUrl: (process.env.APP_BASE_URL || "")\n      .replace(/^https:\\/\\/aibosbot\\.vercel\\.app\\/?$/i, "https://aiboss.seledchik.ru"),
    alexanderBookingUrl: process.env.ALEXANDER_BOOKING_URL || "",
    miniAppAlphaMode: process.env.MINI_APP_ALPHA_MODE === "true",
    skillOrchestratorDiagnosticEnabled: process.env.SKILL_ORCHESTRATOR_DIAGNOSTIC_ENABLED !== "false",
    openaiApiKey: process.env.OPENAI_API_KEY || "",
    openaiBaseUrl: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
    reasoningModel: process.env.OPENAI_REASONING_MODEL || "gpt-5.4-mini",
    reasoningEffort: process.env.OPENAI_REASONING_EFFORT || "medium",
    transcriptionModel: process.env.OPENAI_TRANSCRIPTION_MODEL || "gpt-4o-mini-transcribe",
    transcriptionFallbackModels: (process.env.OPENAI_TRANSCRIPTION_FALLBACK_MODELS || "whisper-1")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
    pollingTimeoutSeconds: Number(process.env.TELEGRAM_POLLING_TIMEOUT_SECONDS || 20),
    screenTimeoutMs: Number(process.env.SCREEN_TIMEOUT_MS || 6000),
    maxHistoryMessages: Number(process.env.MAX_HISTORY_MESSAGES || 12),
    googleDriveServiceAccountEmail: process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL || "",
    googleDrivePrivateKey: process.env.GOOGLE_DRIVE_PRIVATE_KEY || "",
    googleDriveFolderId: process.env.GOOGLE_DRIVE_FOLDER_ID || "",
    googleDriveMaxTextChars: Number(process.env.GOOGLE_DRIVE_MAX_TEXT_CHARS || 120000),
    toolsCatalogSpreadsheetId: process.env.TOOLS_CATALOG_SPREADSHEET_ID || "1ub9feLgp31fSygIA7qcfjGJeiwSJZXEQKWc_jbKIj7U",
    toolsCatalogGid: process.env.TOOLS_CATALOG_GID || "675359757",
    toolsCatalogCsvUrl: process.env.TOOLS_CATALOG_CSV_URL || "",
    memoryBackend,
    supabaseUrl: process.env.SUPABASE_URL || "",
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
    supabaseSyncTransport: process.env.SUPABASE_SYNC_TRANSPORT || "auto",
    supabaseStateMode,
    supabaseStateKey: process.env.SUPABASE_STATE_KEY || "project_state",
    enableSupabaseSync: memoryBackend === "supabase"
  };
}
