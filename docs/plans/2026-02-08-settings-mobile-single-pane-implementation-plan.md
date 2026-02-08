# Mobile Settings Single-Pane Flow Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Convert Settings mobile UX to app-style single-pane navigation (settings list first, then detail pages) while preserving existing desktop layout.

**Architecture:** Introduce a shared responsive Settings shell that renders the existing desktop sidebar/content split on large screens and animated list/detail panes on mobile. Route-level Settings pages delegate sidebar rendering to this shell, and mobile header back events trigger animated exit before returning to `/settings`.

**Tech Stack:** Next.js App Router, React client components, Tailwind utility classes, next-intl, Vitest.

---

### Task 1: Add mobile pane-state helpers (TDD first)

**Files:**
- Create: `src/components/settings/mobilePaneState.ts`
- Create/Test: `src/components/settings/mobilePaneState.test.ts`

**Steps:**
1. Write failing tests for list/detail transition classes and settings detail-route detection.
2. Run test to verify failure.
3. Implement helper functions/constants.
4. Re-run tests to confirm pass.

### Task 2: Build shared responsive Settings shell

**Files:**
- Create: `src/components/settings/SettingsResponsiveShell.tsx`
- Update: `src/design/primitives.tsx`

**Steps:**
1. Create a shared shell that renders:
   - Desktop: unchanged sidebar + content split
   - Mobile: animated list pane + animated detail pane
2. Add event-driven mobile back handling (`settings-mobile-back`) with exit animation before navigation.
3. Add mobile-only back button behavior in `PageHeader` for settings detail routes.

### Task 3: Refactor Settings routes to use shared shell

**Files:**
- Update: `src/app/[locale]/(dashboard)/settings/profile/page.tsx`
- Update: `src/app/[locale]/(dashboard)/settings/organization/page.tsx`
- Update: `src/app/[locale]/(dashboard)/settings/general/page.tsx`
- Update: `src/app/[locale]/(dashboard)/settings/general/GeneralSettingsClient.tsx`
- Update: `src/app/[locale]/(dashboard)/settings/ai/page.tsx`
- Update: `src/app/[locale]/(dashboard)/settings/channels/page.tsx`
- Update: `src/app/[locale]/(dashboard)/settings/billing/page.tsx`
- Create: `src/app/[locale]/(dashboard)/settings/page.tsx`

**Steps:**
1. Move duplicated sidebar markup out of route pages into the shared shell.
2. Keep existing desktop behavior unchanged.
3. Add new `/settings` landing page for mobile-first settings list entry.

### Task 4: Update mobile settings entrypoint and verify

**Files:**
- Update: `src/design/MobileBottomNav.tsx`
- Update/Test: `src/design/mobile-navigation.test.ts`

**Steps:**
1. Point mobile “Ayarlar” shortcut to `/settings`.
2. Keep active-tab behavior under `other`.
3. Run focused tests and full build.

### Task 5: Update product docs/release notes

**Files:**
- Update: `docs/ROADMAP.md`
- Update: `docs/PRD.md`
- Update: `docs/RELEASE.md`

**Steps:**
1. Mark mobile Settings single-pane work as completed in roadmap.
2. Add PRD notes for mobile settings flow and navigation prefetch target update.
3. Add release notes under `[Unreleased]`.
