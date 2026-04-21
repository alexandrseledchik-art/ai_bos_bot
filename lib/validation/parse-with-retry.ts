import { z } from "zod";

export async function parseWithSingleRetry<T>(params: {
  stage: string;
  schema: z.ZodType<T>;
  run: () => Promise<unknown>;
  retry: (validationError: string) => Promise<unknown>;
}) {
  const firstResult = params.schema.safeParse(await params.run());
  if (firstResult.success) {
    return firstResult.data;
  }

  const secondResult = params.schema.safeParse(await params.retry(firstResult.error.message));
  if (secondResult.success) {
    return secondResult.data;
  }

  throw new Error(
    `Model returned invalid ${params.stage} output after retry: ${secondResult.error.message}`,
  );
}
