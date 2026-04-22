export const GRAPH_NODE_TYPES = ["symptom", "state", "cause", "intervention"];

export const CAUSAL_GRAPH_NODES = [
  {
    id: "sales_not_growing",
    type: "symptom",
    label: "Продажи не растут",
    description: "Рост продаж остановился или идёт слабее ожидаемого.",
    domains: ["growth", "sales"],
    layer: "commercial",
    evidencePatterns: [/продаж[аи]\s+не\s+раст/i, /нет\s+роста/i, /не\s+раст[её]т/i],
    contradictionPatterns: [],
    relatedQuestions: [
      "Где поток ломается сильнее всего: качество входа, квалификация, первый ответ, переход в сделку или дожим?"
    ]
  },
  {
    id: "deals_stuck",
    type: "symptom",
    label: "Сделки висят",
    description: "Сделки долго не двигаются по воронке или не закрываются.",
    domains: ["sales", "ops"],
    layer: "operations",
    evidencePatterns: [/сделк[аи].*висят/i, /сделк[аи].*не\s+закрыва/i, /долго\s+не\s+двига/i],
    contradictionPatterns: [],
    relatedQuestions: [
      "Есть ли в CRM жёстко заданные этапы сделки, обязательные поля и понятный момент передачи ответственности?"
    ]
  },
  {
    id: "owner_in_deals",
    type: "symptom",
    label: "Собственник влезает в сделки",
    description: "Собственник остаётся частью операционного контура продаж.",
    domains: ["sales", "governance"],
    layer: "management",
    evidencePatterns: [/собственник.*сделк/i, /все\s+держится\s+на\s+мне/i, /я\s+лезу\s+в\s+сделк/i],
    contradictionPatterns: [],
    relatedQuestions: [
      "Какие решения по сделке команда реально может принять без собственника, а где всё останавливается?"
    ]
  },
  {
    id: "lead_overload",
    type: "symptom",
    label: "Лидов слишком много для текущей обработки",
    description: "Входящий поток превышает текущую пропускную способность.",
    domains: ["growth", "sales"],
    layer: "commercial",
    evidencePatterns: [/заяв[оа]к\s+много/i, /лид[оа]в\s+много/i, /не\s+успева.*обработ/i],
    contradictionPatterns: [],
    relatedQuestions: [
      "Из последних 20 заявок сколько вообще были целевыми и достойными быстрого ответа?"
    ]
  },
  {
    id: "slow_first_response",
    type: "symptom",
    label: "Слишком долгий первый ответ",
    description: "Компания долго отвечает на новые заявки.",
    domains: ["sales", "ops"],
    layer: "operations",
    evidencePatterns: [/долго\s+отвеча/i, /перв[ыо]й\s+ответ.*долго/i, /очеред/i],
    contradictionPatterns: [],
    relatedQuestions: [
      "У входящих есть отдельный владелец и SLA на первый ответ, или это общая очередь?"
    ]
  },
  {
    id: "hiring_without_relief",
    type: "symptom",
    label: "Наняли людей, но легче не стало",
    description: "Ресурс добавили, а системного эффекта нет.",
    domains: ["people", "ops"],
    layer: "people",
    evidencePatterns: [/нанял[и]?\s+людей.*не\s+стал/i, /наняли.*легче\s+не\s+стал/i],
    contradictionPatterns: [],
    relatedQuestions: [
      "После найма что именно осталось прежним: очередь, качество сделок, решения собственника или этапы воронки?"
    ]
  },
  {
    id: "low_profit",
    type: "symptom",
    label: "Прибыль не остаётся",
    description: "Выручка есть, но результат в деньгах слабый.",
    domains: ["finance", "sales"],
    layer: "finance",
    evidencePatterns: [/прибыл.*не\s+оста/i, /денег\s+не\s+оста/i, /касс/i],
    contradictionPatterns: [],
    relatedQuestions: [
      "Где экономика ломается сильнее всего: цена, маржа, CAC, скидки или себестоимость выполнения?"
    ]
  },
  {
    id: "margin_down",
    type: "symptom",
    label: "Маржа падает",
    description: "Маржа просела по сегментам или в целом по бизнесу.",
    domains: ["finance", "sales"],
    layer: "finance",
    evidencePatterns: [/марж[аи].*упал/i, /марж[аи].*пада/i],
    contradictionPatterns: [],
    relatedQuestions: [
      "Маржа проседает на уровне цены, скидок, каналов, сегментов или выполнения?"
    ]
  },
  {
    id: "no_sales_operating_model",
    type: "state",
    label: "Нет операционной модели продаж",
    description: "Продажи работают без оформленной конструкции стадий, владельцев и правил переходов.",
    domains: ["sales", "ops"],
    layer: "operations",
    evidencePatterns: [],
    contradictionPatterns: [],
    relatedQuestions: [
      "Есть ли в CRM жёстко заданные этапы сделки, обязательные поля и момент передачи ответственности?"
    ]
  },
  {
    id: "unclear_role_boundaries",
    type: "state",
    label: "Не разделены роли в коммерческом контуре",
    description: "Квалификация, первый ответ, дожим и управление смешаны.",
    domains: ["sales", "people", "ops"],
    layer: "people",
    evidencePatterns: [],
    contradictionPatterns: [],
    relatedQuestions: [
      "Кто у вас отвечает отдельно за первый ответ, квалификацию, дожим и эскалацию?"
    ]
  },
  {
    id: "decision_centralization",
    type: "state",
    label: "Решения централизованы на собственнике",
    description: "Ключевые исключения и развилки не распределены по роли.",
    domains: ["governance", "sales"],
    layer: "management",
    evidencePatterns: [],
    contradictionPatterns: [],
    relatedQuestions: [
      "Какие решения по сделкам и операционке команда принимает сама, а что всё ещё тянется к собственнику?"
    ]
  },
  {
    id: "no_inbound_routing",
    type: "state",
    label: "Нет маршрутизации входящих",
    description: "Новые заявки не попадают в чёткий поток с владельцем и SLA.",
    domains: ["growth", "sales", "ops"],
    layer: "operations",
    evidencePatterns: [],
    contradictionPatterns: [],
    relatedQuestions: [
      "У входящих есть владелец, SLA и критерии приоритета, или они попадают в общую очередь?"
    ]
  },
  {
    id: "weak_lead_qualification",
    type: "state",
    label: "Слабая квалификация лидов",
    description: "Команда тратит время на лиды, которые не должны были идти в быструю обработку.",
    domains: ["growth", "sales"],
    layer: "commercial",
    evidencePatterns: [],
    contradictionPatterns: [],
    relatedQuestions: [
      "Какой процент последних лидов вы бы сегодня признали целевыми по ICP?"
    ]
  },
  {
    id: "no_icp",
    type: "state",
    label: "Не определён ICP",
    description: "Компания не закрепила приоритетный профиль клиента.",
    domains: ["strategy", "sales", "growth"],
    layer: "strategy",
    evidencePatterns: [],
    contradictionPatterns: [],
    relatedQuestions: [
      "У вас формально описан ICP и критерии приоритета, по которым лучший лид отличается от мусорного?"
    ]
  },
  {
    id: "poor_stage_definition",
    type: "state",
    label: "Нет чётких стадий и критериев перехода",
    description: "Воронка существует на словах, но не как операционная система.",
    domains: ["sales", "ops"],
    layer: "operations",
    evidencePatterns: [],
    contradictionPatterns: [],
    relatedQuestions: [
      "Стадии сделки описаны как обязательная система, или каждый менеджер ведёт процесс по-своему?"
    ]
  },
  {
    id: "no_control_loop",
    type: "state",
    label: "Отсутствует управленческий контур контроля",
    description: "Руководство не видит, где поток ломается и где накапливается ручной героизм.",
    domains: ["governance", "ops"],
    layer: "management",
    evidencePatterns: [],
    contradictionPatterns: [],
    relatedQuestions: [
      "Есть ли регулярный контур контроля по стадиям, SLA, просрочкам и owner'ам, или всё видно только постфактум?"
    ]
  },
  {
    id: "weak_financial_visibility",
    type: "state",
    label: "Слабая прозрачность unit economics",
    description: "Компания не видит, где именно разрушается прибыль.",
    domains: ["finance", "sales"],
    layer: "finance",
    evidencePatterns: [],
    contradictionPatterns: [],
    relatedQuestions: [
      "Вы видите unit economics по сегментам и каналам, или прибыль сейчас обсуждается на уровне ощущений?"
    ]
  },
  {
    id: "sales_process_not_defined",
    type: "cause",
    label: "Не описан sales process",
    description: "Процесс продаж не формализован как управляемая система.",
    domains: ["sales", "ops"],
    layer: "operations",
    evidencePatterns: [],
    contradictionPatterns: [],
    relatedQuestions: [
      "Есть ли у вас единое определение этапов сделки, критериев перехода и обязательных действий?"
    ]
  },
  {
    id: "authority_not_distributed",
    type: "cause",
    label: "Не распределены права принятия решений",
    description: "Команда не знает, что она вправе решать без собственника.",
    domains: ["governance", "people"],
    layer: "management",
    evidencePatterns: [],
    contradictionPatterns: [],
    relatedQuestions: [
      "Что менеджер или руководитель может решить без эскалации к собственнику?"
    ]
  },
  {
    id: "operating_model_not_formalized",
    type: "cause",
    label: "Операционная модель не формализована",
    description: "Бизнес работает на привычке и ручном сопровождении, а не на описанной конструкции.",
    domains: ["ops", "governance"],
    layer: "operations",
    evidencePatterns: [],
    contradictionPatterns: [],
    relatedQuestions: [
      "Что в процессе сейчас держится на привычке людей, а не на формализованной модели?"
    ]
  },
  {
    id: "icp_not_defined",
    type: "cause",
    label: "Не определён ICP и критерии приоритета",
    description: "Компания не отделила лучший спрос от мусорного.",
    domains: ["strategy", "growth", "sales"],
    layer: "strategy",
    evidencePatterns: [],
    contradictionPatterns: [],
    relatedQuestions: [
      "Какой профиль клиента вы считаете приоритетным и где это закреплено в реальной работе команды?"
    ]
  },
  {
    id: "control_loop_missing",
    type: "cause",
    label: "Нет контура контроля и обратной связи",
    description: "Система не создаёт предсказуемость и не подсвечивает узкие места вовремя.",
    domains: ["governance", "ops"],
    layer: "management",
    evidencePatterns: [],
    contradictionPatterns: [],
    relatedQuestions: [
      "Какие показатели и ритуалы реально дают вам увидеть, где именно поток ломается?"
    ]
  },
  {
    id: "unit_economics_unknown",
    type: "cause",
    label: "Неизвестна реальная unit economics",
    description: "Компания не понимает, где рост перестаёт превращаться в прибыль.",
    domains: ["finance", "strategy"],
    layer: "finance",
    evidencePatterns: [],
    contradictionPatterns: [],
    relatedQuestions: [
      "Вы можете быстро показать экономику по каналу, сегменту и продукту без ручной сборки?"
    ]
  },
  {
    id: "define_sales_stages",
    type: "intervention",
    label: "Внедрить стадии сделки и критерии перехода",
    description: "Оформить продажи как операционную модель.",
    domains: ["sales", "ops"],
    layer: "operations",
    evidencePatterns: [],
    contradictionPatterns: [],
    relatedQuestions: []
  },
  {
    id: "assign_inbound_owner",
    type: "intervention",
    label: "Назначить владельца входящих и SLA на первый ответ",
    description: "Снять потери на первом касании.",
    domains: ["sales", "ops"],
    layer: "operations",
    evidencePatterns: [],
    contradictionPatterns: [],
    relatedQuestions: []
  },
  {
    id: "define_icp",
    type: "intervention",
    label: "Определить ICP и критерии приоритета лидов",
    description: "Отделить целевой спрос от мусорного потока.",
    domains: ["strategy", "growth", "sales"],
    layer: "strategy",
    evidencePatterns: [],
    contradictionPatterns: [],
    relatedQuestions: []
  },
  {
    id: "split_roles",
    type: "intervention",
    label: "Разделить роли в продажах и handoff",
    description: "Развести первый ответ, квалификацию, дожим и эскалацию.",
    domains: ["sales", "people", "ops"],
    layer: "people",
    evidencePatterns: [],
    contradictionPatterns: [],
    relatedQuestions: []
  },
  {
    id: "distribute_decision_rights",
    type: "intervention",
    label: "Распределить права принятия решений",
    description: "Снизить зависимость от собственника в сделках и операционке.",
    domains: ["governance", "people"],
    layer: "management",
    evidencePatterns: [],
    contradictionPatterns: [],
    relatedQuestions: []
  },
  {
    id: "install_control_loop",
    type: "intervention",
    label: "Поставить контур контроля по этапам и SLA",
    description: "Сделать узкие места видимыми и управляемыми.",
    domains: ["governance", "ops"],
    layer: "management",
    evidencePatterns: [],
    contradictionPatterns: [],
    relatedQuestions: []
  },
  {
    id: "build_unit_economics",
    type: "intervention",
    label: "Собрать unit economics по сегментам и каналам",
    description: "Увидеть, где рост перестаёт превращаться в деньги.",
    domains: ["finance", "strategy"],
    layer: "finance",
    evidencePatterns: [],
    contradictionPatterns: [],
    relatedQuestions: []
  }
];

export const CAUSAL_GRAPH_EDGES = [
  { from: "sales_not_growing", to: "no_sales_operating_model", relation: "suggests", weight: 0.78, confidence: "medium", domainCross: ["sales", "ops"] },
  { from: "sales_not_growing", to: "weak_lead_qualification", relation: "suggests", weight: 0.64, confidence: "medium", domainCross: ["growth", "sales"] },
  { from: "sales_not_growing", to: "decision_centralization", relation: "suggests", weight: 0.57, confidence: "medium", domainCross: ["sales", "governance"] },
  { from: "deals_stuck", to: "poor_stage_definition", relation: "suggests", weight: 0.79, confidence: "high", domainCross: ["sales", "ops"] },
  { from: "deals_stuck", to: "no_control_loop", relation: "suggests", weight: 0.62, confidence: "medium", domainCross: ["ops", "governance"] },
  { from: "owner_in_deals", to: "decision_centralization", relation: "supports", weight: 0.83, confidence: "high", domainCross: ["sales", "governance"] },
  { from: "owner_in_deals", to: "unclear_role_boundaries", relation: "supports", weight: 0.67, confidence: "medium", domainCross: ["sales", "people"] },
  { from: "lead_overload", to: "weak_lead_qualification", relation: "suggests", weight: 0.81, confidence: "high", domainCross: ["growth", "sales"] },
  { from: "lead_overload", to: "no_inbound_routing", relation: "suggests", weight: 0.76, confidence: "high", domainCross: ["sales", "ops"] },
  { from: "lead_overload", to: "no_icp", relation: "suggests", weight: 0.71, confidence: "medium", domainCross: ["strategy", "sales"] },
  { from: "slow_first_response", to: "no_inbound_routing", relation: "supports", weight: 0.82, confidence: "high", domainCross: ["sales", "ops"] },
  { from: "slow_first_response", to: "unclear_role_boundaries", relation: "supports", weight: 0.61, confidence: "medium", domainCross: ["sales", "people"] },
  { from: "hiring_without_relief", to: "unclear_role_boundaries", relation: "suggests", weight: 0.73, confidence: "medium", domainCross: ["people", "ops"] },
  { from: "hiring_without_relief", to: "no_sales_operating_model", relation: "suggests", weight: 0.66, confidence: "medium", domainCross: ["sales", "ops"] },
  { from: "low_profit", to: "weak_financial_visibility", relation: "suggests", weight: 0.8, confidence: "high", domainCross: ["finance", "strategy"] },
  { from: "margin_down", to: "weak_financial_visibility", relation: "supports", weight: 0.76, confidence: "high", domainCross: ["finance", "strategy"] },
  { from: "no_sales_operating_model", to: "sales_process_not_defined", relation: "depends_on", weight: 0.85, confidence: "high", domainCross: ["sales", "ops"] },
  { from: "no_sales_operating_model", to: "operating_model_not_formalized", relation: "depends_on", weight: 0.7, confidence: "medium", domainCross: ["ops", "governance"] },
  { from: "unclear_role_boundaries", to: "authority_not_distributed", relation: "depends_on", weight: 0.72, confidence: "medium", domainCross: ["people", "governance"] },
  { from: "unclear_role_boundaries", to: "operating_model_not_formalized", relation: "depends_on", weight: 0.66, confidence: "medium", domainCross: ["people", "ops"] },
  { from: "decision_centralization", to: "authority_not_distributed", relation: "depends_on", weight: 0.88, confidence: "high", domainCross: ["governance", "people"] },
  { from: "decision_centralization", to: "control_loop_missing", relation: "depends_on", weight: 0.63, confidence: "medium", domainCross: ["governance", "ops"] },
  { from: "no_inbound_routing", to: "sales_process_not_defined", relation: "depends_on", weight: 0.68, confidence: "medium", domainCross: ["sales", "ops"] },
  { from: "no_inbound_routing", to: "authority_not_distributed", relation: "depends_on", weight: 0.58, confidence: "medium", domainCross: ["ops", "people"] },
  { from: "weak_lead_qualification", to: "icp_not_defined", relation: "depends_on", weight: 0.79, confidence: "high", domainCross: ["strategy", "sales"] },
  { from: "poor_stage_definition", to: "sales_process_not_defined", relation: "depends_on", weight: 0.86, confidence: "high", domainCross: ["sales", "ops"] },
  { from: "no_control_loop", to: "control_loop_missing", relation: "depends_on", weight: 0.9, confidence: "high", domainCross: ["governance", "ops"] },
  { from: "weak_financial_visibility", to: "unit_economics_unknown", relation: "depends_on", weight: 0.88, confidence: "high", domainCross: ["finance", "strategy"] },
  { from: "sales_process_not_defined", to: "define_sales_stages", relation: "resolved_by", weight: 0.92, confidence: "high", domainCross: ["sales", "ops"] },
  { from: "authority_not_distributed", to: "distribute_decision_rights", relation: "resolved_by", weight: 0.9, confidence: "high", domainCross: ["governance", "people"] },
  { from: "operating_model_not_formalized", to: "split_roles", relation: "resolved_by", weight: 0.74, confidence: "medium", domainCross: ["ops", "people"] },
  { from: "operating_model_not_formalized", to: "install_control_loop", relation: "resolved_by", weight: 0.7, confidence: "medium", domainCross: ["ops", "governance"] },
  { from: "icp_not_defined", to: "define_icp", relation: "resolved_by", weight: 0.93, confidence: "high", domainCross: ["strategy", "sales"] },
  { from: "control_loop_missing", to: "install_control_loop", relation: "resolved_by", weight: 0.91, confidence: "high", domainCross: ["governance", "ops"] },
  { from: "unit_economics_unknown", to: "build_unit_economics", relation: "resolved_by", weight: 0.94, confidence: "high", domainCross: ["finance", "strategy"] },
  { from: "no_inbound_routing", to: "assign_inbound_owner", relation: "resolved_by", weight: 0.89, confidence: "high", domainCross: ["sales", "ops"] },
  { from: "weak_lead_qualification", to: "define_icp", relation: "resolved_by", weight: 0.74, confidence: "medium", domainCross: ["strategy", "sales"] },
  { from: "unclear_role_boundaries", to: "split_roles", relation: "resolved_by", weight: 0.87, confidence: "high", domainCross: ["people", "ops"] }
];
