import test from "node:test";
import assert from "node:assert/strict";

import { classifyInputType } from "@/lib/context/classify-input";

test("classifies url only", () => {
  assert.equal(classifyInputType("https://example.com"), "url_only");
});

test("classifies url plus problem", () => {
  assert.equal(
    classifyInputType("https://example.com хочу понять почему просели продажи"),
    "url_plus_problem",
  );
});

test("classifies vague free text", () => {
  assert.equal(classifyInputType("хочу разобрать бизнес"), "free_text_vague");
});

test("classifies problem free text", () => {
  assert.equal(
    classifyInputType("продажи просели, собственник тащит всё на себе, хочу понять ограничение"),
    "free_text_problem",
  );
});

test("classifies unknown short text", () => {
  assert.equal(classifyInputType("ага"), "unknown");
});
