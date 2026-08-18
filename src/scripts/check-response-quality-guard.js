import assert from "node:assert/strict";

import { enforceResponseQuality } from "../application/response-quality-guard.js";

const repaired = enforceResponseQuality({
  text: "Версия уже понятна. Кто принимает решение? Дай ещё один пример? Եթե не подходит — скажи.",
  context: {
    userText: "У нас нет финального владельца решения",
    history: [{ role: "user", text: "Команда получает разные указания" }]
  },
  maxQuestions: 1
});

assert.equal((repaired.text.match(/\?/g) || []).length, 1);
assert.doesNotMatch(repaired.text, /[\u0530-\u058f]/u);
assert.match(repaired.text, /Если не подходит/u);
assert.ok(repaired.issues.includes("extra_questions_removed"));
assert.ok(repaired.issues.includes("foreign_script_removed"));

const natural = enforceResponseQuality({
  text: "Как ты? Что нового?",
  context: { userText: "How are you?" },
  maxQuestions: null
});
assert.equal(natural.text, "Как ты? Что нового?");

console.log("Response quality guard checks passed: one question and Russian-script integrity enforced.");
