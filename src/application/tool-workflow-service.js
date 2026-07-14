import crypto from "node:crypto";
import { nativeToolDefinition, nativeToolFields, ownerSuccessSummary } from "../domain/native-tool-definitions.js";

const ACTIVE_STATUSES = new Set(["in_progress", "waiting_for_user"]);

function firstRow(rows) {
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

function text(value) {
  return String(value || "").trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function questionKey(value, index) {
  return text(value?.key || value?.id) || `question_${index + 1}`;
}

function questionText(value) {
  return text(typeof value === "string" ? value : value?.question || value?.title || value?.label);
}

function templateFileId(url) {
  const value = text(url);
  const match = value.match(/\/d\/([a-zA-Z0-9_-]+)/) || value.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  return match?.[1] || "";
}

function fallbackQuestions(tool) {
  const title = text(tool?.title) || "этот инструмент";
  const result = text(tool?.result || tool?.expected_result);
  return [
    { key: "current_state", question: `Что сейчас уже есть по теме «${title}»? Опиши фактами, даже если пока всё хранится в голове.` },
    { key: "desired_result", question: result ? `Какой результат нужен именно вам? Ориентир инструмента: ${result}` : "Какой конкретный результат вы хотите получить после заполнения этого инструмента?" },
    { key: "evidence", question: "Какие цифры, примеры, решения или документы подтверждают текущее положение дел?" },
    { key: "open_gap", question: "Что пока неясно, не согласовано или мешает считать этот участок собранным?" }
  ];
}

function toolQuestions(tool) {
  const nativeDefinition = nativeToolDefinition(tool);
  if (nativeDefinition) {
    return nativeToolFields(nativeDefinition).map((field) => ({
      key: field.key,
      question: field.question,
      label: field.label,
      type: field.type,
      help: field.help || "",
      placeholder: field.placeholder || "",
      options: field.options || [],
      required: field.required !== false,
      sectionKey: field.sectionKey,
      sectionTitle: field.sectionTitle
    }));
  }
  const metadata = tool?.metadata && typeof tool.metadata === "object" ? tool.metadata : {};
  const candidates = asArray(metadata.questions).length
    ? metadata.questions
    : asArray(tool?.questions);
  const normalized = candidates
    .map((item, index) => ({ key: questionKey(item, index), question: questionText(item) }))
    .filter((item) => item.question);
  return normalized.length ? normalized : fallbackQuestions(tool);
}

function instanceToken() {
  return crypto.randomUUID().replaceAll("-", "");
}

export class ToolWorkflowService {
  constructor({ syncClient, googleDrive = null }) {
    this.syncClient = syncClient;
    this.googleDrive = googleDrive;
  }

  async findOne(table, query) {
    return firstRow(await this.syncClient.request(`/rest/v1/${table}`, {
      query: { ...query, limit: 1 }
    }));
  }

  async findMany(table, query) {
    return this.syncClient.request(`/rest/v1/${table}`, { query });
  }

  async upsertOne(table, body, onConflict = "") {
    return firstRow(await this.syncClient.request(`/rest/v1/${table}`, {
      method: "POST",
      query: { ...(onConflict ? { on_conflict: onConflict } : {}), select: "*" },
      prefer: "resolution=merge-duplicates,return=representation",
      body
    }));
  }

  async patchOne(table, id, body) {
    return firstRow(await this.syncClient.request(`/rest/v1/${table}`, {
      method: "PATCH",
      query: { id: `eq.${id}`, select: "*" },
      prefer: "return=representation",
      body
    }));
  }

  contextIds(bootstrap) {
    return {
      workspace_id: bootstrap.workspace.id,
      company_id: bootstrap.company.id,
      case_id: bootstrap.activeCase.id
    };
  }

  async getTool(toolId) {
    const byId = await this.findOne("tools", {
      id: `eq.${toolId}`,
      select: "*"
    });
    return byId || this.findOne("tools", {
      slug: `eq.${toolId}`,
      select: "*"
    });
  }

  async getInstanceContext({ bootstrap, instanceId }) {
    const instance = await this.findOne("tool_instances", {
      id: `eq.${instanceId}`,
      workspace_id: `eq.${bootstrap.workspace.id}`,
      company_id: `eq.${bootstrap.company.id}`,
      select: "*"
    });
    if (!instance) throw Object.assign(new Error("Экземпляр инструмента не найден."), { status: 404 });
    const [tool, answers, document, snapshots] = await Promise.all([
      this.getTool(instance.tool_id),
      this.findMany("tool_answers", { tool_instance_id: `eq.${instance.id}`, order: "created_at.asc", select: "*" }),
      this.findOne("tool_document_instances", { tool_instance_id: `eq.${instance.id}`, select: "*" }),
      this.findMany("tool_snapshots", { tool_instance_id: `eq.${instance.id}`, order: "created_at.desc", select: "*" })
    ]);
    return {
      instance,
      tool,
      questions: toolQuestions(tool),
      answers,
      document,
      latestSnapshot: snapshots?.[0] || null,
      nativeWorkspace: nativeToolDefinition(tool),
      googleCopyAvailable: Boolean(this.googleDrive?.enabled && templateFileId(tool?.template_url))
    };
  }

  async listInstances({ bootstrap }) {
    const instances = await this.findMany("tool_instances", {
      workspace_id: `eq.${bootstrap.workspace.id}`,
      company_id: `eq.${bootstrap.company.id}`,
      order: "updated_at.desc",
      select: "*"
    });
    const result = [];
    for (const instance of instances || []) {
      const context = await this.getInstanceContext({ bootstrap, instanceId: instance.id });
      result.push(context);
    }
    return result;
  }

  async getOrCreateJourney({ bootstrap }) {
    const ids = this.contextIds(bootstrap);
    const existing = await this.findOne("tool_journeys", {
      case_id: `eq.${ids.case_id}`,
      select: "*"
    });
    if (existing) return existing;
    return this.upsertOne("tool_journeys", {
      ...ids,
      status: "active",
      completed_tool_ids: [],
      next_tool_ids: [],
      progress_summary: {}
    }, "case_id");
  }

  async startTool({ bootstrap, toolId, mode = "chat" }) {
    const tool = await this.getTool(toolId);
    if (!tool) throw Object.assign(new Error("Инструмент не найден."), { status: 404 });
    // The current production schema distinguishes conversation from a linked
    // workspace. Native web forms use the latter until the broader tool model
    // is migrated without making this pilot depend on a production DDL change.
    const storedMode = mode === "web" ? "document" : mode;
    const ids = this.contextIds(bootstrap);
    let instance = await this.findOne("tool_instances", {
      case_id: `eq.${ids.case_id}`,
      tool_id: `eq.${tool.id}`,
      status: "in.(in_progress,waiting_for_user,submitted,analyzed,needs_update,completed)",
      order: "updated_at.desc",
      select: "*"
    });
    if (!instance) {
      instance = await this.upsertOne("tool_instances", {
        ...ids,
        tool_id: tool.id,
        status: mode === "chat" ? "waiting_for_user" : "in_progress",
        fill_mode: storedMode,
        current_step: 0,
        progress_percent: 0,
        telegram_start_token: instanceToken(),
        started_at: new Date().toISOString(),
        version: 1
      });
    } else if (storedMode && instance.fill_mode !== storedMode) {
      instance = await this.patchOne("tool_instances", instance.id, { fill_mode: storedMode });
    }
    const journey = await this.getOrCreateJourney({ bootstrap });
    await this.patchOne("tool_journeys", journey.id, {
      current_layer_key: asArray(tool.layer_keys)[0] || "",
      current_tool_instance_id: instance.id,
      status: "active"
    });
    return this.getInstanceContext({ bootstrap, instanceId: instance.id });
  }

  async createPersonalCopy({ bootstrap, instanceId }) {
    const context = await this.getInstanceContext({ bootstrap, instanceId });
    if (context.document?.copy_status === "created") return context;
    if (!this.googleDrive?.enabled) {
      throw Object.assign(new Error("Персональные Google-копии ещё не подключены. Пока можно пройти инструмент с AI-BOSS в чате или открыть исходный шаблон."), { status: 409 });
    }
    const fileId = templateFileId(context.tool?.template_url);
    if (!fileId) {
      throw Object.assign(new Error("У этого инструмента пока нет Google-шаблона, который можно скопировать."), { status: 409 });
    }
    const companyFolder = await this.googleDrive.findOrCreateFolder({
      name: `${bootstrap.company.id} - ${bootstrap.company.name}`,
      parentId: this.googleDrive.rootFolderId
    });
    const toolsFolder = await this.googleDrive.findOrCreateFolder({ name: "tools", parentId: companyFolder.id });
    const copy = await this.googleDrive.copyFile({
      fileId,
      name: `${context.tool.title} - ${bootstrap.company.name}`,
      parentId: toolsFolder.id
    });
    await this.upsertOne("tool_document_instances", {
      ...this.contextIds(bootstrap),
      tool_instance_id: context.instance.id,
      template_google_file_id: fileId,
      google_file_id: copy.id,
      google_file_url: copy.webViewLink || `https://drive.google.com/open?id=${copy.id}`,
      google_folder_id: toolsFolder.id,
      copy_status: "created",
      access_status: "inherited",
      version: 1
    }, "tool_instance_id");
    await this.patchOne("tool_instances", context.instance.id, {
      fill_mode: "document",
      ...(context.instance.status === "completed" ? {} : { status: "in_progress" })
    });
    return this.getInstanceContext({ bootstrap, instanceId });
  }

  async attachDocumentLink({ bootstrap, instanceId, url }) {
    const context = await this.getInstanceContext({ bootstrap, instanceId });
    const normalizedUrl = text(url);
    if (!/^https:\/\//i.test(normalizedUrl)) throw Object.assign(new Error("Нужна корректная ссылка https:// на документ."), { status: 400 });
    await this.upsertOne("tool_document_instances", {
      ...this.contextIds(bootstrap),
      tool_instance_id: context.instance.id,
      template_google_file_id: templateFileId(context.tool?.template_url),
      google_file_id: templateFileId(normalizedUrl),
      google_file_url: normalizedUrl,
      copy_status: "manual_link_added",
      access_status: "unknown",
      version: 1
    }, "tool_instance_id");
    await this.upsertOne("document_sources", {
      ...this.contextIds(bootstrap),
      tool_id: context.tool.id,
      url: normalizedUrl,
      title: context.tool.title,
      source_kind: normalizedUrl.includes("docs.google.com/spreadsheets") ? "google_sheet" : "google_doc",
      status: "link_added",
      version: 1
    });
    await this.patchOne("tool_instances", context.instance.id, {
      fill_mode: "document",
      ...(context.instance.status === "completed" ? {} : { status: "in_progress" })
    });
    return this.getInstanceContext({ bootstrap, instanceId });
  }

  async resolveTelegramBootstrap({ telegramUser, bootstrapService }) {
    return bootstrapService.bootstrap({ telegramUser });
  }

  async findChatInstance({ bootstrap, startToken = "" }) {
    if (startToken) {
      return this.findOne("tool_instances", {
        telegram_start_token: `eq.${startToken}`,
        workspace_id: `eq.${bootstrap.workspace.id}`,
        select: "*"
      });
    }
    const rows = await this.findMany("tool_instances", {
      workspace_id: `eq.${bootstrap.workspace.id}`,
      company_id: `eq.${bootstrap.company.id}`,
      order: "updated_at.desc",
      select: "*"
    });
    return (rows || []).find((item) => item.fill_mode === "chat" && ACTIVE_STATUSES.has(item.status)) || null;
  }

  async completeChatTool({ bootstrap, context }) {
    const summary = context.questions.map((question) => {
      const answer = context.answers.find((item) => item.question_key === question.key);
      return `${question.question}\n${text(answer?.answer_text) || "Нет ответа"}`;
    }).join("\n\n");
    const nativeDefinition = nativeToolDefinition(context.tool);
    await this.upsertOne("tool_snapshots", {
      ...this.contextIds(bootstrap),
      tool_instance_id: context.instance.id,
      summary: nativeDefinition
        ? ownerSuccessSummary(context.answers)
        : `Инструмент «${context.tool.title}» заполнен через диалог.`,
      key_findings: context.answers.map((item) => item.answer_text).filter(Boolean),
      risks: [],
      open_questions: [],
      extracted_observations: context.answers.map((item) => ({ statement: item.answer_text, layer: asArray(context.tool.layer_keys)[0] || "" })),
      content_text: summary,
      version: 1
    });
    for (const answer of context.answers) {
      await this.upsertOne("observations", {
        ...this.contextIds(bootstrap),
        source_type: "manual",
        source_id: `${context.instance.id}:${answer.question_key}`,
        statement: answer.answer_text,
        normalized_signal: `tool_${context.tool.slug || context.tool.id}_${answer.question_key}`,
        layer: asArray(context.tool.layer_keys)[0] || null,
        confidence: 0.9,
        evidence: [{ toolId: context.tool.id, toolInstanceId: context.instance.id, questionKey: answer.question_key }],
        status: "active"
      }, "case_id,source_type,source_id,normalized_signal");
    }
    await this.patchOne("tool_instances", context.instance.id, {
      status: "completed",
      progress_percent: 100,
      completed_at: new Date().toISOString()
    });
    return `Инструмент «${context.tool.title}» заполнен. Я сохранил ответы в памяти компании и буду учитывать их дальше. Результат уже виден в веб-кабинете.`;
  }

  async saveWebAnswers({ bootstrap, instanceId, answers = {}, complete = false }) {
    let context = await this.getInstanceContext({ bootstrap, instanceId });
    if (!context.nativeWorkspace) {
      throw Object.assign(new Error("Заполнение в кабинете пока недоступно для этого инструмента."), { status: 409 });
    }

    const fields = context.questions;
    const allowedKeys = new Set(fields.map((field) => field.key));
    for (const [key, value] of Object.entries(answers || {})) {
      const answerText = text(value);
      if (!allowedKeys.has(key)) continue;
      const field = fields.find((item) => item.key === key);
      await this.upsertOne("tool_answers", {
        ...this.contextIds(bootstrap),
        tool_instance_id: context.instance.id,
        question_key: key,
        question_text: field.question,
        answer_text: answerText,
        source: "web_form",
        confidence: 1,
        status: "confirmed",
        updated_by: "user"
      }, "tool_instance_id,question_key");
    }

    context = await this.getInstanceContext({ bootstrap, instanceId });
    const answeredKeys = new Set(context.answers.filter((item) => text(item.answer_text)).map((item) => item.question_key));
    const requiredFields = fields.filter((field) => field.required !== false);
    const missing = requiredFields.filter((field) => !answeredKeys.has(field.key));
    const progress = Math.round((requiredFields.length - missing.length) / Math.max(1, requiredFields.length) * 100);

    await this.patchOne("tool_instances", context.instance.id, {
      fill_mode: "document",
      status: complete && !missing.length ? "submitted" : "in_progress",
      current_step: answeredKeys.size,
      progress_percent: progress
    });

    context = await this.getInstanceContext({ bootstrap, instanceId });
    if (complete) {
      if (missing.length) {
        throw Object.assign(new Error(`Чтобы завершить инструмент, заполните: ${missing.map((field) => field.label).join(", ")}.`), { status: 400 });
      }
      await this.completeChatTool({ bootstrap, context });
      context = await this.getInstanceContext({ bootstrap, instanceId });
    }

    return context;
  }

  async handleTelegramInput({ bootstrap, text: input, source = "chat_text" }) {
    const raw = text(input);
    const startMatch = raw.match(/^\/start(?:@\w+)?\s+tool_([a-f0-9]+)$/i);
    const instance = await this.findChatInstance({ bootstrap, startToken: startMatch?.[1] || "" });
    if (!instance) return { handled: false };
    if (/^\/start(?:@\w+)?$/i.test(raw)) return { handled: false };
    if (/^\/(?:cancel|stop)(?:@\w+)?$/i.test(raw) || /^отменить\s+инструмент$/i.test(raw)) {
      await this.patchOne("tool_instances", instance.id, { status: "archived" });
      return { handled: true, reply: "Остановил заполнение инструмента. Сохранённые ответы не потеряны; продолжить можно из веб-кабинета." };
    }
    let context = await this.getInstanceContext({ bootstrap, instanceId: instance.id });
    if (startMatch) {
      await this.patchOne("tool_instances", instance.id, { fill_mode: "chat", status: "waiting_for_user" });
      const first = context.questions[context.answers.length] || context.questions[0];
      return {
        handled: true,
        reply: `Начинаем «${context.tool.title}». Я буду задавать по одному вопросу, использовать уже известный контекст и сохранять ответы в кабинете.\n\n${first.question}`
      };
    }
    const currentQuestion = context.questions.find((question) => !context.answers.some((answer) => answer.question_key === question.key));
    if (!currentQuestion) {
      return { handled: true, reply: await this.completeChatTool({ bootstrap, context }) };
    }
    await this.upsertOne("tool_answers", {
      ...this.contextIds(bootstrap),
      tool_instance_id: instance.id,
      question_key: currentQuestion.key,
      question_text: currentQuestion.question,
      answer_text: raw,
      source,
      confidence: 1,
      status: "confirmed",
      updated_by: "user"
    }, "tool_instance_id,question_key");
    context = await this.getInstanceContext({ bootstrap, instanceId: instance.id });
    const answered = context.answers.length;
    const progress = Math.round((answered / context.questions.length) * 100);
    await this.patchOne("tool_instances", instance.id, {
      status: answered >= context.questions.length ? "submitted" : "waiting_for_user",
      current_step: answered,
      progress_percent: progress
    });
    if (answered >= context.questions.length) {
      context = await this.getInstanceContext({ bootstrap, instanceId: instance.id });
      return { handled: true, reply: await this.completeChatTool({ bootstrap, context }) };
    }
    return {
      handled: true,
      reply: `Сохранил. Готово ${answered} из ${context.questions.length}.\n\n${context.questions[answered].question}`
    };
  }
}

export { templateFileId, toolQuestions };
