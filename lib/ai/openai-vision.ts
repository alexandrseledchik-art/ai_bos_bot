export async function extractImageContextWithOpenAi(params: {
  imageUrl: string;
  prompt: string;
}) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured for image context extraction.");
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_VISION_MODEL ?? process.env.OPENAI_MODEL ?? "gpt-5.4-mini",
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: params.prompt },
            { type: "input_image", image_url: params.imageUrl },
          ],
        },
      ],
      max_output_tokens: 700,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI vision request failed: ${response.status}`);
  }

  const json = (await response.json()) as { output_text?: string };
  if (!json.output_text) {
    throw new Error("OpenAI vision returned empty output.");
  }

  return json.output_text.trim();
}
