import { callOpenAiJson } from "@/lib/ai/openai-json";
import { normalizeReplyText } from "@/lib/formatting/normalize-reply-text";
import { parseWithSingleRetry } from "@/lib/validation/parse-with-retry";
import { RENDERER_PROMPT } from "@/prompts/renderer.prompt";
import { z } from "zod";

const FORBIDDEN_REPLY_PATTERNS = [
  /\bвы хотите\b/i,
  /\bчтобы помочь\b/i,
  /\bдля того чтобы помочь\b/i,
  /\bуточните, пожалуйста\b/i,
  /какой запрос хотите разобрать дальше/i,
  /это важный шаг\./i,
];

const rendererReplySchema = z
  .object({
    replyText: z.string().trim().min(1),
  })
  .superRefine((value, ctx) => {
    if (FORBIDDEN_REPLY_PATTERNS.some((pattern) => pattern.test(value.replyText))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "replyText sounds like a formal corporate assistant and starts with a forbidden bureaucratic pattern",
        path: ["replyText"],
      });
    }
  });

export async function runRenderer(params: {
  routerDecision: unknown;
  analysisResult: unknown;
}) {
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      replyText: { type: "string" }
    },
    required: ["replyText"]
  } as const;

  const result = await parseWithSingleRetry({
    stage: "renderer",
    schema: rendererReplySchema,
    run: () =>
      callOpenAiJson<{ replyText: string }>({
        feature: "renderer",
        systemPrompt: RENDERER_PROMPT,
        userPayload: params,
        schemaName: "renderer_reply",
        schema,
        maxOutputTokens: 1200,
        onErrorLabel: "renderer_prompt",
      }),
    retry: (validationError) =>
      callOpenAiJson<{ replyText: string }>({
        feature: "renderer",
        systemPrompt: `${RENDERER_PROMPT}\n\nПредыдущая попытка не прошла валидацию. Верни только непустой replyText. Ошибка валидации: ${validationError}`,
        userPayload: params,
        schemaName: "renderer_reply_retry",
        schema,
        maxOutputTokens: 1200,
        onErrorLabel: "renderer_prompt_retry",
      }),
  });

  return normalizeReplyText(result.replyText);
}
