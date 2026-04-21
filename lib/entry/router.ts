import { z } from "zod";

import { callOpenAiJson } from "@/lib/entry/openai-json";
import type { EntrySessionState } from "@/types/domain";

const routerDecisionSchema = z.object({
  action: z.enum([
    "capability",
    "website_screening",
    "tool_navigation",
    "ask_question",
    "diagnostic_result",
  ]),
  confidence: z.enum(["low", "medium", "high"]),
  routerReason: z.string().trim().min(1),
});

export type RouterDecision = z.infer<typeof routerDecisionSchema>;

const ROUTER_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    action: {
      type: "string",
      enum: [
        "capability",
        "website_screening",
        "tool_navigation",
        "ask_question",
        "diagnostic_result",
      ],
    },
    confidence: {
      type: "string",
      enum: ["low", "medium", "high"],
    },
    routerReason: { type: "string" },
  },
  required: ["action", "confidence", "routerReason"],
} as const;

const ROUTER_PROMPT = `Ты — router для Telegram-ассистента по бизнес-разбору.

Твоя роль:
- понять, чего пользователь реально хочет от бота прямо сейчас;
- оценить, хватает ли сигнала для следующего сильного шага;
- выбрать только ОДИН action.

Ты не делаешь диагностику сам.
Ты не пишешь длинный ответ пользователю.
Ты не должен подгонять запрос под форму, если данных мало.

Доступные action:
- capability
- website_screening
- tool_navigation
- ask_question
- diagnostic_result

Базовые принципы:
- отвечай только на русском;
- не выдумывай факты;
- не считай ссылку, сайт, название компании или продукт доказательством, что это бизнес пользователя;
- если пользователь ещё пытается понять проблему, не уводи его в инструмент слишком рано;
- если данных недостаточно для честной диагностики, выбирай ask_question;
- если сомневаешься между ask_question и diagnostic_result, выбирай ask_question.

Как понимать action:
- capability: вопрос о возможностях бота, а не о бизнес-ситуации;
- website_screening: по текущему входу можно честно сделать только внешний скрининг сайта или продукта;
- tool_navigation: лучший следующий шаг уже действительно открыть конкретный инструмент;
- ask_question: один хороший ответ пользователя заметно уменьшит неопределённость;
- diagnostic_result: сигнала уже достаточно для честного предварительного диагноза прямо в чате.

Порог достаточности сигнала для diagnostic_result:
Нужно минимум 2 из 4:
- есть цель или желаемый результат;
- есть минимум 2 симптома текущей ситуации;
- есть минимум 1 факт / цифра / ограничение / наблюдение;
- есть понятный контекст бизнеса, роли или управленческой ситуации.

Если этот порог не выполнен, diagnostic_result выбирать нельзя.

Специальные guardrails:
- website_screening — это только внешний разбор, без внутреннего диагноза бизнеса;
- если пользователь прислал сайт, а потом короткую фразу вроде "хочу продать бизнес", сайт остаётся reference context, а не ownership fact;
- если пользователь просит инструмент, но всё ещё не ясно, в чём именно ограничение, выбирай ask_question;
- если пользователь уже показал, что не знает точных цифр или не понимает, зачем от него просят тот же тип данных, не считай это основанием для повторного запроса таких же данных.

Верни строго JSON.`;

export async function runEntryRouter(params: {
  rawText: string;
  session: EntrySessionState | null;
}) {
  const result = await callOpenAiJson<RouterDecision>({
    feature: "telegram_entry_router",
    systemPrompt: ROUTER_PROMPT,
    userPayload: {
      rawText: params.rawText,
      session: params.session
        ? {
            stage: params.session.stage,
            initialMessage: params.session.initialMessage,
            clarifyingAnswers: params.session.clarifyingAnswers.slice(-4),
            turnCount: params.session.turnCount,
            lastQuestionText: params.session.lastQuestionText,
          }
        : null,
    },
    schemaName: "telegram_entry_router",
    schema: ROUTER_JSON_SCHEMA,
    maxOutputTokens: 500,
    onErrorLabel: "router_prompt",
  });

  return routerDecisionSchema.parse(result);
}
