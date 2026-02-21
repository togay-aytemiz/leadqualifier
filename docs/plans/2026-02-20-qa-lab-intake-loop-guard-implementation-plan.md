# QA Lab Intake Loop Guard Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reduce false missing-field penalties and prevent repetitive intake re-asking loops in AI QA Lab.

**Architecture:** Improve sector-agnostic intake fulfillment inference at coverage layer, strengthen responder-side guardrails to avoid asking fulfilled/deferred fields, and tighten Judge instructions for inferable-field handling.

**Tech Stack:** TypeScript, Vitest, Next.js App Router, QA Lab executor/coverage modules.

---

### Task 1: Add Sector-Agnostic Semantic Intake Inference

**Files:**
- Modify: `src/lib/qa-lab/intake-coverage.ts`
- Test: `src/lib/qa-lab/intake-coverage.test.ts`

Steps:
1. Add soft-deflection detection for customer replies.
2. Add sector-agnostic semantic reply heuristic for asked fields.
3. Mark one awaiting field as fulfilled via semantic inference when direct/category match is absent.
4. Add tests for positive semantic inference and deflection negative case.

### Task 2: Harden QA Responder Re-Ask Guard

**Files:**
- Modify: `src/lib/qa-lab/executor.ts`
- Test: `src/lib/qa-lab/executor.test.ts`

Steps:
1. Add helper to interpret semantically informative responses for asked fields.
2. Reuse helper in conversation field-state tracking and customer-turn adaptation.
3. Add response post-processing that removes blocked field questions (`fulfilled + deferred`).
4. Add unit tests for blocked-question stripping behavior.

### Task 3: Tighten Judge Prompt Rules

**Files:**
- Modify: `src/lib/qa-lab/executor.ts`

Steps:
1. Add explicit Judge rule: inferable next-turn values count as provided.
2. Penalize re-asking inferable/already provided fields.

### Task 4: Verify and Document

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

Steps:
1. Run targeted QA Lab tests.
2. Run `npm run build`.
3. Update Roadmap/PRD/Release notes with implemented changes.
