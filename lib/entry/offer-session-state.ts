import type { EntrySessionState } from "@/types/domain";

export function buildEntryOfferSessionState(
  telegramUserId: number,
  now = new Date().toISOString(),
): EntrySessionState {
  return {
    telegramUserId,
    stage: "initial",
    initialMessage: "__entry_offer__",
    clarifyingAnswers: [],
    turnCount: 1,
    createdAt: now,
    updatedAt: now,
    lastQuestionKey: null,
    lastQuestionText: null,
  };
}
