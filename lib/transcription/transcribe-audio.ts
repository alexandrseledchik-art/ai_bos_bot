import { transcribeAudioWithOpenAi } from "@/lib/ai/openai-transcription";

export async function transcribeAudio(params: {
  file: Blob;
  filename: string;
}) {
  return transcribeAudioWithOpenAi(params);
}
