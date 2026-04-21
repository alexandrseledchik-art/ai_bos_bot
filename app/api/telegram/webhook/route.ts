import { markEntryOfferShown } from "@/lib/telegram/entry-session";
import { handleTelegramEntry } from "@/lib/entry/handle-entry";

type TelegramTextLike = {
  chat?: { id?: number };
  from?: {
    id?: number;
    username?: string;
    first_name?: string;
    last_name?: string;
  };
  text?: string;
  caption?: string;
};

type TelegramUpdate = {
  message?: TelegramTextLike & {
    voice?: unknown;
    audio?: unknown;
    photo?: unknown[];
    document?: { mime_type?: string };
  };
};

function getMessageText(message: TelegramUpdate["message"]) {
  return message?.text?.trim() || message?.caption?.trim() || "";
}

export async function POST(request: Request) {
  try {
    const update = (await request.json()) as TelegramUpdate;
    const message = update.message;

    if (!message?.chat?.id || !message.from?.id) {
      return Response.json({ ok: true });
    }

    const text = getMessageText(message);

    if (text === "/start") {
      await markEntryOfferShown(message.from.id);

      return Response.json({
        ok: true,
        reply: {
          text:
            "Здравствуйте!\n\nВы общаетесь с AI-ассистентом по разбору бизнеса и управленческой диагностике.\n\nЗа 3 минуты покажу, где бизнес теряет деньги, время и управляемость — и что делать первым.\n\nДостаточно сайта или пары фраз о ситуации.\n\nРасскажите о запросе любым удобным способом 👇",
        },
      });
    }

    if (!text) {
      return Response.json({
        ok: true,
        reply: {
          text: "Напишите коротко текстом, что хотите разобрать, или пришлите ссылку, голосовое либо изображение.",
        },
      });
    }

    const result = await handleTelegramEntry({
      telegramUserId: message.from.id,
      telegramUsername: message.from.username ?? null,
      firstName: message.from.first_name ?? null,
      lastName: message.from.last_name ?? null,
      text,
    });

    return Response.json({ ok: true, ...result });
  } catch (error) {
    console.error("telegram_webhook_error", error);
    return Response.json({ ok: false }, { status: 500 });
  }
}
