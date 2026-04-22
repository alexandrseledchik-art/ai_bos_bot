import { getMemoryDb, newId, nowIso } from "@/lib/persistence/memory-store";
import { getSupabaseAdminClient } from "@/lib/persistence/supabase-client";
import type {
  ArtifactRecord,
  CaseRecord,
  CaseSnapshotRecord,
  ConversationRecord,
  MessageRecord,
  PromptTraceRecord,
  UserRecord,
} from "@/types/entities";

type JsonMap = Record<string, unknown>;

function useSupabasePersistence() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function toRecord(value: unknown): JsonMap {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as JsonMap;
  }

  return {};
}

function mapUserRow(row: Record<string, unknown>): UserRecord {
  return {
    id: String(row.id),
    telegramUserId: Number(row.telegram_user_id),
    username: row.username ? String(row.username) : null,
    firstName: row.first_name ? String(row.first_name) : null,
    lastName: row.last_name ? String(row.last_name) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapConversationRow(row: Record<string, unknown>): ConversationRecord {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    telegramChatId: Number(row.telegram_chat_id),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    lastMessageAt: String(row.last_message_at),
  };
}

function mapMessageRow(row: Record<string, unknown>): MessageRecord {
  return {
    id: String(row.id),
    conversationId: String(row.conversation_id),
    role: row.role as MessageRecord["role"],
    messageType: row.message_type as MessageRecord["messageType"],
    rawText: typeof row.raw_text === "string" ? row.raw_text : null,
    normalizedText: typeof row.normalized_text === "string" ? row.normalized_text : null,
    telegramMessageId: typeof row.telegram_message_id === "number" ? row.telegram_message_id : null,
    metadataJson: toRecord(row.metadata_json),
    createdAt: String(row.created_at),
  };
}

function mapArtifactRow(row: Record<string, unknown>): ArtifactRecord {
  return {
    id: String(row.id),
    conversationId: String(row.conversation_id),
    messageId: typeof row.message_id === "string" ? row.message_id : null,
    artifactType: row.artifact_type as ArtifactRecord["artifactType"],
    contentJson: toRecord(row.content_json),
    sourceUrl: typeof row.source_url === "string" ? row.source_url : null,
    storagePath: typeof row.storage_path === "string" ? row.storage_path : null,
    createdAt: String(row.created_at),
  };
}

function mapCaseRow(row: Record<string, unknown>): CaseRecord {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    conversationId: String(row.conversation_id),
    title: typeof row.title === "string" ? row.title : null,
    status: row.status as CaseRecord["status"],
    latestSnapshotId: typeof row.latest_snapshot_id === "string" ? row.latest_snapshot_id : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapCaseSnapshotRow(row: Record<string, unknown>): CaseSnapshotRecord {
  return {
    id: String(row.id),
    caseId: String(row.case_id),
    action: row.action as CaseSnapshotRecord["action"],
    confidence: row.confidence as CaseSnapshotRecord["confidence"],
    routerReason: String(row.router_reason),
    replyText: String(row.reply_text),
    structuredOutputJson: toRecord(row.structured_output_json),
    createdAt: String(row.created_at),
  };
}

function mapPromptTraceRow(row: Record<string, unknown>): PromptTraceRecord {
  return {
    id: String(row.id),
    conversationId: String(row.conversation_id),
    caseId: typeof row.case_id === "string" ? row.case_id : null,
    stage: row.stage as PromptTraceRecord["stage"],
    promptVersion: String(row.prompt_version),
    inputJson: toRecord(row.input_json),
    outputJson: toRecord(row.output_json),
    validationStatus: row.validation_status as PromptTraceRecord["validationStatus"],
    createdAt: String(row.created_at),
  };
}

async function getOrCreateUserMemory(params: {
  telegramUserId: number;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}) {
  const db = getMemoryDb();
  let user = db.users.find((item) => item.telegramUserId === params.telegramUserId);

  if (!user) {
    user = {
      id: newId(),
      telegramUserId: params.telegramUserId,
      username: params.username ?? null,
      firstName: params.firstName ?? null,
      lastName: params.lastName ?? null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    } satisfies UserRecord;
    db.users.push(user);
  }

  return user;
}

async function getOrCreateConversationMemory(params: { userId: string; telegramChatId: number }) {
  const db = getMemoryDb();
  let conversation = db.conversations.find(
    (item) => item.userId === params.userId && item.telegramChatId === params.telegramChatId,
  );

  if (!conversation) {
    conversation = {
      id: newId(),
      userId: params.userId,
      telegramChatId: params.telegramChatId,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      lastMessageAt: nowIso(),
    } satisfies ConversationRecord;
    db.conversations.push(conversation);
  }

  return conversation;
}

async function addMessageMemory(params: Omit<MessageRecord, "id" | "createdAt">) {
  const db = getMemoryDb();
  const message = {
    ...params,
    id: newId(),
    createdAt: nowIso(),
  } satisfies MessageRecord;
  db.messages.push(message);

  const conversation = db.conversations.find((item) => item.id === params.conversationId);
  if (conversation) {
    conversation.updatedAt = nowIso();
    conversation.lastMessageAt = nowIso();
  }

  return message;
}

async function addArtifactMemory(params: Omit<ArtifactRecord, "id" | "createdAt">) {
  const db = getMemoryDb();
  const artifact = {
    ...params,
    id: newId(),
    createdAt: nowIso(),
  } satisfies ArtifactRecord;
  db.artifacts.push(artifact);
  return artifact;
}

async function getOrCreateOpenCaseMemory(params: {
  userId: string;
  conversationId: string;
  title?: string | null;
}) {
  const db = getMemoryDb();
  let record = db.cases.find(
    (item) =>
      item.userId === params.userId &&
      item.conversationId === params.conversationId &&
      item.status === "open",
  );

  if (!record) {
    record = {
      id: newId(),
      userId: params.userId,
      conversationId: params.conversationId,
      title: params.title ?? null,
      status: "open",
      latestSnapshotId: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    } satisfies CaseRecord;
    db.cases.push(record);
  } else if (!record.title && params.title) {
    record.title = params.title;
    record.updatedAt = nowIso();
  }

  return record;
}

async function addCaseSnapshotMemory(params: Omit<CaseSnapshotRecord, "id" | "createdAt">) {
  const db = getMemoryDb();
  const snapshot = {
    ...params,
    id: newId(),
    createdAt: nowIso(),
  } satisfies CaseSnapshotRecord;
  db.caseSnapshots.push(snapshot);

  const caseRecord = db.cases.find((item) => item.id === params.caseId);
  if (caseRecord) {
    caseRecord.latestSnapshotId = snapshot.id;
    caseRecord.updatedAt = nowIso();
  }

  return snapshot;
}

async function addPromptTraceMemory(params: Omit<PromptTraceRecord, "id" | "createdAt">) {
  const db = getMemoryDb();
  const trace = {
    ...params,
    id: newId(),
    createdAt: nowIso(),
  } satisfies PromptTraceRecord;
  db.promptTraces.push(trace);
  return trace;
}

export async function getOrCreateUser(params: {
  telegramUserId: number;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}) {
  if (!useSupabasePersistence()) {
    return getOrCreateUserMemory(params);
  }

  const supabase = getSupabaseAdminClient();
  const { data: existing, error: selectError } = await supabase
    .from("users")
    .select("*")
    .eq("telegram_user_id", params.telegramUserId)
    .maybeSingle();

  if (selectError) {
    throw new Error(`Failed to load user from Supabase: ${selectError.message}`);
  }

  if (existing) {
    const nextFields = {
      username: params.username ?? existing.username ?? null,
      first_name: params.firstName ?? existing.first_name ?? null,
      last_name: params.lastName ?? existing.last_name ?? null,
      updated_at: nowIso(),
    };

    const changed =
      nextFields.username !== existing.username ||
      nextFields.first_name !== existing.first_name ||
      nextFields.last_name !== existing.last_name;

    if (changed) {
      const { data: updated, error: updateError } = await supabase
        .from("users")
        .update(nextFields)
        .eq("id", existing.id)
        .select("*")
        .single();

      if (updateError) {
        throw new Error(`Failed to update user in Supabase: ${updateError.message}`);
      }

      return mapUserRow(updated);
    }

    return mapUserRow(existing);
  }

  const { data: inserted, error: insertError } = await supabase
    .from("users")
    .insert({
      telegram_user_id: params.telegramUserId,
      username: params.username ?? null,
      first_name: params.firstName ?? null,
      last_name: params.lastName ?? null,
    })
    .select("*")
    .single();

  if (insertError) {
    throw new Error(`Failed to create user in Supabase: ${insertError.message}`);
  }

  return mapUserRow(inserted);
}

export async function getOrCreateConversation(params: {
  userId: string;
  telegramChatId: number;
}) {
  if (!useSupabasePersistence()) {
    return getOrCreateConversationMemory(params);
  }

  const supabase = getSupabaseAdminClient();
  const { data: existing, error: selectError } = await supabase
    .from("conversations")
    .select("*")
    .eq("user_id", params.userId)
    .eq("telegram_chat_id", params.telegramChatId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (selectError) {
    throw new Error(`Failed to load conversation from Supabase: ${selectError.message}`);
  }

  if (existing) {
    return mapConversationRow(existing);
  }

  const { data: inserted, error: insertError } = await supabase
    .from("conversations")
    .insert({
      user_id: params.userId,
      telegram_chat_id: params.telegramChatId,
    })
    .select("*")
    .single();

  if (insertError) {
    throw new Error(`Failed to create conversation in Supabase: ${insertError.message}`);
  }

  return mapConversationRow(inserted);
}

export async function addMessage(params: Omit<MessageRecord, "id" | "createdAt">) {
  if (!useSupabasePersistence()) {
    return addMessageMemory(params);
  }

  const supabase = getSupabaseAdminClient();
  const { data: inserted, error: insertError } = await supabase
    .from("messages")
    .insert({
      conversation_id: params.conversationId,
      role: params.role,
      message_type: params.messageType,
      raw_text: params.rawText,
      normalized_text: params.normalizedText,
      telegram_message_id: params.telegramMessageId,
      metadata_json: params.metadataJson,
    })
    .select("*")
    .single();

  if (insertError) {
    throw new Error(`Failed to store message in Supabase: ${insertError.message}`);
  }

  const timestamp = nowIso();
  const { error: conversationError } = await supabase
    .from("conversations")
    .update({
      updated_at: timestamp,
      last_message_at: timestamp,
    })
    .eq("id", params.conversationId);

  if (conversationError) {
    throw new Error(`Failed to update conversation in Supabase: ${conversationError.message}`);
  }

  return mapMessageRow(inserted);
}

export async function addArtifact(params: Omit<ArtifactRecord, "id" | "createdAt">) {
  if (!useSupabasePersistence()) {
    return addArtifactMemory(params);
  }

  const supabase = getSupabaseAdminClient();
  const { data: inserted, error: insertError } = await supabase
    .from("artifacts")
    .insert({
      conversation_id: params.conversationId,
      message_id: params.messageId,
      artifact_type: params.artifactType,
      content_json: params.contentJson,
      source_url: params.sourceUrl,
      storage_path: params.storagePath,
    })
    .select("*")
    .single();

  if (insertError) {
    throw new Error(`Failed to store artifact in Supabase: ${insertError.message}`);
  }

  return mapArtifactRow(inserted);
}

export async function getOrCreateOpenCase(params: {
  userId: string;
  conversationId: string;
  title?: string | null;
}) {
  if (!useSupabasePersistence()) {
    return getOrCreateOpenCaseMemory(params);
  }

  const supabase = getSupabaseAdminClient();
  const { data: existing, error: selectError } = await supabase
    .from("cases")
    .select("*")
    .eq("user_id", params.userId)
    .eq("conversation_id", params.conversationId)
    .eq("status", "open")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (selectError) {
    throw new Error(`Failed to load case from Supabase: ${selectError.message}`);
  }

  if (existing) {
    if (!existing.title && params.title) {
      const { data: updated, error: updateError } = await supabase
        .from("cases")
        .update({
          title: params.title,
          updated_at: nowIso(),
        })
        .eq("id", existing.id)
        .select("*")
        .single();

      if (updateError) {
        throw new Error(`Failed to update case in Supabase: ${updateError.message}`);
      }

      return mapCaseRow(updated);
    }

    return mapCaseRow(existing);
  }

  const { data: inserted, error: insertError } = await supabase
    .from("cases")
    .insert({
      user_id: params.userId,
      conversation_id: params.conversationId,
      title: params.title ?? null,
      status: "open",
      latest_snapshot_id: null,
    })
    .select("*")
    .single();

  if (insertError) {
    throw new Error(`Failed to create case in Supabase: ${insertError.message}`);
  }

  return mapCaseRow(inserted);
}

export async function addCaseSnapshot(params: Omit<CaseSnapshotRecord, "id" | "createdAt">) {
  if (!useSupabasePersistence()) {
    return addCaseSnapshotMemory(params);
  }

  const supabase = getSupabaseAdminClient();
  const { data: inserted, error: insertError } = await supabase
    .from("case_snapshots")
    .insert({
      case_id: params.caseId,
      action: params.action,
      confidence: params.confidence,
      router_reason: params.routerReason,
      reply_text: params.replyText,
      structured_output_json: params.structuredOutputJson,
    })
    .select("*")
    .single();

  if (insertError) {
    throw new Error(`Failed to store case snapshot in Supabase: ${insertError.message}`);
  }

  const { error: caseError } = await supabase
    .from("cases")
    .update({
      latest_snapshot_id: inserted.id,
      updated_at: nowIso(),
    })
    .eq("id", params.caseId);

  if (caseError) {
    throw new Error(`Failed to update case latest snapshot in Supabase: ${caseError.message}`);
  }

  return mapCaseSnapshotRow(inserted);
}

export async function addPromptTrace(params: Omit<PromptTraceRecord, "id" | "createdAt">) {
  if (!useSupabasePersistence()) {
    return addPromptTraceMemory(params);
  }

  const supabase = getSupabaseAdminClient();
  const { data: inserted, error: insertError } = await supabase
    .from("prompt_traces")
    .insert({
      conversation_id: params.conversationId,
      case_id: params.caseId,
      stage: params.stage,
      prompt_version: params.promptVersion,
      input_json: params.inputJson,
      output_json: params.outputJson,
      validation_status: params.validationStatus,
    })
    .select("*")
    .single();

  if (insertError) {
    throw new Error(`Failed to store prompt trace in Supabase: ${insertError.message}`);
  }

  return mapPromptTraceRow(inserted);
}

export async function listCaseSnapshots() {
  if (!useSupabasePersistence()) {
    return getMemoryDb().caseSnapshots.slice().reverse();
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("case_snapshots")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to list case snapshots from Supabase: ${error.message}`);
  }

  return (data ?? []).map((row) => mapCaseSnapshotRow(row));
}

export async function getCaseById(id: string) {
  if (!useSupabasePersistence()) {
    return getMemoryDb().cases.find((item) => item.id === id) ?? null;
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.from("cases").select("*").eq("id", id).maybeSingle();

  if (error) {
    throw new Error(`Failed to load case from Supabase: ${error.message}`);
  }

  return data ? mapCaseRow(data) : null;
}

export async function getCaseSnapshotById(id: string) {
  if (!useSupabasePersistence()) {
    return getMemoryDb().caseSnapshots.find((item) => item.id === id) ?? null;
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("case_snapshots")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load case snapshot from Supabase: ${error.message}`);
  }

  return data ? mapCaseSnapshotRow(data) : null;
}

export async function getConversationMessages(conversationId: string) {
  if (!useSupabasePersistence()) {
    return getMemoryDb().messages.filter((item) => item.conversationId === conversationId);
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to load messages from Supabase: ${error.message}`);
  }

  return (data ?? []).map((row) => mapMessageRow(row));
}

export async function getConversationArtifacts(conversationId: string) {
  if (!useSupabasePersistence()) {
    return getMemoryDb().artifacts.filter((item) => item.conversationId === conversationId);
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("artifacts")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to load artifacts from Supabase: ${error.message}`);
  }

  return (data ?? []).map((row) => mapArtifactRow(row));
}

export async function getLatestSnapshotForConversation(conversationId: string) {
  if (!useSupabasePersistence()) {
    const db = getMemoryDb();
    const caseRecord = db.cases.find((item) => item.conversationId === conversationId);
    if (!caseRecord?.latestSnapshotId) {
      return null;
    }

    return db.caseSnapshots.find((item) => item.id === caseRecord.latestSnapshotId) ?? null;
  }

  const supabase = getSupabaseAdminClient();
  const { data: cases, error: caseError } = await supabase
    .from("cases")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("updated_at", { ascending: false })
    .limit(1);

  if (caseError) {
    throw new Error(`Failed to load latest case from Supabase: ${caseError.message}`);
  }

  const caseRow = cases?.[0];
  if (!caseRow?.latest_snapshot_id) {
    return null;
  }

  const { data: snapshot, error: snapshotError } = await supabase
    .from("case_snapshots")
    .select("*")
    .eq("id", caseRow.latest_snapshot_id)
    .maybeSingle();

  if (snapshotError) {
    throw new Error(`Failed to load latest snapshot from Supabase: ${snapshotError.message}`);
  }

  return snapshot ? mapCaseSnapshotRow(snapshot) : null;
}
