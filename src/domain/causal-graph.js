export const GRAPH_NODE_TYPES = ["symptom", "state", "cause", "intervention"];

export const CAUSAL_GRAPH_NODES = [
  {
    id: "sales_not_growing",
    type: "symptom",
    label: "Продажи не растут",
    description: "Рост продаж остановился или идёт слабее ожидаемого.",
    domains: ["growth", "sales"],
    layer: "commercial",
    evidencePatterns: [/продаж[аи]\s+не\s+раст/i, /нет\s+роста/i, /не\s+раст[её]т/i, /с\s+продажами\s+не\s+очень/i],
    contradictionPatterns: [],
    relatedQuestions: [
      "Если смотреть шире воронки, что ломается раньше: качество входа, квалификация, первый ответ, переход в сделку или сама настройка сегмента и ICP?"
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
      "Перегрузка идёт от объёма качественных обращений или от того, что в работу попадает неразобранный и смешанный поток?"
    ]
  },
  {
    id: "slow_first_response",
    type: "symptom",
    label: "Слишком долгий первый ответ",
    description: "Компания долго отвечает на новые заявки.",
    domains: ["sales", "ops"],
    layer: "operations",
    evidencePatterns: [/долго\s+отвеча/i, /перв[ыо]й\s+ответ.*долго/i, /очеред/i, /жд[её]т\s+несколько\s+дн/i, /перезвон/i],
    contradictionPatterns: [],
    relatedQuestions: [
      "Задержка в первом отклике есть даже по самым целевым лидам, или быстрее теряются только смешанные и низкоприоритетные обращения?"
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
      "Все входящие вы считаете целевыми, или продавцы сначала сами пытаются понять, с кем вообще стоит работать?"
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
      "Какой сегмент и какая задача клиента у вас стратегически приоритетны, и где это переведено в ICP и правила приоритета лидов?"
    ]
  },
  {
    id: "no_prequalification_layer",
    type: "state",
    label: "Нет слоя предквалификации до продавца",
    description: "В продавцов попадает сырой поток, который должен отсеиваться раньше.",
    domains: ["sales", "sale_prep", "ops"],
    layer: "commercial",
    evidencePatterns: [],
    contradictionPatterns: [],
    relatedQuestions: [
      "Есть ли до продавца этап квалификации, который отсеивает нецелевые заявки, или в работу попадает всё подряд?"
    ]
  },
  {
    id: "uniform_sla_for_mixed_leads",
    type: "state",
    label: "Одинаковая логика первого контакта для смешанных лидов",
    description: "Приоритетные и слабые лиды обрабатываются одинаково, хотя должны идти разными путями.",
    domains: ["growth", "sales", "sale_prep"],
    layer: "commercial",
    evidencePatterns: [],
    contradictionPatterns: [],
    relatedQuestions: [
      "Сегменты лидов у вас разделены по приоритету, или для всех действует одна и та же логика первого контакта?"
    ]
  },
  {
    id: "inbound_noise_mixed_with_target_demand",
    type: "state",
    label: "Шумный входящий поток смешан с целевым спросом",
    description: "Целевые и нецелевые лиды смешаны в одном потоке, поэтому нагрузка выглядит как нехватка людей.",
    domains: ["growth", "sales", "strategy"],
    layer: "commercial",
    evidencePatterns: [],
    contradictionPatterns: [],
    relatedQuestions: [
      "У вас перегрузка из-за объёма качественных обращений или из-за того, что в команду попадает неразобранный поток?"
    ]
  },
  {
    id: "ownership_of_first_contact_blurred",
    type: "state",
    label: "Размыт ownership первого контакта",
    description: "За первый отклик вроде кто-то отвечает, но на практике владелец и ответственность плавают.",
    domains: ["sales", "ops", "people"],
    layer: "operations",
    evidencePatterns: [],
    contradictionPatterns: [],
    relatedQuestions: [
      "Первый контакт после заявки реально закреплён за одной ролью, или ответственность каждый раз размывается?"
    ]
  },
  {
    id: "capacity_model_missing",
    type: "state",
    label: "Нет модели мощности под реальную нагрузку",
    description: "Штат и очереди живут отдельно от реальной модели потока, SLA и приоритетов.",
    domains: ["people", "sales", "ops"],
    layer: "people",
    evidencePatterns: [],
    contradictionPatterns: [],
    relatedQuestions: [
      "Штат у вас считается от реальной нагрузки и приоритетов лидов, или людей добавляют уже после перегруза?"
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
      "Какой профиль клиента и какая задача по стратегии для вас приоритетны, и где это превращается в правила для маркетинга, квалификации и продаж?"
    ]
  },
  {
    id: "icp_defined_but_not_operationalized",
    type: "cause",
    label: "ICP определён на словах, но не переведён в правила отбора и приоритета",
    description: "Сегмент вроде понятен, но не влияет на маршрутизацию, квалификацию и SLA.",
    domains: ["strategy", "sales", "sale_prep"],
    layer: "strategy",
    evidencePatterns: [],
    contradictionPatterns: [],
    relatedQuestions: [
      "Даже если ICP формально есть, где он реально превращается в правила: в рекламе, квалификации, приоритете и handoff?"
    ]
  },
  {
    id: "traffic_not_aligned_with_icp",
    type: "cause",
    label: "Каналы и обещание приводят спрос не того сегмента",
    description: "Поток растёт, но значимая часть спроса не совпадает с тем клиентом, под которого построены продажи.",
    domains: ["strategy", "growth", "sales"],
    layer: "strategy",
    evidencePatterns: [],
    contradictionPatterns: [],
    relatedQuestions: [
      "Каналы и обещание рынку у вас реально приводят тот сегмент, под который вообще построена модель продаж?"
    ]
  },
  {
    id: "gtm_not_synced_with_sales_capacity",
    type: "cause",
    label: "GTM-модель не синхронизирована с моделью продаж и мощностью команды",
    description: "Привлечение, приоритеты и способ обработки входящих не собраны в одну конструкцию.",
    domains: ["strategy", "growth", "sales", "ops"],
    layer: "strategy",
    evidencePatterns: [],
    contradictionPatterns: [],
    relatedQuestions: [
      "Объём входа, обещание рынку и модель обработки у вас согласованы между собой, или каждый слой живёт отдельно?"
    ]
  },
  {
    id: "staffing_not_tied_to_lead_load",
    type: "cause",
    label: "Штат не привязан к реальной модели нагрузки и приоритетов",
    description: "Людей добавляют по ощущению перегруза, а не от потока целевых лидов, SLA и ownership.",
    domains: ["people", "sales", "ops"],
    layer: "people",
    evidencePatterns: [],
    contradictionPatterns: [],
    relatedQuestions: [
      "Решение про найм у вас опирается на модель целевого потока и SLA, или на общий перегруз без разборки качества входа?"
    ]
  },
  {
    id: "rule_exists_but_execution_loop_missing",
    type: "cause",
    label: "Правило есть, но нет контура исполнения и контроля",
    description: "SLA, ownership или регламент формально существуют, но система их не удерживает.",
    domains: ["management", "ops"],
    layer: "management",
    evidencePatterns: [],
    contradictionPatterns: [],
    relatedQuestions: [
      "Если правило первого отклика у вас уже есть, где оно разваливается: в ownership, в контроле, в мощности или в приоритетах?"
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
    id: "build_prequalification_layer",
    type: "intervention",
    label: "Вынести предквалификацию до продавца",
    description: "Отделить сырой поток от заявок, которые реально должны идти в быструю продажную обработку.",
    domains: ["sales", "sale_prep", "ops"],
    layer: "commercial",
    evidencePatterns: [],
    contradictionPatterns: [],
    relatedQuestions: []
  },
  {
    id: "segment_inbound_routing",
    type: "intervention",
    label: "Разделить маршрутизацию и SLA по сегментам лидов",
    description: "Перестать обрабатывать приоритетный и неприоритетный поток по одной логике.",
    domains: ["growth", "sales", "ops"],
    layer: "commercial",
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
  { from: "sales_not_growing", to: "no_icp", relation: "suggests", weight: 0.62, confidence: "medium", domainCross: ["strategy", "sales"] },
  { from: "sales_not_growing", to: "inbound_noise_mixed_with_target_demand", relation: "suggests", weight: 0.66, confidence: "medium", domainCross: ["growth", "strategy"] },
  { from: "sales_not_growing", to: "decision_centralization", relation: "suggests", weight: 0.57, confidence: "medium", domainCross: ["sales", "governance"] },
  { from: "deals_stuck", to: "poor_stage_definition", relation: "suggests", weight: 0.79, confidence: "high", domainCross: ["sales", "ops"] },
  { from: "deals_stuck", to: "no_control_loop", relation: "suggests", weight: 0.62, confidence: "medium", domainCross: ["ops", "governance"] },
  { from: "owner_in_deals", to: "decision_centralization", relation: "supports", weight: 0.83, confidence: "high", domainCross: ["sales", "governance"] },
  { from: "owner_in_deals", to: "unclear_role_boundaries", relation: "supports", weight: 0.67, confidence: "medium", domainCross: ["sales", "people"] },
  { from: "lead_overload", to: "weak_lead_qualification", relation: "suggests", weight: 0.81, confidence: "high", domainCross: ["growth", "sales"] },
  { from: "lead_overload", to: "no_inbound_routing", relation: "suggests", weight: 0.76, confidence: "high", domainCross: ["sales", "ops"] },
  { from: "lead_overload", to: "no_icp", relation: "suggests", weight: 0.71, confidence: "medium", domainCross: ["strategy", "sales"] },
  { from: "lead_overload", to: "no_prequalification_layer", relation: "suggests", weight: 0.79, confidence: "high", domainCross: ["sales", "sale_prep"] },
  { from: "lead_overload", to: "uniform_sla_for_mixed_leads", relation: "suggests", weight: 0.74, confidence: "high", domainCross: ["sales", "growth"] },
  { from: "lead_overload", to: "inbound_noise_mixed_with_target_demand", relation: "suggests", weight: 0.77, confidence: "high", domainCross: ["growth", "strategy"] },
  { from: "slow_first_response", to: "no_inbound_routing", relation: "supports", weight: 0.82, confidence: "high", domainCross: ["sales", "ops"] },
  { from: "slow_first_response", to: "unclear_role_boundaries", relation: "supports", weight: 0.61, confidence: "medium", domainCross: ["sales", "people"] },
  { from: "slow_first_response", to: "ownership_of_first_contact_blurred", relation: "supports", weight: 0.78, confidence: "high", domainCross: ["sales", "ops"] },
  { from: "slow_first_response", to: "capacity_model_missing", relation: "supports", weight: 0.63, confidence: "medium", domainCross: ["people", "ops"] },
  { from: "hiring_without_relief", to: "unclear_role_boundaries", relation: "suggests", weight: 0.73, confidence: "medium", domainCross: ["people", "ops"] },
  { from: "hiring_without_relief", to: "no_sales_operating_model", relation: "suggests", weight: 0.66, confidence: "medium", domainCross: ["sales", "ops"] },
  { from: "hiring_without_relief", to: "capacity_model_missing", relation: "suggests", weight: 0.69, confidence: "medium", domainCross: ["people", "ops"] },
  { from: "hiring_without_relief", to: "no_prequalification_layer", relation: "suggests", weight: 0.61, confidence: "medium", domainCross: ["sales", "sale_prep"] },
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
  { from: "weak_lead_qualification", to: "icp_defined_but_not_operationalized", relation: "depends_on", weight: 0.77, confidence: "high", domainCross: ["strategy", "sales"] },
  { from: "no_prequalification_layer", to: "icp_defined_but_not_operationalized", relation: "depends_on", weight: 0.81, confidence: "high", domainCross: ["strategy", "sale_prep"] },
  { from: "uniform_sla_for_mixed_leads", to: "icp_defined_but_not_operationalized", relation: "depends_on", weight: 0.79, confidence: "high", domainCross: ["strategy", "sales"] },
  { from: "inbound_noise_mixed_with_target_demand", to: "traffic_not_aligned_with_icp", relation: "depends_on", weight: 0.84, confidence: "high", domainCross: ["strategy", "growth"] },
  { from: "inbound_noise_mixed_with_target_demand", to: "gtm_not_synced_with_sales_capacity", relation: "depends_on", weight: 0.72, confidence: "medium", domainCross: ["strategy", "ops"] },
  { from: "ownership_of_first_contact_blurred", to: "rule_exists_but_execution_loop_missing", relation: "depends_on", weight: 0.83, confidence: "high", domainCross: ["management", "ops"] },
  { from: "capacity_model_missing", to: "staffing_not_tied_to_lead_load", relation: "depends_on", weight: 0.81, confidence: "high", domainCross: ["people", "ops"] },
  { from: "no_inbound_routing", to: "rule_exists_but_execution_loop_missing", relation: "depends_on", weight: 0.64, confidence: "medium", domainCross: ["management", "ops"] },
  { from: "poor_stage_definition", to: "sales_process_not_defined", relation: "depends_on", weight: 0.86, confidence: "high", domainCross: ["sales", "ops"] },
  { from: "no_control_loop", to: "control_loop_missing", relation: "depends_on", weight: 0.9, confidence: "high", domainCross: ["governance", "ops"] },
  { from: "weak_financial_visibility", to: "unit_economics_unknown", relation: "depends_on", weight: 0.88, confidence: "high", domainCross: ["finance", "strategy"] },
  { from: "sales_process_not_defined", to: "define_sales_stages", relation: "resolved_by", weight: 0.92, confidence: "high", domainCross: ["sales", "ops"] },
  { from: "authority_not_distributed", to: "distribute_decision_rights", relation: "resolved_by", weight: 0.9, confidence: "high", domainCross: ["governance", "people"] },
  { from: "operating_model_not_formalized", to: "split_roles", relation: "resolved_by", weight: 0.74, confidence: "medium", domainCross: ["ops", "people"] },
  { from: "operating_model_not_formalized", to: "install_control_loop", relation: "resolved_by", weight: 0.7, confidence: "medium", domainCross: ["ops", "governance"] },
  { from: "icp_not_defined", to: "define_icp", relation: "resolved_by", weight: 0.93, confidence: "high", domainCross: ["strategy", "sales"] },
  { from: "icp_defined_but_not_operationalized", to: "segment_inbound_routing", relation: "resolved_by", weight: 0.86, confidence: "high", domainCross: ["strategy", "sales"] },
  { from: "traffic_not_aligned_with_icp", to: "define_icp", relation: "resolved_by", weight: 0.72, confidence: "medium", domainCross: ["strategy", "growth"] },
  { from: "gtm_not_synced_with_sales_capacity", to: "segment_inbound_routing", relation: "resolved_by", weight: 0.79, confidence: "high", domainCross: ["strategy", "ops"] },
  { from: "staffing_not_tied_to_lead_load", to: "assign_inbound_owner", relation: "resolved_by", weight: 0.62, confidence: "medium", domainCross: ["people", "ops"] },
  { from: "staffing_not_tied_to_lead_load", to: "segment_inbound_routing", relation: "resolved_by", weight: 0.69, confidence: "medium", domainCross: ["people", "sales"] },
  { from: "rule_exists_but_execution_loop_missing", to: "install_control_loop", relation: "resolved_by", weight: 0.88, confidence: "high", domainCross: ["management", "ops"] },
  { from: "control_loop_missing", to: "install_control_loop", relation: "resolved_by", weight: 0.91, confidence: "high", domainCross: ["governance", "ops"] },
  { from: "unit_economics_unknown", to: "build_unit_economics", relation: "resolved_by", weight: 0.94, confidence: "high", domainCross: ["finance", "strategy"] },
  { from: "no_inbound_routing", to: "assign_inbound_owner", relation: "resolved_by", weight: 0.89, confidence: "high", domainCross: ["sales", "ops"] },
  { from: "no_prequalification_layer", to: "build_prequalification_layer", relation: "resolved_by", weight: 0.9, confidence: "high", domainCross: ["sales", "sale_prep"] },
  { from: "uniform_sla_for_mixed_leads", to: "segment_inbound_routing", relation: "resolved_by", weight: 0.88, confidence: "high", domainCross: ["growth", "sales"] },
  { from: "inbound_noise_mixed_with_target_demand", to: "build_prequalification_layer", relation: "resolved_by", weight: 0.76, confidence: "medium", domainCross: ["growth", "sales"] },
  { from: "weak_lead_qualification", to: "define_icp", relation: "resolved_by", weight: 0.74, confidence: "medium", domainCross: ["strategy", "sales"] },
  { from: "weak_lead_qualification", to: "build_prequalification_layer", relation: "resolved_by", weight: 0.71, confidence: "medium", domainCross: ["sales", "sale_prep"] },
  { from: "ownership_of_first_contact_blurred", to: "assign_inbound_owner", relation: "resolved_by", weight: 0.91, confidence: "high", domainCross: ["sales", "ops"] },
  { from: "capacity_model_missing", to: "split_roles", relation: "resolved_by", weight: 0.66, confidence: "medium", domainCross: ["people", "ops"] },
  { from: "unclear_role_boundaries", to: "split_roles", relation: "resolved_by", weight: 0.87, confidence: "high", domainCross: ["people", "ops"] }
];
