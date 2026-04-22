export async function transcribeAudioWithOpenAi(params: {
  file: Blob;
  filename: string;
}) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured for transcription.");
  }

  const formData = new FormData();
  formData.append("file", params.file, params.filename);
  formData.append("model", process.env.OPENAI_TRANSCRIPTION_MODEL ?? "whisper-1");

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`OpenAI transcription request failed: ${response.status}`);
  }

  const json = (await response.json()) as { text?: string };
  if (!json.text?.trim()) {
    throw new Error("OpenAI transcription returned empty text.");
  }

  return json.text.trim();
}
