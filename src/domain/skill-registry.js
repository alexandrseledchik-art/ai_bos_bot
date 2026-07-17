const REQUIRED_SKILL_FIELDS = [
  "id",
  "version",
  "department",
  "kind",
  "activation",
  "purpose",
  "whenToUse",
  "whenNotToUse",
  "requiredContext",
  "inputs",
  "outputs",
  "memoryUpdates",
  "completionCriteria",
  "nextSkillCandidates",
  "currentImplementation"
];

export const SKILL_DEPARTMENTS = Object.freeze({
  MANAGEMENT: "management",
  COMMUNICATION: "communication",
  DIAGNOSTICS: "diagnostics",
  ARCHITECTURE: "architecture",
  EXECUTION: "execution",
  MEMORY: "memory",
  QUALITY: "quality"
});

export const SKILL_KINDS = Object.freeze({
  ORCHESTRATOR: "orchestrator",
  BUSINESS: "business",
  COMMUNICATION: "communication",
  EXECUTION: "execution",
  MEMORY: "memory",
  QUALITY: "quality"
});

export const SKILL_ACTIVATION = Object.freeze({
  PRIMARY: "primary",
  SUPPORTING: "supporting",
  ALWAYS_ON: "always_on"
});

function skill(contract) {
  return Object.freeze({
    artifactTypes: [],
    ...contract,
    whenToUse: Object.freeze(contract.whenToUse || []),
    whenNotToUse: Object.freeze(contract.whenNotToUse || []),
    requiredContext: Object.freeze(contract.requiredContext || []),
    inputs: Object.freeze(contract.inputs || []),
    outputs: Object.freeze(contract.outputs || []),
    memoryUpdates: Object.freeze(contract.memoryUpdates || []),
    artifactTypes: Object.freeze(contract.artifactTypes || []),
    completionCriteria: Object.freeze(contract.completionCriteria || []),
    nextSkillCandidates: Object.freeze(contract.nextSkillCandidates || []),
    currentImplementation: Object.freeze(contract.currentImplementation || [])
  });
}

export const AI_BOSS_SKILLS_V1 = Object.freeze([
  skill({
    id: "skill_orchestration",
    version: "1.0.0",
    department: SKILL_DEPARTMENTS.MANAGEMENT,
    kind: SKILL_KINDS.ORCHESTRATOR,
    activation: SKILL_ACTIVATION.ALWAYS_ON,
    purpose: "Понять текущую задачу, собрать подходящую команду скиллов и определить результат одного хода.",
    whenToUse: ["Перед каждым содержательным ходом", "При смене запроса или этапа", "После завершения скилла"],
    whenNotToUse: ["Не формулирует бизнес-диагноз сам", "Не заменяет специализированный скилл"],
    requiredContext: ["userMessage", "caseState", "conversationState", "availableSkills"],
    inputs: ["intent", "businessContext", "interfaceContext", "skillHistory"],
    outputs: ["primarySkill", "supportingSkills", "communicationSkill", "turnGoal", "completionCondition", "prohibitedActions"],
    memoryUpdates: ["activeSkillRun", "skillSelectionReason", "nextSkillCandidates"],
    completionCriteria: ["Выбран не более чем один основной скилл", "Определён измеримый результат хода", "Исключены опасные и нерелевантные скиллы"],
    nextSkillCandidates: ["intent_clarification", "business_diagnostic", "architecture_navigation", "tool_facilitation", "document_analysis", "concept_explanation"],
    currentImplementation: ["src/application/ai-boss-mode-orchestrator.js", "src/application/conversation-service.js", "src/application/classify-input.js"]
  }),
  skill({
    id: "onboarding_conversation",
    version: "1.0.0",
    department: SKILL_DEPARTMENTS.COMMUNICATION,
    kind: SKILL_KINDS.COMMUNICATION,
    activation: SKILL_ACTIVATION.PRIMARY,
    purpose: "Познакомить пользователя с AI-BOSS, объяснить разделение чата и платформы и помочь сделать первый шаг.",
    whenToUse: ["Первый /start", "Пользователь не понимает, куда попал", "Нужно восстановить маршрут после паузы"],
    whenNotToUse: ["Пользователь уже принёс конкретную содержательную задачу"],
    requiredContext: ["userIdentity", "accessState", "workspaceState"],
    inputs: ["userName", "returningUser", "webCabinetUrl"],
    outputs: ["welcomeMessage", "entryChoice", "cabinetInvite"],
    memoryUpdates: ["onboardingStatus", "preferredEntryRoute"],
    completionCriteria: ["Пользователь понимает роль чата и платформы", "Определён первый маршрут или открыт кабинет"],
    nextSkillCandidates: ["intent_clarification", "architecture_navigation", "business_diagnostic", "platform_support"],
    currentImplementation: ["src/application/conversation-service.js", "src/application/mini-app-invite-policy.js"]
  }),
  skill({
    id: "intent_clarification",
    version: "1.0.0",
    department: SKILL_DEPARTMENTS.COMMUNICATION,
    kind: SKILL_KINDS.COMMUNICATION,
    activation: SKILL_ACTIVATION.PRIMARY,
    purpose: "Понять практическое намерение пользователя, не требуя от него готового диагноза.",
    whenToUse: ["Расплывчатый запрос", "Несколько возможных задач", "Неясен желаемый результат"],
    whenNotToUse: ["Намерение уже однозначно", "Есть срочный риск, требующий немедленной реакции"],
    requiredContext: ["userMessage", "recentHistory", "activeCase"],
    inputs: ["rawIntent", "claimedProblem", "claimedCause"],
    outputs: ["interpretedIntent", "oneClarifyingQuestion", "entryMode"],
    memoryUpdates: ["problemContext", "claimedProblem", "claimedCause"],
    completionCriteria: ["Понятен требуемый пользователю результат", "Выбран следующий содержательный скилл"],
    nextSkillCandidates: ["business_diagnostic", "architecture_navigation", "tool_selection", "concept_explanation"],
    currentImplementation: ["src/application/classify-input.js", "src/application/intent-integrity-checker.js", "src/application/guardrails.js"]
  }),
  skill({
    id: "diagnostic_interview",
    version: "1.0.0",
    department: SKILL_DEPARTMENTS.COMMUNICATION,
    kind: SKILL_KINDS.COMMUNICATION,
    activation: SKILL_ACTIVATION.SUPPORTING,
    purpose: "Получать от пользователя наблюдаемые факты, примеры и документы, которые разделяют конкурирующие гипотезы.",
    whenToUse: ["Есть несколько рабочих гипотез", "Не хватает одного разделяющего сигнала", "Пользователь сообщает мнение вместо факта"],
    whenNotToUse: ["Данных уже достаточно для вывода", "Вопрос перекладывает диагноз на пользователя"],
    requiredContext: ["activeHypotheses", "knownFacts", "lastQuestion"],
    inputs: ["missingSignal", "discriminatingSignals", "conversationState"],
    outputs: ["oneObservableQuestion", "whyQuestionMatters"],
    memoryUpdates: ["lastQuestion", "missingSignals", "conversationStage"],
    completionCriteria: ["Задан один вопрос", "На вопрос можно ответить наблюдением, цифрой, примером или документом"],
    nextSkillCandidates: ["observation_capture", "business_diagnostic", "constraint_prioritization"],
    currentImplementation: ["src/application/graph-reasoner.js", "src/application/data-sufficiency-checker.js", "src/application/guardrails.js"]
  }),
  skill({
    id: "concept_explanation",
    version: "1.0.0",
    department: SKILL_DEPARTMENTS.COMMUNICATION,
    kind: SKILL_KINDS.COMMUNICATION,
    activation: SKILL_ACTIVATION.PRIMARY,
    purpose: "Объяснить метод, термин, инструмент или результат простым языком пользователя.",
    whenToUse: ["Пользователь спрашивает что это значит", "В ответе появляется новый термин", "Нужно интерпретировать результат"],
    whenNotToUse: ["Не превращать объяснение в диагностику без бизнес-сигнала"],
    requiredContext: ["userLanguage", "termOrResult", "userContext"],
    inputs: ["concept", "desiredDepth"],
    outputs: ["plainLanguageExplanation", "businessExample", "optionalNextQuestion"],
    memoryUpdates: ["knownUserConcepts"],
    completionCriteria: ["Нет необъяснённых терминов", "Пользователь может применить объяснение к своей ситуации"],
    nextSkillCandidates: ["intent_clarification", "tool_facilitation", "result_interpretation"],
    currentImplementation: ["src/application/ai-boss-mode-orchestrator.js", "src/application/guardrails.js", "src/application/prompt-builder.js"]
  }),
  skill({
    id: "progress_navigation",
    version: "1.0.0",
    department: SKILL_DEPARTMENTS.COMMUNICATION,
    kind: SKILL_KINDS.COMMUNICATION,
    activation: SKILL_ACTIVATION.SUPPORTING,
    purpose: "Показать, где пользователь находится, что уже сделано и зачем нужен следующий шаг.",
    whenToUse: ["Длинный кейс", "Возврат после паузы", "Пользователь спрашивает о маршруте", "Переход между скиллами"],
    whenNotToUse: ["Не повторять roadmap в каждом коротком ответе"],
    requiredContext: ["caseState", "skillRunHistory", "artifacts"],
    inputs: ["currentStage", "completedResults", "nextStep"],
    outputs: ["progressSummary", "nextStepExplanation"],
    memoryUpdates: ["lastProgressSummary"],
    completionCriteria: ["Пользователь понимает текущий этап и ожидаемый результат следующего действия"],
    nextSkillCandidates: ["architecture_navigation", "maturity_assessment", "tool_facilitation", "next_step_selection"],
    currentImplementation: ["src/application/tool-workflow-service.js", "src/application/mini-app-bootstrap-service.js", "app-assets/src/main.js"]
  }),
  skill({
    id: "platform_support",
    version: "1.0.0",
    department: SKILL_DEPARTMENTS.COMMUNICATION,
    kind: SKILL_KINDS.COMMUNICATION,
    activation: SKILL_ACTIVATION.SUPPORTING,
    purpose: "Помочь пользователю выполнить действие на текущем экране платформы.",
    whenToUse: ["Вызов AI-BOSS с экрана", "Вопрос о кнопке, результате или выборе", "Пользователь застрял в интерфейсе"],
    whenNotToUse: ["Не подменять содержательную консультацию пересказом интерфейса"],
    requiredContext: ["screenId", "screenEntity", "workspaceState"],
    inputs: ["screenContext", "userQuestion"],
    outputs: ["screenSpecificHelp", "recommendedAction"],
    memoryUpdates: ["lastPlatformScreen", "supportOutcome"],
    completionCriteria: ["Пользователь понимает конкретное действие на экране"],
    nextSkillCandidates: ["architecture_navigation", "maturity_assessment", "tool_facilitation", "result_interpretation"],
    currentImplementation: ["src/application/workspace-chat-service.js", "app-assets/src/main.js"]
  }),
  skill({
    id: "business_diagnostic",
    version: "1.0.0",
    department: SKILL_DEPARTMENTS.DIAGNOSTICS,
    kind: SKILL_KINDS.BUSINESS,
    activation: SKILL_ACTIVATION.PRIMARY,
    purpose: "Расширить поле причин, проверить объяснения сверху вниз и найти наиболее вероятное ограничение системы.",
    whenToUse: ["Есть симптом или бизнес-проблема", "Нужно отделить причину от следствия", "Есть противоречащие сигналы"],
    whenNotToUse: ["Нет бизнес-сигнала", "Пользователь просит только определить термин", "Не давать финальный диагноз при слабых данных"],
    requiredContext: ["problemContext", "observations", "companyMemory", "businessLayers"],
    inputs: ["symptoms", "claimedCause", "graphPacket", "referenceGate"],
    outputs: ["candidateHypotheses", "causalLevels", "missingEvidence", "recommendedDiagnosticMove"],
    memoryUpdates: ["hypotheses", "candidateConstraints", "diagnosticTrace"],
    artifactTypes: ["diagnostic_snapshot"],
    completionCriteria: ["Есть 2–3 конкурирующие версии", "Проверены верхние и соседние слои", "Выбран вывод или один разделяющий вопрос"],
    nextSkillCandidates: ["diagnostic_interview", "constraint_prioritization", "next_step_selection", "artifact_builder"],
    currentImplementation: ["src/application/observation-extractor.js", "src/application/graph-reasoner.js", "src/application/reference-model-service.js", "src/application/data-sufficiency-checker.js", "src/infrastructure/openai/reasoning-client.js"]
  }),
  skill({
    id: "architecture_navigation",
    version: "1.0.0",
    department: SKILL_DEPARTMENTS.ARCHITECTURE,
    kind: SKILL_KINDS.BUSINESS,
    activation: SKILL_ACTIVATION.PRIMARY,
    purpose: "Вести пользователя по классам, слоям, доменам и поддоменам архитектуры бизнеса.",
    whenToUse: ["Пользователь собирает бизнес целиком", "Нужно увидеть заполненность архитектуры", "Нужно выбрать следующую ветку"],
    whenNotToUse: ["Не заставлять проходить всю архитектуру ради локальной задачи"],
    requiredContext: ["architectureCatalog", "companyArchitectureSnapshot", "problemContext"],
    inputs: ["currentBranch", "confirmedEvidence", "toolProgress"],
    outputs: ["architectureProgress", "nextArchitectureBranch", "whyThisBranch"],
    memoryUpdates: ["currentArchitectureBranch", "architectureCoverage"],
    artifactTypes: ["architecture_snapshot"],
    completionCriteria: ["Понятен статус выбранной ветки", "Выбрана следующая ветка или подтверждено завершение"],
    nextSkillCandidates: ["tool_selection", "maturity_assessment", "progress_navigation"],
    currentImplementation: ["src/domain/business-architecture-knowledge.js", "src/domain/business-architecture-map.js", "src/application/company-architecture-snapshot.js"]
  }),
  skill({
    id: "maturity_assessment",
    version: "1.0.0",
    department: SKILL_DEPARTMENTS.DIAGNOSTICS,
    kind: SKILL_KINDS.BUSINESS,
    activation: SKILL_ACTIVATION.PRIMARY,
    purpose: "Провести экспресс-, базовую или расширенную диагностику и построить подтверждённую картину зрелости.",
    whenToUse: ["Нужен общий срез", "Выбран слой или домен для углубления", "Нужно проверить конкретную зону"],
    whenNotToUse: ["Не считать минимальный балл главным ограничением", "Не включать неподтверждённые ответы в официальную матрицу"],
    requiredContext: ["diagnosticLevel", "diagnosticCatalog", "existingAnswers"],
    inputs: ["explicitAnswers", "confirmedSuggestions", "selectedBranches"],
    outputs: ["maturityScores", "coverage", "weakAndStrongAreas"],
    memoryUpdates: ["diagnosticRun", "diagnosticAnswers", "maturityScores"],
    artifactTypes: ["maturity_matrix"],
    completionCriteria: ["Рассчитаны оценки выбранной глубины", "Указана полнота и источник каждой оценки"],
    nextSkillCandidates: ["result_interpretation", "constraint_prioritization", "architecture_navigation"],
    currentImplementation: ["src/domain/diagnostic-catalog.js", "src/application/mini-app-diagnostics-service.js", "src/application/maturity-calculator.js", "src/application/diagnostic-prefill-engine.js"]
  }),
  skill({
    id: "constraint_prioritization",
    version: "1.0.0",
    department: SKILL_DEPARTMENTS.DIAGNOSTICS,
    kind: SKILL_KINDS.BUSINESS,
    activation: SKILL_ACTIVATION.PRIMARY,
    purpose: "Выбрать наиболее причинное ограничение относительно текущего запроса, а не просто самое слабое место.",
    whenToUse: ["Накоплены наблюдения или оценки", "Нужно выбрать приоритет", "Есть несколько причинных кандидатов"],
    whenNotToUse: ["Недостаточно сигнала даже для рабочей гипотезы", "Не выдавать гипотезу за факт"],
    requiredContext: ["problemContext", "observations", "maturityScores", "candidateLayers"],
    inputs: ["deterministicShortlist", "evidenceStrength", "layerClass", "causalConnectivity"],
    outputs: ["primaryConstraintHypothesis", "alternatives", "supportingEvidence", "missingEvidence"],
    memoryUpdates: ["constraintHypothesis", "constraintStatus"],
    artifactTypes: ["constraint_hypothesis"],
    completionCriteria: ["Одна первичная гипотеза объяснена", "Названы альтернативы и недостающие доказательства"],
    nextSkillCandidates: ["diagnostic_interview", "next_step_selection", "artifact_builder"],
    currentImplementation: ["src/application/constraint-reasoner.js", "src/application/company-analysis-core.js", "src/application/graph-reasoner.js"]
  }),
  skill({
    id: "result_interpretation",
    version: "1.0.0",
    department: SKILL_DEPARTMENTS.COMMUNICATION,
    kind: SKILL_KINDS.COMMUNICATION,
    activation: SKILL_ACTIVATION.PRIMARY,
    purpose: "Объяснить пользователю матрицу, гипотезу, документ или артефакт и показать границы вывода.",
    whenToUse: ["Пользователь открыл результат", "Нужно объяснить оценку или гипотезу", "Есть риск неверной интерпретации"],
    whenNotToUse: ["Не создавать новый диагноз из одного результата"],
    requiredContext: ["resultObject", "evidence", "confidence", "problemContext"],
    inputs: ["facts", "hypotheses", "limitations"],
    outputs: ["plainSummary", "whatItMeans", "whatItDoesNotMean", "nextCheck"],
    memoryUpdates: ["resultViewed", "userInterpretationFeedback"],
    completionCriteria: ["Разделены факт, гипотеза и неизвестное", "Понятен следующий способ проверки"],
    nextSkillCandidates: ["diagnostic_interview", "next_step_selection", "tool_selection"],
    currentImplementation: ["src/application/guardrails.js", "src/application/conversation-service.js", "src/application/workspace-chat-service.js"]
  }),
  skill({
    id: "next_step_selection",
    version: "1.0.0",
    department: SKILL_DEPARTMENTS.EXECUTION,
    kind: SKILL_KINDS.EXECUTION,
    activation: SKILL_ACTIVATION.PRIMARY,
    purpose: "Выбрать одно минимальное действие, которое проверяет гипотезу или открывает управленческое решение.",
    whenToUse: ["Есть рабочая гипотеза", "Нужно перейти от понимания к действию", "Пользователь спрашивает что делать первым"],
    whenNotToUse: ["Не давать общий список советов", "Не запускать изменение до достаточной проверки"],
    requiredContext: ["constraintHypothesis", "missingEvidence", "decisionRights"],
    inputs: ["candidateActions", "costOfDelay", "reversibility"],
    outputs: ["oneNextStep", "whyThisFirst", "successCriterion", "notNow"],
    memoryUpdates: ["nextStep", "actionWave"],
    artifactTypes: ["action_wave"],
    completionCriteria: ["Выбрано ровно одно действие", "Есть проверяемый результат и границы"],
    nextSkillCandidates: ["tool_selection", "execution_coordination", "artifact_builder"],
    currentImplementation: ["src/application/next-step-selector.js", "src/application/ai-boss-mode-orchestrator.js", "src/application/company-analysis-core.js"]
  }),
  skill({
    id: "tool_selection",
    version: "1.0.0",
    department: SKILL_DEPARTMENTS.ARCHITECTURE,
    kind: SKILL_KINDS.BUSINESS,
    activation: SKILL_ACTIVATION.PRIMARY,
    purpose: "Подобрать инструмент под запрос, ветку архитектуры, гипотезу ограничения и следующий шаг.",
    whenToUse: ["Понятен требуемый рабочий результат", "Нужно собрать недостающий элемент архитектуры", "Пользователь просит инструмент"],
    whenNotToUse: ["Не выдавать инструмент вместо понимания задачи", "Не создавать новые инструменты в MVP"],
    requiredContext: ["toolsCatalog", "problemContext", "constraintHypothesis", "nextStep"],
    inputs: ["relevantLayers", "desiredArtifact", "currentTools"],
    outputs: ["primaryTool", "alternativeTools", "recommendationReason"],
    memoryUpdates: ["toolRecommendations"],
    completionCriteria: ["Рекомендован один основной инструмент", "Понятно, какой результат он создаст"],
    nextSkillCandidates: ["tool_facilitation", "progress_navigation"],
    currentImplementation: ["src/application/tool-recommender.js", "src/domain/business-architecture-tool-matcher.js", "src/domain/mini-app-tools-catalog.js"]
  }),
  skill({
    id: "tool_facilitation",
    version: "1.0.0",
    department: SKILL_DEPARTMENTS.EXECUTION,
    kind: SKILL_KINDS.EXECUTION,
    activation: SKILL_ACTIVATION.PRIMARY,
    purpose: "Сопроводить заполнение инструмента в чате или документе и довести его до подтверждённого результата.",
    whenToUse: ["Пользователь начал инструмент", "Нужно продолжить незавершённый инструмент", "Нужна помощь с вопросом шаблона"],
    whenNotToUse: ["Не считать открытие карточки завершением", "Не подменять ответы пользователя выдуманными фактами"],
    requiredContext: ["toolDefinition", "toolInstance", "companyMemory"],
    inputs: ["toolQuestions", "existingAnswers", "fillMode"],
    outputs: ["nextToolQuestion", "progress", "completedToolResult"],
    memoryUpdates: ["toolInstance", "toolAnswers", "observations"],
    artifactTypes: ["tool_snapshot", "working_document"],
    completionCriteria: ["Получены ответы на обязательные вопросы", "Результат подтверждён и сохранён", "Архитектура обновлена"],
    nextSkillCandidates: ["artifact_builder", "company_memory", "architecture_navigation", "progress_navigation"],
    currentImplementation: ["src/application/tool-workflow-service.js", "src/application/consultant-telegram-mode.js", "src/infrastructure/google/google-drive-client.js"]
  }),
  skill({
    id: "document_analysis",
    version: "1.0.0",
    department: SKILL_DEPARTMENTS.DIAGNOSTICS,
    kind: SKILL_KINDS.BUSINESS,
    activation: SKILL_ACTIVATION.PRIMARY,
    purpose: "Извлечь из файла или ссылки факты, решения, пробелы и сигналы для кейса и архитектуры.",
    whenToUse: ["Пользователь прислал файл или доступную ссылку", "Нужно обновить контекст по документу", "Документ является результатом инструмента"],
    whenNotToUse: ["Нет доступа к документу", "Не считать текст документа автоматически подтверждённой истиной"],
    requiredContext: ["documentContent", "sourceMetadata", "activeCase"],
    inputs: ["fileOrUrl", "analysisPurpose", "relatedTool"],
    outputs: ["documentSnapshot", "extractedObservations", "openQuestions"],
    memoryUpdates: ["documentSource", "documentSnapshot", "observations"],
    artifactTypes: ["document_snapshot"],
    completionCriteria: ["Сохранён короткий структурированный snapshot", "Факты отделены от интерпретаций"],
    nextSkillCandidates: ["observation_capture", "business_diagnostic", "tool_facilitation", "artifact_builder"],
    currentImplementation: ["src/infrastructure/telegram/resolve-telegram-input.js", "src/infrastructure/google/public-google-link-reader.js", "src/application/company-analysis-core.js", "src/application/tool-workflow-service.js"]
  }),
  skill({
    id: "website_screening",
    version: "1.0.0",
    department: SKILL_DEPARTMENTS.DIAGNOSTICS,
    kind: SKILL_KINDS.BUSINESS,
    activation: SKILL_ACTIVATION.PRIMARY,
    purpose: "Провести внешний скрининг сайта, не подменяя его внутренней диагностикой бизнеса.",
    whenToUse: ["Пользователь прислал URL", "Нужно разобрать продукт, обещание или входную воронку по сайту"],
    whenNotToUse: ["Не делать выводы о финансах, команде, управлении и внутреннем ограничении только по сайту"],
    requiredContext: ["urls", "screeningResults"],
    inputs: ["websiteUrl", "statedProblem"],
    outputs: ["knownFacts", "externalObservations", "cannotAssert", "routingQuestion"],
    memoryUpdates: ["screeningSnapshot", "observations"],
    artifactTypes: ["website_screening"],
    completionCriteria: ["Факты отделены от наблюдений и гипотез", "Названы границы внешнего скрининга", "Выбрано продолжение: сайт или бизнес"],
    nextSkillCandidates: ["business_diagnostic", "result_interpretation", "artifact_builder"],
    currentImplementation: ["src/infrastructure/screening/website-screener.js", "src/application/conversation-service.js", "src/application/guardrails.js"]
  }),
  skill({
    id: "artifact_builder",
    version: "1.0.0",
    department: SKILL_DEPARTMENTS.EXECUTION,
    kind: SKILL_KINDS.EXECUTION,
    activation: SKILL_ACTIVATION.SUPPORTING,
    purpose: "Превратить результат разговора или работы в сохранённый управленческий артефакт.",
    whenToUse: ["Получен сильный результат кейса", "Завершён инструмент", "Нужно зафиксировать решение или snapshot"],
    whenNotToUse: ["Нет содержательного результата", "Не сохранять красивое резюме вместо доказанного вывода"],
    requiredContext: ["caseState", "result", "evidence"],
    inputs: ["artifactKind", "confirmedContent", "sourceLinks"],
    outputs: ["artifact", "artifactSummary"],
    memoryUpdates: ["artifacts", "snapshots"],
    artifactTypes: ["diagnostic_snapshot", "decision_record", "tool_snapshot", "action_wave"],
    completionCriteria: ["Артефакт связан с компанией и кейсом", "Указаны версия, дата и источники"],
    nextSkillCandidates: ["company_memory", "progress_navigation", "execution_coordination"],
    currentImplementation: ["src/application/conversation-service.js", "src/application/consultation-brief-builder.js", "src/application/tool-workflow-service.js"]
  }),
  skill({
    id: "execution_coordination",
    version: "1.0.0",
    department: SKILL_DEPARTMENTS.EXECUTION,
    kind: SKILL_KINDS.EXECUTION,
    activation: SKILL_ACTIVATION.PRIMARY,
    purpose: "Обернуть выбранное действие во владельца, исполнителя, срок, метрику и момент проверки.",
    whenToUse: ["Следующий шаг принят", "Нужно проверить статус", "Есть незакрытая управленческая петля"],
    whenNotToUse: ["Нет принятого решения", "AI-BOSS не имеет права назначать людей без подтверждения"],
    requiredContext: ["acceptedNextStep", "decisionRights", "companyRoles"],
    inputs: ["action", "owner", "executor", "deadline", "metric"],
    outputs: ["executionContainer", "reviewMoment", "blockerQuestion"],
    memoryUpdates: ["actionStatus", "executionOwner", "reviewSchedule"],
    artifactTypes: ["execution_container"],
    completionCriteria: ["Есть ответственный, результат и момент проверки", "Статус действия обновлён"],
    nextSkillCandidates: ["progress_navigation", "result_interpretation", "next_step_selection"],
    currentImplementation: ["src/application/ai-boss-mode-orchestrator.js", "src/application/conversation-service.js"]
  }),
  skill({
    id: "observation_capture",
    version: "1.0.0",
    department: SKILL_DEPARTMENTS.MEMORY,
    kind: SKILL_KINDS.MEMORY,
    activation: SKILL_ACTIVATION.ALWAYS_ON,
    purpose: "Извлекать атомарные наблюдения из сообщений, документов и инструментов без смешивания с диагнозом.",
    whenToUse: ["Каждый содержательный вход", "Новый документ", "Ответ на вопрос инструмента"],
    whenNotToUse: ["Не превращать пользовательскую версию причины в подтверждённый факт"],
    requiredContext: ["source", "activeCase", "existingObservations"],
    inputs: ["textOrDocument", "sourceType", "sourceId"],
    outputs: ["observations", "normalizedSignals"],
    memoryUpdates: ["observations"],
    completionCriteria: ["Каждое наблюдение имеет источник, уверенность и статус", "Дубликаты объединены"],
    nextSkillCandidates: ["company_memory", "business_diagnostic", "maturity_assessment"],
    currentImplementation: ["src/application/observation-extractor.js", "src/application/conversation-service.js", "src/infrastructure/storage/state-projector.js"]
  }),
  skill({
    id: "company_memory",
    version: "1.0.0",
    department: SKILL_DEPARTMENTS.MEMORY,
    kind: SKILL_KINDS.MEMORY,
    activation: SKILL_ACTIVATION.ALWAYS_ON,
    purpose: "Хранить актуальный контекст компании отдельно от состояния конкретного кейса и разговора.",
    whenToUse: ["После содержательного результата", "Перед выбором скилла", "При обновлении документа или инструмента"],
    whenNotToUse: ["Не повышать предположение до факта без подтверждения", "Не смешивать разные компании и кейсы"],
    requiredContext: ["workspaceId", "companyId", "caseId", "sourceProvenance"],
    inputs: ["facts", "hypotheses", "artifacts", "statuses"],
    outputs: ["companyContext", "caseContext", "conversationContext"],
    memoryUpdates: ["companyProfile", "caseState", "snapshots", "artifacts"],
    completionCriteria: ["Результат записан в правильный контур", "Сохранены источник, дата, версия и статус"],
    nextSkillCandidates: ["skill_orchestration", "progress_navigation"],
    currentImplementation: ["src/infrastructure/storage/create-store.js", "src/infrastructure/storage/supabase-primary-store.js", "src/infrastructure/storage/state-projector.js", "src/application/conversation-service.js"]
  }),
  skill({
    id: "confidence_control",
    version: "1.0.0",
    department: SKILL_DEPARTMENTS.QUALITY,
    kind: SKILL_KINDS.QUALITY,
    activation: SKILL_ACTIVATION.ALWAYS_ON,
    purpose: "Не допускать сильных выводов при слабом сигнале и явно разделять факты, наблюдения и гипотезы.",
    whenToUse: ["Каждый диагностический вывод", "Предзаполнение", "Рекомендация действия"],
    whenNotToUse: ["Не снижать полезность ответа до бесконечных оговорок"],
    requiredContext: ["evidence", "confidence", "decisionType"],
    inputs: ["candidateOutput", "dataSufficiency", "contradictions"],
    outputs: ["validatedOutput", "confidenceLabel", "requiredCaveat"],
    memoryUpdates: ["qualityTrace"],
    completionCriteria: ["Уверенность соответствует доказательствам", "Гипотеза не названа фактом"],
    nextSkillCandidates: ["skill_orchestration"],
    currentImplementation: ["src/application/guardrails.js", "src/application/data-sufficiency-checker.js", "src/application/reference-model-service.js"]
  }),
  skill({
    id: "communication_quality_control",
    version: "1.0.0",
    department: SKILL_DEPARTMENTS.QUALITY,
    kind: SKILL_KINDS.QUALITY,
    activation: SKILL_ACTIVATION.ALWAYS_ON,
    purpose: "Сохранять живой язык пользователя, понятность, краткость и отсутствие механических повторов.",
    whenToUse: ["Каждый пользовательский ответ"],
    whenNotToUse: ["Не переписывать содержательно точный ответ в безликий шаблон"],
    requiredContext: ["userLanguage", "recentResponses", "userExpertise"],
    inputs: ["draftResponse", "communicationState"],
    outputs: ["finalResponse", "terminologyExplanations"],
    memoryUpdates: ["communicationPreferences", "repetitionTrace"],
    completionCriteria: ["Ответ на языке пользователя", "Новые термины объяснены", "Нет лишних повторов и более одного следующего действия"],
    nextSkillCandidates: ["skill_orchestration"],
    currentImplementation: ["src/application/guardrails.js", "src/application/chat-diagnostic-excellence-assessor.js", "src/application/conversation-evaluator.js"]
  })
]);

export const AI_BOSS_SKILL_BY_ID = new Map(AI_BOSS_SKILLS_V1.map((item) => [item.id, item]));

export function getSkillContract(skillId) {
  return AI_BOSS_SKILL_BY_ID.get(String(skillId || "").trim()) || null;
}

export function listSkillsByDepartment(department) {
  return AI_BOSS_SKILLS_V1.filter((item) => item.department === department);
}

export function validateSkillRegistry(skills = AI_BOSS_SKILLS_V1) {
  const errors = [];
  const ids = new Set();
  const allowedDepartments = new Set(Object.values(SKILL_DEPARTMENTS));
  const allowedKinds = new Set(Object.values(SKILL_KINDS));
  const allowedActivations = new Set(Object.values(SKILL_ACTIVATION));

  for (const item of skills) {
    for (const field of REQUIRED_SKILL_FIELDS) {
      if (!(field in item)) {
        errors.push(`${item.id || "unknown"}: missing field ${field}`);
      }
    }
    if (!item.id || ids.has(item.id)) {
      errors.push(`${item.id || "unknown"}: duplicate or empty id`);
    }
    ids.add(item.id);
    if (!allowedDepartments.has(item.department)) errors.push(`${item.id}: invalid department`);
    if (!allowedKinds.has(item.kind)) errors.push(`${item.id}: invalid kind`);
    if (!allowedActivations.has(item.activation)) errors.push(`${item.id}: invalid activation`);
    if (!Array.isArray(item.completionCriteria) || item.completionCriteria.length === 0) {
      errors.push(`${item.id}: completion criteria required`);
    }
  }

  for (const item of skills) {
    for (const nextSkillId of item.nextSkillCandidates || []) {
      if (!ids.has(nextSkillId)) errors.push(`${item.id}: unknown next skill ${nextSkillId}`);
    }
  }

  return { valid: errors.length === 0, errors };
}
