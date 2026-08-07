import {
  createDecisionCycle,
  createDecisionJournalEntry,
  createDecisionLock,
  createId,
  nowIso
} from "../domain/entities.js";

const DEFAULT_REOPEN_CONDITIONS = [
  "owner_rejection",
  "contradicting_evidence",
  "failed_test",
  "stronger_hypothesis"
];

function normalizeCommand(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    .replaceAll("ё", "е")
    .replace(/[.!?]+$/g, "")
    .replace(/\s+/g, " ");
}

export function classifyTelegramDecisionCommand(text) {
  const normalized = normalizeCommand(text);
  const resultMatch = normalized.match(/^(?:результат|итог)\s*[:\-]\s*(.+)$/i);
  if (resultMatch?.[1]?.trim()) {
    return { type: "result", value: resultMatch[1].trim() };
  }

  if (/^(?:да,?\s*)?(?:фиксируем|зафиксируй|принимаю|подтверждаю|беру в работу|согласен,?\s*фиксируем|согласна,?\s*фиксируем)$/.test(normalized)) {
    return { type: "accept", value: "" };
  }

  if (/^(?:не фиксируем|не принимаю|отклоняю|не согласен|не согласна)$/.test(normalized)) {
    return { type: "reject", value: "" };
  }

  if (/^(?:готово|сделано|выполнено|выполнил|выполнила)$/.test(normalized)) {
    return { type: "complete", value: "" };
  }

  if (/^(?:статус решения|что зафиксировано|что мы зафиксировали)$/.test(normalized)) {
    return { type: "status", value: "" };
  }

  if (/^(?:да|ок|окей|хорошо)$/.test(normalized)) {
    return { type: "acknowledge", value: "" };
  }

  return { type: "none", value: "" };
}

function sameProposal(left, right) {
  return Boolean(
    left &&
    right &&
    normalizeCommand(left.constraint) === normalizeCommand(right.constraint) &&
    normalizeCommand(left.nextStep) === normalizeCommand(right.nextStep)
  );
}

export class TelegramDecisionCycleManager {
  constructor({ clock = () => new Date(), reviewAfterDays = 7 } = {}) {
    this.clock = clock;
    this.reviewAfterDays = reviewAfterDays;
  }

  ensureState(state) {
    state.decisionCycles = Array.isArray(state.decisionCycles) ? state.decisionCycles : [];
    state.decisionLocks = Array.isArray(state.decisionLocks) ? state.decisionLocks : [];
    state.decisionJournalEntries = Array.isArray(state.decisionJournalEntries) ? state.decisionJournalEntries : [];
  }

  findActiveLock(state, threadId) {
    this.ensureState(state);
    return [...state.decisionLocks]
      .reverse()
      .find((lock) => lock.threadId === threadId && lock.status === "active") || null;
  }

  findActiveCycle(state, threadId) {
    this.ensureState(state);
    return [...state.decisionCycles]
      .reverse()
      .find((cycle) => cycle.threadId === threadId && cycle.status === "active") || null;
  }

  getContext({ state, thread }) {
    const activeLock = this.findActiveLock(state, thread.id);
    return {
      pendingDecision: thread.entryState?.pendingDecision || null,
      activeDecisionLock: activeLock
        ? {
            id: activeLock.id,
            constraint: activeLock.constraint,
            nextStep: activeLock.nextStep,
            whyThisFirst: activeLock.whyThisFirst,
            expectedResult: activeLock.expectedResult,
            reviewAt: activeLock.reviewAt,
            awaitingResult: Boolean(activeLock.awaitingResult),
            status: activeLock.status
          }
        : null
    };
  }

  propose({ state, thread, company, activeCase, constraint, nextStep, whyThisFirst = "", alternatives = [] }) {
    this.ensureState(state);
    if (!activeCase?.id || !constraint || !nextStep || this.findActiveLock(state, thread.id)) {
      return { proposal: null, created: false };
    }

    const proposal = {
      id: createId("decision_proposal"),
      companyId: company.id,
      caseId: activeCase.id,
      threadId: thread.id,
      constraint,
      nextStep,
      whyThisFirst,
      expectedResult: nextStep,
      alternatives,
      createdAt: nowIso()
    };
    const current = thread.entryState?.pendingDecision || null;
    if (sameProposal(current, proposal)) {
      return { proposal: current, created: false };
    }

    thread.entryState = {
      ...thread.entryState,
      pendingDecision: proposal,
      lastUpdatedAt: nowIso()
    };

    return { proposal, created: true };
  }

  buildProposalPrompt(proposal) {
    return [
      "Если берём эту версию и шаг в работу, напиши «фиксируем».",
      "Если версия не подходит — «не фиксируем»."
    ].join(" ");
  }

  reviewAt() {
    const date = new Date(this.clock().getTime());
    date.setUTCDate(date.getUTCDate() + this.reviewAfterDays);
    return date.toISOString();
  }

  handleCommand({ state, thread, company, activeCase, text }) {
    this.ensureState(state);
    const command = classifyTelegramDecisionCommand(text);
    if (command.type === "none") {
      return { handled: false };
    }

    const pending = thread.entryState?.pendingDecision || null;
    const activeLock = this.findActiveLock(state, thread.id);

    if (command.type === "acknowledge") {
      if (pending && !activeLock) {
        return {
          handled: true,
          reply: "Уточню, чтобы не принять обычное согласие за управленческое обязательство: если действительно берём эту гипотезу и шаг в работу, напиши «фиксируем».",
          pendingDecision: pending
        };
      }
      return { handled: false };
    }

    if (command.type === "status") {
      if (activeLock) {
        return {
          handled: true,
          reply: [
            "Сейчас зафиксировано:",
            `Гипотеза: ${activeLock.constraint}`,
            `Шаг: ${activeLock.nextStep}`,
            `Проверка: ${activeLock.reviewAt.slice(0, 10)}.`
          ].join("\n"),
          decisionLock: activeLock
        };
      }
      if (pending) {
        return {
          handled: true,
          reply: `Пока это предложение, а не принятое решение. Гипотеза: ${pending.constraint}\nШаг: ${pending.nextStep}\n\nЧтобы принять, напиши «фиксируем».`,
          pendingDecision: pending
        };
      }
      return { handled: true, reply: "Сейчас активного или ожидающего подтверждения решения нет." };
    }

    if (command.type === "accept") {
      if (activeLock) {
        return {
          handled: true,
          reply: `Решение уже зафиксировано. Текущий шаг: ${activeLock.nextStep}`,
          decisionLock: activeLock
        };
      }
      if (!pending || !activeCase?.id || pending.caseId !== activeCase.id) {
        return { handled: false };
      }

      const cycle = createDecisionCycle({
        companyId: company.id,
        caseId: activeCase.id,
        threadId: thread.id
      });
      const lock = createDecisionLock({
        cycleId: cycle.id,
        companyId: company.id,
        caseId: activeCase.id,
        threadId: thread.id,
        constraint: pending.constraint,
        nextStep: pending.nextStep,
        whyThisFirst: pending.whyThisFirst,
        expectedResult: pending.expectedResult,
        reviewAt: this.reviewAt(),
        reopenConditions: DEFAULT_REOPEN_CONDITIONS
      });
      state.decisionCycles.push(cycle);
      state.decisionLocks.push(lock);
      state.decisionJournalEntries.push(createDecisionJournalEntry({
        cycleId: cycle.id,
        lockId: lock.id,
        companyId: company.id,
        caseId: activeCase.id,
        threadId: thread.id,
        entryType: "decision_locked",
        context: {
          constraint: pending.constraint,
          nextStep: pending.nextStep
        },
        alternatives: pending.alternatives,
        selectionReason: pending.whyThisFirst,
        expectedResult: pending.expectedResult
      }));
      thread.entryState = {
        ...thread.entryState,
        pendingDecision: null,
        lastUpdatedAt: nowIso()
      };

      return {
        handled: true,
        reply: [
          "Зафиксировал управленческое решение.",
          `Гипотеза: ${lock.constraint}`,
          `Первый шаг: ${lock.nextStep}`,
          `Контрольная дата: ${lock.reviewAt.slice(0, 10)}.`,
          "Когда выполнишь, напиши «готово»."
        ].join("\n"),
        decisionCycle: cycle,
        decisionLock: lock
      };
    }

    if (command.type === "reject") {
      if (activeLock) {
        const cycle = this.findActiveCycle(state, thread.id);
        activeLock.status = "released";
        activeLock.releaseReason = "owner_rejection";
        activeLock.releasedAt = nowIso();
        activeLock.updatedAt = activeLock.releasedAt;
        if (cycle) {
          cycle.status = "superseded";
          cycle.closedAt = activeLock.releasedAt;
          cycle.updatedAt = activeLock.releasedAt;
        }
        state.decisionJournalEntries.push(createDecisionJournalEntry({
          cycleId: activeLock.cycleId,
          lockId: activeLock.id,
          companyId: company.id,
          caseId: activeLock.caseId,
          threadId: thread.id,
          entryType: "decision_released",
          context: { releaseReason: "owner_rejection" },
          selectionReason: "Собственник отклонил зафиксированную версию.",
          expectedResult: activeLock.expectedResult
        }));
        return {
          handled: true,
          reply: "Снял фиксацию. Напиши, что именно не сходится в гипотезе или шаге — пересоберу версию с учётом этого факта.",
          decisionCycle: cycle,
          decisionLock: activeLock
        };
      }
      if (pending) {
        state.decisionJournalEntries.push(createDecisionJournalEntry({
          cycleId: "",
          companyId: company.id,
          caseId: pending.caseId,
          threadId: thread.id,
          entryType: "proposal_rejected",
          context: { constraint: pending.constraint, nextStep: pending.nextStep },
          alternatives: pending.alternatives,
          selectionReason: "Собственник не принял предложенную рабочую версию."
        }));
        thread.entryState = {
          ...thread.entryState,
          pendingDecision: null,
          lastUpdatedAt: nowIso()
        };
        return {
          handled: true,
          reply: "Не фиксирую. Напиши одним сообщением, что в версии не сходится — гипотеза, шаг или исходные факты.",
          pendingDecision: pending
        };
      }
      return { handled: false };
    }

    if (command.type === "complete") {
      if (!activeLock) {
        return { handled: false };
      }
      activeLock.awaitingResult = true;
      activeLock.updatedAt = nowIso();
      return {
        handled: true,
        reply: "Принял. Теперь нужен фактический результат, чтобы закрыть цикл и не выдать выполнение за эффект. Напиши: «результат: …» — что изменилось в цифрах, процессе или наблюдаемом факте.",
        decisionLock: activeLock
      };
    }

    if (command.type === "result") {
      if (!activeLock) {
        return { handled: false };
      }
      const completedAt = nowIso();
      const cycle = this.findActiveCycle(state, thread.id);
      activeLock.status = "completed";
      activeLock.awaitingResult = false;
      activeLock.actualResult = command.value;
      activeLock.completedAt = completedAt;
      activeLock.updatedAt = completedAt;
      if (cycle) {
        cycle.status = "completed";
        cycle.closedAt = completedAt;
        cycle.updatedAt = completedAt;
      }
      state.decisionJournalEntries.push(createDecisionJournalEntry({
        cycleId: activeLock.cycleId,
        lockId: activeLock.id,
        companyId: company.id,
        caseId: activeLock.caseId,
        threadId: thread.id,
        entryType: "decision_completed",
        context: {
          constraint: activeLock.constraint,
          nextStep: activeLock.nextStep
        },
        selectionReason: activeLock.whyThisFirst,
        expectedResult: activeLock.expectedResult,
        actualResult: command.value
      }));

      return {
        handled: true,
        reply: `Цикл закрыт. Фактический результат сохранён: ${command.value}\n\nТеперь можно проверить, подтвердилась ли гипотеза, и выбрать следующий шаг.`,
        decisionCycle: cycle,
        decisionLock: activeLock
      };
    }

    return { handled: false };
  }
}
