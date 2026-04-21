import { z } from "zod";

import { callOpenAiJson } from "@/lib/entry/openai-json";

export const websiteScreeningSchema = z.object({
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
});

export type WebsiteScreeningResult = z.infer<typeof websiteScreeningSchema>;

export async function generateWebsiteScreeningResult(params: { rawText: string }) {
  const result = await callOpenAiJson<WebsiteScreeningResult>({
    feature: "telegram_website_screening",
    systemPrompt: `Ты делаешь только внешний скрининг сайта.

Правила:
- это не внутренний диагноз бизнеса;
- не выдумывай ownership;
- показывай только то, что можно честно вывести из ссылки, названия, описания и явного внешнего контекста;
- отвечай только на русском.`,
    userPayload: params,
    schemaName: "telegram_website_screening",
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        observedPositioning: { type: "string" },
        visibleStrengths: { type: "array", items: { type: "string" } },
        possibleRiskAreas: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              area: { type: "string" },
              whyCheck: { type: "string" }
            },
            required: ["area", "whyCheck"]
          }
        },
        cannotConclude: { type: "array", items: { type: "string" } }
      },
      required: ["observedPositioning", "visibleStrengths", "possibleRiskAreas", "cannotConclude"]
    },
    maxOutputTokens: 900,
    onErrorLabel: "website_screening_prompt",
  });

  return websiteScreeningSchema.parse(result);
}

export async function persistTelegramWebsiteScreening(params: {
  telegramUserId: number;
  telegramUsername?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  rawText: string;
  result: WebsiteScreeningResult;
  replyText: string;
}) {
  return {
    text: params.replyText,
    stage: "clarifying" as const,
  };
}
