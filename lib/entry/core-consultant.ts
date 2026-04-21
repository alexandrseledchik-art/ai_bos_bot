import { z } from "zod";

import { runDiagnosticCore } from "@/lib/diagnostic-core/run-diagnostic-core";
import type { DiagnosticStructuredResult } from "@/lib/diagnostic-core/schema";
import { runAskQuestionGenerator } from "@/lib/entry/question-generator";
import { normalizeTelegramReplyText } from "@/lib/entry/reply-normalizer";
import { runReplyRenderer } from "@/lib/entry/reply-renderer";
import { runEntryRouter } from "@/lib/entry/router";
import { runToolNavigationResolver } from "@/lib/entry/tool-navigation";
import { getToolsCatalogForEntry } from "@/lib/tools";
import { extractWebsiteContextFromText } from "@/lib/website/extract-website-context";
import {
  generateWebsiteScreeningResult,
  type WebsiteScreeningResult,
} from "@/lib/website/website-screening";
import type { EntrySessionState } from "@/types/domain";

const coreEntryConsultantSchema = z.object({
  action: z.enum([
    "capability",
    "website_screening",
    "tool_navigation",
    "ask_question",
    "diagnostic_result",
  ]),
  confidence: z.enum(["low", "medium", "high"]),
  rationale: z.string().trim().min(1),
  replyText: z.string().trim().min(1),
  question: z.string().trim().min(1).nullable(),
  toolSlug: z.string().trim().min(1).nullable(),
  toolTitle: z.string().trim().min(1).nullable(),
  websiteScreening: z
    .object({
      observedPositioning: z.string().trim().min(1),
      visibleStrengths: z.array(z.string().trim().min(1)).min(1).max(4),
      possibleRiskAreas: z
        .array(
          z.object({
            area: z.string().trim().min(1),
            whyCheck: z.string().trim().min(1),
          }),
        )
        .min(1)
        .max(5),
      cannotConclude: z.array(z.string().trim().min(1)).min(1).max(4),
    })
    .nullable(),
  diagnosticResult: z.any().nullable(),
});

type CoreEntryConsultantResponse = Omit<
  z.infer<typeof coreEntryConsultantSchema>,
  "diagnosticResult"
> & {
  diagnosticResult: DiagnosticStructuredResult | null;
};

const CAPABILITY_FACTS = [
  "Бот принимает обычный текст в Telegram.",
  "Бот принимает голосовые и audio-сообщения в Telegram через автоматическое распознавание речи в текст.",
  "Если распознавание голосового не удалось, бот просит отправить сообщение ещё раз или написать коротко текстом.",
  "Бот умеет анализировать ссылку на сайт и делать только внешний скрининг, если внутреннего бизнес-контекста пока нет.",
  "Бот умеет принимать изображения из Telegram и использовать их видимый контекст в разборе.",
  "Основная диагностика происходит прямо в чате Telegram.",
  "Mini App нужен для хранения, открытия и продолжения уже сохранённых разборов.",
];

export async function runCoreEntryConsultant(params: {
  rawText: string;
  session: EntrySessionState | null;
}) {
  const routerDecision = await runEntryRouter({
    rawText: params.rawText,
    session: params.session,
  });

  let question: string | null = null;
  let toolSlug: string | null = null;
  let toolTitle: string | null = null;
  let websiteScreening: WebsiteScreeningResult | null = null;
  let diagnosticResult: DiagnosticStructuredResult | null = null;

  if (routerDecision.action === "ask_question") {
    const nextQuestion = await runAskQuestionGenerator({
      rawText: params.rawText,
      session: params.session,
      routerReason: routerDecision.routerReason,
    });
    question = nextQuestion.question;
  }

  if (routerDecision.action === "tool_navigation") {
    const toolResult = await runToolNavigationResolver({
      rawText: params.rawText,
      toolsCatalog: await getToolsCatalogForEntry(),
    });

    if (toolResult.toolSlug && toolResult.toolTitle) {
      toolSlug = toolResult.toolSlug;
      toolTitle = toolResult.toolTitle;
    } else {
      const nextQuestion = await runAskQuestionGenerator({
        rawText: params.rawText,
        session: params.session,
        routerReason:
          "Пользователь, похоже, думает об инструменте, но сначала нужно точнее понять задачу и ограничение.",
      });

      const rendered = await runReplyRenderer({
        action: "ask_question",
        rawText: params.rawText,
        routerReason: routerDecision.routerReason,
        question: {
          text: nextQuestion.question,
          whyThisQuestion: nextQuestion.whyThisQuestion,
        },
      });

      return coreEntryConsultantSchema.parse({
        action: "ask_question",
        confidence: "medium",
        rationale: toolResult.reason,
        replyText: normalizeTelegramReplyText("ask_question", rendered.replyText),
        question: nextQuestion.question,
        toolSlug: null,
        toolTitle: null,
        websiteScreening: null,
        diagnosticResult: null,
      }) as CoreEntryConsultantResponse;
    }
  }

  if (routerDecision.action === "website_screening") {
    websiteScreening = await generateWebsiteScreeningResult({
      rawText: params.rawText,
    });
  }

  if (routerDecision.action === "diagnostic_result") {
    const websiteContext = await extractWebsiteContextFromText(params.rawText);
    diagnosticResult = await runDiagnosticCore({
      userMessage: params.rawText,
      clarifyingAnswers: (params.session?.clarifyingAnswers ?? []).map((answer) => ({
        question: answer.questionText,
        answer: answer.answerText,
      })),
      knownFacts: [
        ...(websiteContext?.title ? [`Заголовок сайта: ${websiteContext.title}`] : []),
        ...(websiteContext?.description ? [`Описание сайта: ${websiteContext.description}`] : []),
        ...((websiteContext?.headings ?? [])
          .slice(0, 3)
          .map((heading) => `Заголовок раздела сайта: ${heading}`)),
      ],
    });
  }

  const resolvedAction = toolSlug && toolTitle ? "tool_navigation" : routerDecision.action;
  const reply = await runReplyRenderer({
    action: resolvedAction,
    rawText: params.rawText,
    routerReason: routerDecision.routerReason,
    capabilityFacts: routerDecision.action === "capability" ? CAPABILITY_FACTS : null,
    question: question
      ? {
          text: question,
          whyThisQuestion: routerDecision.routerReason,
        }
      : null,
    tool:
      toolSlug && toolTitle
        ? {
            slug: toolSlug,
            title: toolTitle,
            reason: routerDecision.routerReason,
          }
        : null,
    websiteScreening,
    diagnosticResult,
  });

  return coreEntryConsultantSchema.parse({
    action: resolvedAction,
    confidence: routerDecision.confidence,
    rationale: routerDecision.routerReason,
    replyText: normalizeTelegramReplyText(resolvedAction, reply.replyText),
    question,
    toolSlug,
    toolTitle,
    websiteScreening,
    diagnosticResult,
  }) as CoreEntryConsultantResponse;
}

export type { CoreEntryConsultantResponse };
