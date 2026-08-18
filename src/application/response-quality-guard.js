function normalize(value) {
  return String(value || "").trim();
}

function inferRussianContext(context = {}) {
  const sample = [
    context.userText,
    ...((context.history || []).slice(-6).map((item) => item?.text))
  ].map(normalize).join(" ");
  const cyrillic = (sample.match(/[А-Яа-яЁё]/g) || []).length;
  const latin = (sample.match(/[A-Za-z]/g) || []).length;
  return !sample || cyrillic >= latin;
}

function stripForeignScriptTokens(value) {
  const foreignScript = /[\u0530-\u058f\u0590-\u05ff\u0600-\u06ff\u0900-\u097f\u10a0-\u10ff\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/u;
  return normalize(value)
    .replace(/եթե/giu, (token) => token[0] === token[0].toUpperCase() ? "Если" : "если")
    .split(/(\s+)/)
    .filter((token) => !foreignScript.test(token))
    .join("")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function limitQuestionSentences(value, maxQuestions) {
  if (maxQuestions == null) return normalize(value);
  const text = normalize(value);
  if (!text) return "";
  const segments = text.match(/[^.!?…]*[.!?…]+|[^.!?…]+$/gu) || [text];
  let keptQuestions = 0;
  const kept = [];

  for (const segment of segments) {
    const questions = (segment.match(/\?/g) || []).length;
    if (!questions) {
      kept.push(segment);
      continue;
    }
    if (keptQuestions >= maxQuestions) continue;
    kept.push(segment);
    keptQuestions += questions;
  }

  return kept.join("")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function enforceResponseQuality({ text, context = {}, maxQuestions = 1 } = {}) {
  const original = normalize(text);
  let result = original;
  const issues = [];

  if (inferRussianContext(context)) {
    const sanitized = stripForeignScriptTokens(result);
    if (sanitized !== result) issues.push("foreign_script_removed");
    result = sanitized;
  }

  const limited = limitQuestionSentences(result, maxQuestions);
  if (limited !== result) issues.push("extra_questions_removed");
  result = limited;

  return {
    text: result || original,
    changed: result !== original,
    issues
  };
}
