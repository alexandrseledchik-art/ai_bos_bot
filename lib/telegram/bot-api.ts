const TELEGRAM_API_BASE = "https://api.telegram.org";

function getBotToken() {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    throw new Error("TELEGRAM_BOT_TOKEN is not configured.");
  }

  return botToken;
}

async function callTelegram(method: string, payload: Record<string, unknown>) {
  const response = await fetch(`${TELEGRAM_API_BASE}/bot${getBotToken()}/${method}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Telegram ${method} failed with status ${response.status}.`);
  }

  return response.json();
}

export async function getTelegramFileBlob(fileId: string) {
  const botToken = getBotToken();

  const fileResponse = await fetch(`${TELEGRAM_API_BASE}/bot${botToken}/getFile?file_id=${fileId}`);
  if (!fileResponse.ok) {
    throw new Error(`Telegram getFile failed with status ${fileResponse.status}.`);
  }

  const fileJson = (await fileResponse.json()) as { ok: boolean; result?: { file_path?: string } };
  const filePath = fileJson.result?.file_path;

  if (!fileJson.ok || !filePath) {
    throw new Error("Telegram did not return a valid file path.");
  }

  const downloadResponse = await fetch(`${TELEGRAM_API_BASE}/file/bot${botToken}/${filePath}`);
  if (!downloadResponse.ok) {
    throw new Error(`Telegram file download failed with status ${downloadResponse.status}.`);
  }

  return {
    blob: await downloadResponse.blob(),
    filePath,
  };
}

export async function sendTelegramTextMessage(params: {
  chatId: number;
  text: string;
  replyToMessageId?: number | null;
}) {
  return callTelegram("sendMessage", {
    chat_id: params.chatId,
    text: params.text,
    reply_to_message_id: params.replyToMessageId ?? undefined,
    link_preview_options: {
      is_disabled: true,
    },
  });
}

export async function sendTelegramChatAction(params: {
  chatId: number;
  action?: "typing" | "upload_photo" | "record_voice" | "upload_document";
}) {
  return callTelegram("sendChatAction", {
    chat_id: params.chatId,
    action: params.action ?? "typing",
  });
}
