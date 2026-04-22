export type UUID = string;

export interface UserRecord {
  id: UUID;
  telegramUserId: number;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CompanyRecord {
  id: UUID;
  userId: UUID;
  name: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationRecord {
  id: UUID;
  userId: UUID;
  telegramChatId: number;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string;
}

export interface MessageRecord {
  id: UUID;
  conversationId: UUID;
  role: "user" | "assistant" | "system";
  messageType: "text" | "voice" | "audio" | "image" | "link" | "mixed" | "service";
  rawText: string | null;
  normalizedText: string | null;
  telegramMessageId: number | null;
  metadataJson: Record<string, unknown>;
  createdAt: string;
}

export interface ArtifactRecord {
  id: UUID;
  conversationId: UUID;
  messageId: UUID | null;
  artifactType: "audio_transcript" | "image_context" | "website_context" | "preliminary_screening" | "diagnostic_case" | "other";
  contentJson: Record<string, unknown>;
  sourceUrl: string | null;
  storagePath: string | null;
  createdAt: string;
}

export interface CaseRecord {
  id: UUID;
  userId: UUID;
  conversationId: UUID;
  title: string | null;
  status: "open" | "saved" | "archived";
  latestSnapshotId: UUID | null;
  createdAt: string;
  updatedAt: string;
}

export interface CaseSnapshotRecord {
  id: UUID;
  caseId: UUID;
  action: "clarify" | "screen" | "diagnose" | "answer";
  confidence: "low" | "medium" | "high";
  routerReason: string;
  replyText: string;
  structuredOutputJson: Record<string, unknown>;
  createdAt: string;
}

export interface PromptTraceRecord {
  id: UUID;
  conversationId: UUID;
  caseId: UUID | null;
  stage: "router" | "diagnostic" | "renderer";
  promptVersion: string;
  inputJson: Record<string, unknown>;
  outputJson: Record<string, unknown>;
  validationStatus: "valid" | "invalid";
  createdAt: string;
}

export interface Goal {
  text: string;
}

export interface Symptom {
  text: string;
}

export interface Hypothesis {
  text: string;
}

export interface Constraint {
  text: string;
}

export interface Situation {
  text: string;
}

export interface ActionWave {
  title: string;
  actions: string[];
}

export interface ToolRecommendationEntity {
  title: string;
  whyNow: string;
}
