# Calendar Settings IA Refresh Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move calendar configuration into `Settings > Calendar`, move Google Calendar management into `Settings > Applications`, and make the calendar workspace route users into those dedicated settings surfaces.

**Architecture:** Reuse the existing calendar settings draft/actions layer, but split the UI into two dedicated settings pages. `Settings > Calendar` will own booking rules, working hours, and service durations with AI-settings-style tabs; `Settings > Applications` will own Google Calendar connection management and expose connection state back into the calendar settings page as status-only context.

**Tech Stack:** Next.js App Router, next-intl, shared server actions, Vitest, Tailwind UI primitives

---

### Task 1: Lock the new settings IA with tests

**Files:**
- Modify: `src/components/settings/SettingsResponsiveShell.test.tsx`
- Modify: `src/components/settings/mobilePaneState.test.ts`
- Modify: `src/app/[locale]/(dashboard)/calendar/page.test.ts`
- Modify: `src/app/[locale]/(dashboard)/settings/organization/OrganizationSettingsClient.test.tsx`
- Modify: `src/app/[locale]/(dashboard)/settings/calendar/page.test.ts`
- Modify: `src/app/[locale]/(dashboard)/settings/apps/page.test.ts`

**Step 1: Write the failing tests**

Assert that:
- settings navigation includes `calendar` and `apps`
- mobile pane routing resolves `calendar` and `apps`
- calendar workspace links to `/settings/calendar` and no longer keeps a settings modal
- organization settings no longer expose a calendar tab
- dedicated `settings/calendar` and `settings/apps` routes enforce workspace access

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/components/settings/SettingsResponsiveShell.test.tsx src/components/settings/mobilePaneState.test.ts src/app/[locale]/(dashboard)/calendar/page.test.ts src/app/[locale]/(dashboard)/settings/calendar/page.test.ts src/app/[locale]/(dashboard)/settings/apps/page.test.ts src/app/[locale]/(dashboard)/settings/organization/OrganizationSettingsClient.test.tsx`

Expected: FAIL because nav ids, routes, and workspace-to-settings behavior are still on the old structure.

### Task 2: Implement dedicated settings routes

**Files:**
- Create: `src/app/[locale]/(dashboard)/settings/calendar/page.tsx`
- Create: `src/app/[locale]/(dashboard)/settings/apps/page.tsx`
- Create: `src/components/settings/CalendarSettingsClient.tsx`
- Create: `src/components/settings/ApplicationsSettingsClient.tsx`
- Modify: `src/components/settings/SettingsResponsiveShell.tsx`
- Modify: `src/components/settings/mobilePaneState.ts`
- Modify: `src/app/[locale]/(dashboard)/settings/organization/page.tsx`
- Modify: `src/app/[locale]/(dashboard)/settings/organization/OrganizationSettingsClient.tsx`

**Step 1: Write the minimal implementation**

- Add top-level settings routes for calendar and applications
- Fetch booking settings, availability, services, and calendar connection in the new calendar settings page
- Fetch connection data in the new applications page
- Remove calendar ownership from organization settings
- Update responsive settings navigation and mobile route helpers

**Step 2: Run targeted tests**

Run the Task 1 command again.

Expected: PASS for route and navigation behavior.

### Task 3: Refactor the calendar settings surface

**Files:**
- Modify: `src/components/calendar/CalendarClient.tsx`
- Modify: `src/components/calendar/CalendarSettingsPanel.tsx`
- Modify: `src/components/settings/OrganizationCalendarSettingsTab.tsx` or remove if dead
- Modify: `src/lib/calendar/settings-surface.ts`

**Step 1: Write the minimal implementation**

- Replace workspace modal usage with a link to `/settings/calendar`
- Reuse the existing draft/actions logic inside a dedicated tabbed settings client
- Keep Google status visible on the calendar settings page, but move connect/disconnect controls into applications
- Trim shared surface helpers so each page owns only the sections it should display

**Step 2: Run the focused tests**

Run: `npm test -- --run src/lib/calendar/settings-surface.test.ts src/app/[locale]/(dashboard)/calendar/page.test.ts`

Expected: PASS with the new split ownership.

### Task 4: Localize copy and document the IA change

**Files:**
- Modify: `messages/tr.json`
- Modify: `messages/en.json`
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

**Step 1: Update copy**

- Add Turkish/English labels for `Takvim` and `Uygulamalar`
- Replace remaining English calendar copy exposed in the new settings surfaces
- Update docs to describe the new ownership split

**Step 2: Verify i18n consistency**

Run: `npm run i18n:check`

Expected: PASS with mirrored TR/EN keys.

### Task 5: Review and verify end-to-end

**Files:**
- Review all modified calendar/settings files

**Step 1: Run final verification**

Run: `npm test -- --run src/components/settings/SettingsResponsiveShell.test.tsx src/components/settings/mobilePaneState.test.ts src/app/[locale]/(dashboard)/calendar/page.test.ts src/app/[locale]/(dashboard)/settings/calendar/page.test.ts src/app/[locale]/(dashboard)/settings/apps/page.test.ts src/app/[locale]/(dashboard)/settings/organization/OrganizationSettingsClient.test.tsx src/lib/calendar/settings-surface.test.ts`

Run: `npm run i18n:check`

Run: `npm run build`

Expected: All pass.

**Step 2: Commit**

```bash
git add docs/plans/2026-03-17-calendar-settings-ia-implementation-plan.md \
  src/app/[locale]/(dashboard)/settings/calendar/page.tsx \
  src/app/[locale]/(dashboard)/settings/apps/page.tsx \
  src/components/settings/CalendarSettingsClient.tsx \
  src/components/settings/ApplicationsSettingsClient.tsx
git commit -m "feat(phase-10): reorganize calendar settings information architecture"
```
