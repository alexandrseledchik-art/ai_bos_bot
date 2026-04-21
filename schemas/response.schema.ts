import { z } from "zod";

import { analysisResultSchema } from "@/schemas/diagnostic.schema";
import { inputTypeSchema, modeSchema, nextActionSchema } from "@/schemas/router.schema";

export const finalResponseSchema = z.object({
  inputType: inputTypeSchema,
  mode: modeSchema,
  nextAction: nextActionSchema,
  confidence: z.enum(["low", "medium", "high"]),
  understanding: z.string().trim().min(1),
  workingHypotheses: z.array(z.string().trim().min(1)).min(1).max(2),
  whyImportant: z.string().trim().min(1),
  replyText: z.string().trim().min(1),
  question: z.string().trim().min(1).nullable(),
  preliminaryScreening: analysisResultSchema.shape.preliminaryScreening,
  diagnosticCase: analysisResultSchema.shape.diagnosticCase,
});

export type FinalResponse = z.infer<typeof finalResponseSchema>;
