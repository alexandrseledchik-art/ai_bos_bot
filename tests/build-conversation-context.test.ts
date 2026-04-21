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

  assert.equal(context.recentMessages.length, 1);
  assert.equal(context.recentArtifacts.length, 1);
  assert.equal(context.latestSnapshot, null);
});
