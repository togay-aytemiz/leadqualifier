# Shell Latency Follow-up Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reduce remaining refresh and route-load latency by trimming shell-side unread work, preventing hidden navigation shells from doing IO, and reducing eager settings prefetch pressure.

**Architecture:** Keep the current settings pending-count fix, then reduce repeated client work instead of attempting a risky dashboard-wide i18n refactor in one pass. Centralize unread-state fanout through lightweight browser events, switch unread checks to existence reads, gate `MainSidebar` IO behind desktop viewport detection, and stop the settings shell from prefetching every visible destination on first render.

**Tech Stack:** Next.js App Router, React 19, next-intl, Supabase JS, Vitest, Supabase SQL migrations.

---

### Task 1: Unread Path Lightening
- Files: `src/lib/inbox/unread-events.ts`, `src/lib/inbox/unread-events.test.ts`, `src/design/MainSidebar.tsx`, `src/components/common/TabTitleSync.tsx`, `supabase/migrations/00098_inbox_unread_indicator_index.sql`
- Write failing tests for unread-state event payload support.
- Verify they fail.
- Replace exact unread counts with existence reads.
- Add unread-state broadcast from the primary shell path.
- Make `TabTitleSync` use the lighter desktop path.
- Add partial index for unread conversations.
- Re-run targeted tests.

### Task 2: Hidden Shell IO Gating
- Files: `src/design/MainSidebar.tsx`, `src/design/navigation-performance.test.ts`
- Write failing source guard for desktop-only sidebar IO.
- Verify it fails.
- Add viewport detection to avoid hidden mobile `MainSidebar` reads/subscriptions.
- Re-run targeted tests.

### Task 3: Settings Prefetch Pressure Reduction
- Files: `src/components/settings/SettingsResponsiveShell.tsx`, `src/components/settings/SettingsResponsiveShell.test.tsx`, `src/design/navigation-performance.test.ts`
- Write failing source guard for disabled visible-link prefetch inside settings shell.
- Verify it fails.
- Set settings inner-nav links back to non-prefetching.
- Keep pending-count/preload stability guards intact.
- Re-run targeted tests and `npm run build`.
