import { z } from "zod";

import { callOpenAiJson } from "@/lib/entry/openai-json";
import type { EntryToolCatalogItem } from "@/lib/tools";

const toolNavigationSchema = z.object({
  toolSlug: z.string().trim().min(1).nullable(),
  toolTitle: z.string().trim().min(1).nullable(),
  reason: z.string().trim().min(1),
});

export async function runToolNavigationResolver(params: {
  rawText: string;
  toolsCatalog: EntryToolCatalogItem[];
}) {
  const result = await callOpenAiJson<z.infer<typeof toolNavigationSchema>>({
    feature: "telegram_tool_navigation",
    systemPrompt: `Ты выбираешь инструмент только если это действительно лучший следующий шаг уже сейчас.

Правила:
- не подменяй инструментом диагностику, если пользователь всё ещё пытается понять своё ограничение;
- если точного уверенного совпадения нет, верни null в toolSlug и toolTitle;
- отвечай только на русском;
- опирайся только на переданный каталог инструментов.`,
    userPayload: params,
    schemaName: "telegram_tool_navigation",
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        toolSlug: { anyOf: [{ type: "string" }, { type: "null" }] },
        toolTitle: { anyOf: [{ type: "string" }, { type: "null" }] },
        reason: { type: "string" }
      },
      required: ["toolSlug", "toolTitle", "reason"]
    },
    maxOutputTokens: 300,
    onErrorLabel: "tool_navigation_prompt",
  });

  return toolNavigationSchema.parse(result);
}
