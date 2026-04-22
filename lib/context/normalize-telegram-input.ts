export type NormalizedTelegramInput = {
  text: string;
  messageType: "text" | "voice" | "audio" | "image" | "link" | "mixed" | "service";
  urls: string[];
  hasVoice: boolean;
  hasImage: boolean;
};

export function normalizeTelegramInput(params: {
  text?: string | null;
  caption?: string | null;
  hasVoice?: boolean;
  hasAudio?: boolean;
  hasImage?: boolean;
}) {
  const text = (params.text ?? params.caption ?? "").trim();
  const urls = text.match(/https?:\/\/\S+/gi) ?? [];
  const hasVoice = Boolean(params.hasVoice || params.hasAudio);
  const hasImage = Boolean(params.hasImage);

  let messageType: NormalizedTelegramInput["messageType"] = "text";

  if (hasVoice && (text || urls.length > 0)) {
    messageType = "mixed";
  } else if (hasImage && (text || urls.length > 0)) {
    messageType = "mixed";
  } else if (hasVoice) {
    messageType = "voice";
  } else if (hasImage) {
    messageType = "image";
  } else if (urls.length > 0 && !text.replace(/https?:\/\/\S+/gi, "").trim()) {
    messageType = "link";
  } else if (!text) {
    messageType = "service";
  }

  return {
    text,
    messageType,
    urls,
    hasVoice,
    hasImage,
  } satisfies NormalizedTelegramInput;
}
