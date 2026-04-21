import { z } from "zod";

type CallOpenAiJsonParams<T> = {
  feature: string;
  systemPrompt: string;
  userPayload: unknown;
  schemaName: string;
  schema: unknown;
  maxOutputTokens?: number;
  onErrorLabel: string;
};

const openAiEnvelopeSchema = z.object({
  output_text: z.string().trim().min(1).optional(),
});

export async function callOpenAiJson<T>(params: CallOpenAiJsonParams<T>): Promise<T> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error(`OPENAI_API_KEY is not configured for ${params.onErrorLabel}.`);
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? "gpt-5.4-mini",
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: params.systemPrompt }],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: JSON.stringify(params.userPayload, null, 2),
            },
          ],
        },
      ],
      max_output_tokens: params.maxOutputTokens ?? 1200,
      text: {
        format: {
          type: "json_schema",
          name: params.schemaName,
          schema: params.schema,
          strict: true,
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI request failed for ${params.onErrorLabel}: ${response.status}`);
  }

  const json = openAiEnvelopeSchema.parse(await response.json());
  if (!json.output_text) {
    throw new Error(`OpenAI returned empty output for ${params.onErrorLabel}.`);
  }

  return JSON.parse(json.output_text) as T;
}
