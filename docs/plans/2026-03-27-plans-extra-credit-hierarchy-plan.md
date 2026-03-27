# Plans Extra Credit Hierarchy Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make `Settings > Plans` keep the one-time extra-credit purchase as the primary action and move the custom-package contact card directly beneath it with quieter secondary styling.

**Architecture:** Keep the change inside the existing `PlansSettingsPageContent` composition so no billing logic changes. Guard the new UI hierarchy with a focused source test instead of introducing a new rendering harness for this small layout-only change.

**Tech Stack:** Next.js App Router, React Server Components, Tailwind CSS, Vitest

---

### Task 1: Lock the intended hierarchy with a source guard

**Files:**
- Modify: `src/app/[locale]/(dashboard)/settings/plans/page.source.test.ts`
- Test: `src/app/[locale]/(dashboard)/settings/plans/page.source.test.ts`

**Step 1: Write the failing test**

Add a source guard that asserts:
- `<TopupCheckoutCard` appears before `packageCatalog.customPackage.title`
- the secondary CTA styling contains neutral `border/bg/text` tokens

**Step 2: Run test to verify it fails**

Run: `npm test -- --run 'src/app/[locale]/(dashboard)/settings/plans/page.source.test.ts'`

Expected: FAIL because the custom-package card still renders above the extra-credit card.

**Step 3: Write minimal implementation**

Move the custom-package card from the package section into the extra-credit section and soften its CTA treatment.

**Step 4: Run test to verify it passes**

Run: `npm test -- --run 'src/app/[locale]/(dashboard)/settings/plans/page.source.test.ts'`

Expected: PASS.

### Task 2: Document and verify the change

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

**Step 1: Update docs**

Record the new hierarchy in roadmap/PRD update notes and add an unreleased release-note entry.

**Step 2: Run build verification**

Run: `npm run build`

Expected: Successful production build with no new regressions from this change.
