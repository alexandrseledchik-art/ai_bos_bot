import path from "node:path";

import { ConversationService } from "../application/conversation-service.js";
import { ReasoningClient } from "../infrastructure/openai/reasoning-client.js";
import { FileMemoryStore } from "../infrastructure/storage/file-store.js";
import { extractTelegramMessagePayload } from "../infrastructure/telegram/telegram-api.js";

class StubWebsiteScreener {
  async screen(url) {
    return {
      url,
      knownFacts: [
        `URL: ${url}`,
        'Title: ACME Growth Studio',
        'H1: Growth system for B2B founders',
        'Meta description: Increase pipeline clarity and turn traffic into qualified demos.'
      ],
      observations: [
        'Первый экран обещает рост через системный подход.',
        'Есть явный CTA: Book demo.'
      ],
      canNotAssert: [
        "Нельзя по сайту доказать, где именно ломается экономика бизнеса."
      ],
      raw: {
        title: "ACME Growth Studio",
        headings: ["Growth system for B2B founders"],
        description: "Increase pipeline clarity and turn traffic into qualified demos.",
        ctas: ["Book demo"],
        siteType: "B2B-сервис или SaaS"
      }
    };
  }
}

async function run() {
  const voicePayload = extractTelegramMessagePayload({
    message: {
      chat: { id: 42 },
      from: { username: "voice_user", first_name: "Voice" },
      voice: {
        file_id: "voice-file-id",
        mime_type: "audio/ogg",
        duration: 7
      }
    }
  });

  if (!voicePayload || voicePayload.kind !== "voice") {
    throw new Error("Voice payload should be extracted instead of ignored.");
  }

  const cwd = process.cwd();
  const store = new FileMemoryStore({
    filePath: path.join(cwd, "data", "smoke-state.json"),
    artifactDir: path.join(cwd, "data", "artifacts")
  });
  const reasoner = new ReasoningClient({
    apiKey: "",
    baseUrl: "",
    model: "",
    reasoningEffort: "medium"
  });
  const service = new ConversationService({
    store,
    reasoner,
    screener: new StubWebsiteScreener(),
    maxHistoryMessages: 8
  });

  const inputs = [
    "Хочу разобрать бизнес",
    "Выручка есть, а прибыль почти не остаётся. Маржа упала с 22% до 11% за 3 месяца.",
    "https://acme.example"
  ];

  for (const input of inputs) {
    const result = await service.handleUserMessage({
      telegramChatId: "smoke-owner",
      text: input,
      userMeta: {
        username: "smoke_owner"
      }
    });

    console.log("\n==============================");
    console.log(`INPUT: ${input}`);
    console.log(`ROUTE: ${result.classification.type}`);
    console.log(`MODE: ${result.decision.selectedMode}`);
    console.log(`ACTION: ${result.decision.decision.action}`);
    console.log("\nREPLY:\n");
    console.log(result.reply);

    if (result.artifactPath) {
      console.log(`\nARTIFACT: ${result.artifactPath}`);
    }
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
