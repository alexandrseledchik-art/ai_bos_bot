import { getBusinessLayerByKey } from "../domain/business-layers.js";

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function compactText(value, maxLength = 420) {
  const text = trimString(value).replace(/\s+/g, " ");
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 1).trim()}…`;
}

function layerLabel(layerKey) {
  return getBusinessLayerByKey(layerKey)?.title || layerKey || "Слой бизнеса";
}

function summarizeMaturity(maturity) {
  const scores = maturity?.scores || [];
  const answered = scores.filter((item) =>
    item.score !== null &&
    item.score !== undefined &&
    Number.isFinite(Number(item.score))
  );
  const weakLayers = answered
    .filter((item) => Number(item.score) < 3)
    .sort((left, right) => Number(left.score) - Number(right.score))
    .slice(0, 5)
    .map((item) => ({
      layerKey: item.layerKey,
      title: item.title || layerLabel(item.layerKey),
      score: Number(item.score)
    }));
  const strongLayers = answered
    .filter((item) => Number(item.score) >= 4)
    .sort((left, right) => Number(right.score) - Number(left.score))
    .slice(0, 5)
    .map((item) => ({
      layerKey: item.layerKey,
      title: item.title || layerLabel(item.layerKey),
      score: Number(item.score)
    }));

  return {
    avg_score: maturity?.averageScore ?? 0,
    weak_layers: weakLayers,
    strong_layers: strongLayers,
    completed_layers: maturity?.answeredCount || answered.length || 0
  };
}

function buildConstraintSummary(constraintHypothesis) {
  if (!constraintHypothesis) {
    return "Гипотеза главного ограничения пока не сформирована.";
  }

  const layer = constraintHypothesis.layerTitle || layerLabel(constraintHypothesis.layerKey || constraintHypothesis.layer);
  const title = constraintHypothesis.title || "Гипотеза ограничения";
  const explanation = compactText(constraintHypothesis.explanation || "", 260);

  return explanation
    ? `${title}. Слой: ${layer}. ${explanation}`
    : `${title}. Слой: ${layer}.`;
}

function buildNextStepSummary(nextStep) {
  if (!nextStep) {
    return "Следующий управленческий шаг пока не выбран.";
  }

  const title = nextStep.title || "Следующий шаг";
  const description = compactText(nextStep.description || "", 260);
  const why = compactText(nextStep.why_this_first || nextStep.whyThisFirst || "", 180);

  return [title, description, why ? `Почему первым: ${why}` : ""].filter(Boolean).join(". ");
}

function buildEvidence({ observations = [], documentSnapshots = [], artifacts = [] }) {
  const evidence = [];

  for (const observation of observations || []) {
    const statement = trimString(observation.statement);
    if (!statement) {
      continue;
    }
    evidence.push({
      type: "fact",
      source: observation.source_type === "document" ? "document" : "chat",
      layerKey: observation.layer || "",
      text: statement
    });
  }

  for (const snapshot of documentSnapshots || []) {
    const summary = trimString(snapshot.summary);
    if (!summary) {
      continue;
    }
    evidence.push({
      type: "fact",
      source: "document_snapshot",
      layerKey: "",
      text: compactText(summary, 260)
    });
  }

  for (const artifact of artifacts || []) {
    const summary = trimString(artifact.summary);
    if (!summary) {
      continue;
    }
    evidence.push({
      type: "fact",
      source: "artifact",
      layerKey: "",
      text: compactText(summary, 220)
    });
  }

  return evidence.slice(0, 10);
}

function buildOpenQuestions({ constraintHypothesis, nextStep, documentSnapshots = [], maturitySummary }) {
  const questions = [];

  for (const item of constraintHypothesis?.missingEvidence || []) {
    questions.push(compactText(item, 180));
  }

  for (const item of constraintHypothesis?.whatToCheckNext || []) {
    questions.push(compactText(item, 180));
  }

  if (nextStep?.title) {
    questions.push(`Что должно подтвердить или опровергнуть первый шаг: ${compactText(nextStep.title, 120)}?`);
  }

  for (const snapshot of documentSnapshots || []) {
    for (const question of snapshot.open_questions || snapshot.openQuestions || []) {
      questions.push(compactText(question, 180));
    }
  }

  if (!questions.length && maturitySummary.completed_layers < 11) {
    questions.push("Какие слои бизнеса стоит дозаполнить, чтобы консультация была точнее?");
  }

  return [...new Set(questions.filter(Boolean))].slice(0, 8);
}

function buildMaturityText(maturitySummary) {
  if (!maturitySummary.completed_layers) {
    return "Матрица зрелости пока не заполнена.";
  }

  const weak = maturitySummary.weak_layers.map((item) => `${item.title}: ${item.score}/5`).join("; ");
  const strong = maturitySummary.strong_layers.map((item) => `${item.title}: ${item.score}/5`).join("; ");

  return [
    `Заполнено слоёв: ${maturitySummary.completed_layers}. Средняя оценка: ${maturitySummary.avg_score || 0}/5.`,
    weak ? `Слабые зоны: ${weak}.` : "",
    strong ? `Сильные зоны: ${strong}.` : ""
  ].filter(Boolean).join(" ");
}

export class ConsultationBriefBuilder {
  build({
    company = null,
    companyProfile = null,
    problemContext = null,
    maturity = null,
    constraintHypothesis = null,
    nextStep = null,
    observations = [],
    documentSnapshots = [],
    artifacts = []
  } = {}) {
    const companyName = companyProfile?.company_name || company?.name || "компания";
    const currentRequest = trimString(problemContext?.request_text || companyProfile?.current_request) ||
      "Текущий запрос пока не сформулирован.";
    const maturitySummary = summarizeMaturity(maturity);
    const constraintSummary = buildConstraintSummary(constraintHypothesis);
    const nextStepSummary = buildNextStepSummary(nextStep);
    const evidence = buildEvidence({ observations, documentSnapshots, artifacts });
    const openQuestions = buildOpenQuestions({
      constraintHypothesis,
      nextStep,
      documentSnapshots,
      maturitySummary
    });
    const knownSignals = evidence.slice(0, 4).map((item) => item.text).join("; ");

    return {
      title: `Кейс: ${companyName}`,
      summary: compactText(
        [
          `Контекст: ${companyName}.`,
          `Запрос: ${currentRequest}`,
          buildMaturityText(maturitySummary),
          constraintHypothesis ? `Рабочая гипотеза: ${constraintSummary}` : "",
          nextStep ? `Следующий шаг: ${nextStepSummary}` : "",
          knownSignals ? `Факты и сигналы: ${knownSignals}.` : ""
        ].filter(Boolean).join(" "),
        1200
      ),
      current_request: currentRequest,
      maturity_summary: maturitySummary,
      constraint_summary: constraintSummary,
      next_step_summary: nextStepSummary,
      evidence,
      open_questions: openQuestions
    };
  }

  buildStatusNote({ maturity = null, constraintHypothesis = null, documentSnapshots = [] } = {}) {
    if ((documentSnapshots || []).length > 0) {
      return "Есть материалы, с ними можно быстрее перейти к решению.";
    }

    if (constraintHypothesis) {
      return "Можно проверить гипотезу ограничения и выбрать первый управленческий шаг.";
    }

    if ((maturity?.answeredCount || 0) > 0) {
      return "Уже есть первичная карта зрелости, можно разбирать не с нуля.";
    }

    return "Можно записаться уже сейчас, но экспресс-диагностика сделает разбор точнее.";
  }
}
