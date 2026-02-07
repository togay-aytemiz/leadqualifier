# Skills Single List Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove the "core skills vs custom skills" split and show one unified skills list where users can manage both default and user-added skills together.

**Architecture:** Update the existing `SkillsContainer` UI to a single list flow with no tab state or tab-dependent empty states. Keep backend skill CRUD unchanged; this is a presentation and wording simplification only. Update localization and product docs to match the decision.

**Tech Stack:** Next.js App Router, React, next-intl, TypeScript, Vitest, Supabase (unchanged for this task)

---

### Task 1: Remove tab split from skills UI

**Files:**
- Modify: `/Users/togay/Desktop/leadqualifier/src/components/skills/SkillsContainer.tsx`

**Step 1: Update list panel layout**
- Remove `activeTab` state and tab buttons.
- Keep search + single list rendering.

**Step 2: Update right panel behavior**
- Remove `activeTab === 'core'` conditional.
- Preserve existing create/edit/no-selection states.

**Step 3: Verify local behavior**
- Run: `npm test -- --run src/lib/ai/escalation.test.ts`
- Run: `npm run build`

### Task 2: Clean i18n keys used by removed tab UI

**Files:**
- Modify: `/Users/togay/Desktop/leadqualifier/messages/tr.json`
- Modify: `/Users/togay/Desktop/leadqualifier/messages/en.json`

**Step 1: Remove obsolete keys**
- Remove `skills.tabs` and `skills.core` sections no longer used by UI.

**Step 2: Verify parity**
- Run: `npm run lint`

### Task 3: Update product docs for the new single-list decision

**Files:**
- Modify: `/Users/togay/Desktop/leadqualifier/docs/PRD.md`
- Modify: `/Users/togay/Desktop/leadqualifier/docs/ROADMAP.md`
- Modify: `/Users/togay/Desktop/leadqualifier/docs/RELEASE.md`

**Step 1: Record behavior change**
- PRD: skills management wording reflects single-list approach.
- Roadmap: add/check item tracking this UI simplification.
- Release: add note under `[Unreleased]`.

**Step 2: Final verification**
- Run: `npm run build`
