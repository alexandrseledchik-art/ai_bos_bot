import {
  SITE_NAVIGATOR_ROUTES,
  selectSiteNavigatorRoute,
  selectSiteNavigatorSources
} from "../domain/site-navigator-knowledge.js";

function normalize(value, maxLength = 1600) {
  return String(value || "").trim().slice(0, maxLength);
}

function normalizeHistory(history = []) {
  return (Array.isArray(history) ? history : [])
    .slice(-6)
    .map((item) => ({
      role: item?.role === "assistant" ? "assistant" : "user",
      text: normalize(item?.text, 900)
    }))
    .filter((item) => item.text);
}

function readOutputText(payload) {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  for (const item of payload?.output || []) {
    for (const content of item?.content || []) {
      if (content?.type === "output_text" && content.text?.trim()) return content.text.trim();
    }
  }

  throw new Error("Site navigator response did not contain text.");
}

export class SiteNavigatorService {
  constructor({
    apiKey,
    baseUrl = "https://api.openai.com/v1",
    model,
    reasoningEffort = "low",
    fetchImpl = fetch,
    composeReply = null
  } = {}) {
    this.apiKey = apiKey;
    this.baseUrl = String(baseUrl || "https://api.openai.com/v1").replace(/\/$/, "");
    this.model = model;
    this.reasoningEffort = reasoningEffort;
    this.fetchImpl = fetchImpl;
    this.composeReply = composeReply;
  }

  async answer({ question, history = [], page = {} } = {}) {
    const userQuestion = normalize(question);
    if (!userQuestion) throw new Error("Question is required.");

    const pagePath = normalize(page?.path, 300);
    const route = selectSiteNavigatorRoute(userQuestion, pagePath);
    const sources = selectSiteNavigatorSources(userQuestion, { pagePath, route });
    const trustedContext = {
      pageType: pagePath.includes("/books/business-assembly") ? "book" : "main_site",
      pagePath,
      route,
      sources: sources.map(({ title, url, summary }) => ({ title, url, summary }))
    };

    const answer = this.composeReply
      ? await this.composeReply({ question: userQuestion, history: normalizeHistory(history), context: trustedContext })
      : await this.composeWithModel({ question: userQuestion, history: normalizeHistory(history), context: trustedContext });

    return {
      answer: normalize(answer, 1800),
      route,
      cta: SITE_NAVIGATOR_ROUTES[route] || SITE_NAVIGATOR_ROUTES.general,
      sources: sources.slice(0, 3).map(({ title, url }) => ({ title, url })),
      skill: "site_navigator"
    };
  }

  async composeWithModel({ question, history, context }) {
    if (!this.apiKey || !this.model) {
      throw new Error("Site navigator model is not configured.");
    }

    const response = await this.fetchImpl(`${this.baseUrl}/responses`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.model,
        reasoning: { effort: this.reasoningEffort },
        max_output_tokens: 700,
        input: [
          {
            role: "system",
            content: [{
              type: "input_text",
              text: [
                "Ты site_navigator — AI‑помощник сайта Александра Селедчика, но не сам Александр.",
                "Твоя роль: помочь посетителю понять книгу, опыт и кейсы Александра и выбрать маршрут между книгой, первичной диагностикой, AI‑BOSS и личной работой.",
                "Отвечай только по фактам из переданных источников. Не используй внешние знания и не придумывай результаты, услуги, цены или биографические факты.",
                "Если в источниках нет ответа, прямо скажи об этом и предложи подходящий маршрут или связь с Александром.",
                "Не проводи диагностику бизнеса, не называй причины проблем и не выдавай рекомендации по управлению конкретной компанией. Можно задать не более одного короткого уточняющего вопроса для выбора маршрута.",
                "Не утверждай, что ты Александр. Пиши по-русски, живо и кратко: обычно 2–4 небольших абзаца, без служебных заголовков и без Markdown-ссылок.",
                "Не перечисляй источники в тексте: интерфейс покажет проверенные ссылки отдельно. Заверши понятным следующим шагом, соответствующим route."
              ].join("\n")
            }]
          },
          {
            role: "user",
            content: [{
              type: "input_text",
              text: JSON.stringify({ question, history, trustedContext: context }, null, 2)
            }]
          }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`Site navigator model error ${response.status}: ${await response.text()}`);
    }

    return readOutputText(await response.json());
  }
}
