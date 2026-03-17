# Calendar Settings Polish Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Simplify the calendar module into a full-width operational workspace, move durable calendar configuration under Organization settings, and remove English leakage from the Turkish UI.

**Architecture:** The `/calendar` route remains the day-to-day operator workspace and gets a dedicated `Takvim ayarları` surface for quick scheduling changes. `Settings > Organization` becomes the durable home for full calendar configuration, including service durations, so organization-scoped service metadata stays close to the service catalog instead of adding a new top-level Settings nav item.

**Tech Stack:** Next.js App Router, React 19, next-intl, Vitest, existing server actions in `src/lib/calendar/actions.ts`

---

### Task 1: Lock the surface decisions with failing tests

**Files:**
- Create: `src/lib/calendar/settings-surface.test.ts`
- Modify: `src/app/[locale]/(dashboard)/calendar/page.test.ts`
- Create: `src/app/[locale]/(dashboard)/settings/organization/OrganizationSettingsClient.test.tsx`

**Step 1: Write the failing test**

- Add a pure helper test that locks which settings belong to the calendar quick surface vs Organization settings.
- Extend the calendar page source test so it fails until the calendar page exposes a dedicated settings entry and no longer uses the narrow `max-w-7xl` wrapper.
- Add an Organization settings markup test that fails until a `Takvim / Calendar` tab exists.

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/lib/calendar/settings-surface.test.ts 'src/app/[locale]/(dashboard)/calendar/page.test.ts' 'src/app/[locale]/(dashboard)/settings/organization/OrganizationSettingsClient.test.tsx'`

Expected: FAIL because the helper file and new tab do not exist yet, and the current calendar page still uses the old layout.

**Step 3: Write minimal implementation**

- Add the helper and wire the first tab/button/layout changes required by the tests.

**Step 4: Run test to verify it passes**

Run the same command and confirm all targeted tests pass.

**Step 5: Commit**

```bash
git add docs/plans/2026-03-17-calendar-settings-polish-implementation-plan.md src/lib/calendar/settings-surface.test.ts src/app/[locale]/(dashboard)/calendar/page.test.ts src/app/[locale]/(dashboard)/settings/organization/OrganizationSettingsClient.test.tsx
git commit -m "test(phase-10): lock calendar settings surface structure"
```

### Task 2: Rebuild calendar UI hierarchy for operations

**Files:**
- Modify: `src/components/calendar/CalendarClient.tsx`
- Create: `src/components/calendar/CalendarSettingsPanel.tsx`
- Create: `src/components/calendar/calendar-settings-ui.tsx`
- Modify: `messages/tr.json`
- Modify: `messages/en.json`

**Step 1: Write the failing test**

- Keep the Task 1 tests red until the new full-width and settings-entry structure is real.

**Step 2: Run test to verify it fails**

Run the Task 1 command if needed.

**Step 3: Write minimal implementation**

- Add a `Takvim ayarları` action beside `Yeni randevu`.
- Remove the bottom-of-page three-card settings wall from the calendar body.
- Make the page full width.
- Introduce a cleaner dedicated settings surface with stronger toggle UI and grouped sections for booking rules, working hours, Google connection, and service durations.
- Collapse repeated Google connection UI into one reusable block.
- Replace English-heavy Turkish strings with proper Turkish copy.

**Step 4: Run test to verify it passes**

Run: `npm test -- --run src/lib/calendar/settings-surface.test.ts 'src/app/[locale]/(dashboard)/calendar/page.test.ts'`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/components/calendar/CalendarClient.tsx src/components/calendar/CalendarSettingsPanel.tsx src/components/calendar/calendar-settings-ui.tsx messages/tr.json messages/en.json
git commit -m "feat(phase-10): simplify calendar workspace and settings entry"
```

### Task 3: Add durable calendar configuration under Organization settings

**Files:**
- Modify: `src/app/[locale]/(dashboard)/settings/organization/page.tsx`
- Modify: `src/app/[locale]/(dashboard)/settings/organization/OrganizationSettingsClient.tsx`
- Create: `src/components/settings/OrganizationCalendarSettingsTab.tsx`
- Modify: `messages/tr.json`
- Modify: `messages/en.json`

**Step 1: Write the failing test**

- Keep the Organization settings tab test red until the tab and section render.

**Step 2: Run test to verify it fails**

Run: `npm test -- --run 'src/app/[locale]/(dashboard)/settings/organization/OrganizationSettingsClient.test.tsx'`

Expected: FAIL.

**Step 3: Write minimal implementation**

- Add a `Takvim / Calendar` tab under `Settings > Organization`.
- Load booking settings, availability rules, and service durations on the Organization settings page.
- Render the durable configuration UI there, reusing the shared calendar settings sections instead of duplicating logic.
- Keep service durations in Organization settings because they belong to the organization-wide service catalog.

**Step 4: Run test to verify it passes**

Run the same test command and confirm it passes.

**Step 5: Commit**

```bash
git add src/app/[locale]/(dashboard)/settings/organization/page.tsx src/app/[locale]/(dashboard)/settings/organization/OrganizationSettingsClient.tsx src/components/settings/OrganizationCalendarSettingsTab.tsx messages/tr.json messages/en.json
git commit -m "feat(phase-10): add calendar configuration to organization settings"
```

### Task 4: Update docs and verify the whole change

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

**Step 1: Write the failing test**

- No new code test here; verification is command-based.

**Step 2: Run test to verify current state**

Run the relevant focused tests before the final verification sweep.

**Step 3: Write minimal implementation**

- Update roadmap, PRD, and release notes to reflect the new split between calendar quick controls and Organization settings.

**Step 4: Run test to verify it passes**

Run:

```bash
npm test -- --run src/lib/calendar/settings-surface.test.ts 'src/app/[locale]/(dashboard)/calendar/page.test.ts' 'src/app/[locale]/(dashboard)/settings/organization/OrganizationSettingsClient.test.tsx'
npm run i18n:check
npm run build
```

Expected: all commands succeed.

**Step 5: Commit**

```bash
git add docs/ROADMAP.md docs/PRD.md docs/RELEASE.md
git commit -m "docs: record calendar settings and ui polish"
```
