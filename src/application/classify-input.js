const URL_PATTERN = /\bhttps?:\/\/[^\s]+/gi;

const VAGUE_PATTERNS = [
  /разобрать бизнес/i,
  /увеличить прибыль/i,
  /что-?то не так/i,
  /хочу понять,? что происходит/i,
  /нужна диагностика/i,
  /помоги с бизнесом/i,
  /хочу рост/i,
  /хочу порядок/i,
  /хочу разобраться/i
];

const PROBLEM_PATTERNS = [
  /выручк/i,
  /прибыл/i,
  /марж/i,
  /лид/i,
  /заяв/i,
  /конверс/i,
  /воронк/i,
  /продаж/i,
  /ответ/i,
  /очеред/i,
  /обработ/i,
  /рост/i,
  /не раст/i,
  /упал/i,
  /просел/i,
  /дорог/i,
  /касс/i,
  /команд/i,
  /собственник/i,
  /отдел/i,
  /реклам/i,
  /сайт/i,
  /лендинг/i,
  /сервис/i
];

export function extractUrls(text) {
  const matches = text.match(URL_PATTERN) || [];
  return [...new Set(matches.map((item) => item.trim().replace(/[),.;!?]+$/, "")))];
}

function countWords(text) {
  return text.split(/\s+/).filter(Boolean).length;
}

export function classifyInput(text) {
  const trimmed = text.trim();
  const urls = extractUrls(trimmed);
  const cleanText = trimmed.replace(URL_PATTERN, " ").replace(/\s+/g, " ").trim();
  const wordCount = countWords(cleanText);
  const hasProblemMarkers = PROBLEM_PATTERNS.some((pattern) => pattern.test(cleanText));
  const matchesExplicitVagueIntent = VAGUE_PATTERNS.some((pattern) => pattern.test(cleanText));
  const matchesUnknownIntent = /^(не понимаю|неясно|не знаю)$/i.test(cleanText);
  const looksVague =
    matchesExplicitVagueIntent ||
    wordCount <= 5 ||
    /^(помоги|что делать|нужен совет|не понимаю)$/i.test(cleanText);

  let type = "unknown";

  if (urls.length > 0 && !cleanText) {
    type = "url_only";
  } else if (urls.length > 0 && cleanText) {
    type = "url_plus_problem";
  } else if (!urls.length && matchesUnknownIntent) {
    type = "unknown";
  } else if (!urls.length && looksVague) {
    type = "free_text_vague";
  } else if (!urls.length && hasProblemMarkers) {
    type = "free_text_problem";
  }

  return {
    type,
    urls,
    cleanText: cleanText || trimmed,
    wordCount,
    hasProblemMarkers,
    looksVague
  };
}
