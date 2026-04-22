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
