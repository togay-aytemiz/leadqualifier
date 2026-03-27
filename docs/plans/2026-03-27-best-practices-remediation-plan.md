# Best Practices Remediation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove the audit findings from the dashboard app by fixing React state-sync anti-patterns, accessibility/interaction issues, and the Supabase webhook indexing gap while keeping lint, tests, and build green.

**Architecture:** Keep behavior changes minimal. Fix shared primitives first when they are true roots of repeated lint findings, then patch component-level semantics and state flow in the smallest possible steps. Add a dedicated migration for webhook lookup indexes instead of mutating existing migrations.

**Tech Stack:** Next.js 16 App Router, React 19, next-intl, Tailwind CSS, Supabase/Postgres, Vitest, ESLint

---

### Task 1: Capture Baseline Failures

**Files:**
- Modify: `docs/plans/2026-03-27-best-practices-remediation-plan.md`
- Test: `npm run lint`
- Test: `npm run build`

**Step 1: Run the lint gate and record the failing files**

Run: `npm run lint`
Expected: FAIL with current React hook/state-sync, accessibility-adjacent, and TypeScript lint errors.

**Step 2: Run the production build to confirm the current compile baseline**

Run: `npm run build`
Expected: PASS so remediation can focus on best-practice and lint issues without build breakage.

### Task 2: Add Regression Coverage For Interactive Semantics

**Files:**
- Modify: `src/components/skills/SkillCard.tsx`
- Modify: `src/app/[locale]/(dashboard)/knowledge/components/FolderCard.tsx`
- Modify: `src/app/[locale]/(dashboard)/knowledge/components/KnowledgeTable.tsx`
- Test: existing nearby test files or add focused tests if coverage is missing

**Step 1: Write failing tests for keyboard/semantic interaction where test harness already exists**

Add tests that prove:
- edit actions are rendered as links, not nested button/link combinations
- clickable folder/file surfaces expose button or link semantics instead of plain div/tr click handlers

**Step 2: Run the targeted tests to verify the failures**

Run: targeted `vitest` command for the touched component tests.
Expected: FAIL before implementation.

**Step 3: Implement the minimal semantic fixes**

Replace invalid click containers with semantic buttons/links and keep nested action controls separate.

**Step 4: Re-run the targeted tests**

Run: same targeted `vitest` command.
Expected: PASS.

### Task 3: Remove React State-Sync Anti-Patterns

**Files:**
- Modify: `src/design/primitives.tsx`
- Modify: `src/app/[locale]/(dashboard)/knowledge/components/FolderModal.tsx`
- Modify: `src/app/[locale]/(dashboard)/settings/plans/SubscriptionPlanCatalog.tsx`
- Modify: `src/components/channels/WhatsAppTemplateModal.tsx`
- Modify: `src/components/inbox/TemplatePickerModal.tsx`
- Modify: `src/components/channels/ChannelsList.tsx`
- Modify: additional lint-failing files surfaced by `npm run lint`

**Step 1: For each file, write or extend a focused test where behavior is user-visible**

Cover modal reset behavior, portal rendering behavior, and route prefetch behavior where practical.

**Step 2: Run each targeted test and verify it fails or reproduces the current anti-pattern**

Run: focused `vitest` commands per file cluster.
Expected: FAIL or reproduce before code changes.

**Step 3: Implement minimal state-flow fixes**

Use render-time derivation, event-driven resets, lazy initialization, memoization, or keyed remounting instead of synchronous `setState` in render/effects.

**Step 4: Re-run targeted tests**

Run: same focused `vitest` commands.
Expected: PASS.

### Task 4: Fix Inbox Attachment Interaction

**Files:**
- Modify: `src/components/inbox/InboxContainer.tsx`
- Test: add or extend inbox component tests near attachment/composer coverage

**Step 1: Add a failing regression test for preview/remove interaction**

The test should prove preview and remove are separate accessible actions and that remove is not nested inside another button.

**Step 2: Run the targeted test**

Run: focused `vitest` command for inbox attachment/composer tests.
Expected: FAIL before implementation.

**Step 3: Implement the minimal markup change**

Split preview and remove into sibling controls or make the preview surface non-button while preserving current UX.

**Step 4: Re-run the targeted test**

Run: same focused `vitest` command.
Expected: PASS.

### Task 5: Add Supabase Index Support For Webhook Lookups

**Files:**
- Create: `supabase/migrations/00101_channel_webhook_lookup_indexes.sql`
- Modify: `src/app/api/webhooks/whatsapp/route.ts` only if query shape needs a stable indexed form
- Modify: `src/app/api/webhooks/telegram/route.ts` only if query shape needs a stable indexed form

**Step 1: Add a new migration with expression/partial indexes for webhook token lookups**

Index:
- active WhatsApp channel verify token lookups
- Telegram webhook secret lookups
- preserve multi-tenant safety and current query semantics

**Step 2: Run a quick schema sanity check**

Run: project migration/lint command if available, otherwise inspect SQL carefully and keep query shapes aligned.
Expected: no syntax issues.

### Task 6: Clean Remaining Lint Failures

**Files:**
- Modify: remaining files reported by `npm run lint`

**Step 1: Re-run lint after the primary fixes**

Run: `npm run lint`
Expected: smaller remaining error set.

**Step 2: Fix the remaining concrete issues one by one**

Address:
- `any` types in Instagram webhook
- `useEffectEvent` misuse in calendar client
- unused imports/vars
- remaining `react-hooks/set-state-in-effect` violations

**Step 3: Re-run lint until clean**

Run: `npm run lint`
Expected: PASS.

### Task 7: Update Project Documentation

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

**Step 1: Update roadmap completion items and last updated date**

Mark the remediation work done and add any newly discovered follow-up items only if scope expanded.

**Step 2: Update PRD tech decisions if implementation changed expectations**

Add decisions around semantic interaction fixes, React state-flow constraints, or webhook indexing only if they materially changed the implementation contract.

**Step 3: Update release notes**

Add the fixes under `[Unreleased]` using `Added`, `Changed`, and `Fixed` as appropriate.

### Task 8: Final Verification

**Files:**
- Test: targeted `vitest` commands for touched areas
- Test: `npm run lint`
- Test: `npm run build`

**Step 1: Run all touched targeted tests**

Expected: PASS.

**Step 2: Run lint**

Run: `npm run lint`
Expected: PASS.

**Step 3: Run build**

Run: `npm run build`
Expected: PASS.

**Step 4: Prepare commit**

Commit message: `fix(phase-9): remediate app best-practice regressions`
