import { AccessControlService } from "./application/access-control-service.js";
import { ConversationService } from "./application/conversation-service.js";
import { loadConfig } from "./config.js";
import { AudioTranscriber } from "./infrastructure/openai/audio-transcriber.js";
import { GoogleDriveClient } from "./infrastructure/google/google-drive-client.js";
import { ReasoningClient } from "./infrastructure/openai/reasoning-client.js";
import { WebsiteScreener } from "./infrastructure/screening/website-screener.js";
import { createMemoryStore } from "./infrastructure/storage/create-store.js";
import { SupabaseSyncClient } from "./infrastructure/storage/supabase-sync.js";
import { TelegramApiClient } from "./infrastructure/telegram/telegram-api.js";

let services;

export function getServices() {
  if (services) {
    return services;
  }

  const config = loadConfig();
  const store = createMemoryStore(config);
  const accessSyncClient = new SupabaseSyncClient({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey
  });
  const reasoner = new ReasoningClient({
    apiKey: config.openaiApiKey,
    baseUrl: config.openaiBaseUrl,
    model: config.reasoningModel,
    reasoningEffort: config.reasoningEffort
  });
  const audioTranscriber = new AudioTranscriber({
    apiKey: config.openaiApiKey,
    baseUrl: config.openaiBaseUrl,
    model: config.transcriptionModel,
    fallbackModels: config.transcriptionFallbackModels
  });
  const screener = new WebsiteScreener({
    timeoutMs: config.screenTimeoutMs
  });
  const googleDrive = new GoogleDriveClient({
    serviceAccountEmail: config.googleDriveServiceAccountEmail,
    privateKey: config.googleDrivePrivateKey,
    rootFolderId: config.googleDriveFolderId,
    maxTextChars: config.googleDriveMaxTextChars
  });

  services = {
    config,
    audioTranscriber,
    telegramApi: new TelegramApiClient({
      token: config.telegramToken,
      apiBaseUrl: config.telegramApiBaseUrl
    }),
    accessControl: new AccessControlService({
      syncClient: config.accessControlEnabled ? accessSyncClient : null,
      mode: config.accessControlMode,
      adminTelegramUserIds: config.adminTelegramUserIds
    }),
    conversationService: new ConversationService({
      store,
      reasoner,
      screener,
      googleDrive,
      maxHistoryMessages: config.maxHistoryMessages
    })
  };

  return services;
}
