# Channels Full Width Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make `/settings/channels` use the full dashboard content width instead of a centered narrow shell.

**Architecture:** Remove the page-level `max-w` constraint from the channels settings route and let the card grid use one additional ultra-wide desktop column so the wider surface is visible in practice. Lock the behavior with one page-source regression test and one layout-helper test.

**Tech Stack:** Next.js App Router, React Server Components, Vitest, Tailwind CSS

---

### Task 1: Add failing regression coverage

**Files:**
- Create: `src/app/[locale]/(dashboard)/settings/channels/page.test.ts`
- Modify: `src/components/channels/channelCards.test.ts`

**Step 1: Write the failing page-source test**

Assert that the channels page source no longer uses the centered `max-w-6xl` wrapper and keeps a full-width content container.

**Step 2: Run test to verify it fails**

Run: `npm test -- --run 'src/app/[locale]/(dashboard)/settings/channels/page.test.ts' src/components/channels/channelCards.test.ts`

**Step 3: Update the grid-layout test**

Assert that the channels gallery exposes an extra ultra-wide desktop column class.

### Task 2: Implement the layout change

**Files:**
- Modify: `src/app/[locale]/(dashboard)/settings/channels/page.tsx`
- Modify: `src/components/channels/channelCards.ts`

**Step 1: Remove the narrow page shell**

Replace the centered `max-w-6xl` wrapper with a full-width container so channels can use the dashboard width.

**Step 2: Expand desktop grid usage**

Update the channels card grid classes to use a fourth column on very wide screens.

### Task 3: Verify and document

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

**Step 1: Run verification**

Run:
- `npm test -- --run 'src/app/[locale]/(dashboard)/settings/channels/page.test.ts' src/components/channels/channelCards.test.ts`
- `npm run build`

**Step 2: Update docs**

Record the full-width channels surface decision in roadmap, PRD, and release notes.
