# AI-BOSS Developer Spec v1.0

## 1. Purpose

This document translates `AI_BOSS_CEO_LOGIC_V1_4.md` into an implementation-ready specification.

AI-BOSS is a CEO-contour next to the owner. It turns business chaos into a sequence of decisions, actions, checks and management learnings. Key forks, risky decisions and irreversible moves remain with the owner.

This spec defines the first technical version of that behavior.

## 2. Product Logic

AI-BOSS should not behave like a general Q&A assistant.

It should run a management cycle:

```text
intent
-> owner goal
-> reference model
-> facts
-> gap
-> hypotheses
-> primary hypothesis
-> one next step
-> ownership
-> decision lock
-> monitoring
-> learning
-> model update
```

The system must:

- not accept the user's framing at face value;
- not analyze facts without a reference model;
- search for missing data before asking the user;
- distinguish facts, sources, hypotheses and conclusions;
- build 2-3 hypotheses, but select one main working version;
- choose one next step;
- assign ownership for the action;
- remember why the decision was made;
- check the result;
- update the business model after learning.

## 3. MVP Scope

The first implementation must not try to build the full Operating System.

### MVP must include

- `IntentIntegrityChecker`
- `ReferenceModelGate`
- simple `AutonomousDataCollector`
- `DataSufficiencyChecker`
- `HypothesisBuilder`
- `HypothesisValidator`
- `HypothesisSelector`
- `NextStepScorer`
- `DecisionLockManager`
- `ActionOwnershipManager`
- `DecisionJournalService`
- `ResponseComposer`

### MVP can defer

- full Team Interface;
- advanced Scenario Layer;
- full Drift Control;
- Business Rhythm OS automation;
- advanced Data Quality scoring;
- multi-user task execution;
- external API integrations beyond existing accessible sources.

### MVP behavior goal

For a business request AI-BOSS must be able to:

```text
understand the request
-> detect whether it is a problem, symptom or proposed solution
-> identify the owner goal
-> identify the relevant business layer
-> check or create a minimum reference model
-> collect minimum facts from available sources
-> build 2-3 hypotheses
-> select one primary hypothesis
-> explain why alternatives are weaker
-> choose one next step
-> assign action ownership
-> create a decision journal entry
-> set a decision lock
-> respond in human CEO language
```

## 4. Core Modules

### 4.1 IntentDetector

Detects what the user is trying to do.

Output:

```text
intent_type:
  - ask_question
  - report_problem
  - propose_solution
  - share_fact
  - upload_data
  - request_decision
  - request_action
  - check_status
raw_intent
confidence
```

Definition of Done:

- returns one primary intent;
- keeps the original user wording;
- marks confidence;
- does not decide business logic by itself.

### 4.2 IntentIntegrityChecker

Checks whether the user's request is a real problem, a symptom, an interpretation or a proposed solution.

Examples:

- "Нам нужна CRM" -> proposed solution.
- "Лидов много, продаж мало" -> problem/symptom.
- "Команда не тянет" -> interpretation, needs facts.

Output:

```text
integrity_type:
  - problem
  - symptom
  - proposed_solution
  - interpretation
  - false_focus
  - fact
clarifying_problem
needs_reframing
```

Definition of Done:

- detects proposed solutions and reframes them into the underlying problem;
- prevents AI-BOSS from optimizing the wrong thing;
- produces a short user-facing explanation when reframing is needed.

### 4.3 OwnerGoalDetector

Identifies what matters to the owner right now.

Possible goals:

- growth;
- profit;
- control;
- launch;
- stability;
- exit;
- cash safety;
- owner time freedom;
- packaging consulting/product.

Output:

```text
owner_goal
goal_horizon
goal_confidence
goal_source
```

Definition of Done:

- uses saved model first;
- extracts goal from conversation if present;
- asks the user only if the goal is necessary and unavailable.

### 4.4 ReferenceModelGate

Checks whether the relevant layer has a reference model.

Output:

```text
layer
reference_exists
reference_model
missing_reference_parts
minimum_reference_needed
```

Definition of Done:

- never allows analysis of a layer without at least a minimum reference;
- can build a minimum viable reference from available facts;
- marks which parts are assumptions.

### 4.5 ReferenceConsistencyChecker

Checks whether the reference model is usable.

It verifies:

- no contradiction with the layer above;
- no internal contradiction;
- applicability to the current business model;
- enough specificity for the current decision.

Output:

```text
is_consistent
conflicts
assumptions
needs_owner_decision
```

Definition of Done:

- blocks decisions based on contradictory reference models;
- escalates to the owner if the contradiction requires strategic choice.

### 4.6 AutonomousDataCollector

Searches for missing information before asking the user.

Input:

```text
missing_data
current_layer
decision_type
confidence_level
available_sources
```

Source order:

1. Memory and past conversations.
2. Saved business model.
3. Documents, files and tables.
4. Mini App / cabinet.
5. API / integrations.
6. Open sources.
7. Market, competitors and news.
8. One minimum question to the user.

Output:

```text
found_facts
source_type
confidence
missing_facts
user_question_if_needed
```

Definition of Done:

- does not ask the user for data available in existing sources;
- returns source and confidence for each found fact;
- asks at most one minimum question when data is still missing;
- escalates if the missing data concerns owner will, strategy, obligations or irreversible decisions.

### 4.7 DataSufficiencyChecker

Decides whether there is enough information for the current decision type.

Output:

```text
sufficiency:
  - insufficient
  - enough_for_hypothesis
  - enough_for_decision
missing_facts
uncertainty_level:
  - low
  - medium
  - high
```

Definition of Done:

- separates "enough for hypothesis" from "enough for decision";
- prevents high-confidence recommendations based on weak data;
- points to the minimum missing fact.

### 4.8 EvidenceTagger

Marks every important statement by source.

Tags:

- `confirmed_data`
- `document`
- `decision_history`
- `user_words`
- `external_source`
- `working_hypothesis`
- `ai_boss_conclusion`

Definition of Done:

- every fact used in reasoning has a source tag;
- every hypothesis is clearly separated from confirmed facts;
- user-facing output can simplify tags, but internal state must keep them.

### 4.9 HypothesisBuilder

Builds 2-3 possible constraint hypotheses.

Output:

```text
hypotheses:
  - layer
  - hypothesis_text
  - evidence
  - assumptions
  - expected_effect
```

Definition of Done:

- creates 2-3 plausible hypotheses when data allows;
- avoids creating many options;
- includes a "why this could explain the current request" note.

### 4.10 HypothesisValidator

Validates hypotheses before selection.

Checks:

- higher-layer explanation;
- adjacent-layer explanation;
- simpler explanation;
- cause vs effect;
- evidence strength;
- contradiction with reference model;
- contradiction with known facts.

Output:

```text
validated_hypotheses:
  - hypothesis_id
  - validation_score
  - strengths
  - weaknesses
  - rejected_reason_if_any
```

Definition of Done:

- does not select a hypothesis only because it has the lowest maturity score;
- detects symptom-level hypotheses;
- rejects weaker alternatives explicitly.

### 4.11 HypothesisSelector

Selects one primary hypothesis.

Output:

```text
primary_hypothesis
rejected_hypotheses
selection_reason
confidence_level
```

Definition of Done:

- only one primary hypothesis is selected;
- rejected alternatives are stored with reasons;
- confidence level is marked.

### 4.12 NextStepScorer

Selects one next step.

Formula:

```text
next_step_score =
impact
+ uncertainty_reduction
+ speed
+ data_availability
+ dependency_unlock
+ cost_of_delay
- cost
- risk
```

Definition of Done:

- scoring is applied only after hypothesis validation;
- the selected step validates or advances the primary hypothesis;
- it does not optimize a symptom if the layer above is unresolved;
- it returns one next step, not a list of advice.

### 4.13 DecisionAuthorityChecker

Checks whether AI-BOSS can proceed or must ask the owner.

Escalate if:

- strategic choice;
- irreversible decision;
- high financial risk;
- legal/reputation/team risk;
- owner will required;
- conflicting data;
- equal-strength hypotheses.

Definition of Done:

- detects owner-level forks;
- produces 1-2 options, not an open-ended question;
- includes AI-BOSS recommendation when possible.

### 4.14 ActionOwnershipManager

Turns the next step into an executable action.

Output:

```text
action
accountable_owner
executor
approver
deadline
reporting_place
status
blocker
result_format
```

Definition of Done:

- every action has an owner or explicit "owner unknown";
- every action has a deadline or explicit reason why not;
- every action has a result format;
- unclear ownership triggers a question or owner fork.

### 4.15 DecisionLockManager

Locks the current working hypothesis and action until result or new facts.

Decision Lock is created only if saved:

```text
primary_hypothesis
rejected_hypotheses
selected_action
metric
deadline
success_criteria
failure_criteria
confidence_level
evidence_sources
reopen_conditions
```

Definition of Done:

- prevents topic jumping;
- stores reopen conditions;
- can be lifted when contradiction, failed test, stronger hypothesis or owner rejection appears.

### 4.16 DecisionJournalService

Stores why the decision was made.

Journal entry:

```text
decision
context
alternatives
chosen_option
why
expected_result
risk_accepted
review_date
actual_result
lesson_learned
```

Definition of Done:

- creates a journal entry for every locked decision;
- stores alternatives and rejected reasons;
- stores expected result and review date;
- can later receive actual result and lesson learned.

### 4.17 ResponseComposer

Turns internal reasoning into human CEO language.

Rules:

- one main point;
- one next step;
- at most 1-2 alternatives if owner fork is required;
- no internal jargon unless user asks;
- clearly separate fact, hypothesis and recommendation;
- explain why this hypothesis, not another;
- explain what changes after the action.

Definition of Done:

- response is understandable without knowing the 11 layers;
- response does not expose internal machinery unnecessarily;
- response sounds like a calm operating CEO next to the owner.

## 5. State Machine

Core states:

```text
orientation
diagnosis
fact_collection
research
decision
action
monitoring
update_model
```

Transitions:

```text
orientation -> diagnosis
diagnosis -> fact_collection
diagnosis -> research
fact_collection -> decision
research -> decision
decision -> action
action -> monitoring
monitoring -> update_model
update_model -> orientation
update_model -> diagnosis
```

Global transitions:

```text
any_state -> escalation
any_state -> light_mode
monitoring -> diagnosis, if hypothesis failed
monitoring -> action, if execution blocker exists
decision -> fact_collection, if data becomes insufficient
```

Escalation conditions:

- high risk;
- high irreversibility;
- conflicting data;
- owner will required;
- legal/reputation/team risk;
- cash risk;
- equal-strength hypotheses;
- external shock.

## 6. Database Entities

These are proposed logical entities. They can be implemented as database tables or adapted to the existing storage layer.

### companies

```text
id
owner_user_id
name
industry
size
revenue_range
created_at
updated_at
```

### business_models

```text
id
company_id
owner_goal
goal_horizon
business_description
current_focus
constraints
confidence_level
created_at
updated_at
```

### reference_models

```text
id
company_id
layer_key
reference_json
source_type
assumptions_json
is_minimum_viable
consistency_status
created_at
updated_at
```

### facts

```text
id
company_id
layer_key
fact_text
fact_value
evidence_source_id
confidence_level
freshness_at
created_at
```

### evidence_sources

```text
id
company_id
source_type
source_name
source_uri
priority_rank
retrieved_at
confidence_level
metadata_json
```

### hypotheses

```text
id
company_id
decision_cycle_id
layer_key
hypothesis_text
status
validation_score
confidence_level
evidence_json
assumptions_json
rejected_reason
created_at
updated_at
```

### decision_cycles

```text
id
company_id
state
intent_type
owner_goal
decision_type
layer_key
scope
created_at
updated_at
closed_at
```

### decisions

```text
id
company_id
decision_cycle_id
decision_text
chosen_option
decision_authority
owner_approved
expected_result
risk_accepted
created_at
```

### decision_locks

```text
id
company_id
decision_cycle_id
primary_hypothesis_id
selected_action_id
metric
deadline
success_criteria
failure_criteria
confidence_level
reopen_conditions_json
status
created_at
released_at
release_reason
```

### actions

```text
id
company_id
decision_cycle_id
action_text
accountable_owner
executor
approver
deadline
result_format
status
created_at
updated_at
completed_at
```

### action_assignments

```text
id
action_id
role_type
person_name
person_contact
responsibility
status
created_at
updated_at
```

### monitoring_events

```text
id
company_id
decision_cycle_id
action_id
event_type
status
metric_value
blocker
notes
created_at
```

### decision_journal_entries

```text
id
company_id
decision_cycle_id
decision_id
context_json
alternatives_json
chosen_option
why
expected_result
risk_accepted
review_date
actual_result
lesson_learned
created_at
updated_at
```

### learning_events

```text
id
company_id
decision_cycle_id
hypothesis_id
error_type
what_was_expected
what_happened
model_update_json
created_at
```

### rhythm_events

```text
id
company_id
rhythm_type
scheduled_for
status
summary
created_at
updated_at
```

## 7. Service Flow

### 7.1 Chat request flow

```text
user message
-> IntentDetector
-> IntentIntegrityChecker
-> load company/business model
-> OwnerGoalDetector
-> StateMachine
-> ReferenceModelGate
-> ReferenceConsistencyChecker
-> DataSufficiencyChecker
-> AutonomousDataCollector if needed
-> HypothesisBuilder
-> HypothesisValidator
-> HypothesisSelector
-> NextStepScorer
-> DecisionAuthorityChecker
-> ActionOwnershipManager
-> DecisionLockManager
-> DecisionJournalService
-> ResponseComposer
-> reply
```

### 7.2 Monitoring flow

```text
scheduled check or user update
-> load active decision lock
-> check action status
-> check metric / deadline / blocker
-> compare with success and failure criteria
-> if confirmed: update model and journal
-> if failed: create learning event and reopen diagnosis
-> if blocked: escalate or assign next action
```

### 7.3 Owner escalation flow

```text
risk / irreversibility / conflict detected
-> build 1-2 options
-> add AI-BOSS recommendation
-> explain why owner decision is needed
-> wait for owner choice
-> save owner decision
-> create decision lock or reopen cycle
```

## 8. Prompt / Reasoning Contracts

These contracts define what reasoning output the LLM layer should produce before composing the final answer.

### 8.1 ManagementAnalysisPacket

```json
{
  "intent": {
    "type": "propose_solution",
    "raw": "Нам нужна CRM",
    "confidence": "high"
  },
  "intent_integrity": {
    "type": "proposed_solution",
    "reframed_problem": "какую проблему CRM должна решить"
  },
  "owner_goal": {
    "goal": "control",
    "horizon": "unknown",
    "source": "inferred"
  },
  "state": "orientation",
  "decision_type": "diagnostic",
  "layer": "technology",
  "reference_gate": {
    "exists": false,
    "minimum_reference_needed": ["current sales process", "lead ownership", "control problem"]
  },
  "data_sufficiency": "insufficient",
  "missing_data": ["what breaks without CRM"],
  "next_internal_action": "ask_minimum_question"
}
```

### 8.2 HypothesisPacket

```json
{
  "primary_hypothesis": {
    "layer": "commercial",
    "text": "Sales result is limited by lead quality criteria and handoff rules",
    "confidence": "medium"
  },
  "alternatives": [
    {
      "text": "Problem is in sales skills",
      "status": "rejected",
      "reason": "less evidence; could be consequence"
    }
  ],
  "next_step": {
    "text": "Check 20 recent leads against ICP criteria",
    "metric": "share of target leads",
    "deadline": "3 business days"
  }
}
```

### 8.3 Response Contract

The user-facing response must include:

- what AI-BOSS understood;
- if reframing is needed, why;
- what is known and what is missing;
- the main working hypothesis, if available;
- why this hypothesis is stronger;
- one next step;
- who should own the action, if known;
- what will be checked next.

The response must avoid:

- exposing all 11 layers by default;
- giving 5-10 generic options;
- pretending that a hypothesis is a confirmed fact;
- asking the user for data that AI-BOSS can retrieve itself;
- launching deep CEO mode for a small wording task.

## 9. Test Scenarios

### Case 1: "Нам нужна CRM"

Expected behavior:

- detect proposed solution;
- do not immediately recommend CRM;
- ask what problem CRM should solve or search existing context;
- identify possible layers: commercial, operations, technology, data;
- produce one minimum next question if data unavailable.

Good answer pattern:

```text
Ты уже предлагаешь инструмент. Сначала зафиксирую, какую проблему он должен решить: теряются заявки, нет контроля воронки, менеджеры не ведут клиентов или собственнику не видно продажи?
```

### Case 2: "Лидов много, продаж мало"

Expected behavior:

- detect problem/symptom;
- check commercial reference: ICP, quality lead criteria, funnel stages;
- collect available data;
- build hypotheses: lead quality, sales processing, offer mismatch;
- select one primary based on evidence;
- next step: inspect recent leads/funnel stage data.

### Case 3: "Падает прибыль"

Expected behavior:

- detect financial problem;
- check finance reference: unit economics, margin, costs, cash flow;
- consider higher layers: pricing, product, sales mix;
- include cost_of_delay if cash risk;
- avoid jumping only to "cut costs";
- choose one validating step.

### Case 4: "Команда не тянет"

Expected behavior:

- detect interpretation;
- check team reference: roles, responsibilities, load, competencies;
- check operations and governance before blaming people;
- ask or retrieve workload/process facts;
- distinguish capacity issue, role ambiguity and competency issue.

### Case 5: "Хочу выйти в новую нишу"

Expected behavior:

- detect strategic decision;
- require owner goal and horizon;
- use scenario thinking;
- check external environment and strategy reference;
- escalate to owner if risk profile changes;
- recommend a small validation step before full move.

### Case 6: "Кассовый разрыв через 2 недели"

Expected behavior:

- detect high cost_of_delay;
- enter escalation / deep CEO mode;
- prioritize immediate cash safety;
- ask for or retrieve cash position, obligations, receivables, payroll;
- do not over-diagnose before urgent action;
- present 1-2 owner-level options.

### Case 7: "Нужно нанять операционного директора"

Expected behavior:

- detect proposed solution / strategic people decision;
- check problem: owner overload, process chaos, accountability gap, scale bottleneck;
- check operations and governance reference;
- evaluate reversibility and cost;
- suggest validating whether role, process or decision rights are the real limitation.

### Case 8: Simple wording task

User:

```text
Как лучше назвать этот документ?
```

Expected behavior:

- use light mode;
- do not run full CEO cycle;
- offer 2-3 concise naming options;
- no Decision Lock.

## 10. MVP Implementation Roadmap

### Phase 1: Reasoning Kernel

Goal: AI-BOSS thinks correctly.

Implement:

- intent detection;
- intent integrity check;
- reference model gate;
- data sufficiency check;
- hypothesis builder/validator/selector;
- one next step selection;
- response composer.

Acceptance:

- test scenarios 1-4 pass in chat simulations;
- bot stops treating proposed tools as problems;
- bot explains why the chosen hypothesis is primary.

### Phase 2: Decision Lock + Journal

Goal: AI-BOSS does not jump between topics and remembers why decisions were made.

Implement:

- decision cycle entity;
- hypothesis storage;
- decision lock;
- decision journal entry;
- reopen conditions.

Acceptance:

- every selected primary hypothesis creates a lock;
- alternatives and rejection reasons are stored;
- failed checks can reopen the cycle.

### Phase 3: Action Ownership

Goal: AI-BOSS turns decisions into executable actions.

Implement:

- action entity;
- owner/executor/deadline/result format;
- basic monitoring event;
- blocker status.

Acceptance:

- every next step has ownership or explicitly asks who owns it;
- every action has deadline and result format;
- user can update action status.

### Phase 4: Autonomous Data MVP

Goal: AI-BOSS searches existing sources before asking the user.

Implement:

- search saved business model;
- search facts and previous decisions;
- search uploaded docs/tables if available;
- simple web/open source hook later if approved;
- one minimum question fallback.

Acceptance:

- bot does not ask for data already in saved profile/diagnostic;
- missing data is explicit and minimal;
- facts have source tags.

### Phase 5: Operating Rhythm MVP

Goal: AI-BOSS starts becoming proactive.

Implement:

- daily/weekly check templates;
- active locks overview;
- overdue action detection;
- owner summary.

Acceptance:

- system can list active decisions/actions;
- system can ask for status on overdue actions;
- owner gets a short control summary.

## 11. Non-Goals for MVP

Do not implement in the first version:

- full multi-role team chat automation;
- autonomous financial operations;
- irreversible actions without owner confirmation;
- complex external integrations without source-of-truth rules;
- full market monitoring automation;
- heavy scenario engine for every request;
- exposing 11 layers to users by default.

## 12. Final Acceptance Criteria

Developer Spec v1.0 is implemented when AI-BOSS can handle the seven management test cases and one light-mode case with this behavior:

- reframes false focus;
- builds or requests minimum reference;
- searches existing data first;
- separates fact from hypothesis;
- builds alternatives but selects one primary;
- explains why primary was chosen;
- selects one next step;
- assigns action ownership;
- creates Decision Lock;
- writes Decision Journal;
- knows when to escalate to owner;
- does not overload the user.

The product-level result:

```text
AI-BOSS stops being a smart chat assistant
and becomes a controllable management cycle
next to the business owner.
```
