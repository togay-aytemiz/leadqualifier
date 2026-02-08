# Knowledge Mobile Single-Pane Flow Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Convert the Knowledge Base experience to a mobile single-pane flow while preserving the current desktop layout and behavior.

**Architecture:** Keep desktop Knowledge layout unchanged (`lg` and above), and make mobile render one pane at a time by hiding the left Knowledge sidebar in small viewports. Improve mobile readability by rendering file entries as cards instead of a dense table on small screens.

**Tech Stack:** Next.js App Router, React client components, Tailwind CSS, next-intl, Vitest.

---

### Task 1: Add mobile card helper with TDD

**Files:**
- Create: `src/app/[locale]/(dashboard)/knowledge/components/mobileEntryPreview.ts`
- Create: `src/app/[locale]/(dashboard)/knowledge/components/mobileEntryPreview.test.ts`

**Step 1: Write the failing test**
- Add tests for whitespace normalization, truncation with ellipsis, and empty-content fallback.

**Step 2: Run test to verify it fails**
- Run: `npm test -- src/app/[locale]/(dashboard)/knowledge/components/mobileEntryPreview.test.ts`
- Expected: FAIL because helper file does not exist.

**Step 3: Write minimal implementation**
- Implement `formatMobileEntryPreview(content)` with deterministic truncation and fallback output.

**Step 4: Run test to verify it passes**
- Run: `npm test -- src/app/[locale]/(dashboard)/knowledge/components/mobileEntryPreview.test.ts`
- Expected: PASS.

### Task 2: Apply mobile single-pane layout and mobile list rendering

**Files:**
- Modify: `src/app/[locale]/(dashboard)/knowledge/layout.tsx`
- Modify: `src/app/[locale]/(dashboard)/knowledge/components/KnowledgeContainer.tsx`
- Modify: `src/app/[locale]/(dashboard)/knowledge/components/KnowledgeTable.tsx`
- Modify: `src/app/[locale]/(dashboard)/knowledge/components/FolderCard.tsx`

**Step 1: Make layout single-pane on mobile**
- Hide `KnowledgeSidebar` below `lg`, keep current desktop structure unchanged.

**Step 2: Improve mobile spacing in container**
- Keep desktop classes intact.
- Make mobile paddings and section spacing compact.

**Step 3: Render mobile card list for entries**
- Keep current desktop `DataTable` for `lg` and above.
- Add `lg:hidden` card list for mobile using existing i18n labels and status/type badges.

**Step 4: Ensure folder card actions remain usable on touch screens**
- Keep desktop hover-only behavior.
- Make action affordance visible on mobile.

### Task 3: Documentation and verification

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

**Step 1: Update roadmap and PRD notes**
- Add mobile Knowledge Base single-pane flow entry and update Last Updated date context.

**Step 2: Update release notes**
- Add an `[Unreleased]` item for the mobile Knowledge Base flow and responsive list update.

**Step 3: Run full build verification**
- Run: `npm run build`
- Expected: Successful build with no type/runtime compile errors.
