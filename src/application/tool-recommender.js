const PROBLEM_KEYWORDS = [
  {
    patterns: ["продаж", "лид", "заяв", "конверс", "ворон", "контакт", "клиент"],
    problemTypes: ["sales", "leads", "conversion", "funnel", "icp", "segmentation"]
  },
  {
    patterns: ["марж", "прибыл", "касс", "деньг", "выруч", "эконом"],
    problemTypes: ["finance", "margin", "cash", "profit", "unit_economics"]
  },
  {
    patterns: ["продать бизнес", "продажа бизнеса", "покупател", "оценк", "инвестор"],
    problemTypes: ["sale", "exit", "valuation", "documents"]
  },
  {
    patterns: ["роль", "ответствен", "кто", "хаос", "управ", "процесс", "срок"],
    problemTypes: ["roles", "responsibility", "operations", "management", "sales_process"]
  }
];

const ACTION_TYPE_TOOL_HINTS = {
  lead_flow_audit: ["funnel", "leads", "icp", "segmentation"],
  strategy_focus: ["icp", "segmentation"],
  value_check: ["conversion", "icp"],
  process_path_map: ["operations", "responsibility", "funnel"],
  finance_slice: ["finance", "margin", "cash"],
  capacity_check: ["roles", "responsibility", "operations"],
  decision_flow_check: ["management", "responsibility"],
  owner_alignment: ["management", "owner_dependency"],
  visibility_check: ["funnel", "finance", "operations"],
  market_check: ["segmentation", "icp"]
};

function normalizeText(...parts) {
  return parts.filter(Boolean).join(" ").toLowerCase();
}

function problemTypesFromText(text) {
  const types = new Set();

  for (const rule of PROBLEM_KEYWORDS) {
    if (rule.patterns.some((pattern) => text.includes(pattern))) {
      rule.problemTypes.forEach((type) => types.add(type));
    }
  }

  return types;
}

function weakLayerKeys(maturity) {
  return new Set(
    (maturity?.scores || [])
      .filter((score) => score.score !== null && Number(score.score) < 3)
      .map((score) => score.layerKey)
  );
}

function intersects(left = [], rightSet = new Set()) {
  return left.some((item) => rightSet.has(item));
}

function buildReason({ tool, scoreParts, constraintHypothesis, nextStep }) {
  const reasons = [];

  if (scoreParts.constraint > 0) {
    reasons.push(`связан с текущей гипотезой ограничения: ${constraintHypothesis?.layerTitle || constraintHypothesis?.layer || "слой кейса"}`);
  }

  if (scoreParts.problem > 0) {
    reasons.push("попадает в текущий запрос пользователя");
  }

  if (scoreParts.weakLayer > 0) {
    reasons.push("закрывает слабый или недозрелый слой матрицы");
  }

  if (scoreParts.nextStep > 0) {
    reasons.push(`помогает выполнить следующий шаг: ${nextStep?.title || "первое действие"}`);
  }

  return reasons.length
    ? reasons.join("; ")
    : `Инструмент подходит как поддержка для слоя: ${tool.layer_keys?.join(", ") || "текущий кейс"}.`;
}

function buildUsageMoment(tool, nextStep) {
  if (nextStep?.title) {
    return `Использовать после текущего шага или прямо в нём: ${nextStep.title}`;
  }

  return tool.when_to_use || tool.whenToUse || "Использовать, когда нужно быстро структурировать текущий участок бизнеса.";
}

export class ToolRecommender {
  recommend({ tools = [], problemContext = null, companyProfile = null, constraintHypothesis = null, maturity = null, nextStep = null } = {}) {
    const problemText = normalizeText(problemContext?.request_text, companyProfile?.current_request);
    const problemTypes = problemTypesFromText(problemText);
    const weakLayers = weakLayerKeys(maturity);
    const constraintLayer = constraintHypothesis?.layer || constraintHypothesis?.layerKey || "";
    const nextStepHints = new Set(ACTION_TYPE_TOOL_HINTS[nextStep?.action_type || nextStep?.actionType] || []);

    return (tools || [])
      .filter((tool) => tool.is_active !== false)
      .map((tool) => {
        const layerKeys = tool.layer_keys || tool.layerKeys || [];
        const toolProblemTypes = tool.problem_types || tool.problemTypes || [];
        const scoreParts = {
          constraint: constraintLayer && layerKeys.includes(constraintLayer) ? 3 : 0,
          problem: intersects(toolProblemTypes, problemTypes) ? 2 : 0,
          weakLayer: intersects(layerKeys, weakLayers) ? 1.5 : 0,
          nextStep: intersects(toolProblemTypes, nextStepHints) ? 2 : 0
        };
        const score = scoreParts.constraint + scoreParts.problem + scoreParts.weakLayer + scoreParts.nextStep;

        return {
          tool,
          score,
          scoreParts,
          reason: buildReason({ tool, scoreParts, constraintHypothesis, nextStep }),
          usageMoment: buildUsageMoment(tool, nextStep)
        };
      })
      .sort((left, right) => right.score - left.score || left.tool.title.localeCompare(right.tool.title, "ru"))
      .slice(0, 3)
      .map((item, index) => ({
        ...item,
        priority: index + 1
      }));
  }
}
