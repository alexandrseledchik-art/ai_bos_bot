import { randomUUID } from "node:crypto";

import type {
  ArtifactRecord,
  CaseRecord,
  CaseSnapshotRecord,
  ConversationRecord,
  MessageRecord,
  PromptTraceRecord,
  UserRecord,
} from "@/types/entities";

type MemoryDb = {
  users: UserRecord[];
  conversations: ConversationRecord[];
  messages: MessageRecord[];
  artifacts: ArtifactRecord[];
  cases: CaseRecord[];
  caseSnapshots: CaseSnapshotRecord[];
  promptTraces: PromptTraceRecord[];
};

const db: MemoryDb = {
  users: [],
  conversations: [],
  messages: [],
  artifacts: [],
  cases: [],
  caseSnapshots: [],
  promptTraces: [],
};

export function nowIso() {
  return new Date().toISOString();
}

export function newId() {
  return randomUUID();
}

export function getMemoryDb() {
  return db;
}
