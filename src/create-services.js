import { ConversationService } from "./application/conversation-service.js";
import { loadConfig } from "./config.js";
import { ReasoningClient } from "./infrastructure/openai/reasoning-client.js";
import { WebsiteScreener } from "./infrastructure/screening/website-screener.js";
import { createMemoryStore } from "./infrastructure/storage/create-store.js";
import { TelegramApiClient } from "./infrastructure/telegram/telegram-api.js";

let services;

export function getServices() {
  if (services) {
    return services;
  }

  const config = loadConfig();
  const store = createMemoryStore(config);
  const reasoner = new ReasoningClient({
    apiKey: config.openaiApiKey,
    baseUrl: config.openaiBaseUrl,
    model: config.reasoningModel,
    reasoningEffort: config.reasoningEffort
  });
  const screener = new WebsiteScreener({
    timeoutMs: config.screenTimeoutMs
  });

  services = {
    config,
    telegramApi: new TelegramApiClient({
      token: config.telegramToken,
      apiBaseUrl: config.telegramApiBaseUrl
    }),
    conversationService: new ConversationService({
      store,
      reasoner,
      screener,
      maxHistoryMessages: config.maxHistoryMessages
    })
  };

  return services;
}
