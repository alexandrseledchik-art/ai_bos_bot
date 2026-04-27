export const MVP_TOOLS = [
  {
    slug: "role-responsibility-map",
    title: "Карта ролей и ответственности",
    shortDescription: "Помогает увидеть, кто за что отвечает, где задачи зависают между людьми и где нужна ясная передача.",
    whenToUse: "Когда есть хаос в ролях, перегруз, ручное распределение задач или непонятно, кто владеет результатом.",
    templateUrl: "",
    layerKeys: ["operating_model", "people_organization", "governance_risks"],
    problemTypes: ["roles", "responsibility", "operations", "management", "sales_process"]
  },
  {
    slug: "target-customer-review",
    title: "Разбор целевого клиента",
    shortDescription: "Помогает отделить целевой спрос от шума и превратить портрет клиента в рабочий фильтр.",
    whenToUse: "Когда лидов много, но продажи слабые; поток смешанный; продавцы тратят время на нецелевых клиентов.",
    templateUrl: "",
    layerKeys: ["strategy", "product_value_proposition", "commercial"],
    problemTypes: ["sales", "leads", "conversion", "icp", "segmentation"]
  },
  {
    slug: "funnel-map",
    title: "Карта воронки",
    shortDescription: "Показывает, где именно поток ломается: вход, контакт, квалификация, предложение, сделка или передача дальше.",
    whenToUse: "Когда есть заявки, но непонятно, где теряется конверсия, скорость или ответственность.",
    templateUrl: "",
    layerKeys: ["commercial", "operating_model", "data_analytics"],
    problemTypes: ["sales", "funnel", "conversion", "leads", "sla"]
  },
  {
    slug: "finance-slice",
    title: "Финансовый срез",
    shortDescription: "Коротко собирает выручку, маржу, расходы и кассу, чтобы понять, где деньги перестают превращаться в результат.",
    whenToUse: "Когда выручка есть, но прибыль не остаётся; маржа падает; есть кассовый разрыв или непонятна экономика.",
    templateUrl: "",
    layerKeys: ["finance", "commercial", "operating_model"],
    problemTypes: ["finance", "margin", "cash", "profit", "unit_economics"]
  },
  {
    slug: "business-sale-prep",
    title: "Подготовка к продаже бизнеса",
    shortDescription: "Помогает собрать бизнес для покупателя: цифры, зависимость от собственника, риски, документы и понятность модели.",
    whenToUse: "Когда нужно подготовить бизнес к продаже, упаковке или переговорам с инвестором/покупателем.",
    templateUrl: "",
    layerKeys: ["owner_context", "finance", "governance_risks", "data_analytics"],
    problemTypes: ["sale", "exit", "valuation", "owner_dependency", "documents"]
  }
];
