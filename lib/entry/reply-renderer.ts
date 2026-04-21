import { z } from "zod";

import { callOpenAiJson } from "@/lib/entry/openai-json";
import { POST_WEBSITE_SCREENING_REQUEST_TEXT } from "@/lib/entry/constants";
import type { DiagnosticStructuredResult } from "@/lib/diagnostic-core/schema";
import type { WebsiteScreeningResult } from "@/lib/website/website-screening";

const renderedReplySchema = z.object({
  replyText: z.string().trim().min(1),
});

type RenderedReply = z.infer<typeof renderedReplySchema>;

const RENDERED_REPLY_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    replyText: { type: "string" },
  },
  required: ["replyText"],
} as const;

const RENDERER_PROMPT = `Ты — renderer Telegram-ответа.

Твоя задача:
по structured JSON собрать финальный replyText для пользователя.

Главные требования:
- только русский язык;
- коротко, плотно, структурно;
- без воды и без повторов;
- без вида "консалтингового отчёта";
- replyText не должен дублировать structured JSON дословно;
- не начинай сообщения с "Понял", "Понимаю", "Ясно" и похожих слов-паразитов;
- если данных мало, текст должен быть компактным и вести к следующему сильному ходу.

Правила по action:
- capability: ответь прямо и коротко, строго опираясь на capabilityFacts;
- website_screening: это только внешний скрининг сайта, а не диагноз бизнеса;
- ask_question: коротко зафиксируй только тот минимум контекста, который нужен, и задай один лучший вопрос;
- tool_navigation: коротко объясни, почему инструмент — правильный следующий шаг именно сейчас;
- diagnostic_result: дай плотный Telegram-friendly разбор без длинных секций и без искусственной полноты.

Guardrails:
- если пользователь уже сказал, что не знает цифр, не заставляй replyText снова просить те же цифры; перенеси акцент на наблюдаемый барьер, ограничение или симптом;
- если action != website_screening, не вставляй блок "Что дальше:" и не используй websiteScreeningRequestText;
- если structured JSON частично пустой, не проговаривай отсутствующие разделы;
- не придумывай ограничения возможностей бота, которых нет в capabilityFacts;
- если capabilityFacts говорят, что голосовые принимаются через распознавание, не пиши, что бот понимает только текст.

Логика website_screening:
1. обозначь, что это внешний скрининг, а не диагноз бизнеса;
2. скажи, что видно снаружи;
3. назови сильные стороны;
4. назови, что стоит проверить;
5. назови, что нельзя утверждать по сайту;
6. закончи блоком:
   Что дальше:
   {websiteScreeningRequestText}
   Напишите запрос в 1–2 фразах.

Для diagnostic_result:
- показывай только то, что реально усиливает понимание и следующий шаг;
- не превращай ответ в список всех секций схемы;
- не расписывай слабые или пустые блоки только ради формы.

Верни только replyText в JSON.`;

export async function runReplyRenderer(params: {
  action: "capability" | "website_screening" | "tool_navigation" | "ask_question" | "diagnostic_result";
  rawText: string;
  routerReason: string;
  question?: {
    text: string;
    whyThisQuestion: string;
  } | null;
  capabilityFacts?: string[] | null;
  tool?: {
    slug: string;
    title: string;
    reason: string;
  } | null;
  websiteScreening?: WebsiteScreeningResult | null;
  diagnosticResult?: DiagnosticStructuredResult | null;
}) {
  const result = await callOpenAiJson<RenderedReply>({
    feature: "telegram_reply_renderer",
    systemPrompt: RENDERER_PROMPT,
    userPayload: {
      ...params,
      websiteScreeningRequestText:
        params.action === "website_screening" ? POST_WEBSITE_SCREENING_REQUEST_TEXT : null,
    },
    schemaName: "telegram_reply_renderer",
    schema: RENDERED_REPLY_JSON_SCHEMA,
    maxOutputTokens: 1100,
    onErrorLabel: "reply_renderer_prompt",
  });

  return renderedReplySchema.parse(result);
}
