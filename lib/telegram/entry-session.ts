import { buildEntryOfferSessionState } from "@/lib/entry/offer-session-state";
import { upsertEntrySession } from "@/lib/entry/session-state";

export async function markEntryOfferShown(telegramUserId: number) {
  return upsertEntrySession(buildEntryOfferSessionState(telegramUserId));
}
