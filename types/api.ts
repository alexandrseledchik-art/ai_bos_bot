import type { EntryRoutingDecision, EntrySessionState, TelegramEntryReply } from "@/types/domain";

export interface TelegramEntryResponse {
  reply: TelegramEntryReply;
  session: EntrySessionState;
  decision: EntryRoutingDecision;
}
