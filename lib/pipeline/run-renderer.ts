import { callOpenAiJson } from "@/lib/ai/openai-json";
import { parseWithSingleRetry } from "@/lib/validation/parse-with-retry";
import { RENDERER_PROMPT } from "@/prompts/renderer.prompt";
import { z } from "zod";

const rendererReplySchema = z.object({
  replyText: z.string().trim().min(1),
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

  return result.replyText.trim();
}
