function extractTagText(html, tagName, maxItems = 3) {
  const pattern = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "gi");
  const items = [];
  let match;

  while ((match = pattern.exec(html)) && items.length < maxItems) {
    const text = stripHtml(match[1]);
    if (text) {
      items.push(text);
    }
  }

  return items;
}

function extractMeta(html, name) {
  const patterns = [
    new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${name}["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+property=["']${name}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${name}["'][^>]*>`, "i")
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      return decodeHtml(match[1]);
    }
  }

  return "";
}

function stripHtml(value) {
  return decodeHtml(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function decodeHtml(value) {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function detectSiteType({ title, description, heading }) {
  const haystack = `${title} ${description} ${heading}`.toLowerCase();

  if (/курс|обучени|academy|school/.test(haystack)) {
    return "образовательный продукт";
  }
  if (/crm|erp|platform|saas|автоматизац/.test(haystack)) {
    return "B2B-сервис или SaaS";
  }
  if (/shop|store|каталог|товар|купить/.test(haystack)) {
    return "e-commerce или каталог";
  }
  if (/agency|marketing|studio|консалт|consult/.test(haystack)) {
    return "сервисный бизнес или агентство";
  }
  return "лендинг или продуктовый сайт";
}

function buildObservations({ heading, ctas, title, description }) {
  const observations = [];

  if (heading) {
    observations.push(`Первый экран обещает: "${heading}".`);
  }

  if (description) {
    observations.push(`Мета-описание усиливает сообщение: "${description}".`);
  }

  if (ctas.length > 0) {
    observations.push(`Есть явный CTA: ${ctas.slice(0, 2).join(", ")}.`);
  } else {
    observations.push("Явный CTA из HTML не считывается сразу.");
  }

  if (title && title.length < 45) {
    observations.push("Title короткий, возможно позиционирование сфокусировано, но контекста пока мало.");
  }

  return observations;
}

function buildCanNotAssert() {
  return [
    "Нельзя утверждать по сайту, что именно ломает экономику бизнеса.",
    "Нельзя делать выводы о качестве команды, оргструктуры и операционного контура без прямых данных.",
    "Нельзя уверенно судить о спросе, юнит-экономике и повторных продажах по одному URL."
  ];
}

export class WebsiteScreener {
  constructor({ timeoutMs = 6000 } = {}) {
    this.timeoutMs = timeoutMs;
  }

  async screen(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: {
          "user-agent": "BusinessDiagnosticBot/0.1"
        }
      });
      const html = await response.text();
      const title = extractTagText(html, "title", 1)[0] || "";
      const headings = extractTagText(html, "h1", 3);
      const description = extractMeta(html, "description") || extractMeta(html, "og:description");
      const ctas = [
        ...extractTagText(html, "button", 3),
        ...extractTagText(html, "a", 5).filter((item) =>
          /(demo|contact|book|start|купить|заказать|оставить|получить|связаться|пробн)/i.test(item)
        )
      ].slice(0, 3);

      const siteType = detectSiteType({
        title,
        description,
        heading: headings[0] || ""
      });

      const knownFacts = [
        `URL: ${url}`,
        `HTTP status: ${response.status}`,
        title ? `Title: ${title}` : "",
        headings[0] ? `H1: ${headings[0]}` : "",
        description ? `Meta description: ${description}` : "",
        `Предположительный тип сайта: ${siteType}`
      ].filter(Boolean);

      const observations = buildObservations({
        heading: headings[0] || "",
        ctas,
        title,
        description
      });

      return {
        url,
        knownFacts,
        observations,
        canNotAssert: buildCanNotAssert(),
        raw: {
          title,
          headings,
          description,
          ctas,
          siteType
        }
      };
    } catch (error) {
      return {
        url,
        knownFacts: [`URL: ${url}`, `Не удалось загрузить сайт: ${error.message}`],
        observations: [
          "Внешний скрининг ограничен, потому что HTML страницы недоступен из текущей среды."
        ],
        canNotAssert: buildCanNotAssert(),
        raw: {
          error: error.message
        }
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
