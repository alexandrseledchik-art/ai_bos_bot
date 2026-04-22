import { extractImageContextWithOpenAi } from "@/lib/ai/openai-vision";

export async function extractImageContext(params: { imageUrl: string }) {
  return extractImageContextWithOpenAi({
    imageUrl: params.imageUrl,
    prompt:
      "Опиши только видимый контекст изображения для бизнес-разбора. Не выдумывай скрытые факты. Выдели, что видно, какой это тип артефакта и что по нему пока нельзя утверждать.",
  });
}
