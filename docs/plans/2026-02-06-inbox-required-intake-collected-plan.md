# Inbox Required Intake Collected Fields Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show collected required-intake information in Inbox > Lead section, based on Organization Settings required fields.

**Architecture:** Extend lead extraction payload to persist structured `required_intake_collected` into `leads.extracted_fields`. Add a small resolver utility that maps Organization required fields to collected values (including backward-compatible fallback from existing extracted fields). Render this resolved list in Inbox lead details.

**Tech Stack:** Next.js App Router, TypeScript, Supabase, Vitest, next-intl.

---

### Task 1: Add required-intake resolver utility (TDD)

**Files:**
- Create: `src/lib/leads/required-intake.ts`
- Create: `src/lib/leads/required-intake.test.ts`

**Steps:**
1. Write failing tests for resolved collected entries and fallback mappings.
2. Run tests and confirm failure.
3. Implement minimal resolver utility.
4. Re-run tests to pass.

### Task 2: Persist collected required-intake values during extraction

**Files:**
- Modify: `src/lib/leads/extraction.ts`
- Modify: `src/lib/leads/extraction.test.ts`

**Steps:**
1. Add failing test for parsing `required_intake_collected`.
2. Update extraction prompt + parser normalization to include `required_intake_collected`.
3. Store normalized object under `leads.extracted_fields.required_intake_collected`.
4. Run extraction tests.

### Task 3: Render collected required info in Inbox lead card

**Files:**
- Modify: `src/app/[locale]/(dashboard)/inbox/page.tsx`
- Modify: `src/components/inbox/InboxContainer.tsx`
- Modify: `messages/en.json`
- Modify: `messages/tr.json`

**Steps:**
1. Load org required fields on inbox page.
2. Pass required fields to `InboxContainer`.
3. Resolve collected required entries from lead snapshot and render them in Lead section.
4. Add EN/TR translation keys.

### Task 4: Verify + docs

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

**Steps:**
1. Run targeted tests + `npm run build`.
2. Update roadmap/PRD/release notes.
3. Inspect diff for unintended changes.
