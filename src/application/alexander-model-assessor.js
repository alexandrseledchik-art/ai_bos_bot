import {
  ALEXANDER_DECISION_MODEL_VERSION,
  selectAlexanderPlaybook
} from "../domain/alexander-decision-model.js";

function normalize(value) {
  return String(value || "").trim();
}

function questionCount(value) {
  return (normalize(value).match(/\?/g) || []).length;
}

function hasNextMove(value) {
  return /(\?|пришли|отправь|покажи|назови|уточни|выбери|открой|зафиксир|давай|можем|предлагаю|следующ)/i.test(normalize(value));
}

export function assessAlexanderModelAlignment({ context = {}, decision = {} } = {}) {
  const response = normalize(decision.response?.responseText);
  const playbook = selectAlexanderPlaybook(context);
  const issues = [];

  if (/(?:^|\s)я\s+(?:и\s+есть\s+)?александр(?:[\s.,!?]|$)|пишу\s+вам\s+как\s+александр/i.test(response)) {
    issues.push({ code: "impersonates_alexander", penalty: 35 });
  }
  if (/knownFacts|entryState|graphPacket|skillSelection|businessStateMode|operatingMode/i.test(response)) {
    issues.push({ code: "internal_language_exposed", penalty: 25 });
  }
  if (/(^|\n)\s*(что я понял|гипотезы|почему это важно|следующий шаг)\s*:/i.test(response)) {
    issues.push({ code: "visible_response_template", penalty: 15 });
  }
  if (questionCount(response) > 1 && ["entry_clarification", "diagnostic_reasoning", "human_handoff"].includes(playbook.id)) {
    issues.push({ code: "too_many_questions", penalty: 15 });
  }
  if (/главн[а-я\s]+ограничени|точн[а-я\s]+причин|корень\s+проблем/i.test(response) && !/гипотез|верси|провер|пока/i.test(response)) {
    issues.push({ code: "premature_certainty", penalty: 20 });
  }
  if (!hasNextMove(response) && playbook.id !== "natural_dialogue") {
    issues.push({ code: "missing_next_move", penalty: 15 });
  }
  if (playbook.id !== "human_handoff" && /t\.me\/seledchikpro|связаться\s+с\s+александр/i.test(response) && response.length < 220) {
    issues.push({ code: "route_before_value", penalty: 15 });
  }

  const score = Math.max(0, 100 - issues.reduce((total, issue) => total + issue.penalty, 0));
  return {
    version: ALEXANDER_DECISION_MODEL_VERSION,
    playbook: playbook.id,
    score,
    status: score >= 85 ? "aligned" : score >= 65 ? "review" : "misaligned",
    issues: issues.map(({ code }) => code)
  };
}
