import type { ArtifactRecord, CaseSnapshotRecord, MessageRecord } from "@/types/entities";

export type ConversationContext = {
  recentMessages: Array<{
    role: MessageRecord["role"];
    text: string;
  }>;
  recentArtifacts: Array<{
    artifactType: ArtifactRecord["artifactType"];
    content: Record<string, unknown>;
  }>;
  latestSnapshot: {
    replyText: string;
    structuredOutputJson: Record<string, unknown>;
  } | null;
};

export function buildConversationContext(params: {
  messages: MessageRecord[];
  artifacts: ArtifactRecord[];
  latestSnapshot: CaseSnapshotRecord | null;
}) {
  return {
    recentMessages: params.messages
      .slice(-6)
      .filter((item) => item.normalizedText)
      .map((item) => ({
        role: item.role,
        text: item.normalizedText ?? "",
      })),
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
