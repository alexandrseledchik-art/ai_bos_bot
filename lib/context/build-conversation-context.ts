import type { ArtifactRecord, CaseSnapshotRecord, MessageRecord } from "@/types/entities";

export type ConversationContext = {
  recentMessages: Array<{
    role: MessageRecord["role"];
    text: string;
  }>;
  latestUserMessage: string | null;
  latestAssistantMessage: string | null;
  latestAssistantQuestion: string | null;
  userReplyToLatestAssistantQuestion: string | null;
  statedGoals: string[];
  knownUnknowns: string[];
  frictionSignals: string[];
  recentArtifacts: Array<{
    artifactType: ArtifactRecord["artifactType"];
    content: Record<string, unknown>;
  }>;
  latestSnapshot: {
    replyText: string;
    structuredOutputJson: Record<string, unknown>;
  } | null;
};

function compactText(text: string | null | undefined) {
  return text?.trim() || null;
}

function findLatestMessage(messages: MessageRecord[], role: MessageRecord["role"]) {
  return compactText(
    [...messages].reverse().find((item) => item.role === role && item.normalizedText)?.normalizedText,
  );
}

function extractStatedGoals(messages: MessageRecord[]) {
  const goals = new Set<string>();

  for (const message of messages.filter((item) => item.role === "user")) {
    const text = compactText(message.normalizedText);
    if (!text) continue;

    const normalized = text.toLowerCase();
    if (
      normalized.startsWith("хочу ") ||
      normalized.startsWith("нужно ") ||
      normalized.startsWith("мне нужно ") ||
      normalized.startsWith("моя цель ") ||
      normalized.startsWith("цель ")
    ) {
      goals.add(text);
    }
  }

  return Array.from(goals).slice(-3);
}

function extractSignals(messages: MessageRecord[], markers: string[]) {
  const signals = new Set<string>();

  for (const message of messages.filter((item) => item.role === "user")) {
    const text = compactText(message.normalizedText);
    if (!text) continue;

    const normalized = text.toLowerCase();
    if (markers.some((marker) => normalized.includes(marker))) {
      signals.add(text);
    }
  }

  return Array.from(signals).slice(-4);
}

function findLatestAssistantQuestion(messages: MessageRecord[]) {
  return compactText(
    [...messages]
      .reverse()
      .find(
        (item) =>
          item.role === "assistant" &&
          item.normalizedText &&
          item.normalizedText.includes("?"),
      )?.normalizedText,
  );
}

function findUserReplyToLatestAssistantQuestion(
  messages: MessageRecord[],
  latestAssistantQuestion: string | null,
) {
  if (!latestAssistantQuestion) {
    return null;
  }

  const reversed = [...messages].reverse();
  const questionIndex = reversed.findIndex(
    (item) => item.role === "assistant" && item.normalizedText === latestAssistantQuestion,
  );

  if (questionIndex < 0) {
    return null;
  }

  const reply = reversed
    .slice(0, questionIndex)
    .find((item) => item.role === "user" && item.normalizedText);

  return compactText(reply?.normalizedText);
}

export function buildConversationContext(params: {
  messages: MessageRecord[];
  artifacts: ArtifactRecord[];
  latestSnapshot: CaseSnapshotRecord | null;
}) {
  const latestAssistantQuestion = findLatestAssistantQuestion(params.messages);

  return {
    recentMessages: params.messages
      .slice(-6)
      .filter((item) => item.normalizedText)
      .map((item) => ({
        role: item.role,
        text: item.normalizedText ?? "",
      })),
    latestUserMessage: findLatestMessage(params.messages, "user"),
    latestAssistantMessage: findLatestMessage(params.messages, "assistant"),
    latestAssistantQuestion,
    userReplyToLatestAssistantQuestion: findUserReplyToLatestAssistantQuestion(
      params.messages,
      latestAssistantQuestion,
    ),
    statedGoals: extractStatedGoals(params.messages),
    knownUnknowns: extractSignals(params.messages, [
      "не знаю",
      "нет данных",
      "данных нет",
      "данных у меня",
      "не выгруж",
      "не могу назвать",
      "не понимаю",
      "не уверен",
    ]),
    frictionSignals: extractSignals(params.messages, [
      "в этом и хочу разобраться",
      "за этим к тебе и приш",
      "как твои вопросы помогают",
      "можешь диагностировать",
      "не понимаю, как",
    ]),
    recentArtifacts: params.artifacts.slice(-4).map((item) => ({
      artifactType: item.artifactType,
      content: item.contentJson,
    })),
    latestSnapshot: params.latestSnapshot
      ? {
          replyText: params.latestSnapshot.replyText,
          structuredOutputJson: params.latestSnapshot.structuredOutputJson,
        }
      : null,
  } satisfies ConversationContext;
}
