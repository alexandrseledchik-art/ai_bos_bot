import path from "node:path";
import fs from "node:fs/promises";

import { ConversationService } from "../application/conversation-service.js";
import { ReasoningClient } from "../infrastructure/openai/reasoning-client.js";
import { FileMemoryStore } from "../infrastructure/storage/file-store.js";
import { extractTelegramMessagePayload } from "../infrastructure/telegram/telegram-api.js";
import { resolveTelegramPayloadToText } from "../infrastructure/telegram/resolve-telegram-input.js";
import {
  buildFileCapabilityReply,
  buildVoiceCapabilityReply,
  isFileCapabilityQuestion,
  isVoiceCapabilityQuestion
} from "../infrastructure/telegram/telegram-meta.js";

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

  if (!isFileCapabilityQuestion("Файлы и pdf принимаешь?")) {
    throw new Error("File capability question should be detected.");
  }

  if (!/файлы принимаю/i.test(buildFileCapabilityReply())) {
    throw new Error("File capability reply should be available.");
  }

  const documentPayload = extractTelegramMessagePayload({
    message: {
      chat: { id: 42 },
      from: { username: "file_user", first_name: "File" },
      caption: "Посмотри, что здесь важно для продаж",
      document: {
        file_id: "document-file-id",
        file_unique_id: "document-unique-id",
        file_name: "sales-notes.txt",
        mime_type: "text/plain",
        file_size: 128
      }
    }
  });

  if (!documentPayload || documentPayload.kind !== "document" || documentPayload.caption !== "Посмотри, что здесь важно для продаж") {
    throw new Error("Document payload should be extracted with caption.");
  }

  const resolvedDocument = await resolveTelegramPayloadToText({
    payload: documentPayload,
    telegramApi: {
      async getFile(fileId) {
        if (fileId !== "document-file-id") {
          throw new Error("Unexpected file id.");
        }
        return { file_path: "documents/sales-notes.txt" };
      },
      async downloadFile() {
        return Buffer.from("Лидов много, но часть заявок нецелевые и не проходят квалификацию.", "utf8");
      }
    },
    audioTranscriber: null
  });

  if (!resolvedDocument.text.includes("Содержимое файла") || !resolvedDocument.userMeta.fileContentExtracted) {
    throw new Error("Text document should be resolved into message text.");
  }

  const photoPayload = extractTelegramMessagePayload({
    message: {
      chat: { id: 42 },
      from: { username: "photo_user", first_name: "Photo" },
      caption: "Это скрин воронки",
      photo: [
        {
          file_id: "small-photo",
          width: 100,
          height: 100,
          file_size: 1000
        },
        {
          file_id: "large-photo",
          width: 1000,
          height: 1000,
          file_size: 100000
        }
      ]
    }
  });

  if (!photoPayload || photoPayload.kind !== "photo" || photoPayload.fileId !== "large-photo") {
    throw new Error("Photo payload should use the largest available Telegram photo.");
  }

  const resolvedPhoto = await resolveTelegramPayloadToText({
    payload: photoPayload,
    telegramApi: {},
    audioTranscriber: null
  });

  if (!resolvedPhoto.text.includes("Содержимое этого файла пока не извлечено автоматически")) {
    throw new Error("Unsupported photo should produce a safe file context.");
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

  await service.recordTelegramExchange({
    telegramChatId: "direct-reply",
    userText: "Файлы принимаешь?",
    assistantText: buildFileCapabilityReply(),
    userMeta: {
      username: "direct_reply_user"
    }
  });
  const directReplyState = await store.readState();
  const directReplyThread = directReplyState.threads.find((thread) => thread.telegramChatId === "direct-reply");
  const directReplyMessages = directReplyState.messages.filter((message) => message.threadId === directReplyThread?.id);
  if (!directReplyThread || directReplyMessages.length !== 2) {
    throw new Error("Direct Telegram replies should be persisted for admin analytics.");
  }

  const startResult = await service.handleUserMessage({
    telegramChatId: "new-platform-user",
    text: "/start",
    userMeta: { username: "new_platform_user", firstName: "Алексей" }
  });
  if (!/Добро пожаловать в AI-BOSS/i.test(startResult.reply) || !/На платформе доступны рабочие инструменты/i.test(startResult.reply)) {
    throw new Error("Start must welcome the user, explain AI-BOSS and point to the platform.");
  }
  if (startResult.miniAppInvite !== null || startResult.runtime?.chatFirst !== true) {
    throw new Error("Start must stay in Telegram and must not invite the user to Mini App or web cabinet.");
  }

  const smallTalk = await service.handleUserMessage({
    telegramChatId: "small-talk-user",
    text: "здарова",
    userMeta: { username: "small_talk_user", firstName: "Алексей" }
  });
  if (
    smallTalk.classification?.type !== "small_talk" ||
    smallTalk.runtime?.skillSelection?.primarySkill !== "natural_conversation"
  ) {
    throw new Error("Informal greeting must use the live natural-conversation skill.");
  }
  if (!smallTalk.reply?.trim() || /Симптом|рабочих версий|источник данных/i.test(smallTalk.reply)) {
    throw new Error("Small talk must stay conversational and must not start business diagnostics.");
  }

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
