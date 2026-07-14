import assert from "node:assert/strict";
import fs from "node:fs";
import platformRoute from "../../api/platform/[...path].js";

const routeSource = fs.readFileSync("api/platform/[...path].js", "utf8");
const mainSource = fs.readFileSync("app-assets/src/main.js", "utf8");
const apiSource = fs.readFileSync("app-assets/src/api-client.js", "utf8");
const cssSource = fs.readFileSync("app-assets/styles.css", "utf8");

assert.match(routeSource, /path === "workspace"/);
assert.match(routeSource, /path === "profile"/);
assert.match(routeSource, /toolOpenedMatch/);
assert.equal(routeSource.includes("diagnostics\\/(express|basic|deep)"), true);
assert.match(routeSource, /saveDiagnosticLevelAnswer/);

for (const method of [
  "workspace()",
  "saveProfile(payload)",
  "getDiagnosticLevel(level)",
  "saveDiagnosticAnswer(level, payload)",
  "markToolOpened(toolId)"
]) {
  assert.equal(apiSource.includes(method), true, `API client must expose ${method}`);
}

for (const screenText of [
  "Архитектура бизнеса",
  "Как выбрать глубину диагностики",
  "Полное прохождение",
  "10–15 минут",
  "60–90 минут для всех 72 доменов",
  "4–6 часов для всех 288 поддоменов",
  "11 слоёв бизнеса",
  "Домены внутри выбранных слоёв",
  "Поддомены внутри выбранных доменов",
  "Когда выбирать",
  "Самый низкий балл не обязательно является главным ограничением",
  "Поиск по каталогу",
  "Документы и память",
  "Профиль компании",
  "Спросить AI-BOSS"
]) {
  assert.equal(mainSource.includes(screenText), true, `Platform UI must include: ${screenText}`);
}

for (const className of [
  "layer-grid",
  "diagnostic-list",
  "diagnostic-level-grid",
  "diagnostic-question-list",
  "scope-tabs",
  "domain-tab",
  "tool-grid",
  "document-list",
  "profile-form"
]) {
  assert.match(cssSource, new RegExp(`\\.${className}`));
}

process.env.WEB_SESSION_SECRET = "phase-two-platform-secret-123456";
process.env.TELEGRAM_WEBHOOK_SECRET = "phase-two-platform-secret-123456";
process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";

for (const path of ["workspace", "profile", "tools/tool-id/opened"]) {
  const response = await platformRoute.fetch(new Request(`https://aibosbot.test/api/platform/${path}`, {
    method: path === "workspace" ? "GET" : "POST"
  }));
  assert.equal(response.status, 401, `${path} must require a signed web session`);
}

console.log("Web Platform Phase 2 checks passed.");
