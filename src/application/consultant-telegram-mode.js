import {
  createCompany,
  createCompanySource,
  createTelegramContext,
  nowIso
} from "../domain/entities.js";
import { CompanyAnalysisCore, detectConsultantLayersForText } from "./company-analysis-core.js";
import { CONSULTANT_MVP_LAYERS } from "../domain/consultant-mvp-schema.js";

function cleanText(value) {
  return String(value || "").trim();
}

function cleanName(value) {
  return cleanText(value).replace(/[?.!]+$/g, "").trim();
}

function normalizeText(value) {
  return cleanText(value).toLowerCase().replace(/\s+/g, " ");
}

function slugifyCompanyName(value) {
  return normalizeText(value)
    .replace(/[^а-яёa-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "company";
}

function layerName(layerCode) {
  return CONSULTANT_MVP_LAYERS.find((item) => item.code === layerCode)?.name || layerCode;
}

function findLayerByText(value) {
  const text = normalizeText(value);
  if (!text) {
    return null;
  }

  const aliases = [
    ["owner_context", ["контур собственника", "собственник", "цель"]],
    ["external_environment", ["внешняя среда", "рынок", "спрос", "конкурент"]],
    ["strategy", ["стратегия", "фокус", "ниша"]],
    ["product", ["продукт", "оффер", "ценность"]],
    ["commercial", ["коммерц", "продажи", "продаж", "лиды", "лид", "воронка", "icp"]],
    ["operations", ["операции", "операцион", "процесс", "производство", "исполнение"]],
    ["finance", ["финансы", "деньги", "прибыль", "выручка", "маржа", "касса"]],
    ["team", ["команда", "люди", "роли", "нагрузка"]],
    ["governance", ["управлен", "ответственность", "контроль", "решения"]],
    ["technology", ["технологии", "crm", "инструменты", "автоматизация"]],
    ["data_analytics", ["данные", "аналитика", "метрики", "отчётность", "отчетность"]]
  ];

  const found = aliases.find(([, names]) => names.some((name) => text.includes(name)));
  return found ? found[0] : null;
}

function findTelegramContext(state, telegramChatId, telegramUserId = "") {
  const chatId = String(telegramChatId || "");
  const userId = String(telegramUserId || chatId);
  return (state.telegramContexts || []).find((item) =>
    String(item.telegramChatId || "") === chatId ||
    (userId && String(item.telegramUserId || "") === userId)
  ) || null;
}

function upsertTelegramContext(state, { telegramChatId, telegramUserId, activeCompanyId }) {
  state.telegramContexts = state.telegramContexts || [];
  let context = findTelegramContext(state, telegramChatId, telegramUserId);

  if (!context) {
    context = createTelegramContext({ telegramChatId, telegramUserId, activeCompanyId });
    state.telegramContexts.push(context);
    return context;
  }

  context.activeCompanyId = activeCompanyId || context.activeCompanyId || "";
  context.lastMessageAt = nowIso();
  return context;
}

function findCompanyByName(state, name, telegramChatId = "") {
  const normalizedName = normalizeText(name);
  if (!normalizedName) {
    return null;
  }

  const candidates = (state.companies || []).filter((company) => {
    const companyName = normalizeText(company.name);
    const companyChat = String(company.telegramChatId || "");
    const sameName = companyName === normalizedName || companyName.includes(normalizedName) || normalizedName.includes(companyName);
    const visibleForChat =
      !telegramChatId ||
      companyChat === String(telegramChatId) ||
      companyChat.startsWith(`consultant:${telegramChatId}:`);

    return sameName && visibleForChat;
  });

  return candidates[0] || null;
}

function ensureConsultantCompany(state, { name, telegramChatId }) {
  const existing = findCompanyByName(state, name, telegramChatId);
  if (existing) {
    return existing;
  }

  const slug = slugifyCompanyName(name);
  const company = createCompany({
    name,
    telegramChatId: `consultant:${telegramChatId}:${slug}`,
    workspaceType: "consultant",
    userRole: "consultant",
    companySource: "telegram"
  });
  state.companies.push(company);
  return company;
}

function getActiveCompany(state, { telegramChatId, telegramUserId }) {
  const context = findTelegramContext(state, telegramChatId, telegramUserId);
  if (!context?.activeCompanyId) {
    return null;
  }

  return (state.companies || []).find((company) => company.id === context.activeCompanyId) || null;
}

function setThreadCompany(thread, company) {
  if (!thread || !company) {
    return;
  }

  thread.companyId = company.id;
  thread.activeCaseId = "";
  thread.updatedAt = nowIso();
}

function parseUseCommand(text) {
  const match = cleanText(text).match(/^\/use\s+(.+)$/i);
  if (match) {
    return cleanName(match[1]);
  }

  const natural = cleanText(text).match(/^работаем\s+по\s+(.+)$/i);
  return natural ? cleanName(natural[1]) : "";
}

function parseAnalyzeCommand(text) {
  const value = cleanText(text);
  const match = value.match(/^\/analy[sz]e(?:\s+(.+))?$/i) || value.match(/^\/анализ(?:\s+(.+))?$/i);
  if (match) {
    return cleanName(match[1] || "");
  }

  if (/^проанализируй(?:\s+компани[юи])?(?:\s+(.+))?$/i.test(value)) {
    return cleanName(value.replace(/^проанализируй(?:\s+компани[юи])?\s*/i, ""));
  }

  return "";
}

function parseAddFact(text) {
  const value = cleanText(text);
  const explicit = value.match(/^добавь\s+факт\s*:?\s*(.+)$/i);
  if (explicit) {
    return { companyName: "", fact: cleanText(explicit[1]) };
  }

  const companyPrefixed = value.match(/^по\s+([^:：]+)\s*[:：]\s*(.+)$/i);
  if (companyPrefixed) {
    return {
      companyName: cleanName(companyPrefixed[1]),
      fact: cleanText(companyPrefixed[2])
    };
  }

  return null;
}

function parseStatusQuestion(text) {
  const value = cleanText(text);
  const explicit = value.match(/^\/status(?:\s+(.+))?$/i) || value.match(/^\/статус(?:\s+(.+))?$/i);
  if (explicit) {
    return cleanName(explicit[1] || "");
  }

  const natural = value.match(/^(?:что\s+сейчас\s+главное|какое\s+главное\s+ограничение|что\s+следующий\s+шаг)(?:\s+по\s+(.+))?\??$/i);
  return natural ? cleanName(natural[1] || "") : null;
}

function parseLayerQuestion(text) {
  const value = cleanText(text);
  const layerCode = findLayerByText(value);
  if (!layerCode) {
    return null;
  }

  if (/пробел|не\s+хватает|чего\s+не\s+хватает|понял|понятно|вывод|сло[йюя]/i.test(value)) {
    return {
      layerCode,
      wantsGaps: /пробел|не\s+хватает|чего\s+не\s+хватает/i.test(value)
    };
  }

  return null;
}

function latestCompanyAnalysis(state, companyId) {
  return [...(state.companyAnalyses || [])].reverse().find((item) => item.companyId === companyId) || null;
}

function currentLayerAnalysis(state, companyId, layerCode) {
  return [...(state.layerAnalyses || [])]
    .reverse()
    .find((item) => item.companyId === companyId && item.layerCode === layerCode) || null;
}

function formatLayerList(layerCodes) {
  if (!layerCodes.length) {
    return "пока слой не определён";
  }

  return layerCodes.map(layerName).join(", ");
}

function formatAnalysisShort(company, analysis) {
  const constraint = analysis.probableConstraint || {};
  const nextStep = analysis.nextStep || {};

  return [
    `По компании "${company.name}" сейчас главное ограничение выглядит как: ${constraint.title || "пока не выбрано"}.`,
    "",
    constraint.explanation ? `Почему: ${constraint.explanation}` : "",
    constraint.confidence ? `Уверенность: ${constraint.confidence}.` : "",
    "",
    nextStep.title ? `Следующий шаг: ${nextStep.title}` : "",
    nextStep.why ? `Зачем: ${nextStep.why}` : ""
  ].filter((line) => line !== "").join("\n");
}

function formatLayerAnswer(company, layerAnalysis, wantsGaps) {
  const name = layerName(layerAnalysis.layerCode);
  const facts = layerAnalysis.facts || [];
  const gaps = layerAnalysis.gaps || [];
  const missing = layerAnalysis.missingFields || [];
  const conclusions = layerAnalysis.conclusions || [];

  if (wantsGaps) {
    return [
      `По компании "${company.name}", слой "${name}".`,
      "",
      missing.length
        ? `Главные пробелы: ${missing.slice(0, 6).join(", ")}.`
        : "Явных пробелов по минимальному шаблону сейчас не вижу.",
      gaps.length ? `Почему важно: ${gaps[0]}` : "",
      `Уверенность: ${layerAnalysis.confidence}.`
    ].filter(Boolean).join("\n");
  }

  return [
    `По компании "${company.name}", слой "${name}".`,
    "",
    facts.length ? `Что понятно: ${facts.slice(0, 3).join("; ")}.` : "Пока нет достаточных фактов по этому слою.",
    conclusions[0] ? `Вывод: ${conclusions[0]}` : "",
    missing.length ? `Чего не хватает: ${missing.slice(0, 5).join(", ")}.` : "",
    `Уверенность: ${layerAnalysis.confidence}.`
  ].filter(Boolean).join("\n");
}

export class ConsultantTelegramMode {
  constructor({ analyzer = new CompanyAnalysisCore() } = {}) {
    this.analyzer = analyzer;
  }

  handle({ state, thread, telegramChatId, text, userMeta = {} }) {
    const telegramUserId = userMeta.telegramUserId || userMeta.id || telegramChatId;
    const useCompanyName = parseUseCommand(text);
    if (useCompanyName) {
      const company = ensureConsultantCompany(state, {
        name: useCompanyName,
        telegramChatId
      });
      upsertTelegramContext(state, {
        telegramChatId,
        telegramUserId,
        activeCompanyId: company.id
      });
      setThreadCompany(thread, company);

      return {
        handled: true,
        reply: [
          `Ок, работаем по компании "${company.name}".`,
          "Теперь можешь присылать факты, заметки со встреч, цифры или вопрос по этой компании.",
          "Например: «Добавь факт: заявки теряются между продажами и производством» или `/analyze`."
        ].join("\n\n"),
        company
      };
    }

    const factRequest = parseAddFact(text);
    if (factRequest?.fact) {
      const company = factRequest.companyName
        ? ensureConsultantCompany(state, { name: factRequest.companyName, telegramChatId })
        : getActiveCompany(state, { telegramChatId, telegramUserId });

      if (!company) {
        return {
          handled: true,
          reply: "Сначала выбери компанию: `/use Название компании`. После этого я буду складывать факты в её рабочий контекст."
        };
      }

      upsertTelegramContext(state, {
        telegramChatId,
        telegramUserId,
        activeCompanyId: company.id
      });
      setThreadCompany(thread, company);

      const relatedLayers = detectConsultantLayersForText(factRequest.fact);
      const source = createCompanySource({
        companyId: company.id,
        type: "telegram_note",
        title: `Telegram факт: ${factRequest.fact.slice(0, 60)}`,
        contentText: factRequest.fact,
        sourceOrigin: "telegram",
        aiSummary: factRequest.fact,
        relatedLayers
      });
      state.companySources = state.companySources || [];
      state.companySources.push(source);
      company.updatedAt = nowIso();

      return {
        handled: true,
        reply: [
          `Добавил факт в компанию "${company.name}".`,
          `Связал со слоями: ${formatLayerList(relatedLayers)}.`,
          "Когда будешь готов, напиши `/analyze` — обновлю разбор по 11 слоям и выберу один следующий шаг."
        ].join("\n\n"),
        company,
        source
      };
    }

    const analyzeCompanyName = parseAnalyzeCommand(text);
    const isAnalyze = analyzeCompanyName !== "" || /^\/analy[sz]e$/i.test(cleanText(text)) || /^\/анализ$/i.test(cleanText(text));
    if (isAnalyze) {
      const company = analyzeCompanyName
        ? ensureConsultantCompany(state, { name: analyzeCompanyName, telegramChatId })
        : getActiveCompany(state, { telegramChatId, telegramUserId });

      if (!company) {
        return {
          handled: true,
          reply: "Сначала выбери компанию: `/use Название компании`. Потом запущу анализ по её данным."
        };
      }

      upsertTelegramContext(state, {
        telegramChatId,
        telegramUserId,
        activeCompanyId: company.id
      });
      setThreadCompany(thread, company);

      const { analysis } = this.analyzer.analyze({ state, companyId: company.id });
      return {
        handled: true,
        reply: `${formatAnalysisShort(company, analysis)}\n\nПолный разбор сохранён в данных компании: 11 слоёв, инструменты, пробелы, проблематики, ограничение и следующий шаг.`,
        company,
        analysis
      };
    }

    const statusCompanyName = parseStatusQuestion(text);
    if (statusCompanyName !== null) {
      const company = statusCompanyName
        ? findCompanyByName(state, statusCompanyName, telegramChatId)
        : getActiveCompany(state, { telegramChatId, telegramUserId });

      if (!company) {
        if (!statusCompanyName) {
          return { handled: false };
        }

        return {
          handled: true,
          reply: "Не вижу активной компании. Напиши `/use Название компании`, и я буду отвечать по её данным."
        };
      }

      const analysis = latestCompanyAnalysis(state, company.id);
      if (!analysis) {
        return {
          handled: true,
          reply: `По компании "${company.name}" ещё нет сохранённого анализа. Напиши /analyze — соберу текущие данные по 11 слоям и дам следующий шаг.`
        };
      }

      upsertTelegramContext(state, {
        telegramChatId,
        telegramUserId,
        activeCompanyId: company.id
      });
      setThreadCompany(thread, company);

      return {
        handled: true,
        reply: formatAnalysisShort(company, analysis),
        company,
        analysis
      };
    }

    const layerQuestion = parseLayerQuestion(text);
    if (layerQuestion) {
      const company = getActiveCompany(state, { telegramChatId, telegramUserId });
      if (!company) {
        return { handled: false };
      }

      let analysis = latestCompanyAnalysis(state, company.id);
      if (!analysis) {
        analysis = this.analyzer.analyze({ state, companyId: company.id }).analysis;
      }

      const layerAnalysis = currentLayerAnalysis(state, company.id, layerQuestion.layerCode);
      if (!layerAnalysis) {
        return {
          handled: true,
          reply: `По слою "${layerName(layerQuestion.layerCode)}" пока нет анализа. Напиши /analyze — пересоберу картину по компании.`
        };
      }

      return {
        handled: true,
        reply: formatLayerAnswer(company, layerAnalysis, layerQuestion.wantsGaps),
        company,
        analysis
      };
    }

    return { handled: false };
  }
}
