import "server-only";

import { buildToolDeepLink } from "@/lib/entry/deeplink";
import {
  POST_WEBSITE_SCREENING_REQUEST_KEY,
  POST_WEBSITE_SCREENING_REQUEST_TEXT,
} from "@/lib/entry/constants";
import { runCoreEntryConsultant } from "@/lib/entry/core-consultant";
import { persistTelegramDiagnosticCase } from "@/lib/telegram/diagnostic-case";
import { persistTelegramWebsiteScreening } from "@/lib/website/website-screening";
import {
  getEntrySessionByTelegramUserId,
  upsertEntrySession,
} from "@/lib/entry/session-state";
import { buildWorkingText } from "@/lib/entry/working-text";
import type { TelegramEntryResponse } from "@/types/api";
import type { EntryRoutingDecision, InternalEntrySessionState, TelegramEntryReply } from "@/types/domain";

function shouldContinueSession(session: InternalEntrySessionState | null) {
  if (!session || session.stage !== "clarifying") {
    return false;
  }

  const ageMs = Date.now() - new Date(session.updatedAt).getTime();
  return ageMs <= 1000 * 60 * 60 * 24;
}

function mapCoreModeToDecision(params: {
  action: "capability" | "website_screening" | "tool_navigation" | "ask_question" | "diagnostic_result";
  rationale: string;
  question?: string | null;
  toolSlug?: string | null;
  toolTitle?: string | null;
}): EntryRoutingDecision {
  if (params.action === "website_screening") {
    return { action: "route_to_website_screening", reason: params.rationale };
  }

  if (params.action === "diagnostic_result") {
    return { action: "route_to_diagnosis", reason: params.rationale };
  }

  if (params.action === "tool_navigation" && params.toolSlug && params.toolTitle) {
    return {
      action: "route_to_tool",
      reason: params.rationale,
      toolSuggestion: {
        slug: params.toolSlug,
        title: params.toolTitle,
        url: buildToolDeepLink(params.toolSlug),
      },
    };
  }

  return {
    action: "ask_question",
    reason: params.rationale,
    nextQuestion: params.question
      ? {
          key: "core_consultant_question",
          text: params.question,
        }
      : undefined,
  };
}

export async function handleTelegramEntry(params: {
  telegramUserId: number;
  telegramUsername?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  text: string;
}): Promise<TelegramEntryResponse> {
  const text = params.text.trim();
  const existingSession = await getEntrySessionByTelegramUserId(params.telegramUserId);
  const continueSession = shouldContinueSession(existingSession);
  const workingText = buildWorkingText(continueSession ? existingSession : null, text);

  const coreDecision = await runCoreEntryConsultant({
    rawText: workingText,
    session: continueSession ? existingSession : null,
  });

  const normalizedDecision = mapCoreModeToDecision({
    action: coreDecision.action,
    rationale: coreDecision.rationale,
    question: coreDecision.question,
    toolSlug: coreDecision.toolSlug,
    toolTitle: coreDecision.toolTitle,
  });

  const clarifyingAnswers =
    continueSession && existingSession && existingSession.lastQuestionKey && existingSession.lastQuestionText
      ? [
          ...existingSession.clarifyingAnswers,
          {
            questionKey: existingSession.lastQuestionKey,
            questionText: existingSession.lastQuestionText,
            answerText: text,
          },
        ]
      : [];

  const isWebsiteScreening = normalizedDecision.action === "route_to_website_screening";
  const isCapabilityDecision = coreDecision.action === "capability";
  const nextQuestion =
    normalizedDecision.action === "ask_question" ? normalizedDecision.nextQuestion : undefined;

  const persistedSession = await upsertEntrySession({
    telegramUserId: params.telegramUserId,
    stage:
      isCapabilityDecision
        ? "ready_for_routing"
        : isWebsiteScreening || normalizedDecision.action === "ask_question"
          ? "clarifying"
          : "ready_for_routing",
    initialMessage: continueSession && existingSession ? existingSession.initialMessage : text,
    clarifyingAnswers,
    turnCount: continueSession && existingSession ? existingSession.turnCount + 1 : 1,
    createdAt: existingSession?.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastQuestionKey:
      isWebsiteScreening ? POST_WEBSITE_SCREENING_REQUEST_KEY : nextQuestion?.key ?? null,
    lastQuestionText:
      isWebsiteScreening ? POST_WEBSITE_SCREENING_REQUEST_TEXT : nextQuestion?.text ?? null,
  });

  let reply: TelegramEntryReply = {
    text: coreDecision.replyText,
    stage:
      normalizedDecision.action === "ask_question" || isWebsiteScreening
        ? "clarifying"
        : "ready_for_routing",
  };

  if (normalizedDecision.action === "route_to_website_screening") {
    if (!coreDecision.websiteScreening) {
      throw new Error("website_screening selected without payload");
    }

    reply = await persistTelegramWebsiteScreening({
      telegramUserId: params.telegramUserId,
      telegramUsername: params.telegramUsername,
      firstName: params.firstName,
      lastName: params.lastName,
      rawText: workingText,
      result: coreDecision.websiteScreening,
      replyText: coreDecision.replyText,
    });
  } else if (normalizedDecision.action === "route_to_tool" && normalizedDecision.toolSuggestion) {
    reply = {
      text: coreDecision.replyText,
      stage: "ready_for_routing",
      cta: {
        label: "Открыть инструмент",
        url: normalizedDecision.toolSuggestion.url,
      },
    };
  } else if (normalizedDecision.action === "route_to_diagnosis") {
    if (!coreDecision.diagnosticResult) {
      throw new Error("diagnostic_result selected without payload");
    }

    reply = await persistTelegramDiagnosticCase({
      telegramUserId: params.telegramUserId,
      telegramUsername: params.telegramUsername,
      firstName: params.firstName,
      lastName: params.lastName,
      workingText,
      session: persistedSession,
      result: coreDecision.diagnosticResult,
      replyText: coreDecision.replyText,
    });
  }

  return {
    reply,
    session: persistedSession,
    decision: normalizedDecision,
  };
}
