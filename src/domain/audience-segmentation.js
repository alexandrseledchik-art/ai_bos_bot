export const AUDIENCE_AXES = {
  humanRole: ["owner", "ceo", "consultant", "expert", "book_reader", "consulting_client", "unknown"],
  businessSize: ["solo", "micro", "small", "medium", "large", "group", "unknown"],
  developmentStage: ["launch", "first_sales", "growth", "scaling", "stabilization", "exit_preparation", "rebuild", "unknown"],
  businessState: [
    "owner_operational_trap",
    "management_gap",
    "profit_decline",
    "process_chaos",
    "focus_gap",
    "data_gap",
    "team_growth_gap",
    "unknown"
  ],
  industry: ["consulting", "logistics", "manufacturing", "trade", "service", "it", "other", "unknown"],
  entryChannel: ["book", "telegram", "qr", "website", "consultation", "referral", "web_cabinet", "unknown"],
  aiBossMode: ["methodologist", "diagnostician", "tool_navigator", "filling_assistant", "ceo_contour", "expert_review", "unknown"]
};

export const PRIORITY_SEGMENTS = [
  {
    id: "owner_medium_management_gap",
    title: "Собственник выросшего бизнеса с разрывом управляемости",
    promise: "Быстро собрать картину бизнеса, увидеть разрыв управляемости и понять, что чинить первым.",
    commercialPriority: 1
  },
  {
    id: "owner_pre_scaling_control_risk",
    title: "Собственник растущего бизнеса перед масштабированием",
    promise: "Проверить готовность системы к росту и не усилить масштабированием существующий хаос.",
    commercialPriority: 2
  },
  {
    id: "expert_methodology_productization",
    title: "Эксперт или консультант, упаковывающий методологию в продукт",
    promise: "Превратить экспертный способ работы в воспроизводимый продукт, маршрут и управленческую систему.",
    commercialPriority: 3
  }
];

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replaceAll("ё", "е");
}

function axis(value = "unknown", confidence = "low", source = "not_observed") {
  return { value, confidence, source };
}

function firstMatch(text, candidates) {
  for (const candidate of candidates) {
    if (candidate.pattern.test(text)) {
      return axis(candidate.value, candidate.confidence || "high", candidate.source || "explicit_user_text");
    }
  }
  return axis();
}

function mergeAxis(previous, incoming) {
  if (incoming?.value && incoming.value !== "unknown") {
    return incoming;
  }
  if (previous?.value && previous.value !== "unknown") {
    return previous;
  }
  return incoming || previous || axis();
}

function mergeEntryChannel(previous, incoming) {
  if (incoming?.source === "current_surface" && previous?.value && previous.value !== "unknown") {
    return previous;
  }
  return mergeAxis(previous, incoming);
}

function mergeBusinessState(previous, incoming) {
  const previousValues = previous?.values || [];
  const incomingValues = incoming?.values || [];
  const knownIncoming = incomingValues.filter((value) => value !== "unknown");
  const knownPrevious = previousValues.filter((value) => value !== "unknown");
  const values = [...new Set([...knownPrevious, ...knownIncoming])];
  return values.length
    ? { values, confidence: knownIncoming.length ? "high" : previous?.confidence || "medium", source: knownIncoming.length ? incoming.source : previous?.source || "prior_context" }
    : incoming || previous || { values: ["unknown"], confidence: "low", source: "not_observed" };
}

function detectHumanRole(text, userMeta = {}) {
  const explicitMetaRole = normalizeText(userMeta.userRole || userMeta.role);
  const metaMap = {
    owner: "owner",
    собственник: "owner",
    ceo: "ceo",
    consultant: "consultant",
    консультант: "consultant",
    expert: "expert",
    эксперт: "expert",
    book_reader: "book_reader",
    consulting_client: "consulting_client"
  };
  if (metaMap[explicitMetaRole]) {
    return axis(metaMap[explicitMetaRole], "high", "explicit_user_profile");
  }

  return firstMatch(text, [
    { value: "owner", pattern: /(?:я\s+)?собственник(?:\s+бизнеса)?|мой\s+бизнес/ },
    { value: "ceo", pattern: /(?:я\s+)?(?:ceo|сео|генеральный\s+директор)/ },
    { value: "consultant", pattern: /(?:я\s+)?консультант/ },
    { value: "expert", pattern: /(?:я\s+)?эксперт/ },
    { value: "book_reader", pattern: /(?:я\s+)?читатель\s+книги|читаю\s+(?:вашу\s+)?книгу/ },
    { value: "consulting_client", pattern: /(?:я\s+)?клиент\s+консалтинг|после\s+консультации/ }
  ]);
}

function detectBusinessSize(text, userMeta = {}) {
  const explicit = normalizeText(userMeta.companySize || userMeta.businessSize);
  const explicitMap = {
    solo: "solo",
    micro: "micro",
    small: "small",
    medium: "medium",
    large: "large",
    group: "group",
    соло: "solo",
    микробизнес: "micro",
    малый: "small",
    средний: "medium",
    крупный: "large",
    группа: "group"
  };
  if (explicitMap[explicit]) {
    return axis(explicitMap[explicit], "high", "explicit_user_profile");
  }

  return firstMatch(text, [
    { value: "group", pattern: /группа\s+компаний|холдинг|сеть\s+компаний/ },
    { value: "large", pattern: /крупн(?:ый|ого|ому|ом|ая|ой|ую)(?:\s+[a-zа-я0-9-]+){0,3}\s+[a-zа-я0-9-]*бизнес[а-я]*/ },
    { value: "medium", pattern: /средн(?:ий|его|ему|ем|яя|ей|юю)(?:\s+[a-zа-я0-9-]+){0,3}\s+[a-zа-я0-9-]*бизнес[а-я]*/ },
    { value: "small", pattern: /мал(?:ый|ого|ому|ом|ая|ой|ую)(?:\s+[a-zа-я0-9-]+){0,3}\s+[a-zа-я0-9-]*бизнес[а-я]*/ },
    { value: "micro", pattern: /микробизнес/ },
    { value: "solo", pattern: /работаю\s+один|работаю\s+одна|соло[-\s]?бизнес|без\s+команды/ }
  ]);
}

function detectDevelopmentStage(text) {
  return firstMatch(text, [
    { value: "exit_preparation", pattern: /подготов(?:ка|ить|иться).*продаж(?:е|и)\s+бизнес|продать\s+бизнес|выход\s+из\s+бизнеса/ },
    { value: "rebuild", pattern: /перестройк(?:а|е)\s+бизнес|пересобира(?:ем|ю)\s+(?:модель|бизнес)|пивот|pivot/ },
    { value: "scaling", pattern: /перед\s+масштабирован|готов(?:имся|люсь)\s+масштаб|масштабировани/ },
    { value: "first_sales", pattern: /первые\s+продажи|перв(?:ые|ых)\s+клиент/ },
    { value: "launch", pattern: /запускаю\s+бизнес|запуск\s+бизнес|только\s+стартуем/ },
    { value: "stabilization", pattern: /стабилизац|нужно\s+стабилизировать|восстановить\s+контроль/ },
    { value: "growth", pattern: /растущ(?:ий|его)\s+бизнес|бизнес\s+растет|стади[ияе]\s+роста/ }
  ]);
}

function detectBusinessStates(text) {
  const candidates = [
    { value: "owner_operational_trap", pattern: /застрял\s+в\s+операцион|застряла\s+в\s+операцион|все\s+держится\s+на\s+мне|собственник\s+перегруж/ },
    { value: "management_gap", pattern: /нет\s+управляемост|разрыв\s+управляемост|управляемость\s+не\s+успел|меньше\s+контрол|непонятно,?\s+кто\s+за\s+что\s+отвеч|решени[ея]\s+завис|кажд[а-я]*\s+[а-я]*\s*меня[а-я]*\s+приоритет|команда\s+.*не\s+понима[а-я]*.*решени[а-я]*\s+окончатель/ },
    { value: "profit_decline", pattern: /падает\s+прибыл|прибыль\s+падает|маржа\s+(?:упала|падает|снижается)|выручка\s+есть,?\s+а\s+прибыл/ },
    { value: "process_chaos", pattern: /хаос\s+в\s+процесс|процессы\s+не\s+держ|ручной\s+хаос|рост\s+усил.*хаос/ },
    { value: "focus_gap", pattern: /не\s+выбран\s+фокус|нет\s+фокуса|распыляемся|слишком\s+много\s+направлен/ },
    { value: "data_gap", pattern: /нет\s+данных|не\s+знаем,?\s+каким\s+цифрам\s+верить|нет\s+единой\s+(?:картины|версии)(?:\s+цифр|\s+данных)?|разн(?:ые|ая)\s+данн|данные\s+расходятся/ },
    { value: "team_growth_gap", pattern: /команда\s+не\s+держит\s+рост|команда\s+не\s+тянет\s+рост|рост\s+перегружает\s+команд/ }
  ];
  const values = candidates.filter((candidate) => candidate.pattern.test(text)).map((candidate) => candidate.value);
  return values.length
    ? { values: [...new Set(values)], confidence: "high", source: "explicit_user_text" }
    : { values: ["unknown"], confidence: "low", source: "not_observed" };
}

function detectIndustry(text, company = {}) {
  const explicit = normalizeText(company.industry);
  const candidates = [
    { value: "consulting", pattern: /консалтинг|консультационн(?:ый|ого)\s+бизнес/ },
    { value: "logistics", pattern: /логистик|перевозк|складск/ },
    { value: "manufacturing", pattern: /производств|завод|цех/ },
    { value: "trade", pattern: /торговл|ритейл|магазин|дистрибьюц/ },
    { value: "it", pattern: /\bit\b|айти|saas|разработк(?:а|и)\s+по/ },
    { value: "service", pattern: /сервисн(?:ый|ого)\s+бизнес|услуг(?:и|ах)/ }
  ];
  const detected = firstMatch(`${explicit} ${text}`, candidates);
  if (detected.value !== "unknown") {
    return explicit ? { ...detected, source: "company_profile" } : detected;
  }
  return explicit ? axis("other", "medium", "company_profile") : axis();
}

function detectChannel(text, userMeta = {}) {
  const explicit = normalizeText(userMeta.entryChannel || userMeta.sourceChannel);
  if (AUDIENCE_AXES.entryChannel.includes(explicit) && explicit !== "unknown") {
    return { ...axis(explicit, "high", "explicit_attribution"), path: [explicit] };
  }

  const path = [];
  if (/книг|прочитал|читаю/.test(text)) path.push("book");
  if (/\bqr\b|куар|qr-?код/.test(text)) path.push("qr");
  if (/сайт|лендинг/.test(text)) path.push("website");
  if (/по\s+рекомендац|порекомендовал|порекомендовала/.test(text)) path.push("referral");
  if (/после\s+консультац|на\s+консультац/.test(text)) path.push("consultation");
  path.push("telegram");

  const uniquePath = [...new Set(path)];
  return {
    ...axis(uniquePath[0] || "telegram", uniquePath.length > 1 ? "high" : "medium", uniquePath.length > 1 ? "explicit_user_text" : "current_surface"),
    path: uniquePath
  };
}

function detectAiBossMode(orchestration = {}) {
  const mapping = {
    methodology_expert: "methodologist",
    diagnostician: "diagnostician",
    advisor: "tool_navigator",
    execution_coordinator: "filling_assistant",
    ceo_mode: "ceo_contour",
    strategic_reviewer: "expert_review"
  };
  const value = mapping[orchestration.operatingMode];
  return value
    ? axis(value, "medium", "mode_orchestrator")
    : axis();
}

function detectCurrentTask(text) {
  return firstMatch(text, [
    { value: "package_methodology", pattern: /упакова(?:ть|т|ыва).*методолог|методолог.*в\s+продукт|экспертн.*продукт/ },
    { value: "restore_manageability", pattern: /вернуть\s+управляемост|собрать\s+систему\s+управлен|понять,?\s+кто\s+за\s+что\s+отвеч/ },
    { value: "prepare_scaling", pattern: /подготов.*масштаб|перед\s+масштабирован|масштаб.*без\s+хаос|готовност.*к\s+рост/ },
    { value: "find_primary_constraint", pattern: /что\s+чинить\s+перв|главн.*ограничен|что\s+делать\s+перв/ },
    { value: "try_book_idea", pattern: /попробовать\s+на\s+своем\s+бизнес|открыть\s+инструмент|иде[юя]\s+из\s+книг/ }
  ]);
}

function buildSegmentCandidates(profile) {
  const role = profile.humanRole.value;
  const size = profile.businessSize.value;
  const stage = profile.developmentStage.value;
  const states = new Set(profile.businessState.values || []);
  const task = profile.currentTask.value;
  const candidates = [];

  const managementEvidence = [
    [role === "owner" || role === "ceo", "role"],
    [["medium", "large", "group"].includes(size), "size"],
    [states.has("management_gap") || states.has("owner_operational_trap") || states.has("data_gap"), "state"],
    [task === "restore_manageability" || task === "find_primary_constraint", "task"]
  ];
  candidates.push(scoreSegment(PRIORITY_SEGMENTS[0], managementEvidence));

  const scalingEvidence = [
    [role === "owner" || role === "ceo", "role"],
    [stage === "growth" || stage === "scaling", "stage"],
    [states.has("process_chaos") || states.has("team_growth_gap") || states.has("management_gap") || states.has("focus_gap"), "state"],
    [task === "prepare_scaling", "task"]
  ];
  candidates.push(scoreSegment(PRIORITY_SEGMENTS[1], scalingEvidence));

  const expertEvidence = [
    [role === "consultant" || role === "expert", "role"],
    [task === "package_methodology", "task"],
    [profile.industry.value === "consulting", "industry"]
  ];
  candidates.push(scoreSegment(PRIORITY_SEGMENTS[2], expertEvidence, {
    qualifies: (matchedAxes) => matchedAxes.includes("role") && matchedAxes.includes("task")
  }));

  return candidates.sort((left, right) => right.score - left.score || left.commercialPriority - right.commercialPriority);
}

function scoreSegment(segment, evidence, { qualifies = null } = {}) {
  const matchedAxes = evidence.filter(([matched]) => matched).map(([, name]) => name);
  const score = Number((matchedAxes.length / evidence.length).toFixed(2));
  const isQualified = typeof qualifies === "function"
    ? qualifies(matchedAxes)
    : score >= 0.75 && matchedAxes.includes("role");
  return {
    ...segment,
    score,
    matchedAxes,
    missingAxes: evidence.filter(([matched]) => !matched).map(([, name]) => name),
    status: isQualified ? "qualified" : score >= 0.5 ? "candidate" : "insufficient"
  };
}

export function buildAudienceProfile({
  userText = "",
  userMeta = {},
  company = {},
  orchestration = {},
  previousProfile = null
} = {}) {
  const text = normalizeText(userText);
  const detectedChannel = detectChannel(text, userMeta);
  const profile = {
    humanRole: mergeAxis(previousProfile?.humanRole, detectHumanRole(text, userMeta)),
    businessSize: mergeAxis(previousProfile?.businessSize, detectBusinessSize(text, userMeta)),
    developmentStage: mergeAxis(previousProfile?.developmentStage, detectDevelopmentStage(text)),
    businessState: mergeBusinessState(previousProfile?.businessState, detectBusinessStates(text)),
    industry: mergeAxis(previousProfile?.industry, detectIndustry(text, company)),
    entryChannel: mergeEntryChannel(previousProfile?.entryChannel, detectedChannel),
    channelPath: [...new Set([...(previousProfile?.channelPath || []), ...(detectedChannel.path || [])])],
    aiBossMode: detectAiBossMode(orchestration),
    currentTask: mergeAxis(previousProfile?.currentTask, detectCurrentTask(text))
  };

  if (profile.businessState.values[0] === "unknown" && previousProfile?.businessState?.values?.length) {
    profile.businessState = previousProfile.businessState;
  }
  profile.segmentCandidates = buildSegmentCandidates(profile);
  profile.primarySegment = profile.segmentCandidates.find((segment) => segment.status === "qualified") || null;
  profile.segmentationRule = "segment_is_intersection_not_single_axis";
  profile.nurtureOnly = profile.humanRole.value === "book_reader";

  return profile;
}
