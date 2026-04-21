import { z } from "zod";

export const diagnosticStructuredResultSchema = z.object({
  goal: z.object({
    primary: z.string().trim().min(1).nullable(),
    hypotheses: z.array(z.string().trim().min(1)),
    explanation: z.string().trim().min(1).nullable(),
  }),
  symptoms: z.array(z.string().trim().min(1)),
  keyHypotheses: z.array(
    z.object({
      hypothesis: z.string().trim().min(1),
      confidence: z.enum(["working", "weak"]),
      basis: z.string().trim().min(1),
    }),
  ),
  keyContours: z.array(
    z.object({
      contour: z.string().trim().min(1),
      criticality: z.enum(["low", "medium", "high"]),
      role: z.enum(["cause", "effect", "unclear"]),
      basis: z.string().trim().min(1),
    }),
  ),
  confidenceMap: z.object({
    facts: z.array(z.string().trim().min(1)),
    interpretations: z.array(z.string().trim().min(1)),
    workingHypotheses: z.array(z.string().trim().min(1)),
    weakHypotheses: z.array(z.string().trim().min(1)),
  }),
  constraints: z.object({
    main: z.string().trim().min(1).nullable(),
    secondary: z.string().trim().min(1).nullable(),
    tertiary: z.string().trim().min(1).nullable(),
    competingVersions: z.array(z.string().trim().min(1)),
    explanation: z.string().trim().min(1).nullable(),
  }),
  dominantSituations: z.array(
    z.object({
      name: z.string().trim().min(1),
      constraintEffect: z.string().trim().min(1),
    }),
  ),
  checks: z.array(
    z.object({
      hypothesis: z.string().trim().min(1),
      confirmedBy: z.array(z.string().trim().min(1)),
      couldRefute: z.array(z.string().trim().min(1)),
      questions: z.array(z.string().trim().min(1)),
    }),
  ),
  firstWave: z.object({
    directions: z.array(z.string().trim().min(1)),
    successSignals: z.array(z.string().trim().min(1)),
    errorCost: z.string().trim().min(1),
    explanation: z.string().trim().min(1).nullable(),
  }),
  secondWave: z.object({
    transitionSignals: z.array(z.string().trim().min(1)),
    whatToConsolidate: z.array(z.string().trim().min(1)),
    nextBottleneckToPrevent: z.array(z.string().trim().min(1)),
  }).nullable(),
  doNotDoNow: z.array(
    z.object({
      action: z.string().trim().min(1),
      whyNotNow: z.string().trim().min(1),
    }),
  ),
  summary: z.string().trim().min(1),
});

export type DiagnosticStructuredResult = z.infer<typeof diagnosticStructuredResultSchema>;
