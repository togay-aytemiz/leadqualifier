# Required Intake Fallback Fix Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Prevent unrelated extracted fields like `location` from populating semantically different required-intake labels such as `Hamilelik Durumu`.

**Architecture:** Reproduce the bug in `resolveCollectedRequiredIntake`, then replace substring-based fallback matching with token-aware hint matching so short hints like `il` only match standalone field tokens. Keep the existing fallback behavior for genuine date/location/budget/service labels.

**Tech Stack:** TypeScript, Vitest

---

### Task 1: Add regression coverage

**Files:**
- Modify: `src/lib/leads/required-intake.test.ts`
- Test: `src/lib/leads/required-intake.test.ts`

**Step 1: Write the failing test**

Add a test where:
- required field is `Hamilelik Durumu`
- extracted fields contain `location: 'Ankara'`
- result should be `[]`

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/lib/leads/required-intake.test.ts`

Expected: FAIL because current fallback logic matches `il` inside `hamilelik`.

### Task 2: Tighten fallback hint matching

**Files:**
- Modify: `src/lib/leads/required-intake.ts`
- Test: `src/lib/leads/required-intake.test.ts`

**Step 1: Implement minimal matcher fix**

Change fallback matching to:
- tokenize normalized field labels
- match hints on token boundaries
- allow safe prefix matches like `tarih` -> `tarihi`
- avoid raw substring matching across the whole field label

**Step 2: Run the focused test suite**

Run: `npm test -- --run src/lib/leads/required-intake.test.ts`

Expected: PASS

### Task 3: Verify and document

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

**Step 1: Run broader verification**

Run:
- `npm test -- --run src/lib/leads/required-intake.test.ts`
- `npm run build`

Expected: PASS

**Step 2: Update docs**

Record the required-intake fallback bug fix in roadmap, PRD update notes if behavior contract changed, and release notes under `[Unreleased]`.
