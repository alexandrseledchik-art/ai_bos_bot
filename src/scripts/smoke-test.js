import path from "node:path";
import fs from "node:fs/promises";

import { ConversationService } from "../application/conversation-service.js";
import { ReasoningClient } from "../infrastructure/openai/reasoning-client.js";
import { FileMemoryStore } from "../infrastructure/storage/file-store.js";
import { extractTelegramMessagePayload } from "../infrastructure/telegram/telegram-api.js";
import { buildVoiceCapabilityReply, isVoiceCapabilityQuestion } from "../infrastructure/telegram/telegram-meta.js";

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

  if (!isVoiceCapabilityQuestion("Ты голосовые принимаешь?")) {
    throw new Error("Voice capability question should be detected.");
  }

  if (!/Да, принимаю/i.test(buildVoiceCapabilityReply({ voiceEnabled: true }))) {
    throw new Error("Voice capability positive reply should be available.");
  }

  const cwd = process.cwd();
  const filePath = path.join(cwd, "data", "smoke-state.json");
  const artifactDir = path.join(cwd, "data", "artifacts");
  await fs.rm(filePath, { force: true });
  await fs.rm(artifactDir, { recursive: true, force: true });

  const store = new FileMemoryStore({
    filePath,
    artifactDir
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
    "Мне нужен RACI для ролей",
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
    console.log(`ENTRY MODE: ${result.classification.entryMode}`);
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
