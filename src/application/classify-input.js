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
  /люд/i,
  /собственник/i,
  /отдел/i,
  /реклам/i,
  /сайт/i,
  /лендинг/i,
  /сервис/i
];

const TOOL_DISCOVERY_PATTERNS = [
  /подбери\s+инструмент/i,
  /какой\s+инструмент/i,
  /нужен\s+инструмент/i,
  /дай\s+инструмент/i,
  /посоветуй\s+инструмент/i,
  /нужен\s+шаблон/i,
  /дай\s+шаблон/i,
  /чек-?лист/i,
  /таблиц[ау]/i
];

const SPECIFIC_TOOL_PATTERNS = [
  /\braci\b/i,
  /\bрас[иi]\b/i,
  /\bsipoc\b/i,
  /\bswot\b/i,
  /\bpestel\b/i,
  /\bjtbd\b/i,
  /job\s+to\s+be\s+done/i,
  /матриц[ау]\s+ответственност/i,
  /юнит-?экономик/i,
  /unit\s+economics/i,
  /scorecard/i,
  /дашборд/i,
  /регламент/i,
  /roadmap|роадмап/i
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
  const hasToolDiscoveryIntent = TOOL_DISCOVERY_PATTERNS.some((pattern) => pattern.test(cleanText));
  const hasSpecificToolIntent = SPECIFIC_TOOL_PATTERNS.some((pattern) => pattern.test(cleanText));
  const matchesExplicitVagueIntent = VAGUE_PATTERNS.some((pattern) => pattern.test(cleanText));
  const matchesUnknownIntent = /^(не понимаю|неясно|не знаю)$/i.test(cleanText);
  const hasConcreteProblemSignal =
    hasProblemMarkers &&
    /(не\s+\S+|не хватает|не успева|не справля|перегруж|тонут|много|мало|просел|упал|падает|срыва|завис|долго|очеред|теря|дорог|буксу)/i.test(
      cleanText
    );
  const looksVague =
    matchesExplicitVagueIntent ||
    (wordCount <= 5 && !hasConcreteProblemSignal) ||
    /^(помоги|что делать|нужен совет|не понимаю)$/i.test(cleanText);

  let type = "unknown";
  let entryMode = "unclear";

  if (urls.length > 0 && !cleanText) {
    type = "url_only";
    entryMode = "url_only";
  } else if (urls.length > 0 && cleanText) {
    type = "url_plus_problem";
    entryMode = "url_plus_problem";
  } else if (!urls.length && hasSpecificToolIntent) {
    type = "free_text_vague";
    entryMode = "specific_tool_request";
  } else if (!urls.length && hasToolDiscoveryIntent) {
    type = "free_text_vague";
    entryMode = "tool_discovery";
  } else if (!urls.length && matchesUnknownIntent) {
    type = "unknown";
    entryMode = "unclear";
  } else if (!urls.length && hasConcreteProblemSignal && !matchesExplicitVagueIntent) {
    type = "free_text_problem";
    entryMode = "problem_first";
  } else if (!urls.length && looksVague) {
    type = "free_text_vague";
    entryMode = "unclear";
  } else if (!urls.length && hasProblemMarkers) {
    type = "free_text_problem";
    entryMode = "problem_first";
  }

  return {
    type,
    entryMode,
    urls,
    cleanText: cleanText || trimmed,
    wordCount,
    hasProblemMarkers,
    hasToolDiscoveryIntent,
    hasSpecificToolIntent,
    looksVague,
    hasConcreteProblemSignal
  };
}
