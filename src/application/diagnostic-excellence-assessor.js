const REQUIRED_LAYERS_COUNT = 11;

function hasText(value) {
  return Boolean(String(value || "").trim());
}

function hasArrayItems(value) {
  return Array.isArray(value) && value.length > 0;
}

function unique(items = []) {
  return [...new Set(items.filter(Boolean))];
}

function addCriterion(criteria, key, title, passed, explanation) {
  criteria.push({
    key,
    title,
    passed: Boolean(passed),
    score: passed ? 1 : 0,
    explanation
  });
}

function likelyHasIntentIntegrity(company, sources = []) {
  const text = [
    company?.currentRequest,
    company?.ownerGoal,
    company?.description,
    ...sources.map((source) => [source.title, source.aiSummary, source.contentText].filter(Boolean).join(" "))
  ].join(" ").toLowerCase();

  return /нужн|хочу|проблем|запрос|цель|падает|раст|не хватает|не успева|разрыв|прибыл|продаж|лид|crm|команд|стратег|рынок/.test(text);
}

function assessEvidenceDiscipline(layerAnalyses = [], analysis = {}) {
  const layersWithSources = layerAnalyses.filter((item) => hasArrayItems(item.sourceIds));
  const hasMissingData = hasArrayItems(analysis.missingData);
  const hasFactsOrGaps = layerAnalyses.some((item) => hasArrayItems(item.facts) || hasArrayItems(item.gaps));

  return layersWithSources.length > 0 || (hasMissingData && hasFactsOrGaps);
}

function assessReferenceGate(layerAnalyses = []) {
  return layerAnalyses.length > 0 && layerAnalyses.every((item) => {
    const hasReference = item.referenceModel && typeof item.referenceModel === "object";
    const hasFilled = item.filledFields && typeof item.filledFields === "object";
    const hasMissing = Array.isArray(item.missingFields);
    return hasReference && hasFilled && hasMissing;
  });
}

function assessUpperFrameProtection(analysis = {}) {
  const constraint = analysis.probableConstraint || {};
  const rejected = analysis.rejectedHypotheses || constraint.rejectedAlternatives || [];
  const related = analysis.diagnosticChain || constraint.relatedLayers || [];
  const text = [
    constraint.title,
    constraint.explanation,
    constraint.cause,
    ...rejected.map((item) => [item.layerName, item.reason].join(" ")),
    ...related.map((item) => [item.layerName, item.layer].join(" "))
  ].join(" ").toLowerCase();

  if (constraint.mode === "upper_frame") {
    return /собственник|рын|стратег|условия игры/.test(text);
  }

  return /слоем выше|верхн|собственник|рын|стратег|следств/.test(text) || rejected.length > 0;
}

function assessAlternativeHypotheses(analysis = {}) {
  const rejected = analysis.rejectedHypotheses || analysis.probableConstraint?.rejectedAlternatives || [];
  const problems = analysis.keyProblemAreas || [];
  const related = analysis.diagnosticChain || analysis.probableConstraint?.relatedLayers || [];
  const uniqueLayers = unique([
    ...rejected.map((item) => item.layer),
    ...problems.map((item) => item.layer),
    ...related.map((item) => item.layer)
  ]);

  return rejected.length >= 1 || uniqueLayers.length >= 3;
}

function assessCauseEffect(analysis = {}) {
  const constraint = analysis.probableConstraint || {};
  const hasCause = hasText(constraint.cause);
  const hasEffects = hasArrayItems(constraint.effects);
  const explanation = [constraint.explanation, analysis.reasoning].join(" ").toLowerCase();

  return hasCause && (hasEffects || /следств|симптом|причин/.test(explanation));
}

function assessConfidence(analysis = {}) {
  const constraint = analysis.probableConstraint || {};
  return hasText(analysis.confidence || constraint.confidence) && hasArrayItems(constraint.missingForHigh);
}

function assessOneNextMove(analysis = {}) {
  const nextStep = analysis.nextStep || {};
  return hasText(nextStep.title) && hasText(nextStep.why) && (hasText(nextStep.successCriteria) || hasText(nextStep.expectedResult));
}

function assessParallelSafety(analysis = {}) {
  const constraint = analysis.probableConstraint || {};
  const actions = analysis.parallelActions || constraint.parallelActions || [];
  const rejected = analysis.rejectedHypotheses || constraint.rejectedAlternatives || [];

  if (constraint.mode === "upper_frame") {
    return hasArrayItems(actions) && hasArrayItems(rejected);
  }

  return true;
}

export function assessDiagnosticExcellence({ company, sources = [], layerAnalyses = [], analysis = {} }) {
  const criteria = [];

  addCriterion(
    criteria,
    "intent_integrity",
    "Вход понят как управленческий сигнал, а не принят на веру",
    likelyHasIntentIntegrity(company, sources),
    "Диагностика должна видеть, что пользователь принёс: проблему, симптом, цель, цифру или готовое решение."
  );
  addCriterion(
    criteria,
    "evidence_discipline",
    "Факты отделены от пробелов и версий",
    assessEvidenceDiscipline(layerAnalyses, analysis),
    "Даже при слабых данных AI-BOSS должен показывать, что уже видно, а чего не хватает."
  );
  addCriterion(
    criteria,
    "layer_orientation",
    "Использована карта 11 слоёв",
    layerAnalyses.length === REQUIRED_LAYERS_COUNT,
    "11 слоёв остаются внутренней картой диагностики, даже если не показываются пользователю."
  );
  addCriterion(
    criteria,
    "reference_gate",
    "По каждому слою есть эталон или явный пробел эталона",
    assessReferenceGate(layerAnalyses),
    "Слой нельзя оценивать без точки сравнения: AI-BOSS должен восстановить эталон или показать его отсутствие."
  );
  addCriterion(
    criteria,
    "upper_frame_protection",
    "Проверена верхняя рамка перед выводом по нижним слоям",
    assessUpperFrameProtection(analysis),
    "Финансы, команда, операции и данные нельзя автоматически считать корнем, если не выбрана игра сверху."
  );
  addCriterion(
    criteria,
    "alternative_hypotheses",
    "Есть альтернативные версии, а не один преждевременный ответ",
    assessAlternativeHypotheses(analysis),
    "Сильный диагност сначала держит 2-3 версии, затем выбирает основную."
  );
  addCriterion(
    criteria,
    "cause_effect_separation",
    "Причина отделена от следствий",
    assessCauseEffect(analysis),
    "AI-BOSS должен объяснять, что похоже на причину, а что может быть симптомом или последствием."
  );
  addCriterion(
    criteria,
    "confidence_calibration",
    "Уверенность откалибрована и понятно, что нужно для HIGH",
    assessConfidence(analysis),
    "Недостаток данных снижает уверенность, но не должен разрушать диагностическую логику."
  );
  addCriterion(
    criteria,
    "one_next_move",
    "Выбран один следующий диагностический ход",
    assessOneNextMove(analysis),
    "AI-BOSS ведёт бизнес не списком советов, а одним проверочным шагом."
  );
  addCriterion(
    criteria,
    "parallel_safety",
    "Параллельные действия не подменяют корневую гипотезу",
    assessParallelSafety(analysis),
    "Полезную стабилизацию можно запускать параллельно, но нельзя путать её с главным ограничением."
  );

  const score10 = criteria.reduce((sum, item) => sum + item.score, 0);
  const missing = criteria.filter((item) => !item.passed).map((item) => item.title);

  return {
    score10,
    targetScore10: 10,
    level: score10 >= 10
      ? "10/10 diagnostic behavior"
      : score10 >= 8
      ? "strong diagnostic behavior"
      : score10 >= 6
      ? "useful but incomplete diagnostic behavior"
      : "needs diagnostic strengthening",
    criteria,
    missing,
    principle: "Low data reduces certainty, not diagnostic discipline."
  };
}
