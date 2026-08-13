const SOURCE_GROUPS = Object.freeze({
  author: ["author", "cases"],
  book: ["book", "articles"],
  diagnostic: ["diagnostic", "articles"],
  ai_boss: ["ai_boss", "book"],
  consulting: ["consulting", "cases", "author"],
  articles: ["articles", "book"],
  general: ["consulting", "diagnostic", "book", "ai_boss", "author"]
});

export const SITE_NAVIGATOR_SOURCES = Object.freeze([
  {
    id: "author-overview",
    group: "author",
    title: "Александр Селедчик — опыт и подход",
    url: "https://seledchik.ru/#about",
    keywords: ["александр", "автор", "опыт", "кто", "подход", "эксперт", "предприниматель", "инвестор"],
    summary: "Александр Селедчик — предприниматель, инвестор и автор. 15 лет в управлении и консалтинге, 1,5+ млрд рублей общего оборота собственного бизнеса; работал с компаниями масштаба до 10 млрд рублей. Его фокус — растущие прибыльные компании, которые уже не могут расти на личном контроле собственника."
  },
  {
    id: "book-overview",
    group: "book",
    title: "Книга «Бизнес. Инструкция по сборке»",
    url: "https://seledchik.ru/books/business-assembly/",
    keywords: ["книга", "внутри", "содержание", "глав", "читать", "инструкция", "сборк"],
    summary: "Настольная книга собственника о том, как увидеть бизнес как систему: от клиента, продукта и продаж до операций, финансов, ролей, данных и технологий. В ней 35 глав, около 200 страниц и более 300 инструментов. Книга предназначена прежде всего для собственников, которые хотят перейти от ручного управления к архитектуре бизнеса."
  },
  {
    id: "book-structure",
    group: "book",
    title: "Содержание и практикумы книги",
    url: "https://seledchik.ru/books/business-assembly/#inside",
    keywords: ["части", "содержание", "структура", "главы", "практикум", "инструмент", "что внутри"],
    summary: "Книга проходит путь от первого взгляда на бизнес и условий игры к ценности и спросу, результату, устойчивости и точке сборки. Каждая часть завершается практикумом, который помогает применить материал к своему бизнесу."
  },
  {
    id: "diagnostic",
    group: "diagnostic",
    title: "Диагностика системы управления",
    url: "https://seledchik.ru/diagnostika/?utm_source=site_navigator&utm_medium=widget",
    keywords: ["диагност", "оценить", "состояние", "с чего начать", "проблем", "хаос", "управляем", "операцион", "проверить компанию"],
    summary: "Диагностика состоит из 10 коротких вопросов и занимает примерно 4–6 минут. Она показывает зрелость системы управления и три зоны, с которых логичнее начать изменения. Это первичный срез, а не полноценный диагноз бизнеса."
  },
  {
    id: "ai-boss",
    group: "ai_boss",
    title: "Платформа AI‑BOSS",
    url: "https://aiboss.seledchik.ru/app?utm_source=seledchik&utm_medium=site_navigator",
    keywords: ["ai-boss", "ai boss", "платформ", "инструмент", "кабинет", "память", "применить", "работать с системой"],
    summary: "AI‑BOSS — рабочая платформа для применения системного подхода к конкретной компании. В ней соединяются диагностика, инструменты и память компании, чтобы последовательно собирать систему управления."
  },
  {
    id: "consulting",
    group: "consulting",
    title: "Работа с Александром",
    url: "https://seledchik.ru/#work",
    keywords: ["помочь", "работа", "консалт", "сопровожд", "разбор", "проект", "партнер", "партнёр", "связаться", "консультац"],
    summary: "Форматы работы: стратегический разбор, сопровождение собственника, проект по пересборке управления, партнёрство и инвестиции. Александр особенно полезен прибыльным растущим компаниям, где решения, контроль и ключевые связи всё ещё замыкаются на собственнике."
  },
  {
    id: "case-mpstats",
    group: "cases",
    title: "Кейс MPSTATS",
    url: "https://seledchik.ru/mpstats/",
    keywords: ["mpstats", "кейс", "маркетплейс", "масштаб", "команд", "продажа компании"],
    summary: "MPSTATS прошёл путь от стартапа из четырёх человек до лидера рынка аналитики маркетплейсов: команда выросла до 500 человек, оценка компании перед сделкой достигла 10 млрд рублей, сумма продажи банку Точка — 2 млрд рублей."
  },
  {
    id: "case-heavy-booster",
    group: "cases",
    title: "Кейс Heavy Booster",
    url: "https://seledchik.ru/heavybooster/",
    keywords: ["heavy booster", "кейс", "e-commerce", "маркетплейс", "собственный бизнес", "оборот", "операцион"],
    summary: "Heavy Booster — собственный e-commerce-бизнес Александра. После неудачного старта компания была пересобрана через стратегию, экономику, команду и операции; совокупный оборот превысил 1,5 млрд рублей, оборот за 2025 год составил 620 млн рублей."
  },
  {
    id: "case-haval",
    group: "cases",
    title: "Кейс HAVAL",
    url: "https://seledchik.ru/haval/",
    keywords: ["haval", "хавал", "кейс", "продаж", "команд", "прибыл", "выручк", "дилер"],
    summary: "В кейсе HAVAL первоначальный запрос на аудит продаж привёл к пересборке управленческой конструкции отдела. Через год компания стала первой по доле рынка, выручка выросла в три раза, чистая прибыль — в пять раз."
  },
  {
    id: "case-rolf",
    group: "cases",
    title: "Кейс РОЛЬФ",
    url: "https://seledchik.ru/rolf/",
    keywords: ["рольф", "rolf", "кейс", "автомобил", "карьера", "продаж", "руководител"],
    summary: "В РОЛЬФ Александр за 11 лет прошёл путь от техника до директора по продажам. Собранная им команда установила мировой рекорд — 350 проданных автомобилей за один месяц."
  },
  {
    id: "articles",
    group: "articles",
    title: "Статьи о системном управлении",
    url: "https://seledchik.ru/articles/",
    keywords: ["статья", "материал", "почитать", "стратег", "процесс", "делегир", "crm", "мотивац", "роль", "ритм", "продаж"],
    summary: "На сайте собраны практические статьи о стратегии, ролях, процессах, продажах, CRM, управленческом ритме, делегировании и выходе собственника из операционной работы."
  }
]);

export const SITE_NAVIGATOR_ROUTES = Object.freeze({
  book: {
    label: "О книге",
    url: "https://seledchik.ru/books/business-assembly/"
  },
  diagnostic: {
    label: "Пройти диагностику",
    url: "https://seledchik.ru/diagnostika/?utm_source=site_navigator&utm_medium=widget"
  },
  ai_boss: {
    label: "Открыть AI‑BOSS",
    url: "https://aiboss.seledchik.ru/app?utm_source=seledchik&utm_medium=site_navigator"
  },
  consulting: {
    label: "Связаться с Александром",
    url: "https://t.me/seledchikpro"
  },
  author: {
    label: "Об Александре",
    url: "https://seledchik.ru/#about"
  },
  articles: {
    label: "Открыть статьи",
    url: "https://seledchik.ru/articles/"
  },
  general: {
    label: "Посмотреть направления",
    url: "https://seledchik.ru/#ecosystem"
  }
});

function normalize(value) {
  return String(value || "").trim().toLowerCase().replace(/ё/g, "е");
}

export function selectSiteNavigatorRoute(question, pagePath = "") {
  const text = normalize(question);
  const path = normalize(pagePath);

  if (/связ|созвон|обсуд|консультац|работать с александр|личн.*работ|помощь александр|чем александр|проект|сопровожд/.test(text)) return "consulting";
  if (/ai[\s‑-]?boss|платформ|кабинет|память компан|рабоч.*инструмент/.test(text)) return "ai_boss";
  if (/диагност|оценить.*компан|с чего начать измен|где начать|состояние компан|проверить.*управлен/.test(text)) return "diagnostic";
  if (/книг|что внутри|содержан|сколько глав|читать/.test(text)) return "book";
  if (/кто.*александр|об автор|опыт|кейс|результат/.test(text)) return "author";
  if (/стать|почитать|материал/.test(text)) return "articles";
  if (path.includes("/books/business-assembly")) return "book";
  return "general";
}

export function selectSiteNavigatorSources(question, { pagePath = "", route = "" } = {}) {
  const normalizedQuestion = normalize(question);
  const normalizedPath = normalize(pagePath);
  const selectedRoute = route || selectSiteNavigatorRoute(question, pagePath);
  const preferredGroups = SOURCE_GROUPS[selectedRoute] || SOURCE_GROUPS.general;

  const ranked = SITE_NAVIGATOR_SOURCES
    .map((source) => {
      let score = Math.max(0, 5 - preferredGroups.indexOf(source.group));
      if (!preferredGroups.includes(source.group)) score = 0;
      for (const keyword of source.keywords) {
        if (normalizedQuestion.includes(normalize(keyword))) score += 4;
      }
      try {
        const sourcePath = new URL(source.url).pathname.toLowerCase();
        if (sourcePath !== "/" && normalizedPath.startsWith(sourcePath.replace(/\/$/, ""))) score += 6;
      } catch {
        // All production sources are validated constants; keep retrieval resilient in tests.
      }
      return { source, score };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score);

  const selected = selectedRoute === "general"
    ? ranked.filter((item, index, items) => items.findIndex((candidate) => candidate.source.group === item.source.group) === index)
    : ranked;

  return selected.slice(0, 4).map((item) => item.source);
}
