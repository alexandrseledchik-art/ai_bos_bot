import assert from "node:assert/strict";
import { handleSiteNavigatorRequest } from "../../api/site-navigator.js";
import { SiteNavigatorService } from "../application/site-navigator-service.js";
import {
  selectSiteNavigatorRoute,
  selectSiteNavigatorSources
} from "../domain/site-navigator-knowledge.js";

assert.equal(selectSiteNavigatorRoute("Подойдёт ли мне книга?"), "book");
assert.equal(selectSiteNavigatorRoute("С чего начать изменения в компании?"), "diagnostic");
assert.equal(selectSiteNavigatorRoute("Чем Александр может помочь?"), "consulting");
assert.equal(selectSiteNavigatorRoute("Хочу обсудить проект лично"), "consulting");
assert.equal(selectSiteNavigatorRoute("Как работает платформа AI-BOSS?"), "ai_boss");

const bookSources = selectSiteNavigatorSources("Что внутри книги?", {
  pagePath: "/books/business-assembly/",
  route: "book"
});
assert.equal(bookSources[0].id, "book-overview");
assert.ok(bookSources.every((source) => source.url.startsWith("https://")));

let capturedContext;
const service = new SiteNavigatorService({
  composeReply: async ({ context }) => {
    capturedContext = context;
    return "Книга подходит собственнику, которому важно увидеть бизнес как единую систему.";
  }
});
const result = await service.answer({
  question: "Подойдёт ли мне книга?",
  history: [{ role: "user", text: "Я собственник растущего бизнеса" }],
  page: { path: "/books/business-assembly/" }
});
assert.equal(result.skill, "site_navigator");
assert.equal(result.route, "book");
assert.equal(result.cta.label, "О книге");
assert.ok(result.sources.length > 0);
assert.equal(capturedContext.pageType, "book");
assert.ok(capturedContext.sources.every((source) => source.summary && source.url));

const preflight = await handleSiteNavigatorRequest(new Request("https://aibosbot.test/api/site-navigator", {
  method: "OPTIONS",
  headers: { origin: "https://seledchik.ru" }
}));
assert.equal(preflight.status, 204);
assert.equal(preflight.headers.get("access-control-allow-origin"), "https://seledchik.ru");

const disallowedOrigin = await handleSiteNavigatorRequest(new Request("https://aibosbot.test/api/site-navigator", {
  method: "POST",
  headers: { origin: "https://example.com", "content-type": "application/json" },
  body: JSON.stringify({ question: "Что внутри книги?" })
}));
assert.equal(disallowedOrigin.status, 403);

const emptyQuestion = await handleSiteNavigatorRequest(new Request("https://aibosbot.test/api/site-navigator", {
  method: "POST",
  headers: { origin: "https://seledchik.ru", "content-type": "application/json" },
  body: JSON.stringify({ question: "" })
}));
assert.equal(emptyQuestion.status, 400);

console.log("Site navigator checks passed.");
