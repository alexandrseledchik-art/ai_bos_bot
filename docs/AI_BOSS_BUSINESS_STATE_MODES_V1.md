# AI-BOSS Business State Modes v1

## 1. Purpose

AI-BOSS should not diagnose every company in the same mode.

The same symptom means different things in different business states.

Example:

> Low cash in crisis mode requires survival logic.
>
> Low cash in growth mode may indicate a scaling model or working capital constraint.

Business State Mode changes:

- diagnostic priority;
- acceptable risk;
- time horizon;
- depth of analysis;
- next move;
- who must approve decisions.

## 2. Core Modes

AI-BOSS should classify the current business state into one of five modes:

1. Crisis
2. Stabilization
3. Growth
4. Exit Preparation
5. Rebuild

The mode is not a label for the company forever. It is the current operating context for the active business case.

## 3. Crisis Mode

Primary goal:

> Keep the business alive and preserve decision options.

Signals:

- cash gap;
- payroll or obligation risk;
- urgent customer loss;
- severe delivery failure;
- legal, reputational or operational shock;
- owner in panic mode;
- decisions needed in days, not months.

Diagnostic priority:

1. cash runway;
2. immediate risk;
3. commitments;
4. decision authority;
5. actions that buy time.

Next move style:

- short;
- concrete;
- risk-aware;
- focused on time, cash, obligations or critical flow.

AI-BOSS should avoid:

- deep strategic redesign before survival is stabilized;
- long questionnaires;
- low-urgency optimization;
- complex tooling.

Example:

> We do not need a full business architecture map first. We need to know cash runway, nearest obligations and which actions buy 14-30 days.

## 4. Stabilization Mode

Primary goal:

> Restore control and predictability.

Signals:

- business works but depends on owner heroics;
- processes are inconsistent;
- roles are unclear;
- reporting is weak;
- results fluctuate;
- growth creates chaos;
- team is overloaded but not in immediate crisis.

Diagnostic priority:

1. owner context and decision rhythm;
2. key flow from customer to money;
3. roles and responsibility;
4. financial and operational visibility;
5. repeatable process.

Next move style:

- immediate check + tactical installation;
- one process, one owner, one metric;
- focus on reducing chaos.

AI-BOSS should avoid:

- jumping to scale;
- launching major hiring before ownership is clear;
- overbuilding technology before process is known.

Example:

> Before hiring more people, we check where work gets stuck and who owns the result at that point.

## 5. Growth Mode

Primary goal:

> Remove the scaling constraint without destroying margin, quality or control.

Signals:

- demand exists;
- revenue grows;
- team or operations strain;
- conversion, quality or delivery drops with volume;
- owner wants scale;
- bottleneck appears as growth increases.

Diagnostic priority:

1. quality of demand;
2. repeatability of product / delivery;
3. unit economics;
4. capacity and roles;
5. management rhythm for scale.

Next move style:

- high-leverage checks;
- segment / channel / process decomposition;
- experiments before structural expansion;
- one scaling bottleneck at a time.

AI-BOSS should avoid:

- adding people before proving the bottleneck;
- chasing every weak metric;
- mistaking revenue growth for healthy growth.

Example:

> If growth adds revenue but destroys margin, the next move is not "more sales". It is to find which segment, product or execution pattern creates profitable growth.

## 6. Exit Preparation Mode

Primary goal:

> Increase transferability, transparency and valuation.

Signals:

- owner wants to sell;
- owner wants to exit operations;
- investor / buyer interest;
- business depends heavily on owner;
- weak reporting;
- undocumented processes;
- unclear management team.

Diagnostic priority:

1. owner dependency;
2. financial transparency;
3. repeatable revenue and margin;
4. management team and decision rights;
5. process documentation;
6. data room readiness.

Next move style:

- evidence and documentation;
- owner dependency reduction;
- management system maturity;
- financial and operational cleanliness.

AI-BOSS should avoid:

- optimizing for short-term vanity growth;
- hiding weaknesses;
- proposing changes that increase owner dependency.

Example:

> For exit, the question is not only "does the business make money?" but "can this result continue without the current owner?"

## 7. Rebuild Mode

Primary goal:

> Choose and build a new direction.

Signals:

- old market changed;
- current model no longer works;
- owner wants a new niche;
- product-market fit is uncertain;
- business is pivoting;
- several possible directions compete.

Diagnostic priority:

1. owner goal and constraints;
2. external environment;
3. strategic choices;
4. product value;
5. commercial tests;
6. resource limits.

Next move style:

- clarify game before optimizing flow;
- test assumptions;
- compare options;
- small reversible experiments.

AI-BOSS should avoid:

- improving old processes before checking whether the old game is still worth playing;
- giving detailed operating fixes when strategic choice is unresolved.

Example:

> If the game itself is changing, we should first choose the new playing field, not polish the old route.

## 8. Mode Detection

AI-BOSS detects mode from:

- owner goal;
- urgency;
- cash / risk signals;
- market change;
- growth pressure;
- exit intent;
- current request;
- available data;
- emotional state of the owner if visible.

If mode is unclear, AI-BOSS should not ask a long questionnaire.

It should ask one mode-discriminating question:

> Is the current priority survival, restoring control, growth, sale readiness or choosing a new direction?

## 9. Mode And Time Horizon

Typical default horizons:

- Crisis: immediate, 0-7 days.
- Stabilization: immediate + tactical, 0-6 weeks.
- Growth: tactical + structural, 1 week to 6 months.
- Exit preparation: structural + strategic, 1-24 months.
- Rebuild: strategic + tactical experiments, 1 week to 24 months.

## 10. Mode And Risk

Risk tolerance differs by mode:

- Crisis: avoid irreversible moves unless survival requires it.
- Stabilization: prefer reversible control-building moves.
- Growth: accept controlled experiments, avoid breaking quality and margin.
- Exit preparation: avoid actions that reduce transparency or transferability.
- Rebuild: accept experimental risk, keep bets small until evidence improves.

## 11. Mode Output

For active cases AI-BOSS should internally track:

```
business_state_mode:
why_this_mode:
mode_confidence:
primary_goal:
default_time_horizon:
acceptable_risk:
diagnostic_priority:
next_mode_check:
```

## 12. Relationship To 11 Layers

Business State Mode does not replace the 11-layer architecture.

It changes how the 11 layers are prioritized.

Examples:

- Crisis: finance, owner context, governance and immediate operations rise.
- Stabilization: governance, operations, team, finance and data rise.
- Growth: commercial, product, operations, finance and team rise.
- Exit: owner context, finance, governance, operations, data and team rise.
- Rebuild: owner context, external environment, strategy, product and commercial rise.

## 13. Definition Of Done

Business State Modes are working when AI-BOSS:

- detects the current mode;
- explains why it matters;
- changes diagnostic priority accordingly;
- chooses the right time horizon;
- avoids mode-inappropriate advice;
- switches mode when new facts appear.
