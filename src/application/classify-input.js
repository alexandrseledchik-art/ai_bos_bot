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
  /цифр/i,
  /правд/i,
  /лид/i,
  /заяв/i,
  /конверс/i,
  /покуп/i,
  /интерес/i,
  /воронк/i,
  /продаж/i,
  /ответ/i,
  /очеред/i,
  /обработ/i,
  /путь/i,
  /рост/i,
  /не раст/i,
  /упал/i,
  /просел/i,
  /дорог/i,
  /касс/i,
  /команд/i,
  /люд/i,
  /сотрудник/i,
  /ключев/i,
  /собственник/i,
  /отдел/i,
  /реклам/i,
  /канал/i,
  /привлеч/i,
  /сайт/i,
  /лендинг/i,
  /сервис/i,
  /продукт/i,
  /линейк/i,
  /процесс/i,
  /crm/i,
  /ручн/i,
  /перенос/i,
  /дублир/i,
  /данн/i,
  /метрик/i,
  /аналитик/i,
  /отч[её]т/i,
  /решени/i,
  /стратег/i,
  /фокус/i,
  /инициатив/i,
  /проект/i,
  /довод/i,
  /масштаб/i,
  /тираж/i,
  /филиал/i,
  /регион/i,
  /повтор/i,
  /направлен/i,
  /ниш/i,
  /рынок/i,
  /санкц/i,
  /конкурент/i,
  /законодатель/i,
  /курс/i,
  /кризис/i,
  /потолок/i,
  /стабил/i
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
  const hasOperationalPainSignal =
    /(ручн|перенос|дублир|crm|систем[аы]\s+не\s+связ|процесс|нет\s+метрик|не\s+видим|разные\s+цифр|своя\s+версия\s+правд|спорят\s+о\s+цифр|отч[её]т|аналитик|непонятно[^а-яё0-9]+куда\s+движ|много\s+инициатив|мало\s+что\s+довод|решени[яй]\s+.*не\s+связан|отделы\s+.*сам\s+по\s+себе|новые\s+направлен|старый\s+бизнес\s+.*проседа|ключев[а-яё]+\s+сотрудник|одного-двух\s+ключев|потолок\s+достиг|продуктов[а-яё]+\s+линейк[а-яё]+\s+разрос|старые\s+канал[а-яё]+\s+.*перестал|хорошо\s+прода[её]т.*плохо\s+исполня|внешн[а-яё]+\s+изменен|рынок,\s*курс|санкц|законодательств|не\s+повторя|не\s+тираж|нет\s+прибыл|прибыли\s+нет)/i.test(
      cleanText
    );
  const hasConcreteProblemSignal =
    (hasProblemMarkers || hasOperationalPainSignal) &&
    /(не\s+\S+|нет\s+(прибыл|денег|заяв|рост|фокус|стратег|метрик|цифр|продаж)|прибыли\s+нет|не хватает|не успева|не справля|перегруж|тонут|много|мало|просел|проседа|упал|падает|срыва|завис|долго|длинн|нестабил|очеред|теря|дорог|буксу|ручн|перенос|дублир|спорят|своя\s+версия|сам\s+по\s+себе|непонятно|нет\s+нормальн|потолок\s+достиг|разрос|перестал|плохо|паник|заканчива|хочет\s+нов|хочу\s+нов|новую\s+ниш|новый\s+рынок|новый\s+сегмент|новый\s+продукт|не\s+повторя|не\s+тираж|доводится)/i.test(
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
  } else if (!urls.length && hasConcreteProblemSignal && !matchesExplicitVagueIntent) {
    type = "free_text_problem";
    entryMode = "problem_first";
  } else if (!urls.length && hasSpecificToolIntent && !hasConcreteProblemSignal) {
    type = "free_text_vague";
    entryMode = "specific_tool_request";
  } else if (!urls.length && hasToolDiscoveryIntent && !hasConcreteProblemSignal) {
    type = "free_text_vague";
    entryMode = "tool_discovery";
  } else if (!urls.length && matchesUnknownIntent) {
    type = "unknown";
    entryMode = "unclear";
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
