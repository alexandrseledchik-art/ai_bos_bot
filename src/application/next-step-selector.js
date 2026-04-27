import { getBusinessLayerByKey } from "../domain/business-layers.js";

const NEXT_STEP_BY_LAYER = {
  owner_context: {
    title: "Согласовать одну рамку решений собственника",
    description: "Зафиксируйте на одной странице цель на ближайший горизонт, роль собственника и 3 решения, которые сейчас нельзя менять без согласования.",
    whyThisFirst: "Если верхняя рамка противоречива, нижние изменения будут спорить между собой и быстро откатываться.",
    actionType: "owner_alignment"
  },
  external_environment: {
    title: "Проверить, жив ли текущий спрос",
    description: "Сравните 2-3 последних периода по входящему спросу, цене заявки, конверсии каналов и причинам отказов.",
    whyThisFirst: "Если рынок или спрос изменились, внутренние улучшения могут не вернуть прежний результат без пересборки модели.",
    actionType: "market_check"
  },
  strategy: {
    title: "Сузить стратегический фокус до главного сегмента",
    description: "Выберите 3 ключевых сегмента и сравните их по выручке, марже, повторяемости сделки и сложности исполнения.",
    whyThisFirst: "Пока фокус размыт, команда будет тратить силы на разные потоки, и ограничения ниже будут казаться несвязанными.",
    actionType: "strategy_focus"
  },
  product_value_proposition: {
    title: "Разобрать 10 последних отказов по причине покупки",
    description: "Возьмите 10 последних клиентов, которые не купили, и отметьте: не было боли, не поняли ценность, дорого, нет доверия или выбрали альтернативу.",
    whyThisFirst: "Это быстро отделяет проблему ценности продукта от проблемы продавцов, канала или цены.",
    actionType: "value_check"
  },
  commercial: {
    title: "Разобрать 20 последних лидов по целевости и маршруту",
    description: "Возьмите 20 последних заявок и для каждой отметьте: источник, целевой/нецелевой, приоритет, кто взял первым, что произошло дальше и где остановилось.",
    whyThisFirst: "Так вы увидите, перегруз создаёт объём действительно целевых лидов или смешанный вход без фильтра, приоритета и понятной передачи.",
    actionType: "lead_flow_audit"
  },
  operating_model: {
    title: "Нарисовать путь заявки от входа до результата",
    description: "Разложите один реальный поток по шагам: вход, владелец, первое действие, передача, контроль, результат. Отметьте, где появляется очередь или ручное решение.",
    whyThisFirst: "Это показывает, где именно система теряет скорость: в процессе, ответственности, контроле или реальной мощности.",
    actionType: "process_path_map"
  },
  finance: {
    title: "Собрать короткий срез денег по текущему запросу",
    description: "За последний период выпишите выручку, маржу, основные расходы, кассовый остаток и место, где деньги перестают превращаться в результат.",
    whyThisFirst: "Финансовая проблема часто является отражением того, как формируется и проходит поток выше; срез отделит симптом от причины.",
    actionType: "finance_slice"
  },
  people_organization: {
    title: "Сопоставить нагрузку, роли и фактические очереди",
    description: "По ключевому процессу выпишите роли, количество входящих задач на роль, фактическое время реакции и место, где люди начинают захлёбываться.",
    whyThisFirst: "Это отделит настоящую нехватку людей от слабой маршрутизации, правил или процесса.",
    actionType: "capacity_check"
  },
  governance_risks: {
    title: "Разобрать 5 зависших решений",
    description: "Возьмите 5 решений или задач, которые зависли, и отметьте: кто владелец, кто согласует, какой срок, какой контроль и где потерялась ответственность.",
    whyThisFirst: "Если проблема в управлении, усиление людей или инструментов не поможет, пока решения и ответственность не собраны.",
    actionType: "decision_flow_check"
  },
  technology: {
    title: "Найти 3 ручных переноса данных",
    description: "Отметьте, где команда вручную переносит данные между таблицами, CRM, чатами или документами, и сколько времени это съедает в неделю.",
    whyThisFirst: "Это покажет, тормозит поток сам процесс или инструменты, через которые он проходит.",
    actionType: "tooling_friction_check"
  },
  data_analytics: {
    title: "Собрать минимальную карту метрик по проблемному потоку",
    description: "Определите 5 чисел, которые должны показывать реальность: вход, переход, потеря, скорость, результат. Отметьте, какие из них сейчас не видны.",
    whyThisFirst: "Без видимости система рискует выбирать приоритет на ощущениях и чинить не то место.",
    actionType: "visibility_check"
  }
};

function clampConfidence(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return 0.5;
  }

  return Math.max(0.35, Math.min(0.82, number));
}

export class NextStepSelector {
  select({ constraintHypothesis } = {}) {
    const layerKey = constraintHypothesis?.layer || constraintHypothesis?.layerKey || "data_analytics";
    const layer = getBusinessLayerByKey(layerKey);
    const template = NEXT_STEP_BY_LAYER[layerKey] || NEXT_STEP_BY_LAYER.data_analytics;

    return {
      title: template.title,
      description: template.description,
      whyThisFirst: template.whyThisFirst,
      actionType: template.actionType,
      targetEntityType: "constraint_hypothesis",
      targetEntityId: constraintHypothesis?.id || null,
      layerKey: layer?.key || layerKey,
      layerTitle: layer?.title || "Слой бизнеса",
      confidence: Number(clampConfidence(constraintHypothesis?.confidence).toFixed(2))
    };
  }
}
