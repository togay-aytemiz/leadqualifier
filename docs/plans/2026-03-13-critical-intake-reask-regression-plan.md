# Critical Intake Re-Ask Regression Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Prevent refusal/no-progress guardrails from re-asking common intake fields when the prior ask used semantically equivalent wording instead of exact label tokens.

**Architecture:** Keep the fix local to the shared field-matching heuristic used by intake analysis and response guards. Add regression tests first for a realistic `Telefon Numarası` wording drift case, then implement the smallest normalization/alias enhancement that makes both blocked re-ask detection and response stripping agree.

**Tech Stack:** Next.js, TypeScript, Vitest

---

### Task 1: Reproduce the regression in tests

**Files:**
- Modify: `src/lib/ai/followup.test.ts`
- Modify: `src/lib/ai/response-guards.test.ts`

**Step 1: Write the failing test**

Add one test proving `Telefon Numarası` is blocked after assistant asks with `ulaşabileceğimiz numara`, and one test proving the same wording is stripped from guarded responses.

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/lib/ai/followup.test.ts src/lib/ai/response-guards.test.ts`

Expected: FAIL on the new blocked re-ask regression coverage.

### Task 2: Fix the shared matcher

**Files:**
- Modify: `src/lib/ai/followup.ts`
- Modify: `src/lib/ai/response-guards.ts`

**Step 1: Write minimal implementation**

Extend the shared field-matching heuristic to support a narrow alias/root match for common intake concepts like phone/contact/number without broad semantic overreach.

**Step 2: Run tests to verify it passes**

Run: `npm test -- --run src/lib/ai/followup.test.ts src/lib/ai/response-guards.test.ts`

Expected: PASS

### Task 3: Verify and document

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

**Step 1: Run verification**

Run: `npm run build`

Expected: PASS

**Step 2: Update docs**

Document the regression coverage and implementation decision without overwriting unrelated in-progress edits.
