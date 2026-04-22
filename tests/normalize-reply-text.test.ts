import test from "node:test";
import assert from "node:assert/strict";

import { normalizeReplyText } from "@/lib/formatting/normalize-reply-text";

test("removes leading greeting", () => {
  assert.equal(
    normalizeReplyText("Привет! Вы хотите продать бизнес. Что сейчас мешает этому?"),
    "Вы хотите продать бизнес. Что сейчас мешает этому?",
  );
});

test("removes leading acknowledgement", () => {
  assert.equal(
    normalizeReplyText("Понял, похоже, сейчас главный вопрос в зависимости от собственника."),
    "Похоже, сейчас главный вопрос в зависимости от собственника.",
  );
});

test("removes universal trailing cta", () => {
  assert.equal(
    normalizeReplyText(
      "Похоже, сейчас узкое место в подготовке бизнеса к продаже.\n\nЧтобы продолжить, уточните: какой запрос хотите разобрать дальше?",
    ),
    "Похоже, сейчас узкое место в подготовке бизнеса к продаже.",
  );
});

test("removes trailing cta with 1-2 phrases tail", () => {
  assert.equal(
    normalizeReplyText(
      "Внешне видно продукт и оффер.\n\nЧто дальше:\nЧтобы продолжить, уточните: какой запрос хотите разобрать дальше?\nНапишите запрос в 1–2 фразах.",
    ),
    "Внешне видно продукт и оффер.",
  );
});
