import { callOpenAiJson } from "@/lib/ai/openai-json";
import { ROUTER_PROMPT } from "@/prompts/router.prompt";
import { routerDecisionSchema, type InputType, type RouterDecision } from "@/schemas/router.schema";
import { parseWithSingleRetry } from "@/lib/validation/parse-with-retry";

export async function runRouter(params: {
  inputType: InputType;
  normalizedText: string;
  conversationContext: unknown;
  artifacts: unknown[];
}) {
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      inputType: { type: "string", enum: ["url_only", "url_plus_problem", "free_text_vague", "free_text_problem", "unknown"] },
      mode: { type: "string", enum: ["clarification_mode", "website_screening_mode", "diagnostic_mode"] },
      nextAction: { type: "string", enum: ["clarify", "screen", "diagnose", "answer"] },
      confidence: { type: "string", enum: ["low", "medium", "high"] },
      understanding: { type: "string" },
      workingHypotheses: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 2 },
      whyImportant: { type: "string" },
      signalAssessment: {
        type: "object",
        additionalProperties: false,
        properties: {
          enoughForDiagnosis: { type: "boolean" },
          missing: { type: "array", items: { type: "string" }, maxItems: 4 }
        },
        required: ["enoughForDiagnosis", "missing"]
      },
      routerReason: { type: "string" },
      question: { anyOf: [{ type: "string" }, { type: "null" }] }
    },
    required: ["inputType", "mode", "nextAction", "confidence", "understanding", "workingHypotheses", "whyImportant", "signalAssessment", "routerReason", "question"]
  } as const;

  return parseWithSingleRetry({
    stage: "router",
    schema: routerDecisionSchema,
    run: () =>
      callOpenAiJson<RouterDecision>({
        feature: "router",
        systemPrompt: ROUTER_PROMPT,
        userPayload: params,
        schemaName: "router_decision",
        schema,
        maxOutputTokens: 900,
        onErrorLabel: "router_prompt",
      }),
    retry: (validationError) =>
      callOpenAiJson<RouterDecision>({
        feature: "router",
        systemPrompt: `${ROUTER_PROMPT}\n\nПредыдущая попытка не прошла валидацию. Исправь только структуру и обязательные поля. Ошибка валидации: ${validationError}`,
        userPayload: params,
        schemaName: "router_decision_retry",
        schema,
        maxOutputTokens: 900,
        onErrorLabel: "router_prompt_retry",
      }),
  });
}
