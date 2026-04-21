import { buildDiagnosisDeepLink } from "@/lib/entry/deeplink";
import type { DiagnosticStructuredResult } from "@/lib/diagnostic-core/schema";
import type { EntrySessionState, TelegramEntryReply } from "@/types/domain";

export async function persistTelegramDiagnosticCase(params: {
  telegramUserId: number;
  telegramUsername?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  workingText: string;
  session: EntrySessionState;
  result: DiagnosticStructuredResult;
  replyText: string;
}): Promise<TelegramEntryReply> {
  if (!params.replyText.trim()) {
    throw new Error("Diagnostic replyText is required.");
  }

  return {
    text: params.replyText.trim(),
    stage: "ready_for_routing",
    cta: {
      label: "Открыть сохранённый разбор",
      url: buildDiagnosisDeepLink(),
    },
  };
}
