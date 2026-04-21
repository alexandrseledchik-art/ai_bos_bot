import { callOpenAiJson } from "@/lib/entry/openai-json";
import { DIAGNOSTIC_PROMPT } from "@/lib/diagnostic-core/prompt";
import {
  diagnosticStructuredResultSchema,
  type DiagnosticStructuredResult,
} from "@/lib/diagnostic-core/schema";

export async function runDiagnosticCore(params: {
  userMessage: string;
  clarifyingAnswers: Array<{ question: string; answer: string }>;
  knownFacts: string[];
}): Promise<DiagnosticStructuredResult> {
  const result = await callOpenAiJson<DiagnosticStructuredResult>({
    feature: "telegram_diagnostic_result",
    systemPrompt: DIAGNOSTIC_PROMPT,
    userPayload: params,
    schemaName: "telegram_diagnostic_result",
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        goal: {
          type: "object",
          additionalProperties: false,
          properties: {
            primary: { anyOf: [{ type: "string" }, { type: "null" }] },
            hypotheses: { type: "array", items: { type: "string" } },
            explanation: { anyOf: [{ type: "string" }, { type: "null" }] }
          },
          required: ["primary", "hypotheses", "explanation"]
        },
        symptoms: { type: "array", items: { type: "string" } },
        keyHypotheses: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              hypothesis: { type: "string" },
              confidence: { type: "string", enum: ["working", "weak"] },
              basis: { type: "string" }
            },
            required: ["hypothesis", "confidence", "basis"]
          }
        },
        keyContours: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              contour: { type: "string" },
              criticality: { type: "string", enum: ["low", "medium", "high"] },
              role: { type: "string", enum: ["cause", "effect", "unclear"] },
              basis: { type: "string" }
            },
            required: ["contour", "criticality", "role", "basis"]
          }
        },
        confidenceMap: {
          type: "object",
          additionalProperties: false,
          properties: {
            facts: { type: "array", items: { type: "string" } },
            interpretations: { type: "array", items: { type: "string" } },
            workingHypotheses: { type: "array", items: { type: "string" } },
            weakHypotheses: { type: "array", items: { type: "string" } }
          },
          required: ["facts", "interpretations", "workingHypotheses", "weakHypotheses"]
        },
        constraints: {
          type: "object",
          additionalProperties: false,
          properties: {
            main: { anyOf: [{ type: "string" }, { type: "null" }] },
            secondary: { anyOf: [{ type: "string" }, { type: "null" }] },
            tertiary: { anyOf: [{ type: "string" }, { type: "null" }] },
            competingVersions: { type: "array", items: { type: "string" } },
            explanation: { anyOf: [{ type: "string" }, { type: "null" }] }
          },
          required: ["main", "secondary", "tertiary", "competingVersions", "explanation"]
        },
        dominantSituations: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              name: { type: "string" },
              constraintEffect: { type: "string" }
            },
            required: ["name", "constraintEffect"]
          }
        },
        checks: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              hypothesis: { type: "string" },
              confirmedBy: { type: "array", items: { type: "string" } },
              couldRefute: { type: "array", items: { type: "string" } },
              questions: { type: "array", items: { type: "string" } }
            },
            required: ["hypothesis", "confirmedBy", "couldRefute", "questions"]
          }
        },
        firstWave: {
          type: "object",
          additionalProperties: false,
          properties: {
            directions: { type: "array", items: { type: "string" } },
            successSignals: { type: "array", items: { type: "string" } },
            errorCost: { type: "string" },
            explanation: { anyOf: [{ type: "string" }, { type: "null" }] }
          },
          required: ["directions", "successSignals", "errorCost", "explanation"]
        },
        secondWave: {
          anyOf: [
            { type: "null" },
            {
              type: "object",
              additionalProperties: false,
              properties: {
                transitionSignals: { type: "array", items: { type: "string" } },
                whatToConsolidate: { type: "array", items: { type: "string" } },
                nextBottleneckToPrevent: { type: "array", items: { type: "string" } }
              },
              required: ["transitionSignals", "whatToConsolidate", "nextBottleneckToPrevent"]
            }
          ]
        },
        doNotDoNow: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              action: { type: "string" },
              whyNotNow: { type: "string" }
            },
            required: ["action", "whyNotNow"]
          }
        },
        summary: { type: "string" }
      },
      required: [
        "goal",
        "symptoms",
        "keyHypotheses",
        "keyContours",
        "confidenceMap",
        "constraints",
        "dominantSituations",
        "checks",
        "firstWave",
        "secondWave",
        "doNotDoNow",
        "summary"
      ]
    },
    maxOutputTokens: 2200,
    onErrorLabel: "diagnostic_core_prompt",
  });

  return diagnosticStructuredResultSchema.parse(result);
}
