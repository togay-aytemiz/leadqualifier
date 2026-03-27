# Dashboard Workspace Navigation Followup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reduce perceived navigation latency for `Inbox`, `Calendar`, `Leads`, `Skills`, and `Knowledge Base` so they benefit from the same route-transition polish already applied to `Settings`.

**Architecture:** Keep the existing dashboard prefetch/optimistic-route infrastructure, then trim per-route critical path. Use top-level `next/dynamic` boundaries for heavy client containers and remove the non-essential server-side inbox thread bootstrap so the route can paint sooner while the selected thread hydrates client-side.

**Tech Stack:** Next.js App Router, React Server Components, `next/dynamic`, `next-intl`, Vitest.

---

### Task 1: Add failing source guards for the intended performance behaviors

**Files:**
- Modify: `src/design/navigation-performance.test.ts`

**Step 1: Write the failing test**

Add source assertions that require:
- `Inbox`, `Calendar`, `Leads`, `Skills`, and `Knowledge` pages to import `next/dynamic`
- those pages to render route-scoped lazy wrappers instead of importing the heavy client container directly
- `Inbox` page to stop awaiting `getConversationThreadPayload(...)` during the initial server render

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/design/navigation-performance.test.ts`
Expected: FAIL because the listed pages still import heavy client containers directly and inbox still bootstraps the first thread on the server.

### Task 2: Implement route-level lazy loading and inbox critical-path trimming

**Files:**
- Modify: `src/app/[locale]/(dashboard)/inbox/page.tsx`
- Modify: `src/app/[locale]/(dashboard)/calendar/page.tsx`
- Modify: `src/app/[locale]/(dashboard)/leads/page.tsx`
- Modify: `src/app/[locale]/(dashboard)/skills/page.tsx`
- Modify: `src/app/[locale]/(dashboard)/knowledge/page.tsx`

**Step 1: Write minimal implementation**

- Add `next/dynamic` wrappers for the five heavy route containers with route-appropriate fallback skeletons.
- Keep server data fetching intact where it is required for first paint.
- Remove the initial server-side inbox thread fetch so the page only loads the conversation list and related metadata; let `InboxContainer` fetch the selected thread on mount using its existing client cache/fetch flow.

**Step 2: Run the focused test**

Run: `npm test -- --run src/design/navigation-performance.test.ts`
Expected: PASS

### Task 3: Verify no regressions and update project docs

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

**Step 1: Run broader verification**

Run:
- `npm run build`

Expected: PASS

**Step 2: Update project tracking docs**

- Add roadmap/PRD/release notes covering the cross-route navigation optimization
- Update the relevant `Last Updated` dates

**Step 3: Commit**

```bash
git add docs/plans/2026-03-27-dashboard-workspace-navigation-followup-plan.md src/design/navigation-performance.test.ts src/app/[locale]/(dashboard)/inbox/page.tsx src/app/[locale]/(dashboard)/calendar/page.tsx src/app/[locale]/(dashboard)/leads/page.tsx src/app/[locale]/(dashboard)/skills/page.tsx src/app/[locale]/(dashboard)/knowledge/page.tsx docs/ROADMAP.md docs/PRD.md docs/RELEASE.md
git commit -m "perf(phase-9): speed up workspace route transitions"
```
