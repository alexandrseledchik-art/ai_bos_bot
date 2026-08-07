# AI-BOSS Implementation Backlog v1.0

## 1. Purpose

This document maps `AI_BOSS_DEVELOPER_SPEC_V1_0.md` to the current codebase and defines the practical implementation order.

Goal:

```text
move from prompt-heavy diagnostic behavior
to a persisted CEO decision cycle:
intent -> reference -> facts -> hypothesis -> next step -> owner/action -> lock -> journal -> learning
```

This is not a full rebuild. The current project already has useful pieces. The next stage is to extract the most important CEO logic into explicit services, persisted entities and testable flows.

## 2. Current Codebase Snapshot

### Already exists

#### Chat orchestration

- `src/application/conversation-service.js`
  - stores messages;
  - keeps `entryState`;
  - creates/updates cases;
  - persists observations, goals, symptoms, hypotheses, constraints, action waves, snapshots and artifacts.

#### Input classification

- `src/application/classify-input.js`
  - detects problem-first, tool discovery, specific tool request, meta-role, URL modes;
  - already catches CRM/data/process/strategy signals as problem markers.

#### Prompt reasoning contract

- `src/application/prompt-builder.js`
  - contains a large system prompt with many CEO-like rules;
  - already includes 11-layer logic, anti-template behavior, tool-first behavior, meta-role behavior, and "one next step" guidance;
  - currently too much behavior lives only in prompt instructions.

#### Observation extraction

- `src/application/observation-extractor.js`
  - extracts symptoms/signals from user text;
  - separates `claimedProblem` and `claimedCause`;
  - maps observations to business layers.

#### Graph reasoning

- `src/application/graph-reasoner.js`
  - uses causal graph to rank candidate states, causes, interventions and discriminating questions;
  - already protects against local staffing explanations in lead-flow cases.

#### Constraint reasoning

- `src/application/constraint-reasoner.js`
  - ranks 11-layer constraint candidates;
  - uses maturity, observations, request relevance and rejection feedback;
  - produces primary hypothesis and alternatives;
  - already avoids pure "lowest score wins" logic.

#### Next step selection

- `src/application/next-step-selector.js`
  - provides layer-based next step templates;
  - good starting point, but not yet a real scoring engine with `cost_of_delay`, dependency unlock, cost and risk.

#### Mini App diagnostic persistence

- `src/application/mini-app-diagnostics-service.js`
  - persists diagnostic answers;
  - builds and stores `constraint_hypotheses`;
  - stores `next_steps`;
  - handles confirm/reject hypothesis;
  - has owner decision queue and CEO agenda;
  - supports document sources and consultation briefs.

#### Database foundation

Existing migration `supabase/migrations/20260428_add_mini_app_mvp_phase1.sql` already includes:

- `company_profiles`;
- `problem_contexts`;
- `observations`;
- `diagnostic_runs`;
- `diagnostic_answers`;
- `maturity_scores`;
- `constraint_hypotheses`;
- `next_steps`;
- `tools`;
- `tool_recommendations`;
- `document_sources`;
- `document_snapshots`;
- `consultation_briefs`.

This means the implementation should extend the existing schema instead of inventing a parallel system.

## 3. Main Gaps Against Developer Spec

### 3.1 Intent Integrity Check

Current state:

- `classify-input.js` detects broad entry modes;
- prompt tells AI-BOSS not to accept user framing blindly.

Gap:

- no explicit module that classifies user input as problem, symptom, proposed solution, interpretation, false focus or fact;
- no persisted `intent_integrity` packet;
- no deterministic tests for false-focus cases like "Нам нужна CRM".

Need:

- create `src/application/intent-integrity-checker.js`;
- call it after `classifyInput`;
- pass result into reasoning context;
- add eval cases.

### 3.2 Reference Model Gate

Current state:

- 11 layers exist in `src/domain/business-layers.js`;
- prompt says to reason by 11 layers;
- Mini App has maturity diagnostics.

Gap:

- no explicit reference model per layer;
- no gate that blocks analysis when the minimum reference is missing;
- no storage for reference models, assumptions and consistency status.

Need:

- create `src/domain/reference-models.js`;
- create `src/application/reference-model-service.js`;
- add `reference_models` table;
- implement minimum viable references for 11 layers.

### 3.3 Autonomous Data Collector MVP

Current state:

- conversation memory exists;
- observations exist;
- company profile exists;
- documents/snapshots exist in Mini App;
- website screener exists for URLs.

Gap:

- no single service that searches existing sources before asking user;
- no `missing_data -> found_facts -> remaining_question` flow;
- no evidence priority logic at service level.

Need:

- create `src/application/autonomous-data-collector.js`;
- sources for MVP:
  - thread history;
  - company profile;
  - problem context;
  - observations;
  - diagnostic answers;
  - document snapshots;
  - constraint hypotheses and next steps.

Do not start with broad web/news monitoring yet.

### 3.4 Data Sufficiency

Current state:

- prompt and graph reasoner have signal sufficiency concepts;
- `entryState.signalSufficiency` exists.

Gap:

- no explicit service deciding `insufficient / enough_for_hypothesis / enough_for_decision`;
- no standard output for missing facts.

Need:

- create `src/application/data-sufficiency-checker.js`;
- connect it to Reference Gate and AutonomousDataCollector.

### 3.5 Decision Lock

Current state:

- Mini App has `constraint_hypotheses.status` and `next_steps.status`;
- chat has active cases and entry state;
- no formal lock.

Gap:

- no `decision_locks` table;
- no lock status/reopen conditions;
- no prevention of topic jumping around an accepted hypothesis/action;
- no release reason when a lock is reopened.

Need:

- add `decision_locks`;
- create `src/application/decision-lock-manager.js`;
- integrate after primary hypothesis + next step + ownership are selected.

### 3.6 Action Ownership

Current state:

- `next_steps` exist with title, description, why_this_first and status;
- owner decision queue exists in Mini App.

Gap:

- next step is not yet a fully executable action;
- no owner/executor/deadline/result format;
- no blockers or action status history.

Need:

- add `actions` and `action_assignments`;
- create `src/application/action-ownership-manager.js`;
- map existing `next_steps` into executable actions.

### 3.7 Decision Journal

Current state:

- hypotheses and snapshots persist some reasoning;
- artifacts can store diagnostic summaries.

Gap:

- no structured journal storing context, alternatives, why, expected result, accepted risk, review date and actual result.

Need:

- add `decision_journal_entries`;
- create `src/application/decision-journal-service.js`;
- create entry for each new decision lock.

### 3.8 Learning Loop

Current state:

- rejected hypotheses can influence ConstraintReasoner;
- Mini App can record status changes.

Gap:

- no structured learning event;
- no error type taxonomy;
- no model update from failed hypothesis/action.

Need:

- add `learning_events`;
- implement simple learning on lock release or action completion.

### 3.9 Operating Rhythm

Current state:

- Mini App has CEO agenda;
- no scheduled/proactive rhythm.

Gap:

- no daily/weekly review entities;
- no active lock/action summary;
- no proactive check cycle.

Need later:

- add `rhythm_events`;
- implement daily/weekly summaries after Decision Lock/Actions are stable.

## 4. Implementation Principles

1. Do not rewrite everything.
2. Keep current diagnostic behavior working.
3. Move logic from prompt to services gradually.
4. Use existing Mini App entities where they already fit.
5. Add persistence only where the current model cannot represent the new concept.
6. Keep user-facing language simple; do not expose internal layer mechanics by default.
7. Add eval scenarios before or alongside behavior changes.

## 5. MVP Implementation Phases

### Phase 1: Intent Integrity + Reasoning Packet

Goal:

AI-BOSS stops treating proposed tools and interpretations as the real problem.

Files:

- add `src/application/intent-integrity-checker.js`;
- update `src/application/conversation-service.js`;
- update `src/application/prompt-builder.js`;
- add eval cases in `evals/conversation-quality-cases.json` or a new CEO kernel eval file.

Deliverables:

- `intentIntegrity` added to reasoning context;
- proposed-solution detection for cases like:
  - "Нам нужна CRM";
  - "Нужно нанять РОПа";
  - "Нужно больше лидов";
  - "Нужен операционный директор";
- response reframes solution into underlying problem.

Acceptance:

- bot says "ты предлагаешь инструмент/решение" when appropriate;
- bot asks for the underlying problem only if it cannot infer it from context;
- bot does not recommend a tool immediately.

### Phase 2: Reference Model Gate MVP

Goal:

AI-BOSS checks what reality should be compared with before analyzing facts.

Files:

- add `src/domain/reference-models.js`;
- add `src/application/reference-model-service.js`;
- update `src/application/conversation-service.js`;
- update `src/application/constraint-reasoner.js` inputs.

Database:

- add `reference_models` table.

Deliverables:

- minimum reference templates for all 11 layers;
- gate output:
  - `reference_exists`;
  - `missing_reference_parts`;
  - `minimum_reference_needed`;
  - `assumptions`;
  - `needs_owner_decision`.

Acceptance:

- bot does not analyze "bad leads" without ICP/lead quality criteria;
- bot does not analyze "low profit" without basic finance reference;
- bot says in simple language what reference is missing.

### Phase 3: Autonomous Data Collector MVP

Goal:

AI-BOSS searches existing context before asking the user.

Files:

- add `src/application/autonomous-data-collector.js`;
- add `src/application/evidence-tagger.js`;
- update `src/application/conversation-service.js`;
- update Mini App service where needed.

Sources for MVP:

- company profile;
- problem context;
- diagnostic answers;
- observations;
- previous hypotheses;
- next steps;
- document snapshots;
- recent messages.

Deliverables:

- `foundFacts`;
- `missingFacts`;
- `sourceType`;
- `confidence`;
- `userQuestionIfNeeded`.

Acceptance:

- bot does not ask for current request if it is already in profile;
- bot uses diagnostic answers if they exist;
- bot asks one minimum question only when data is still missing.

### Phase 4: Decision Lock + Journal

Goal:

AI-BOSS fixes the current working hypothesis and remembers why.

Implementation update (2026-08-06):

- the first Decision Lock slice is implemented directly in the Telegram chat runtime state;
- the explicit commands are `фиксируем`, `не фиксируем`, `статус решения`, `готово` and `результат: ...`;
- a plain `да` never creates a management commitment;
- accepted decisions persist a cycle, lock and append-only journal entry in the primary bot state;
- Telegram Mini App is intentionally not part of this stage;
- relational database projection can be added later after the chat pilot validates the workflow.

Files:

- add `src/application/telegram-decision-cycle-manager.js`;
- update `src/application/conversation-service.js`;
- update `src/application/prompt-builder.js`;
- extend `src/domain/entities.js` with runtime decision entities.

Persistence for the chat pilot:

- store `decisionCycles`, `decisionLocks` and `decisionJournalEntries` in the primary bot state;
- keep the journal append-only;
- defer relational Supabase projection until the Telegram chat flow is validated.

Deliverables:

- lock after confirmed/accepted hypothesis and next step;
- reopen conditions;
- journal entry with alternatives and selection reason.

Acceptance:

- explicit owner command `фиксируем` creates a lock;
- rejected alternatives are stored;
- lock is released only by contradiction, failed test, stronger hypothesis or owner rejection;
- journal stores expected result and review date.

### Phase 5: Action Ownership MVP

Goal:

AI-BOSS turns a next step into a real executable action.

Files:

- add `src/application/action-ownership-manager.js`;
- update `src/application/next-step-selector.js`;
- update Mini App next-step actions.

Database:

- add `actions`;
- add `action_assignments`;
- add `monitoring_events` extensions if needed.

Deliverables:

- action owner;
- executor;
- deadline;
- result format;
- status;
- blocker.

Acceptance:

- every accepted next step has an owner or asks who owns it;
- every accepted action has a deadline or explicit no-deadline reason;
- action status can be updated;
- blocker can be recorded.

### Phase 6: Learning Loop MVP

Goal:

AI-BOSS learns when a hypothesis/action does not work.

Files:

- add `src/application/learning-loop-service.js`;
- update lock release and action completion flows.

Database:

- add `learning_events`.

Deliverables:

- error type taxonomy:
  - fact_error;
  - reference_error;
  - interpretation_error;
  - layer_error;
  - external_context_error;
  - execution_error;
  - decision_error;
  - metric_error;
  - timing_error.

Acceptance:

- failed check creates learning event;
- model update recommendation is saved;
- next hypothesis uses learning event as signal.

### Phase 7: Operating Rhythm MVP

Goal:

AI-BOSS becomes minimally proactive.

Files:

- add `src/application/operating-rhythm-service.js`;
- update admin or mini-app overview.

Database:

- add `rhythm_events`.

Deliverables:

- active locks summary;
- overdue actions summary;
- weekly owner review draft;
- daily risk check draft.

Acceptance:

- user can see active management cycle;
- overdue actions are visible;
- AI-BOSS can produce short control summary.

## 6. Database Migration Plan

Create one migration for CEO Kernel MVP:

```text
supabase/migrations/YYYYMMDD_add_ceo_decision_kernel.sql
```

Tables:

- `reference_models`;
- `decision_cycles`;
- `decision_locks`;
- `actions`;
- `action_assignments`;
- `decision_journal_entries`;
- `learning_events`;
- `rhythm_events` later or nullable in second migration.

Do not duplicate:

- `constraint_hypotheses`;
- `next_steps`;
- `observations`;
- `document_sources`;
- `document_snapshots`;
- `company_profiles`;
- `problem_contexts`.

These already exist and should be reused.

## 7. Test Plan

### New eval file

Create:

```text
evals/ceo-kernel-cases.json
```

Required cases:

1. "Нам нужна CRM"
2. "Лидов много, продаж мало"
3. "Падает прибыль"
4. "Команда не тянет"
5. "Хочу выйти в новую нишу"
6. "Кассовый разрыв через 2 недели"
7. "Нужно нанять операционного директора"
8. "Как лучше назвать этот документ?"

### Evaluation criteria

Each case should check:

- intent integrity;
- no false focus;
- reference model gate;
- data sufficiency;
- hypothesis quality;
- one next step;
- escalation if needed;
- light mode when task is small.

## 8. First Implementation Slice

The first slice should be intentionally narrow.

Implement:

1. `IntentIntegrityChecker`
2. `ReferenceModelGate` as in-memory/service layer, before database expansion if needed.
3. `DataSufficiencyChecker`
4. Update prompt context to include these packets.
5. Add CEO kernel eval cases.

Do not implement yet:

- full action assignments;
- scheduled rhythm;
- open-source monitoring;
- team communication;
- complex scenario engine.

Why:

This first slice changes AI-BOSS behavior where it matters most: it stops following the user's false framing and starts checking reference/fact sufficiency before giving a conclusion.

## 9. Recommended Next Step

Start with Phase 1 and Phase 2 together:

```text
IntentIntegrityChecker
+ ReferenceModelGate MVP
+ ceo-kernel evals
```

Reason:

- highest product impact;
- low database risk;
- directly improves chat behavior;
- creates foundation for AutonomousDataCollector, Decision Lock and Action Ownership.

After that, implement Decision Lock + Journal before expanding Team Interface or Operating Rhythm.

## 10. Implementation Boundary

For now AI-BOSS should not claim that it fully manages the business.

Correct product framing:

```text
AI-BOSS is a CEO-contour next to the owner.
It helps run the management cycle.
The owner remains responsible for key forks, risky choices and irreversible decisions.
```

This boundary must be preserved in prompt, UI copy and docs.
