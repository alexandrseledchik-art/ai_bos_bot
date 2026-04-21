import { z } from "zod";

import { callOpenAiJson } from "@/lib/entry/openai-json";
import type { EntrySessionState } from "@/types/domain";

const askQuestionSchema = z.object({
  question: z.string().trim().min(1),
  whyThisQuestion: z.string().trim().min(1),
});

export type AskQuestionPayload = z.infer<typeof askQuestionSchema>;

const ASK_QUESTION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    question: { type: "string" },
    whyThisQuestion: { type: "string" },
  },
  required: ["question", "whyThisQuestion"],
} as const;

const ASK_QUESTION_PROMPT = `Ты — assistant, который выбирает один лучший следующий вопрос для бизнес-диагностики в Telegram.

Тебе уже известно, что данных пока недостаточно для честного диагностического вывода.
Твоя задача — задать ОДИН вопрос, который сильнее всего уменьшит риск ложной интерпретации и поможет сделать следующий шаг содержательным.

Принципы:
- только русский язык;
- один вопрос, без меню и без списка вариантов;
- вопрос короткий, понятный, деловой;
- не повторяй то, что пользователь уже сообщил;
- если пользователь прислал только приветствие, короткое подтверждение или фразу без бизнес-содержания после уже показанного entry-offer, не запускай новый вводный опрос; просто мягко верни его к просьбе описать запрос в 1–2 фразах
- не проси тот же тип данных по кругу, если пользователь уже сказал, что их не знает, они не выгружены или именно в этом и хочет разобраться;
- опирайся на контекст переписки, а не только на последнее сообщение;
- хороший вопрос должен прояснять главный пробел данных, а не просто собирать ещё текст.

Как думать:
1. Что уже понятно?
2. Какое предположение сейчас самое рискованное или самый важный пробел данных?
3. Какой один ответ сильнее всего изменит следующий шаг?

Приоритеты вопроса:
- если цель уже ясна, чаще спрашивай про главный текущий барьер к цели;
- если ownership/объект разговора не подтверждён, сначала уточни это;
- если пользователь не знает цифр, смещай вопрос на наблюдаемые симптомы, ограничения и покупательские риски;
- если пользователь прямо говорит "вот с этим и хочу разобраться", не переформулируй ту же задачу, а иди в самое наблюдаемое узкое место.

Полезные ориентиры:
- для продажи бизнеса хороший вопрос чаще про то, что сильнее всего мешает продаже сейчас;
- для выхода из операционки — что удерживает собственника в ручном управлении;
- для наведения порядка — где сильнее всего теряется управляемость;
- для слабых цифр — что сейчас непрозрачно: экономика, команда, процессы, выручка, зависимость от собственника или покупательский риск.

Чего не делать:
- не задавай пустой вопрос вроде "расскажите подробнее";
- не дублируй entry-offer вопрос другим вводным вопросом вроде "какая у вас цель или задача сегодня?", если пользователь ещё вообще не начал описывать кейс;
- не уходи в мета-вопросы вроде "какой вид бизнеса?" или "почему вообще хотите это сделать?", если уже можно спросить про реальный барьер;
- не начинай с финансовых метрик по умолчанию, если пользователь ещё не подтвердил, что они у него под рукой;
- не повторяй вопрос почти теми же словами, если пользователь уже показал непонимание или отсутствие ответа.

Верни строго JSON.`;

export async function runAskQuestionGenerator(params: {
  rawText: string;
  session: EntrySessionState | null;
  routerReason: string;
}) {
  const result = await callOpenAiJson<AskQuestionPayload>({
    feature: "telegram_ask_question",
    systemPrompt: ASK_QUESTION_PROMPT,
    userPayload: {
      rawText: params.rawText,
      routerReason: params.routerReason,
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
    schemaName: "telegram_ask_question",
    schema: ASK_QUESTION_JSON_SCHEMA,
    maxOutputTokens: 400,
    onErrorLabel: "ask_question_prompt",
  });

  return askQuestionSchema.parse(result);
}
