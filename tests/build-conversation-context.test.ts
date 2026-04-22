import test from "node:test";
import assert from "node:assert/strict";

import { buildConversationContext } from "@/lib/context/build-conversation-context";

test("builds compact recent context", () => {
  const context = buildConversationContext({
    messages: [
      {
        id: "1",
        conversationId: "c1",
        role: "user",
        messageType: "text",
        rawText: "Хочу продать бизнес",
        normalizedText: "Хочу продать бизнес",
        telegramMessageId: 1,
        metadataJson: {},
        createdAt: "2026-04-21T12:00:00.000Z",
      },
      {
        id: "2",
        conversationId: "c1",
        role: "assistant",
        messageType: "text",
        rawText: "Что сейчас сильнее всего мешает продаже?",
        normalizedText: "Что сейчас сильнее всего мешает продаже?",
        telegramMessageId: null,
        metadataJson: {},
        createdAt: "2026-04-21T12:01:00.000Z",
      },
      {
        id: "3",
        conversationId: "c1",
        role: "user",
        messageType: "text",
        rawText: "В этом и хочу разобраться, данных у меня пока нет",
        normalizedText: "В этом и хочу разобраться, данных у меня пока нет",
        telegramMessageId: 2,
        metadataJson: {},
        createdAt: "2026-04-21T12:02:00.000Z",
      },
    ],
    artifacts: [
      {
        id: "a1",
        conversationId: "c1",
        messageId: "1",
        artifactType: "website_context",
        contentJson: { url: "https://example.com" },
        sourceUrl: "https://example.com",
        storagePath: null,
        createdAt: "2026-04-21T12:00:00.000Z",
      },
    ],
    latestSnapshot: null,
  });

  assert.equal(context.recentMessages.length, 3);
  assert.equal(context.recentArtifacts.length, 1);
  assert.equal(context.latestSnapshot, null);
  assert.equal(context.latestUserMessage, "В этом и хочу разобраться, данных у меня пока нет");
  assert.equal(context.latestAssistantQuestion, "Что сейчас сильнее всего мешает продаже?");
  assert.equal(
    context.userReplyToLatestAssistantQuestion,
    "В этом и хочу разобраться, данных у меня пока нет",
  );
  assert.deepEqual(context.statedGoals, ["Хочу продать бизнес"]);
  assert.equal(context.knownUnknowns.length, 1);
  assert.equal(context.frictionSignals.length, 1);
});
