import { BUSINESS_LAYERS_V1 } from "../domain/business-layers.js";

const OFFICIAL_ANSWER_SOURCES = new Set([
  "user_explicit",
  "user_confirmed_inference",
  "user_corrected_inference"
]);

const OFFICIAL_ANSWER_STATUSES = new Set(["confirmed", "corrected"]);

function isOfficialAnswer(answer) {
  return OFFICIAL_ANSWER_SOURCES.has(answer?.source) && OFFICIAL_ANSWER_STATUSES.has(answer?.status);
}

function latestBySubject(answers) {
  const latest = new Map();

  for (const answer of answers || []) {
    if (!isOfficialAnswer(answer) || answer.subject_type !== "layer" || answer.level !== "express") {
      continue;
    }

    const existing = latest.get(answer.subject_key);
    const existingUpdated = existing?.updated_at || existing?.created_at || "";
    const answerUpdated = answer.updated_at || answer.created_at || "";

    if (!existing || answerUpdated >= existingUpdated) {
      latest.set(answer.subject_key, answer);
    }
  }

  return latest;
}

export function calculateExpressMaturity(answers = []) {
  const latestAnswers = latestBySubject(answers);
  const scores = BUSINESS_LAYERS_V1.map((layer) => {
    const answer = latestAnswers.get(layer.key);

    if (!answer || !Number.isFinite(Number(answer.score))) {
      return {
        layerKey: layer.key,
        title: layer.title,
        classKey: layer.classKey,
        score: null,
        sourceLevel: "express",
        confidence: 0,
        answerId: null,
        status: "missing"
      };
    }

    return {
      layerKey: layer.key,
      title: layer.title,
      classKey: layer.classKey,
      score: Number(answer.score),
      sourceLevel: "express",
      confidence: Number(answer.confidence ?? 1),
      answerId: answer.id || null,
      status: "answered"
    };
  });

  const answeredCount = scores.filter((score) => score.status === "answered").length;
  const totalCount = BUSINESS_LAYERS_V1.length;
  const averageScore = answeredCount > 0
    ? Number((scores.reduce((sum, item) => sum + (item.score || 0), 0) / answeredCount).toFixed(2))
    : null;

  return {
    level: "express",
    totalCount,
    answeredCount,
    progressPercent: Number(((answeredCount / totalCount) * 100).toFixed(2)),
    averageScore,
    scores
  };
}
