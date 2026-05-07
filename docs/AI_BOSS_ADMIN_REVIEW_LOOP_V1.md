# AI-BOSS Admin Review Loop v1

## 1. Purpose

The Admin Review Loop turns AI-BOSS from a bot that produces good answers into a system that can inspect, improve and govern its own behavior on real cases.

It does not replace the diagnostic engine.

It reviews the decision objects produced by the core behavior architecture.

Core loop:

```
decision object
→ auto review
→ admin review
→ error classification
→ improvement proposal
→ owner decision
→ product task
→ outcome update
→ learning
```

## 2. Source Objects

The review loop works with `decisionObject` records stored inside snapshots.

Each reviewed object must include:

- `schemaVersion`;
- `createdAt`;
- `reviewStatus`;
- `businessStateMode`;
- `operatingMode`;
- `dataConfidence`;
- `diagnosticQuality`;
- `reasonCodes`;
- `ownerDecisionRequired`;
- `ownerDecisionType`;
- `modeSwitch`;
- `workingHypothesis`;
- `nextMove`;
- `executionContainer`;
- `userFacingSummary`;
- `internalReasoningSummary`;
- `hiddenEvaluation`;
- `improvementProposalIds`;
- `outcome`.

The review source should also expose links back to the original conversation:

```json
{
  "conversationId": "",
  "messageId": "",
  "snapshotId": ""
}
```

These fields can live in review metadata if they are not already present in the stored decision object. The goal is simple: an admin must be able to open the original message, answer and snapshot without guessing where the reviewed decision came from.

## 3. Review Status Lifecycle

Allowed values:

- `not_reviewed`;
- `auto_reviewed`;
- `reviewed`;
- `needs_improvement`;
- `accepted`;
- `rejected`.

### not_reviewed

Default status after a decision object is created.

Use when:

- no automatic or manual review has been applied yet.

### auto_reviewed

The object passed automated checks.

Use when:

- required fields are present;
- schema version is readable;
- basic evals did not find a contract violation;
- no manual conclusion has been made yet.

Important:

`auto_reviewed` does not mean the answer was good. It means the object is structurally reviewable and passed automated gates.

### reviewed

An admin has reviewed the answer and did not mark it as accepted, rejected or requiring improvement.

Use when:

- the answer is acceptable enough for observation;
- no product change is required;
- outcome may still be unknown.

### needs_improvement

The answer or decision logic exposed a fixable issue.

Use when:

- the mode was wrong;
- the diagnosis was weak;
- the next move was vague;
- the owner authority boundary was missed;
- the execution container was incomplete;
- the answer was too heavy, too shallow or too template-like.

### accepted

The reviewed answer or behavior pattern is considered a good example.

Use when:

- the answer should become a benchmark;
- the logic should be preserved;
- the response can be used as a positive training case.

### rejected

The answer or decision logic should not be repeated.

Use when:

- it was factually wrong;
- it violated methodology;
- it overstepped owner authority;
- it gave action without enough evidence;
- it confused symptom and cause;
- it created risk.

## 4. Which Decision Objects Enter Review

Not every answer needs manual review.

Manual review should prioritize:

- high diagnostic quality claims;
- low data confidence with strong recommendations;
- `ownerDecisionRequired = true`;
- `ownerDecisionType` not equal to `none`;
- `transition = diagnosis_to_execution`;
- `modeSwitch.occurred = true`;
- crisis, exit preparation and rebuild modes;
- user complaints or negative feedback;
- failed or skipped outcomes;
- answers selected by sampling.

Automatic review should run on every decision object.

## 5. Admin View

The admin should see:

- original user message;
- assistant answer;
- company / case context;
- `userFacingSummary`;
- `internalReasoningSummary`;
- `businessStateMode`;
- `operatingMode`;
- `dataConfidence`;
- `diagnosticQuality`;
- `reasonCodes`;
- `ownerDecisionRequired`;
- `ownerDecisionType`;
- `workingHypothesis`;
- `nextMove`;
- `executionContainer`;
- evidence summary;
- current `reviewStatus`;
- `reviewerNotes`;
- `autoReviewFindings`;
- linked improvement proposals;
- outcome status.

The admin should not need to inspect raw model internals to understand why the answer happened.

## 6. Error Types

Each review can assign one or more error types.

### mode_error

AI-BOSS selected the wrong operating mode.

Examples:

- explained methodology when it should diagnose;
- diagnosed when it should ask one minimal question;
- moved into CEO mode without owner-level decision.

### business_state_error

AI-BOSS identified the wrong business state.

Examples:

- treated a cash crisis as normal stabilization;
- treated strategic rebuild as a local commercial issue;
- treated growth overload as team weakness too early.

### diagnostic_error

The diagnostic logic was weak.

Examples:

- accepted user interpretation as fact;
- confused cause and effect;
- ignored upper-layer explanation;
- did not build alternatives;
- selected a shallow constraint.

### evidence_error

The answer overstated certainty or used weak evidence.

Examples:

- claimed data was known when it was only user words;
- ignored missing reference model;
- did not mark uncertainty.

### execution_error

The answer did not create a usable execution container.

Examples:

- no owner;
- no executor;
- no metric;
- no review moment;
- next move too abstract.

### owner_authority_error

AI-BOSS acted as if it could decide for the owner.

Examples:

- changed segment, pricing, public promise or process without a fork;
- suggested irreversible action without confirmation;
- did not mark owner decision required.

### communication_error

The answer was hard for the user to understand.

Examples:

- too many internal terms;
- too template-like;
- too long;
- no clear call to action;
- method exposed without user request.

### product_gap

The answer exposed a missing product capability.

Examples:

- no way to capture outcome;
- no admin control for review;
- no data source connector;
- no task object for the next move.

## 7. Improvement Proposal

An improvement proposal is a structured suggestion created from review.

Important distinction:

- `severity` means how dangerous the error is;
- `priority` means how fast the team should work on it.

Examples:

- `owner_authority_error` is usually high or critical severity;
- `communication_error` is usually low or medium severity;
- a low-severity issue can still have high priority if it affects many users;
- a high-severity issue can have medium priority if it happened once and has a clear manual guard.

Minimum fields:

```json
{
  "id": "...",
  "createdAt": "ISO_DATE",
  "sourceDecisionObjectId": "...",
  "conversationId": "",
  "messageId": "",
  "snapshotId": "",
  "status": "proposed",
  "errorTypes": ["diagnostic_error"],
  "severity": "low | medium | high | critical",
  "summary": "...",
  "recommendedChange": "...",
  "targetArea": "prompt | orchestrator | eval | ui | data | execution",
  "priority": "low | medium | high | critical",
  "reviewerNotes": "",
  "positivePattern": {
    "isBenchmarkCandidate": false,
    "why": ""
  },
  "ownerDecisionRequired": false,
  "acceptedBy": "",
  "rejectedReason": "",
  "linkedTaskId": ""
}
```

Proposal statuses:

- `proposed`;
- `accepted`;
- `rejected`;
- `converted_to_task`;
- `done`.

## 8. Owner Decision

Alexander should accept or reject improvement proposals that affect:

- methodology;
- positioning;
- public promise;
- owner authority boundaries;
- business logic;
- product direction;
- paid consulting workflow.

Alexander or another reviewer should be able to add `reviewerNotes` before accepting or rejecting a proposal.

For accepted positive cases, the reviewer should be able to mark:

```json
{
  "positivePattern": {
    "isBenchmarkCandidate": true,
    "why": "The answer separated symptom and cause, kept uncertainty visible and gave one executable next move."
  }
}
```

This allows strong answers to become benchmarks, not just approved records.

The system can auto-accept only low-risk mechanical improvements:

- missing required field checks;
- typo fixes in admin labels;
- additional eval assertions;
- non-behavioral logging.

## 9. From Proposal To Product Task

Accepted proposals should become product tasks when they require implementation.

Task should include:

- source proposal;
- target module;
- expected behavior change;
- eval to add or update;
- acceptance criteria;
- priority;
- owner;
- status.

Rule:

No behavior-changing improvement should be considered done without an eval or a clear manual review criterion.

## 10. Outcome Update

The review loop must eventually update the decision object's `outcome`.

Allowed outcome statuses:

- `unknown`;
- `completed`;
- `failed`;
- `skipped`.

Outcome fields:

- `status`;
- `resultSummary`;
- `learned`.

Examples:

```json
{
  "status": "completed",
  "resultSummary": "The user gathered 7 deals and confirmed margin loss came from discounting and delivery overruns.",
  "learned": "Finance symptom was connected to pricing and operations, not only cost structure."
}
```

## 11. Learning Rules

Learning should update the system only when there is enough evidence.

Do not update core logic from one weak case.

Use one case to:

- create a proposal;
- add an eval candidate;
- mark a pattern to watch.

Use repeated cases to:

- change orchestrator heuristics;
- change prompt rules;
- update diagnostic benchmarks;
- change product workflow.

## 12. Automatic Review Checks

Automatic review should check:

- decision object has `schemaVersion`;
- schema version is supported;
- `createdAt` is valid ISO date;
- `reviewStatus` is allowed;
- `reasonCodes` exist;
- `ownerDecisionRequired` is boolean;
- `ownerDecisionType` is present;
- serious answers have `workingHypothesis`;
- `diagnosis_to_execution` has execution container fields;
- `userFacingSummary` exists;
- `internalReasoningSummary` exists;
- `outcome.status` is allowed.

If all structural checks pass:

- set `reviewStatus = auto_reviewed`.

If checks fail:

- set `reviewStatus = needs_improvement`;
- add `autoReviewFindings`.

Automatic review should create an improvement proposal only for critical structural violations.

For ordinary structural issues, it should not flood the admin with proposals. It should:

- mark `needs_improvement`;
- store `autoReviewFindings`;
- let a human decide whether a proposal is needed.

Example:

```json
{
  "autoReviewFindings": [
    {
      "code": "missing_owner_decision_type",
      "severity": "medium",
      "message": "ownerDecisionRequired is true, but ownerDecisionType is empty."
    }
  ]
}
```

Proposal auto-creation is allowed only when:

- schema is unreadable;
- owner authority fields are missing on a high-risk decision;
- execution transition has no execution container;
- source linkage is absent and the object cannot be reviewed;
- the answer creates a critical safety, legal, financial or reputational risk.

## 13. Manual Review Questions

The admin should answer:

1. Did AI-BOSS choose the right business state?
2. Did it choose the right operating mode?
3. Did it protect owner authority?
4. Did it separate fact, interpretation and hypothesis?
5. Did it avoid shallow symptom-fixing?
6. Did it choose one next move?
7. Was the next move executable?
8. Was the language clear and human?
9. Should this become a positive benchmark or an improvement proposal?

## 14. MVP Scope

For the first implementation, keep it simple.

MVP should include:

- list of decision objects;
- filters by reviewStatus, mode, business state and date;
- detail view with user message, answer and decision object;
- buttons:
  - mark reviewed;
  - mark accepted;
  - mark rejected;
  - needs improvement;
  - create improvement proposal;
- outcome editor;
- basic automatic structural review.

MVP review metadata should include:

- `conversationId`;
- `messageId`;
- `snapshotId`;
- `reviewerNotes`;
- `autoReviewFindings`;
- `severity`;
- `positivePattern`.

Do not build yet:

- complex scoring dashboards;
- team permissions;
- automatic prompt rewriting;
- full task management;
- model fine-tuning workflow.

## 15. Implementation Prompt

When this spec is handed to implementation, the prompt should be:

> Implement Admin Review Loop on top of existing decisionObject records in snapshots.
> Do not change the diagnostic engine.
> Do not change the Supabase schema if review metadata can be stored inside snapshot / decisionObject JSON.
> Build the MVP: list, filters, detail card, statuses, proposal creation, outcome editor and automatic structural review.
> Auto-review should create proposals only for critical structural violations; otherwise it should store autoReviewFindings and mark the object needs_improvement.

## 16. Final Principle

Admin Review Loop exists to improve behavior without making the user experience heavier.

The user should still feel:

> AI-BOSS gives one clear, human next move.

The system should know:

> why this answer happened, whether it was good, what failed, what improved and what should change next.
