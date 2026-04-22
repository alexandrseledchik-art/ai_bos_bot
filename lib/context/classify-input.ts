import type { InputType } from "@/schemas/router.schema";

function extractUrls(text: string) {
  return text.match(/https?:\/\/\S+/gi) ?? [];
}

function normalize(text: string) {
  return text.trim().toLowerCase();
}

function stripUrls(text: string) {
  return text.replace(/https?:\/\/\S+/gi, " ").replace(/\s+/g, " ").trim();
}

function looksVague(text: string) {
  const normalized = normalize(text);
  if (!normalized) return true;

  const vaguePhrases = [
    "привет",
    "здравствуйте",
    "хочу разобрать бизнес",
    "хочу увеличить прибыль",
    "что-то не так",
    "нужна помощь",
    "нужен совет",
  ];

  return vaguePhrases.includes(normalized);
}

function looksProblemLike(text: string) {
  const normalized = normalize(text);
  const markers = [
    "мешает",
    "проблем",
    "не раст",
    "падает",
    "просел",
    "хаос",
    "зависит",
    "непонятно",
    "не могу",
    "хочу продать",
    "хочу выйти",
    "барьер",
    "огранич",
  ];

  return markers.some((marker) => normalized.includes(marker));
}

export function classifyInputType(text: string): InputType {
  const urls = extractUrls(text);
  const textWithoutUrls = stripUrls(text);

  if (urls.length > 0 && !textWithoutUrls) {
    return "url_only";
  }

  if (urls.length > 0 && textWithoutUrls) {
    return looksProblemLike(textWithoutUrls) ? "url_plus_problem" : "url_only";
  }

  if (!textWithoutUrls) {
    return "unknown";
  }

  if (looksVague(textWithoutUrls)) {
    return "free_text_vague";
  }

  if (looksProblemLike(textWithoutUrls) || textWithoutUrls.split(/\s+/).length >= 6) {
    return "free_text_problem";
  }

  return "unknown";
}
