import { z } from "zod";

export const toolRecommendationSchema = z.object({
  title: z.string().trim().min(1),
  whyNow: z.string().trim().min(1),
});

export const confidenceMapSchema = z.object({
  knownFacts: z.array(z.string().trim().min(1)),
  observations: z.array(z.string().trim().min(1)),
  workingHypotheses: z.array(z.string().trim().min(1)),
});

export const preliminaryScreeningSchema = z.object({
  externalType: z.string().trim().min(1),
  visibleSignals: z.array(z.string().trim().min(1)).min(1),
  cannotClaim: z.array(z.string().trim().min(1)).min(1),
  branchingQuestion: z.string().trim().min(1),
  confidenceMap: confidenceMapSchema,
});

export const diagnosticCaseSchema = z.object({
  goal: z.string().trim().min(1),
  symptoms: z.array(z.string().trim().min(1)).min(1),
  workingHypotheses: z.array(z.string().trim().min(1)).min(1).max(3),
  mainConstraint: z.string().trim().min(1),
  secondaryConstraints: z.array(z.string().trim().min(1)).max(2),
  situation: z.string().trim().min(1),
  firstWave: z.object({
    focus: z.string().trim().min(1),
    actions: z.array(z.string().trim().min(1)).min(1).max(3),
    whyThisFirst: z.string().trim().min(1),
  }),
  doNotDoNow: z.array(z.string().trim().min(1)).min(1).max(5),
  toolRecommendations: z.array(toolRecommendationSchema).max(3),
  confidenceMap: confidenceMapSchema,
});

export const analysisResultSchema = z.object({
  preliminaryScreening: preliminaryScreeningSchema.nullable(),
  diagnosticCase: diagnosticCaseSchema.nullable(),
});

export type ToolRecommendation = z.infer<typeof toolRecommendationSchema>;
export type PreliminaryScreening = z.infer<typeof preliminaryScreeningSchema>;
export type DiagnosticCase = z.infer<typeof diagnosticCaseSchema>;
export type AnalysisResult = z.infer<typeof analysisResultSchema>;
