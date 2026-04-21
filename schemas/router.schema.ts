import { z } from "zod";

export const inputTypeSchema = z.enum([
  "url_only",
  "url_plus_problem",
  "free_text_vague",
  "free_text_problem",
  "unknown",
]);

export const modeSchema = z.enum([
  "clarification_mode",
  "website_screening_mode",
  "diagnostic_mode",
]);

export const nextActionSchema = z.enum([
  "clarify",
  "screen",
  "diagnose",
  "answer",
]);

export const routerDecisionSchema = z.object({
  inputType: inputTypeSchema,
  mode: modeSchema,
  nextAction: nextActionSchema,
  confidence: z.enum(["low", "medium", "high"]),
  understanding: z.string().trim().min(1),
  workingHypotheses: z.array(z.string().trim().min(1)).min(1).max(2),
  whyImportant: z.string().trim().min(1),
  signalAssessment: z.object({
    enoughForDiagnosis: z.boolean(),
    missing: z.array(z.string().trim().min(1)).max(4),
  }),
  routerReason: z.string().trim().min(1),
  question: z.string().trim().min(1).nullable(),
});

export type InputType = z.infer<typeof inputTypeSchema>;
export type BotMode = z.infer<typeof modeSchema>;
export type NextAction = z.infer<typeof nextActionSchema>;
export type RouterDecision = z.infer<typeof routerDecisionSchema>;
