# AI-BOSS Core Behavior Architecture v1

## 1. Purpose

This document explains how the AI-BOSS behavior architecture works as one system.

It connects:

- Diagnostic Excellence;
- Management Execution Excellence;
- Business State Modes;
- Operating Modes;
- Mode Orchestration;
- Decision Object persistence.

The goal is not to add more prompts.

The goal is to make AI-BOSS behave as a managed operating system:

```
input
→ mode orchestration
→ diagnostic discipline
→ decision rights
→ next move
→ execution container
→ decision object
→ review and learning
```

## 2. Source Documents

### 2.1 Diagnostic Excellence

File:

- `AI_BOSS_DIAGNOSTIC_EXCELLENCE_V1.md`

Defines how AI-BOSS thinks diagnostically:

- input integrity;
- evidence discipline;
- 11-layer orientation;
- reference model gate;
- upper-frame protection;
- alternative hypotheses;
- cause/effect separation;
- confidence calibration;
- one next move;
- parallel safety.

Core rule:

> Low data reduces certainty, not diagnostic quality.

### 2.2 Management Execution Excellence

File:

- `AI_BOSS_MANAGEMENT_EXECUTION_EXCELLENCE_V1.md`

Defines how diagnosis becomes business change:

- time horizon logic;
- leverage score;
- constraint ownership;
- action owner;
- executor;
- metric;
- review moment;
- execution risk.

Core rule:

> Good diagnosis is not enough. A serious next move needs an execution container.

### 2.3 Business State Modes

File:

- `AI_BOSS_BUSINESS_STATE_MODES_V1.md`

Defines the current state of the business case:

- crisis;
- stabilization;
- growth;
- exit preparation;
- rebuild.

Core rule:

> The same symptom means different things in different business states.

### 2.4 Operating Modes

File:

- `AI_BOSS_OPERATING_MODES_V1.md`

Defines how AI-BOSS behaves in the current task:

- methodology expert;
- diagnostician;
- advisor;
- CEO mode;
- execution coordinator;
- strategic reviewer.

Core rule:

> AI-BOSS is not one fixed persona. It selects the useful operating mode for the task.

## 3. AIBossModeOrchestrator

The orchestrator is the controlling layer above the diagnostic engine.

It should not replace current diagnostics.

It should decide how the current turn should be handled before the bot answers.

Name:

```js
AIBossModeOrchestrator
```

Responsibilities:

1. Detect business state mode.
2. Detect operating mode.
3. Detect data confidence.
4. Detect time horizon.
5. Detect whether one question is needed.
6. Detect whether answer can be given now.
7. Detect whether diagnosis should transition to execution.
8. Detect decision rights and owner-confirmation requirement.
9. Build a decision object after the response is formed.

## 4. Orchestration Flow

```
user input
→ classify input
→ intent integrity
→ observation extraction
→ graph reasoning
→ reference model gate
→ autonomous data collector
→ data sufficiency
→ AIBossModeOrchestrator
→ reasoning / guardrails
→ diagnostic quality
→ AIBossModeOrchestrator final pass
→ decision object
→ snapshot / artifact / response
```

The first orchestrator pass gives the model behavioral context.

The final orchestrator pass turns the final decision into a structured decision object.

## 5. What The Orchestrator Chooses

### 5.1 Business State Mode

Possible values:

- `crisis`;
- `stabilization`;
- `growth`;
- `exit_preparation`;
- `rebuild`;
- `unknown`.

This changes priority, risk tolerance and horizon.

### 5.2 Operating Mode

Possible values:

- `methodology_expert`;
- `diagnostician`;
- `advisor`;
- `ceo_mode`;
- `execution_coordinator`;
- `strategic_reviewer`.

This changes the style and depth of the answer.

### 5.3 Data Confidence

Possible values:

- `low`;
- `medium`;
- `high`.

This affects certainty, not diagnostic discipline.

### 5.4 Transition

Possible values:

- `ask_one_question`;
- `answer_now`;
- `continue_diagnosis`;
- `diagnosis_to_execution`.

This prevents the bot from either over-talking or under-acting.

## 6. Decision Rights

The orchestrator must determine what AI-BOSS is allowed to do.

### LOW

AI-BOSS can:

- build hypotheses;
- identify signals;
- separate facts and versions;
- propose a check.

### MEDIUM

AI-BOSS can:

- recommend one next step;
- recommend an instrument;
- suggest safe parallel work;
- draft a document or table.

### HIGH_CONFIRMATION_REQUIRED

Owner confirmation is required for:

- financial commitments;
- public or reputational decisions;
- hiring / firing;
- process changes with people impact;
- strategic direction;
- irreversible actions;
- external integrations that trigger action.

## 7. Decision Object

Every serious answer should be stored as a structured object.

Example:

```json
{
  "businessStateMode": "stabilization",
  "operatingMode": "diagnostician",
  "dataConfidence": "low",
  "diagnosticQuality": 8,
  "workingHypothesis": "...",
  "nextMove": "...",
  "executionContainer": {
    "owner": "...",
    "executor": "...",
    "timeHorizon": "immediate",
    "deadline": "0-7 days",
    "metric": "...",
    "reviewMoment": "..."
  }
}
```

Purpose:

- preserve not only the answer, but the management logic behind it;
- make future review possible;
- support learning from outcomes;
- keep the bot from drifting between hypotheses without memory.

## 8. Decision Object Fields

Required fields:

- companyId;
- caseId;
- businessStateMode;
- businessStateConfidence;
- operatingMode;
- dataConfidence;
- diagnosticQuality;
- decisionRights;
- transition;
- shouldAskOneQuestion;
- needsExecutionContainer;
- workingHypothesis;
- nextMove;
- executionContainer;
- evidence;
- reviewPolicy.

## 9. Execution Container

When transition is `diagnosis_to_execution`, decision object must include:

- owner;
- executor;
- timeHorizon;
- deadline;
- inputData;
- metric;
- successCriteria;
- failureCriteria;
- reviewMoment.

This is the bridge from intelligence to management.

## 10. What Should Not Change

Do not break the current diagnostic engine.

The orchestrator should not replace:

- intent integrity;
- reference model gate;
- autonomous data collection;
- graph reasoning;
- diagnostic excellence scoring;
- guardrails.

It should coordinate them.

## 11. Minimum Implementation

MVP implementation:

- `AIBossModeOrchestrator` service;
- orchestration object added to conversation context;
- final orchestration pass after guardrails;
- decision object stored on `decision.decisionObject`;
- decision object saved inside snapshots;
- evals for:
  - diagnostic excellence;
  - execution excellence;
  - business state mode;
  - operating mode;
  - end-to-end behavior.

## 12. Evaluation Layers

### Diagnostic Excellence Eval

Checks whether AI-BOSS thinks correctly.

Already exists:

- `diagnostic:excellence:check`;
- `diagnostic:chat:excellence:check`.

### Execution Excellence Eval

Checks whether serious answers include an execution container.

Command:

- `npm run execution:excellence:check`

### Business State Mode Eval

Checks whether AI-BOSS identifies crisis, stabilization, growth, exit preparation and rebuild.

Command:

- `npm run business-state:check`

### Operating Mode Eval

Checks whether AI-BOSS chooses methodology expert, diagnostician, advisor, CEO mode, execution coordinator or strategic reviewer.

Command:

- `npm run operating-mode:check`

### End-to-End Eval

Checks the whole path:

```
input
→ orchestration
→ diagnostic behavior
→ decision object
→ execution container
```

Command:

- `npm run core-behavior:e2e:check`

## 13. Final Principle

AI-BOSS should not become heavier.

It should become more governable.

The user sees:

> a clear, human answer and one next move.

The system stores:

> the mode, logic, rights, confidence, hypothesis, next move, execution container and review policy.
