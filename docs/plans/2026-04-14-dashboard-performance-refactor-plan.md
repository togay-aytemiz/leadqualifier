# Dashboard Performance Refactor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reduce local and production dashboard route latency so Calendar, Settings, and workspace navigation stop waiting on repeated shell-level organization, billing, onboarding, AI settings, and calendar data waterfalls.

**Architecture:** Keep Next.js App Router, but move non-critical shell data off the blocking render path, dedupe request-scoped organization/billing reads, and introduce route-level read models with client-side stale-while-revalidate cache where interaction latency matters. Do not copy Lumiso's Vite architecture directly; reuse the practical parts: explicit cache TTLs, inflight request dedupe, route-local query keys, and development performance instrumentation.

**Tech Stack:** Next.js 16 App Router, React 19, next-intl, Supabase Postgres/RLS, Vitest, Playwright, optional Postgres RPC/read-model functions.

---

## Verified Findings

- `src/app/[locale]/(dashboard)/layout.tsx` blocks every dashboard route on org context, shell messages, billing snapshot, onboarding state, and AI settings before children render. The expensive part is not only data volume; `getOrganizationOnboardingState` fans out into onboarding row, billing, KB count, skill count, cookie read, offering profile, service catalog count, and channels.
- `src/app/[locale]/(dashboard)/settings/layout.tsx` calls `resolveActiveOrganizationContext()` again and wraps every settings route with a broad namespace list, including `calendar`, `billingUsage`, `billingPlans`, `aiQaLab`, and `Channels`, even when the active detail page does not need all of them.
- `src/app/[locale]/(dashboard)/calendar/page.tsx` has a sequential critical path: create Supabase client, locale, calendar translations, active org context, billing enforcement, booking settings, then calendar page data.
- `src/components/calendar/CalendarClient.tsx` has a range cache, but cache misses call `getCalendarPageData` server action. That server action re-resolves active org context and then loads settings, availability rules, services, Google connection, and bookings.
- `src/components/settings/SettingsResponsiveShell.tsx` already moved pending suggestion count and billing lock hydration to the client, but those client fetches still run on settings entry and should be measured separately from server route latency.
- Lumiso is faster partly because it is a Vite/React Router app with React Query defaults (`staleTime: 5m`, `gcTime: 10m`, `refetchOnWindowFocus: false`) and explicit memory/localStorage + inflight dedupe for organization settings. We should reuse that caching discipline, not migrate frameworks.
- The earlier UX issue is real and low-risk: `src/components/settings/CalendarSettingsClient.tsx` links empty service durations to `/settings/organization`, but it should deep-link to `/settings/organization?focus=organization-details`.

## Assumptions To Verify First

- The 10-20 second delay is dominated by server route/action critical path rather than client rendering. Verify with server timings before large refactors.
- Local Supabase/RLS latency is contributing because several simple reads each invoke RLS helpers such as `get_user_organizations(auth.uid())` and `is_system_admin_secure()`. Verify with Supabase query timing or Postgres `EXPLAIN ANALYZE`, not by assumption.
- Next dev mode overhead is not the whole issue. Verify with `npm run build && npm run start` timing locally against the same user/session.
- Google Calendar free/busy is not on initial Calendar page load. It appears used in availability lookup/write paths, not `getCalendarPageDataByOrganizationId`, but confirm with timings when clicking appointment creation or availability suggestions.

---

## Task 1: Add Performance Timing Harness

**Files:**
- Create: `src/lib/performance/timing.ts`
- Modify: `src/app/[locale]/(dashboard)/layout.tsx`
- Modify: `src/app/[locale]/(dashboard)/settings/layout.tsx`
- Modify: `src/app/[locale]/(dashboard)/calendar/page.tsx`
- Modify: `src/lib/calendar/actions.ts`
- Test: `src/lib/performance/timing.test.ts`

**Step 1: Write the failing test**

Add a small unit test that verifies a timing wrapper returns the callback value and logs only when enabled:

```ts
it('measures async work and returns the callback result', async () => {
  const result = await withDevTiming('calendar.page', async () => 'ok', {
    enabled: true,
    now: createFakeClock([10, 45]),
    log: logSpy,
  })

  expect(result).toBe('ok')
  expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('calendar.page'), expect.objectContaining({ durationMs: 35 }))
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/lib/performance/timing.test.ts`

Expected: FAIL because `withDevTiming` does not exist.

**Step 3: Implement minimal timing helper**

Implement `withDevTiming(label, fn, options?)` with:

- default enabled only when `process.env.DASHBOARD_PERF_DEBUG === '1'`
- `performance.now()` or `Date.now()` fallback
- `console.info('[perf]', { label, durationMs })`
- no production logging unless the env flag is set

**Step 4: Instrument the current critical path**

Wrap these blocks with unique labels:

- `dashboard.layout.orgContext`
- `dashboard.layout.messages`
- `dashboard.layout.billingAndOnboarding`
- `dashboard.layout.aiSettings`
- `settings.layout.orgContext`
- `settings.layout.routeMessages`
- `calendar.page.orgContext`
- `calendar.page.billing`
- `calendar.page.settings`
- `calendar.page.data`
- `calendar.action.getPageData.requireOrg`
- `calendar.action.getPageData.data`

**Step 5: Verify**

Run:

```bash
npm test -- --run src/lib/performance/timing.test.ts
npm run build
```

Manual local check:

```bash
DASHBOARD_PERF_DEBUG=1 npm run dev
```

Then navigate to `/calendar`, `/settings/calendar`, `/settings/organization`, and record the timing table.

**Step 6: Commit**

```bash
git add src/lib/performance/timing.ts src/lib/performance/timing.test.ts src/app/[locale]/\(dashboard\)/layout.tsx src/app/[locale]/\(dashboard\)/settings/layout.tsx src/app/[locale]/\(dashboard\)/calendar/page.tsx src/lib/calendar/actions.ts
git commit -m "test(phase-10): add dashboard performance timing"
```

---

## Task 2: Fix The Low-Risk Calendar Settings Deep Link

**Files:**
- Modify: `src/components/settings/CalendarSettingsClient.test.ts`
- Modify: `src/components/settings/CalendarSettingsClient.tsx`

**Step 1: Write the failing test**

Add a source guard:

```ts
it('opens organization details from the empty service durations state', () => {
  const source = fs.readFileSync(CALENDAR_SETTINGS_CLIENT_PATH, 'utf8')

  expect(source).toContain('href="/settings/organization?focus=organization-details"')
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/components/settings/CalendarSettingsClient.test.ts`

Expected: FAIL because the current href is `/settings/organization`.

**Step 3: Implement**

Change the empty service duration CTA href to:

```tsx
href="/settings/organization?focus=organization-details"
```

**Step 4: Verify**

Run:

```bash
npm test -- --run src/components/settings/CalendarSettingsClient.test.ts
npm run i18n:check
```

**Step 5: Commit**

```bash
git add src/components/settings/CalendarSettingsClient.tsx src/components/settings/CalendarSettingsClient.test.ts
git commit -m "fix(phase-9.6): open organization details from calendar settings"
```

---

## Task 3: Collapse Dashboard Shell Data Into One Request-Scoped Loader

**Files:**
- Create: `src/lib/dashboard/shell-data.ts`
- Modify: `src/app/[locale]/(dashboard)/layout.tsx`
- Test: `src/app/[locale]/(dashboard)/layout.test.tsx`
- Test: `src/app/[locale]/(dashboard)/dashboard-message-scoping.test.ts`

**Step 1: Write failing tests**

Add source tests that require:

- `layout.tsx` calls `getDashboardShellData`
- `layout.tsx` does not call `getOrganizationBillingSnapshot`, `getOrganizationOnboardingState`, and `getOrgAiSettings` directly
- `shell-data.ts` uses `cache(...)`
- `getDashboardShellData` returns a single object with org context, billing snapshot, onboarding state, and AI settings

**Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- --run src/app/[locale]/\\(dashboard\\)/layout.test.tsx src/app/[locale]/\\(dashboard\\)/dashboard-message-scoping.test.ts
```

**Step 3: Implement the cached loader**

Create `getDashboardShellData = cache(async () => { ... })`.

Rules:

- Fetch `locale` and `resolveActiveOrganizationContext()` in parallel.
- Start shell message loading immediately after locale is known.
- If there is no active tenant or read-only tenant mode, skip billing/onboarding/AI settings.
- Avoid duplicate billing reads: `getOrganizationOnboardingState` already loads billing internally, but the banner also needs the snapshot. Either return the billing snapshot from an expanded onboarding read model or create a single `getOrganizationOnboardingShellData` helper that returns both from one fan-out.
- Keep system admin behavior unchanged.

**Step 4: Update layout**

Make the layout only map `shellData` into props and JSX. It should not own the data-fetch choreography.

**Step 5: Verify**

Run:

```bash
npm test -- --run src/app/[locale]/\\(dashboard\\)/layout.test.tsx src/app/[locale]/\\(dashboard\\)/dashboard-message-scoping.test.ts
npm run build
```

Use `DASHBOARD_PERF_DEBUG=1` to compare before/after.

**Step 6: Commit**

```bash
git add src/lib/dashboard/shell-data.ts src/app/[locale]/\(dashboard\)/layout.tsx src/app/[locale]/\(dashboard\)/layout.test.tsx src/app/[locale]/\(dashboard\)/dashboard-message-scoping.test.ts
git commit -m "refactor(phase-10): dedupe dashboard shell data loading"
```

---

## Task 4: Move Non-Critical Shell Reads Behind Client Stale Cache

**Files:**
- Create: `src/lib/dashboard/shell-cache.ts`
- Modify: `src/design/MainSidebar.tsx`
- Modify: `src/components/onboarding/OnboardingTrialBanner.tsx` or create `src/components/onboarding/OnboardingTrialBannerLoader.tsx`
- Modify: `src/components/onboarding/OnboardingCompletionModal.tsx` if needed
- Add server action: `src/lib/dashboard/actions.ts`
- Test: `src/design/navigation-performance.test.ts`

**Step 1: Write failing tests**

Add source guards that non-critical bot mode, onboarding modal requirement, and trial banner data are not required before `DashboardRouteTransitionViewport` renders.

**Step 2: Run tests to verify they fail**

Run: `npm test -- --run src/design/navigation-performance.test.ts`

**Step 3: Implement cached client shell loader**

Use the Lumiso pattern without adding React Query:

- memory Map keyed by `organizationId + locale`
- TTL 2-5 minutes
- inflight Promise dedupe
- invalidate on billing update and bot-mode update events
- return initial server snapshot if available, then revalidate in background

**Step 4: Move only non-critical UI**

Keep required auth/org context server-side. Move these behind cache/revalidation if timings prove they are slow:

- onboarding checklist/banner counts
- AI bot mode unlock modal data
- billing progress snapshot for sidebar display

Do not move billing lock enforcement for protected routes to the client; that must stay server-side.

**Step 5: Verify**

Run:

```bash
npm test -- --run src/design/navigation-performance.test.ts
npm run build
```

Manual:

- Route to Calendar from Inbox
- Route between Settings tabs
- Confirm lock redirect still happens for billing-only accounts

**Step 6: Commit**

```bash
git add src/lib/dashboard src/design/MainSidebar.tsx src/components/onboarding src/design/navigation-performance.test.ts
git commit -m "refactor(phase-10): move non-critical shell reads behind cache"
```

---

## Task 5: Narrow Settings Layout Messages And Org Context Work

**Files:**
- Modify: `src/app/[locale]/(dashboard)/settings/layout.tsx`
- Modify: `src/components/i18n/DashboardRouteIntlProvider.tsx`
- Modify: settings route layouts/pages if adding per-route providers
- Test: `src/app/[locale]/(dashboard)/settings/layout.test.ts`
- Test: `src/app/[locale]/(dashboard)/dashboard-message-scoping.test.ts`

**Step 1: Write failing tests**

Assert settings layout no longer preloads unrelated route namespaces. The baseline settings shell should include only:

- `Sidebar`
- `unsavedChanges`
- namespaces needed by the settings shell navigation itself

Route pages should load their own page namespace.

**Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- --run src/app/[locale]/\\(dashboard\\)/settings/layout.test.ts src/app/[locale]/\\(dashboard\\)/dashboard-message-scoping.test.ts
```

**Step 3: Implement**

Options, pick the smaller one after timing:

- Preferred: narrow `settings/layout.tsx` namespace list and let each settings child layout/page wrap its own route namespaces.
- Alternative: update `DashboardRouteIntlProvider` to accept already-loaded shell messages and merge only route namespaces, avoiding full message import/filter duplication.

**Step 4: Verify**

Run:

```bash
npm test -- --run src/app/[locale]/\\(dashboard\\)/settings/layout.test.ts src/app/[locale]/\\(dashboard\\)/dashboard-message-scoping.test.ts
npm run i18n:check
npm run build
```

Manual: load `/settings/organization`, `/settings/calendar`, `/settings/plans`, and confirm labels still render in TR/EN.

**Step 5: Commit**

```bash
git add src/app/[locale]/\(dashboard\)/settings src/components/i18n/DashboardRouteIntlProvider.tsx src/app/[locale]/\(dashboard\)/dashboard-message-scoping.test.ts
git commit -m "refactor(phase-10): narrow settings route message loading"
```

---

## Task 6: Create Calendar Page Read Model

**Files:**
- Modify: `src/lib/calendar/bookings.ts`
- Modify: `src/app/[locale]/(dashboard)/calendar/page.tsx`
- Modify: `src/lib/calendar/actions.ts`
- Test: `src/lib/calendar/bookings.test.ts`
- Test: `src/lib/calendar/actions.test.ts`
- Optional migration: `supabase/migrations/00115_calendar_page_read_model.sql`

**Step 1: Write failing tests**

Cover that `getCalendarPageDataByOrganizationId`:

- returns settings, rules, services, connection, and bookings
- accepts already-loaded settings without refetching
- can use a compact DB read path if present
- filters bookings by range exactly as before

**Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- --run src/lib/calendar/bookings.test.ts src/lib/calendar/actions.test.ts
```

**Step 3: Implement smaller payloads first**

Before adding SQL RPC, reduce payloads:

- select explicit columns instead of `select('*')` where the UI does not need every field
- keep `booking_settings` full only if the settings UI needs it; Calendar page can use a `CalendarPageSettings` shape
- for `service_catalog`, select `id, name, duration_minutes, active`
- for `calendar_connections`, select fields used by the page header/status only

**Step 4: Add DB read model only if timings still require it**

If Supabase round trips dominate after payload narrowing, create a Postgres RPC:

```sql
public.get_calendar_page_data(p_org_id uuid, p_range_start timestamptz, p_range_end timestamptz)
```

Return JSON with:

- settings
- availability rules
- services
- connection
- bookings

Keep RLS/security behavior explicit. Prefer `SECURITY INVOKER` unless a `SECURITY DEFINER` function is needed and audited.

**Step 5: Verify**

Run:

```bash
npm test -- --run src/lib/calendar/bookings.test.ts src/lib/calendar/actions.test.ts src/components/calendar/CalendarClient.test.tsx
npm run build
```

Manual: Calendar initial load, month/week/day switching, booking detail click, new booking, cancel booking.

**Step 6: Commit**

```bash
git add src/lib/calendar/bookings.ts src/app/[locale]/\(dashboard\)/calendar/page.tsx src/lib/calendar/actions.ts src/lib/calendar/*.test.ts supabase/migrations/00115_calendar_page_read_model.sql
git commit -m "refactor(phase-10): optimize calendar page data loading"
```

---

## Task 7: Add Calendar Client SWR Cache And Adjacent Window Prefetch

**Files:**
- Create: `src/lib/calendar/page-data-cache.ts`
- Modify: `src/components/calendar/CalendarClient.tsx`
- Test: `src/components/calendar/CalendarClient.test.tsx` or source test if current project pattern is source-based

**Step 1: Write failing tests**

Verify:

- cache keys include `organizationId`, `timezone`, `rangeStartIso`, and `rangeEndIso`
- repeated navigation to the same range uses cached data
- adjacent month/week window prefetch does not replace visible data
- mutation invalidation clears only the active organization's calendar cache

**Step 2: Run tests to verify they fail**

Run: `npm test -- --run src/components/calendar/CalendarClient.test.tsx`

**Step 3: Implement cache**

Use a simple module-level cache:

- TTL: 2 minutes
- max entries: 8-12 per organization
- inflight dedupe
- stale data may render immediately while revalidation updates in background

**Step 4: Prefetch adjacent windows**

When a range loads successfully, prefetch previous/next calendar data window after a short idle delay. Do not prefetch if `NEXT_PUBLIC_DISABLE_MANUAL_PREFETCH` disables app-shell prefetch.

**Step 5: Verify**

Run:

```bash
npm test -- --run src/components/calendar/CalendarClient.test.tsx src/lib/calendar/actions.test.ts
npm run build
```

Manual:

- Open Calendar
- Next month
- Back to current month
- Click booking card
- Confirm the detail panel/modal opens instantly and route does not refetch unnecessarily

**Step 6: Commit**

```bash
git add src/lib/calendar/page-data-cache.ts src/components/calendar/CalendarClient.tsx src/components/calendar/CalendarClient.test.tsx
git commit -m "refactor(phase-10): cache calendar route windows"
```

---

## Task 8: Add Database Index And RLS Timing Verification

**Files:**
- Create: `supabase/migrations/00116_dashboard_latency_indexes.sql`
- Create or modify: `docs/plans/2026-04-14-dashboard-performance-refactor-plan.md`
- Optional script: `scripts/db/explain-dashboard-queries.sql`

**Step 1: Verify before adding indexes**

Run representative `EXPLAIN (ANALYZE, BUFFERS)` for:

- active org membership lookup
- profile lookup
- billing account lookup
- onboarding state row
- service catalog active count
- calendar bookings by org/range/status
- offering profile suggestions pending count

**Step 2: Add only missing indexes**

Likely candidates to verify before adding:

- `organization_billing_accounts (organization_id)` if not covered by primary/unique key
- `organization_ai_settings (organization_id)` if not covered by primary key
- `organization_onboarding_states (organization_id)` if not covered by primary key
- `offering_profile_suggestions (organization_id, archived_at, status)` for pending count
- `service_catalog (organization_id, active, name)` for calendar service listing

Do not add duplicate indexes if primary keys or existing indexes already cover the query.

**Step 3: Verify**

Run Supabase migration tests/reset only when Docker is available. If Docker is not running, record that the DB reset is blocked.

```bash
supabase db reset
npm run build
```

**Step 4: Commit**

```bash
git add supabase/migrations/00116_dashboard_latency_indexes.sql scripts/db/explain-dashboard-queries.sql docs/plans/2026-04-14-dashboard-performance-refactor-plan.md
git commit -m "perf(phase-10): add verified dashboard latency indexes"
```

---

## Task 9: Add Performance Regression Guard

**Files:**
- Create: `tests/e2e/dashboard-performance.spec.ts`
- Modify: `playwright.config.ts` if a perf project is needed
- Modify: `package.json`

**Step 1: Write failing Playwright test**

Add a local-only perf smoke test that records:

- `/calendar` first content visible time
- `/settings/calendar` first content visible time
- `/settings/organization` first content visible time
- calendar next/previous navigation action latency

Make thresholds generous for CI and stricter when `PERF_STRICT=1`.

**Step 2: Run test to verify it fails or is skipped without auth state**

Run: `npx playwright test tests/e2e/dashboard-performance.spec.ts`

If auth setup is missing, create a documented skip with a clear message rather than a flaky failure.

**Step 3: Implement auth/session setup**

Reuse existing E2E auth helpers if present. Do not hardcode personal credentials.

**Step 4: Verify**

Run:

```bash
npm run test:e2e:settings
npx playwright test tests/e2e/dashboard-performance.spec.ts
npm run build
```

**Step 5: Commit**

```bash
git add tests/e2e/dashboard-performance.spec.ts playwright.config.ts package.json
git commit -m "test(phase-10): add dashboard performance smoke guard"
```

---

## Rollout Order

1. Timing harness first. Without this, we may optimize the wrong layer.
2. Low-risk deep link fix.
3. Dashboard shell loader dedupe.
4. Non-critical shell reads behind client cache.
5. Settings namespace/context narrowing.
6. Calendar read model and smaller payloads.
7. Calendar client SWR cache and adjacent-window prefetch.
8. Verified DB indexes/RLS query tuning.
9. Playwright regression guard.

## Success Criteria

- Calendar route first useful content should be under 2 seconds locally in `next start` against a small local database, excluding cold Next compilation.
- Calendar cached next/back window should be under 500 ms after adjacent prefetch.
- Settings tab navigation should show the shell immediately and detail content within 1-2 seconds locally for empty/small orgs.
- Route changes should no longer wait on onboarding/banner/AI bot-mode data unless the target page truly needs those values to render correctly.
- No billing-only account can access locked pages because of client-side cache movement.
- TR/EN message checks and build stay green.

## Challenge Review

1. RIGHT PROBLEM: The request is about whole-dashboard perceived slowness, not only calendar availability logic. The plan prioritizes dashboard/settings shell latency before calendar-specific query tuning.
2. OVERENGINEERING CHECK: Do not introduce React Query globally or a new data framework in the first pass. Start with timing, request-scoped cache, module-level TTL cache, and smaller payloads.
3. ASSUMPTIONS: The main unverified assumption is whether server route latency dominates client render latency. Task 1 must validate this before Tasks 3-8.
4. COMPLETENESS: The plan covers code, DB, i18n, tests, local manual checks, and regression guard. It intentionally does not cover production APM setup beyond dev timing.
5. BREAKING CHANGES: Moving billing and onboarding reads off the critical path can break lock enforcement or onboarding UI if done too broadly. Keep enforcement server-side and move only display-only data.
6. SIMPLER ALTERNATIVE: If timing shows one DB/RLS query dominates, stop after Task 1 and fix that query/index/RLS helper directly before changing UI architecture.
7. CONFIDENCE RATING: 7/10 until timings prove the dominant bottleneck; 8.5/10 after `DASHBOARD_PERF_DEBUG=1` traces confirm route shell and calendar data windows are the slow paths.
