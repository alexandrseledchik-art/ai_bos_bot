import { callOpenAiJson } from "@/lib/ai/openai-json";
import { DIAGNOSTIC_PROMPT } from "@/prompts/diagnostic.prompt";
import { analysisResultSchema, type AnalysisResult } from "@/schemas/diagnostic.schema";
import type { BotMode } from "@/schemas/router.schema";
import { parseWithSingleRetry } from "@/lib/validation/parse-with-retry";

export async function runAnalysis(params: {
  mode: BotMode;
  normalizedText: string;
  conversationContext: unknown;
  artifacts: unknown[];
  routerDecision: unknown;
}) {
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      preliminaryScreening: {
        anyOf: [
          { type: "null" },
          {
            type: "object",
            additionalProperties: false,
            properties: {
              externalType: { type: "string" },
              visibleSignals: { type: "array", items: { type: "string" } },
              cannotClaim: { type: "array", items: { type: "string" } },
              branchingQuestion: { type: "string" },
              confidenceMap: {
                type: "object",
                additionalProperties: false,
                properties: {
                  knownFacts: { type: "array", items: { type: "string" } },
                  observations: { type: "array", items: { type: "string" } },
                  workingHypotheses: { type: "array", items: { type: "string" } }
                },
                required: ["knownFacts", "observations", "workingHypotheses"]
              }
            },
            required: ["externalType", "visibleSignals", "cannotClaim", "branchingQuestion", "confidenceMap"]
          }
        ]
      },
      diagnosticCase: {
        anyOf: [
          { type: "null" },
          {
            type: "object",
            additionalProperties: false,
            properties: {
              goal: { type: "string" },
              symptoms: { type: "array", items: { type: "string" } },
              workingHypotheses: { type: "array", items: { type: "string" } },
              mainConstraint: { type: "string" },
              secondaryConstraints: { type: "array", items: { type: "string" } },
              situation: { type: "string" },
              firstWave: {
                type: "object",
                additionalProperties: false,
                properties: {
                  focus: { type: "string" },
                  actions: { type: "array", items: { type: "string" } },
                  whyThisFirst: { type: "string" }
                },
                required: ["focus", "actions", "whyThisFirst"]
              },
              doNotDoNow: { type: "array", items: { type: "string" } },
              toolRecommendations: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    title: { type: "string" },
                    whyNow: { type: "string" }
                  },
                  required: ["title", "whyNow"]
                }
              },
              confidenceMap: {
                type: "object",
                additionalProperties: false,
                properties: {
                  knownFacts: { type: "array", items: { type: "string" } },
                  observations: { type: "array", items: { type: "string" } },
                  workingHypotheses: { type: "array", items: { type: "string" } }
                },
                required: ["knownFacts", "observations", "workingHypotheses"]
              }
            },
            required: ["goal", "symptoms", "workingHypotheses", "mainConstraint", "secondaryConstraints", "situation", "firstWave", "doNotDoNow", "toolRecommendations", "confidenceMap"]
          }
        ]
      }
    },
    required: ["preliminaryScreening", "diagnosticCase"]
  } as const;

  return parseWithSingleRetry({
    stage: "analysis",
    schema: analysisResultSchema,
    run: () =>
      callOpenAiJson<AnalysisResult>({
        feature: "analysis",
        systemPrompt: DIAGNOSTIC_PROMPT,
        userPayload: params,
        schemaName: "analysis_result",
        schema,
        maxOutputTokens: 1800,
        onErrorLabel: "diagnostic_prompt",
      }),
    retry: (validationError) =>
      callOpenAiJson<AnalysisResult>({
        feature: "analysis",
        systemPrompt: `${DIAGNOSTIC_PROMPT}\n\nПредыдущая попытка не прошла валидацию. Исправь только структуру, обязательные поля и nullability. Ошибка валидации: ${validationError}`,
        userPayload: params,
        schemaName: "analysis_result_retry",
        schema,
        maxOutputTokens: 1800,
        onErrorLabel: "diagnostic_prompt_retry",
      }),
  });
}
