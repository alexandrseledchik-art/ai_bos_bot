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
  "Соберите бизнес как систему",
  "Разобрать текущую задачу",
  "Выберите точку входа",
  "С чего хотите начать?",
  "Основные экраны платформы",
  "От общей картины — к собранному бизнесу",
  "Познакомиться с платформой",
  "С чего начнём работу?",
  "Продолжаем с того места, где остановились",
  "Архитектура бизнеса",
  "Как выбрать глубину диагностики",
  "Выберите глубину: быстрый обзор всей системы",
  "Диагностика помогает оценить, насколько собраны разные части бизнеса",
  "Время прохождения",
  "10–15 минут",
  "60–90 минут",
  "4–6 часов",
  "Смотрим на бизнес целиком",
  "Разбираем выбранную часть бизнеса",
  "Детально проверяем конкретную зону",
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
  "welcome-hero",
  "welcome-entry-grid",
  "welcome-choice-title",
  "entry-or",
  "system-flow-grid",
  "system-assistant-note",
  "tour-start-button",
  "tour-spotlight",
  "tour-tooltip",
  "ready-entry-grid",
  "dashboard-guide",
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

for (const tourContract of [
  "PLATFORM_TOUR_STEPS",
  "startPlatformTour",
  "data-tour-target",
  "data-tour-next",
  "data-tour-prev",
  "data-tour-skip"
]) {
  assert.equal(mainSource.includes(tourContract), true, `Platform tour must include: ${tourContract}`);
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
