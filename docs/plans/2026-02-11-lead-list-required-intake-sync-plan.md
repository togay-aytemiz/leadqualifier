# Lead List Required Intake Sync Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ensure required-intake values shown in Inbox details are also shown consistently in Leads list rows.

**Architecture:** Reuse the existing `resolveCollectedRequiredIntake` resolver in lead list helper utilities so both Inbox details and Leads list read the same normalized source (`required_intake_collected` + fallbacks). Update tests to lock behavior and prevent regression.

**Tech Stack:** Next.js App Router, TypeScript, Vitest, next-intl

---

### Task 1: Add a failing test for required-intake extraction in lead list helper

**Files:**
- Modify: `/Users/togay/Desktop/leadqualifier/src/components/leads/mobile-table.test.ts`

**Step 1: Write the failing test**
- Add a test where `extracted_fields.required_intake_collected` contains values and assert mobile required hints return those values.

**Step 2: Run test to verify it fails**
- Run: `npm run test -- src/components/leads/mobile-table.test.ts`
- Expected: FAIL because current helper reads only top-level extracted fields.

### Task 2: Implement minimal resolver reuse in lead list helpers

**Files:**
- Modify: `/Users/togay/Desktop/leadqualifier/src/components/leads/mobile-table.ts`
- Modify: `/Users/togay/Desktop/leadqualifier/src/components/leads/LeadsTable.tsx`

**Step 1: Add shared required-field resolver helper**
- In mobile-table helper, read required fields through `resolveCollectedRequiredIntake`.

**Step 2: Wire desktop table cells to the same helper**
- Replace direct `extracted_fields[field]` reads with resolver-backed values.

**Step 3: Keep existing summary/mobile behavior intact**
- Ensure only field extraction logic changes.

### Task 3: Verify and update docs

**Files:**
- Modify: `/Users/togay/Desktop/leadqualifier/docs/ROADMAP.md`
- Modify: `/Users/togay/Desktop/leadqualifier/docs/PRD.md`
- Modify: `/Users/togay/Desktop/leadqualifier/docs/RELEASE.md`

**Step 1: Run focused tests and full build**
- Run: `npm run test -- src/components/leads/mobile-table.test.ts`
- Run: `npm run build`

**Step 2: Update project docs**
- Mark roadmap item if applicable, add PRD tech decision note, and add release note entry under `[Unreleased]`.
