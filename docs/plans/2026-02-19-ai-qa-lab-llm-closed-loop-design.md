# AI QA Lab (Manual, LLM-Driven) Design

> **Date:** 2026-02-19  
> **Status:** Proposed (design approved)

## 1. Goal

Create a manual, simulator-only quality loop that runs realistic multi-turn tests before exposing changes to real users. The system must not rely on hardcoded scenarios. Instead, each run is generated and evaluated by LLM roles with separate instructions:

- `Generator` creates knowledge fixtures and test conversations.
- `Responder` is the existing production responder pipeline (the current system under test).
- `Judge` evaluates responses, finds problems, and outputs prioritized fixes.

The goal is not just a score. The goal is actionable quality findings and concrete remediation guidance.

## 2. Locked Decisions

- Trigger model: `manual` from Admin (`AI QA Lab` page).
- Test surface: `simulator` only (no Telegram/WhatsApp path in MVP).
- Presets:
  - `Quick`: 12 scenarios, max 4 turns per scenario, max 50k tokens/run.
  - `Regression`: 24 scenarios, max 5 turns per scenario, max 100k tokens/run.
- Gate rule: any `Critical` finding => run result is `FAIL_CRITICAL`.
- Evidence storage: full text evidence (prompt, response, finding evidence snippets).
- Reporting model: findings-first, with `Top 5` prioritized action recommendations.

## 3. LLM Role Contract

### 3.1 Generator (LLM-A)

Generator uses organization context (skills, KB docs/chunks, offering profile, required intake fields, locale) and produces:

1. `KB Fixture Set`:
  - Each fixture is at least 200 lines.
  - No hardcoded canned corpus.
  - Mixes writing-quality variants:
    - Quick: 20% clean / 50% semi-noisy / 30% messy
    - Regression: 10% clean / 40% semi-noisy / 50% messy
  - Includes realistic noise: typos, partial structure, repetition, mixed clarity, inconsistent formatting.
2. `Ground Truth Manifest`:
  - canonical services
  - required intake fields
  - critical policy facts
  - disallowed fabricated claims
3. `Scenario Blueprint` and multi-turn customer messages.

### 3.2 Responder (System Under Test)

No special test model. Responses are produced by the existing simulator responder stack exactly as in product behavior.

### 3.3 Judge (LLM-B)

Judge uses separate instructions and must output:

- turn-level and conversation-level evaluation
- severity (`critical`, `major`, `minor`)
- violated rule, evidence, rationale
- suggested fix with target layer (`kb`, `skill`, `prompt`, `pipeline`)
- effort estimate and confidence
- `Top 5` prioritized action list

Judge must be evidence-driven and cannot output unsupported findings.

## 4. Scoring and Severity

Weighted score:

- `Groundedness`: 40%
- `Extraction Accuracy`: 35%
- `Conversation Quality`: 25% (includes continuity quality checks)

Critical scope (locked):

- KB-external or contradictory factual claims
- materially wrong user guidance
- safety/policy-risk violations

Major/Minor examples:

- asks too many questions in one turn
- low-relevance follow-up question
- repetitive question loops
- weak continuity transitions

## 5. Run Lifecycle

1. Admin starts run (`Quick` or `Regression`).
2. System creates immutable `run_id` snapshot (settings hash + source metadata).
3. Generator builds fixture + manifest + scenarios.
4. Scenarios are executed against simulator responder.
5. Judge evaluates all transcripts.
6. Report is written and locked.
7. Delta is computed versus prior run with same preset.

Token controls:

- hard per-run budget
- per-scenario turn cap
- controlled stop on budget exhaustion (`BUDGET_STOPPED`)

## 6. Data and Reporting

Suggested entities:

- `qa_runs`
- `qa_run_artifacts` (fixture/manifest/blueprint)
- `qa_run_cases`
- `qa_run_turns`
- `qa_run_findings`
- `qa_run_top_actions`

Report layout:

1. Run status (`FAIL_CRITICAL`, `PASS_WITH_FINDINGS`, `PASS_CLEAN`)
2. Findings (critical -> major -> minor)
3. Top 5 actions
4. Score breakdown + token usage + delta

Persistence strategy:

- Keep full run artifacts immutably in run storage.
- Do not auto-commit all fixtures to repo.
- Allow manual “promote fixture” to `docs/kb-fixtures` for high-value failing cases.

## 7. Implementation Notes (MVP)

- Start with manual run only.
- No auto-fix writes in MVP.
- Admin reviews findings, applies changes manually, reruns preset.
- Target outcome is stable iterative quality improvement with transparent risk reporting.
