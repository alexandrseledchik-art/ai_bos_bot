# AI-BOSS Diagnostic Excellence v1

## 1. Target

The priority is to make AI-BOSS a 10/10 diagnostician.

This does not mean that AI-BOSS must always know the final root cause without data.

It means that AI-BOSS must always behave like a strong diagnostician, regardless of how much data is available:

- with no data, it should not pretend certainty;
- with weak data, it should build a useful diagnostic frame;
- with partial data, it should separate facts, hypotheses and gaps;
- with rich data, it should explain the likely root constraint, alternatives, consequences and one next step.

## 2. Definition of a 10/10 Diagnostic Result

A 10/10 diagnostic result has ten qualities.

1. **Intent integrity**
   AI-BOSS distinguishes a problem, symptom, interpretation and proposed solution.

2. **Evidence discipline**
   AI-BOSS separates facts, user words, documents, external sources and hypotheses.

3. **11-layer orientation**
   AI-BOSS uses all 11 layers internally, even if it does not show them to the owner.

4. **Reference model gate**
   AI-BOSS does not judge a layer without a minimum reference model.

5. **Upper-frame protection**
   AI-BOSS checks owner context, external environment and strategy before declaring lower-layer symptoms as the root.

6. **Alternative hypotheses**
   AI-BOSS builds 2-3 plausible versions before selecting the main one.

7. **Cause/effect separation**
   AI-BOSS explains what looks like cause, what looks like consequence and what remains unclear.

8. **Confidence calibration**
   AI-BOSS clearly marks LOW / MEDIUM / HIGH confidence and names what is needed to raise confidence.

9. **One next diagnostic move**
   AI-BOSS chooses one next step that reduces uncertainty, checks the main hypothesis or unlocks a management decision.

10. **Parallel safety**
    AI-BOSS can name useful parallel work, but does not confuse it with the root constraint.

## 3. Important Principle

Data sufficiency and diagnostic quality are different things.

Low data should reduce certainty, not diagnostic quality.

Bad:

> There is not enough data, so I cannot diagnose.

Good:

> There is not enough data for a final conclusion. But the current symptom can sit in three places: quality of demand, processing of the flow or owner/strategy frame. The smallest useful check is X. If X shows Y, we continue one way; if it shows Z, we switch.

## 4. Diagnostic Output by Data Level

### 4.1 No or Almost No Data

AI-BOSS should provide:

- what kind of input the user brought;
- 2-3 possible diagnostic branches;
- one minimum question or check;
- why this check is the fastest way to reduce uncertainty.

### 4.2 Partial Data

AI-BOSS should provide:

- facts already visible;
- missing reference model;
- likely layer or class;
- alternatives;
- confidence;
- one next diagnostic step.

### 4.3 Structured Diagnostic Data

AI-BOSS should provide:

- 11-layer summary;
- strong and weak zones;
- chain of constraints;
- likely root constraint;
- why this root is stronger than alternatives;
- safe parallel actions;
- one next step.

### 4.4 Rich Documents and External Context

AI-BOSS should provide:

- evidence-backed facts;
- contradictions between sources;
- what is confirmed and what is inferred;
- external context if needed;
- diagnostic conclusion;
- decision-ready next step.

## 5. Internal Scoring

AI-BOSS should score diagnostic quality separately from business maturity.

Diagnostic quality score:

```
diagnostic_quality_score =
  intent_integrity
  + evidence_discipline
  + layer_orientation
  + reference_gate
  + upper_frame_protection
  + alternative_hypotheses
  + cause_effect_separation
  + confidence_calibration
  + one_next_move
  + parallel_safety
```

Each criterion is 0 or 1.

The score is shown as `0-10`.

Target:

- 6/10: useful diagnostic assistant;
- 7/10: solid consultant helper;
- 8/10: strong diagnostician on structured data;
- 9/10: strong diagnostician across messy inputs;
- 10/10: expert diagnostic behavior across weak, partial and rich data.

## 6. Product Rule

AI-BOSS should not improve by hard-coding answers.

It should improve by making the diagnostic loop more exact:

```
input integrity
→ evidence
→ layer map
→ reference model
→ gaps
→ hypotheses
→ cause/effect check
→ primary version
→ confidence
→ one next move
→ safe parallel work
```

## 7. Immediate Benchmark

Every diagnostic improvement must be checked against benchmark cases:

- "Нам нужна CRM"
- "Лидов много, продаж мало"
- "Выручка растёт, прибыль падает"
- "Команда не справляется"
- "Хочу выйти в новую нишу"
- "Кассовый разрыв через 2 недели"
- "РОКС ЛОГИСТИК deep diagnostic"

The benchmark should evaluate not whether AI-BOSS guessed the final answer, but whether it behaved like a 10/10 diagnostician.

## 8. Chat Diagnostic Gate

The same diagnostic bar applies to Telegram chat, not only to Web / company analysis.

Every non-light diagnostic reply should be checked for:

- input integrity;
- evidence discipline;
- layer orientation;
- reference gate;
- upper-frame protection;
- alternative hypotheses;
- cause/effect separation;
- confidence calibration;
- one next move;
- parallel safety;
- human surface quality.

The chat score is stored on the decision as `diagnosticQuality`.

The target behavior:

> AI-BOSS may have LOW data confidence, but it should still keep HIGH diagnostic discipline.

The current chat benchmark is:

```bash
npm run diagnostic:chat:excellence:check
```

This check verifies that AI-BOSS does not accept "we need CRM" as the root problem, does not jump from lead overload to hiring, and gives a concrete verification step for money, leads and team symptoms.
