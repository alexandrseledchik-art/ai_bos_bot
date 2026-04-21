import type { InternalEntrySessionState } from "@/types/domain";

const memory = new Map<number, InternalEntrySessionState>();

export async function getEntrySessionByTelegramUserId(telegramUserId: number) {
  return memory.get(telegramUserId) ?? null;
}

export async function upsertEntrySession(state: InternalEntrySessionState) {
  memory.set(state.telegramUserId, state);
  return state;
}
