# Calendar Settings Compact UI Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make calendar settings denser and clearer by compacting day rows, adding inline help tooltips for timing fields, and simplifying the Google Calendar connect card.

**Architecture:** Keep existing calendar settings actions and data flow intact. Only refactor the client-side settings surfaces so `Settings > Calendar` and `Settings > Applications` present the same data in a more compact and self-explanatory layout.

**Tech Stack:** Next.js App Router, React client components, next-intl, Tailwind, Vitest

---

### Task 1: Lock the new UI contract with failing tests

**Files:**
- Create: `src/components/settings/CalendarSettingsClient.test.ts`
- Create: `src/components/settings/ApplicationsSettingsClient.test.ts`

**Step 1: Write the failing tests**

Assert that:
- calendar settings source includes an inline info-tooltip helper and explanatory keys for slot interval / minimum notice / front buffer / back buffer
- availability rows use a compact multi-column row layout for day label, open/closed switch, start, and end time
- applications settings source uses a generic connect CTA and no longer renders the Google badge next to connection state

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/components/settings/CalendarSettingsClient.test.ts src/components/settings/ApplicationsSettingsClient.test.ts`

Expected: FAIL because the current UI is vertically spaced, lacks tooltips, and still shows the old Google label pattern.

### Task 2: Refactor `Settings > Calendar`

**Files:**
- Modify: `src/components/settings/CalendarSettingsClient.tsx`
- Modify: `messages/tr.json`
- Modify: `messages/en.json`

**Step 1: Write minimal implementation**

- add a lightweight local tooltip helper for info icons
- move timing help into tooltip-enabled labels
- compress availability rows into a single row layout with day info, switch, start, and end fields aligned horizontally on larger screens
- keep existing save actions and validation behavior

**Step 2: Run targeted tests**

Run: `npm test -- --run src/components/settings/CalendarSettingsClient.test.ts`

Expected: PASS.

### Task 3: Refactor `Settings > Applications`

**Files:**
- Modify: `src/components/settings/ApplicationsSettingsClient.tsx`
- Modify: `messages/tr.json`
- Modify: `messages/en.json`

**Step 1: Write minimal implementation**

- remove the Google badge/chip beside connection status
- shorten connect CTA to `Bağla / Connect`
- keep disconnect/settings behavior intact

**Step 2: Run targeted tests**

Run: `npm test -- --run src/components/settings/ApplicationsSettingsClient.test.ts`

Expected: PASS.

### Task 4: Verify and review

**Files:**
- Review modified calendar settings files

**Step 1: Run verification**

Run: `npm test -- --run src/components/settings/CalendarSettingsClient.test.ts src/components/settings/ApplicationsSettingsClient.test.ts src/components/settings/SettingsResponsiveShell.test.tsx src/components/settings/mobilePaneState.test.ts src/app/[locale]/(dashboard)/settings/calendar/page.test.ts src/app/[locale]/(dashboard)/settings/apps/page.test.ts`

Run: `npm run i18n:check`

Run: `npm run build`

Expected: PASS.

**Step 2: Commit**

```bash
git add src/components/settings/CalendarSettingsClient.tsx \
  src/components/settings/ApplicationsSettingsClient.tsx \
  messages/tr.json messages/en.json \
  docs/plans/2026-03-17-calendar-settings-compact-ui-plan.md
git commit -m "feat(phase-9.5): compact calendar settings surfaces"
```
