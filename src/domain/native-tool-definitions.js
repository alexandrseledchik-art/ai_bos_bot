function text(value) {
  return String(value || "").trim();
}

const OWNER_SUCCESS_CANVAS = {
  key: "owner_success_canvas_v1",
  title: "Канва критериев успеха собственника",
  description: "Помогает определить, что лично для собственника будет означать победу в бизнесе через 3–10 лет.",
  result: "Согласованные критерии успеха, красные линии и ориентиры для решений по бизнесу.",
  sections: [
    {
      key: "future",
      title: "Образ желаемого будущего",
      description: "Сначала зафиксируйте не задачи на квартал, а состояние бизнеса и жизни, к которому хотите прийти.",
      fields: [
        {
          key: "horizon",
          label: "На какой горизонт вы смотрите?",
          question: "На какой горизонт вы определяете личный успех в этом бизнесе?",
          type: "select",
          required: true,
          options: ["3 года", "5 лет", "10 лет", "Более 10 лет"]
        },
        {
          key: "financial_success",
          label: "Финансовый успех",
          question: "Как для вас выглядит финансовая победа: сколько денег, к какому сроку и в какой форме?",
          help: "Например: дивиденды, стоимость бизнеса, продажа доли или пассивный доход.",
          placeholder: "К какому сроку, какой доход или стоимость и в какой форме...",
          type: "textarea",
          required: true
        },
        {
          key: "freedom_success",
          label: "Личная свобода",
          question: "Сколько времени вы хотите посвящать бизнесу и чем хотите заниматься лично?",
          help: "Отдельно отметьте, от какой работы хотите освободиться.",
          placeholder: "Моя желаемая роль, загрузка и то, что больше не должно зависеть от меня...",
          type: "textarea",
          required: true
        },
        {
          key: "legacy_success",
          label: "Наследие и смысл",
          question: "Что должно остаться после вас и ради чего вам важно строить этот бизнес?",
          placeholder: "Какую ценность, систему, репутацию или влияние вы хотите создать...",
          type: "textarea",
          required: true
        },
        {
          key: "relationships_success",
          label: "Отношения",
          question: "Какими вы хотите видеть отношения с семьёй, партнёрами и командой?",
          placeholder: "Что должно измениться или сохраниться в важных отношениях...",
          type: "textarea",
          required: true
        },
        {
          key: "red_lines",
          label: "Красные линии",
          question: "Что вы не готовы делать ради успеха бизнеса?",
          help: "Это личные ограничения, которые нельзя нарушать даже ради роста или денег.",
          placeholder: "Чем вы не готовы пожертвовать и какие решения для вас неприемлемы...",
          type: "textarea",
          required: true
        }
      ]
    },
    {
      key: "choice",
      title: "Выбор и проверка",
      description: "Теперь расставьте акценты и проверьте, не противоречат ли ваши ожидания друг другу.",
      fields: [
        {
          key: "top_priority",
          label: "Главный приоритет",
          question: "Какое измерение успеха для вас сейчас важнее остальных?",
          type: "select",
          required: true,
          options: ["Финансовый успех", "Личная свобода", "Наследие и смысл", "Отношения", "Сохранение красных линий"]
        },
        {
          key: "contradictions",
          label: "Возможные противоречия",
          question: "Какие ваши критерии успеха могут конфликтовать между собой?",
          help: "Например: быстрый рост требует больше личного участия, хотя цель — выйти из операционки.",
          placeholder: "Где одна желаемая цель может мешать другой...",
          type: "textarea",
          required: false
        },
        {
          key: "anchor_criteria",
          label: "3–5 якорных критериев победы",
          question: "Назовите 3–5 признаков, по которым вы поймёте, что бизнес действительно привёл вас к желаемому результату.",
          help: "Каждый критерий лучше записать с новой строки и по возможности добавить срок или число.",
          placeholder: "1. ...\n2. ...\n3. ...",
          type: "textarea",
          required: true
        },
        {
          key: "first_decision",
          label: "Что это меняет уже сейчас",
          question: "Какое текущее решение нужно пересмотреть с учётом ваших критериев успеха?",
          placeholder: "Первое решение, которое нужно проверить или изменить...",
          type: "textarea",
          required: true
        }
      ]
    }
  ]
};

export function nativeToolDefinition(tool = {}) {
  const title = text(tool.title).toLowerCase();
  const slug = text(tool.slug).toLowerCase();
  if (slug === "ba-tool-0007" || slug === "owner-success-canvas" || title.includes("канва критериев успеха собственника")) {
    return OWNER_SUCCESS_CANVAS;
  }
  return null;
}

export function nativeToolFields(definition) {
  return (definition?.sections || []).flatMap((section) =>
    (section.fields || []).map((field) => ({ ...field, sectionKey: section.key, sectionTitle: section.title }))
  );
}

export function ownerSuccessSummary(answers = []) {
  const byKey = new Map(answers.map((answer) => [answer.question_key, text(answer.answer_text)]));
  const horizon = byKey.get("horizon") || "горизонт не указан";
  const priority = byKey.get("top_priority") || "приоритет не выбран";
  const anchors = byKey.get("anchor_criteria") || "якорные критерии пока не зафиксированы";
  return `Критерии успеха собственника определены на горизонт ${horizon}. Главный приоритет: ${priority}. Якорные признаки победы: ${anchors}`;
}

export { OWNER_SUCCESS_CANVAS };
