# Settings Lightning Navigation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make `/settings` transitions feel instant by keeping the settings shell visually persistent, shortening the server critical path, and introducing warmed/cached detail data for intra-settings navigation.

**Architecture:** Keep the current Next.js App Router shell, but stop using the global dashboard loading overlay for settings subroutes. Move settings toward a persistent "micro-shell" model: stable sidebar, detail-only loading, request-scoped shared server context, streamed heavy sections, and a thin client cache for warmed revisits. This gets us much closer to Linear/Lumiso behavior without rewriting the whole dashboard into a client SPA.

**Tech Stack:** Next.js 16 App Router, React 19, next-intl, Supabase, Tailwind CSS, Vitest, Playwright

---

## Current Findings

- The biggest "settings sidebar reloads" signal is visual, not only data-related. `SettingsResponsiveShell` dispatches a dashboard transition start event on nav clicks, and the dashboard-level viewport paints a full white overlay over the entire route subtree, including the settings sidebar.
  - `src/components/common/DashboardRouteTransitionViewport.tsx:22`
  - `src/components/common/DashboardRouteTransitionViewport.tsx:29`
  - `src/app/[locale]/(dashboard)/layout.tsx:58`
  - `src/components/settings/SettingsResponsiveShell.tsx:326`

- The settings layout is still on the server critical path for every subroute transition because it resolves org context and billing state before rendering the settings shell.
  - `src/app/[locale]/(dashboard)/settings/layout.tsx:17`
  - `src/app/[locale]/(dashboard)/settings/layout.tsx:21`

- Heavy settings pages still block on full data payloads before first content paint. The organization page already does five parallel reads before rendering anything, and plans does multiple reads plus a database write inside render.
  - `src/app/[locale]/(dashboard)/settings/organization/page.tsx:40`
  - `src/app/[locale]/(dashboard)/settings/plans/page.tsx:205`
  - `src/app/[locale]/(dashboard)/settings/plans/page.tsx:249`

- The settings shell also does its own client fetch for the pending suggestion badge on mount, which is non-critical UI work and should stay off the nav critical path.
  - `src/components/settings/SettingsResponsiveShell.tsx:97`
  - `src/components/settings/SettingsResponsiveShell.tsx:261`

- Lumiso feels faster because it behaves like a warmed client app with memory/storage cache plus inflight dedupe, not a fresh server render per click.
  - `/Users/togay/Desktop/Lumiso/src/lib/organizationSettingsCache.ts:53`
  - `/Users/togay/Desktop/Lumiso/src/lib/organizationSettingsCache.ts:90`
  - `/Users/togay/Desktop/Lumiso/src/lib/organizationSettingsCache.ts:206`

## Performance Targets

- No full-screen white overlay for `/settings/* -> /settings/*` transitions.
- Desktop settings sidebar stays visible and interactive during subroute transitions.
- Warmed settings-to-settings navigation: under `120ms` on local dev, under `250ms p95` in production.
- Revisiting a previously opened settings subpage should render cached detail UI in under `50ms`.
- Non-critical badge refreshes must never block the first paint of a settings subpage.

### Task 1: Add a real settings-navigation baseline

**Files:**
- Create: `tests/e2e/settings-navigation.spec.ts`
- Modify: `src/design/navigation-performance.test.ts`
- Modify: `package.json`

**Step 1: Write the failing test**

- Add a Playwright test for `/settings/profile -> /settings/organization -> /settings/ai`.
- Assert that the settings sidebar stays visible during the transition.
- Record warm navigation timing so the test can fail above the target budget.

**Step 2: Run test to verify it fails**

Run: `npx playwright test tests/e2e/settings-navigation.spec.ts`

Expected: FAIL because the current global overlay hides the sidebar and warm transitions exceed the budget.

**Step 3: Add source guards for the regression**

- Extend `src/design/navigation-performance.test.ts` to assert that settings transitions do not use the full dashboard overlay.
- Keep the guard small and specific so future refactors cannot silently reintroduce the behavior.

**Step 4: Run focused tests**

Run: `npm test -- --run src/design/navigation-performance.test.ts`

Expected: PASS once the guard is in place.

**Step 5: Commit**

```bash
git add tests/e2e/settings-navigation.spec.ts src/design/navigation-performance.test.ts package.json
git commit -m "test(settings-nav): add performance and persistence baseline"
```

### Task 2: Stop hiding the settings shell during route transitions

**Files:**
- Modify: `src/components/common/DashboardRouteTransitionViewport.tsx`
- Modify: `src/design/dashboard-route-transition.ts`
- Modify: `src/app/[locale]/(dashboard)/settings/loading.tsx`
- Modify: `src/components/common/DashboardRouteSkeleton.tsx`

**Step 1: Write the failing test**

- Add a focused source/unit test proving `/settings/*` is excluded from the dashboard-wide pending overlay.
- Add a source guard that the settings loading UI is detail-pane scoped, not route-wide whiteout.

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/design/navigation-performance.test.ts`

Expected: FAIL because settings is currently treated like a generic `page` overlay route.

**Step 3: Write minimal implementation**

- Teach the dashboard transition policy that settings is a persistent-shell route family.
- Keep optimistic active-nav updates, but do not paint a fullscreen overlay on top of the settings subtree.
- Replace the generic settings fallback with a detail-only skeleton that fits inside the right-hand pane.

**Step 4: Run tests to verify it passes**

Run: `npm test -- --run src/design/navigation-performance.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/components/common/DashboardRouteTransitionViewport.tsx src/design/dashboard-route-transition.ts src/app/[locale]/(dashboard)/settings/loading.tsx src/components/common/DashboardRouteSkeleton.tsx src/design/navigation-performance.test.ts
git commit -m "fix(settings-nav): keep settings shell visible during transitions"
```

### Task 3: Flatten the server critical path for settings pages

**Files:**
- Create: `src/app/[locale]/(dashboard)/settings/_lib/settings-route-context.ts`
- Modify: `src/app/[locale]/(dashboard)/settings/layout.tsx`
- Modify: `src/app/[locale]/(dashboard)/settings/profile/page.tsx`
- Modify: `src/app/[locale]/(dashboard)/settings/organization/page.tsx`
- Modify: `src/app/[locale]/(dashboard)/settings/ai/page.tsx`
- Modify: `src/app/[locale]/(dashboard)/settings/calendar/page.tsx`
- Modify: `src/app/[locale]/(dashboard)/settings/apps/page.tsx`
- Modify: `src/app/[locale]/(dashboard)/settings/channels/page.tsx`
- Modify: `src/app/[locale]/(dashboard)/settings/channels/[channel]/page.tsx`
- Modify: `src/app/[locale]/(dashboard)/settings/qa-lab/page.tsx`
- Modify: `src/app/[locale]/(dashboard)/settings/billing/page.tsx`
- Modify: `src/app/[locale]/(dashboard)/settings/plans/page.tsx`
- Modify: `src/app/[locale]/(dashboard)/settings/layout.test.ts`

**Step 1: Write the failing test**

- Add a source/test guard for a single shared settings route-context helper.
- Add a guard that plans no longer bypasses the cached billing snapshot path for its initial render.

**Step 2: Run test to verify it fails**

Run: `npm test -- --run 'src/app/[locale]/(dashboard)/settings/layout.test.ts'`

Expected: FAIL because the helper does not exist and settings pages resolve their state ad hoc.

**Step 3: Write minimal implementation**

- Create a request-scoped helper that resolves locale, org context, read-only mode, billing snapshot, and billing-only access once per request.
- Refactor settings pages to consume that helper instead of each page reassembling the same state.
- Move the `billing_region` write in plans out of render; use `after()` or a server action / route so a GET render never mutates data.

**Step 4: Run focused tests**

Run: `npm test -- --run 'src/app/[locale]/(dashboard)/settings/layout.test.ts'`

Expected: PASS

**Step 5: Commit**

```bash
git add src/app/[locale]/(dashboard)/settings/_lib/settings-route-context.ts src/app/[locale]/(dashboard)/settings/layout.tsx src/app/[locale]/(dashboard)/settings/profile/page.tsx src/app/[locale]/(dashboard)/settings/organization/page.tsx src/app/[locale]/(dashboard)/settings/ai/page.tsx src/app/[locale]/(dashboard)/settings/calendar/page.tsx src/app/[locale]/(dashboard)/settings/apps/page.tsx src/app/[locale]/(dashboard)/settings/channels/page.tsx src/app/[locale]/(dashboard)/settings/channels/[channel]/page.tsx src/app/[locale]/(dashboard)/settings/qa-lab/page.tsx src/app/[locale]/(dashboard)/settings/billing/page.tsx src/app/[locale]/(dashboard)/settings/plans/page.tsx src/app/[locale]/(dashboard)/settings/layout.test.ts
git commit -m "refactor(settings-nav): share request context across settings routes"
```

### Task 4: Stream heavy settings pages instead of blocking the whole detail pane

**Files:**
- Create: `src/app/[locale]/(dashboard)/settings/organization/OrganizationSettingsPageContent.tsx`
- Create: `src/app/[locale]/(dashboard)/settings/plans/PlansSettingsPageContent.tsx`
- Create: `src/app/[locale]/(dashboard)/settings/billing/BillingSettingsPageContent.tsx`
- Modify: `src/app/[locale]/(dashboard)/settings/organization/page.tsx`
- Modify: `src/app/[locale]/(dashboard)/settings/plans/page.tsx`
- Modify: `src/app/[locale]/(dashboard)/settings/billing/page.tsx`
- Modify: `src/app/[locale]/(dashboard)/settings/qa-lab/page.tsx`

**Step 1: Write the failing test**

- Add a source guard that the page frame renders before the slowest data sections.
- Add a test that the heavy pages use `Suspense` boundaries around non-critical sections.

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/design/navigation-performance.test.ts`

Expected: FAIL because the current pages block on full server payloads before rendering.

**Step 3: Write minimal implementation**

- Split each heavy page into a lightweight frame plus async section loaders.
- Keep page header and primary action controls renderable immediately.
- Stream secondary content such as suggestions, usage tables, ledger detail, and long lists after the frame is visible.

**Step 4: Run focused tests**

Run: `npm test -- --run src/design/navigation-performance.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/app/[locale]/(dashboard)/settings/organization/OrganizationSettingsPageContent.tsx src/app/[locale]/(dashboard)/settings/plans/PlansSettingsPageContent.tsx src/app/[locale]/(dashboard)/settings/billing/BillingSettingsPageContent.tsx src/app/[locale]/(dashboard)/settings/organization/page.tsx src/app/[locale]/(dashboard)/settings/plans/page.tsx src/app/[locale]/(dashboard)/settings/billing/page.tsx src/app/[locale]/(dashboard)/settings/qa-lab/page.tsx src/design/navigation-performance.test.ts
git commit -m "feat(settings-nav): stream heavy settings detail sections"
```

### Task 5: Add a thin client cache for warmed settings revisits

**Files:**
- Create: `src/lib/settings/route-cache.ts`
- Create: `src/lib/settings/route-cache.test.ts`
- Create: `src/components/settings/SettingsRouteCacheProvider.tsx`
- Modify: `src/components/settings/SettingsResponsiveShell.tsx`
- Modify: `src/app/[locale]/(dashboard)/settings/organization/OrganizationSettingsClient.tsx`
- Modify: `src/app/[locale]/(dashboard)/settings/ai/AiSettingsClient.tsx`
- Modify: `src/components/settings/CalendarSettingsClient.tsx`
- Modify: `src/components/settings/ApplicationsSettingsClient.tsx`
- Modify: `src/app/[locale]/(dashboard)/settings/qa-lab/QaLabSettingsClient.tsx`

**Step 1: Write the failing test**

- Add unit tests for memory cache, storage hydration, and inflight request dedupe.
- Add a client test that a revisited settings page can render from cache before the revalidation finishes.

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/lib/settings/route-cache.test.ts`

Expected: FAIL because the cache layer does not exist yet.

**Step 3: Write minimal implementation**

- Create a small module cache keyed by `organizationId + routeId + locale`.
- Seed the cache from server-provided props on first successful render.
- On intra-settings navigation, render cached data immediately and revalidate in the background after navigation, save, focus, or explicit refresh.
- Keep this local to settings; do not introduce app-wide query tooling unless this phase misses targets.

**Step 4: Run tests to verify it passes**

Run: `npm test -- --run src/lib/settings/route-cache.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/settings/route-cache.ts src/lib/settings/route-cache.test.ts src/components/settings/SettingsRouteCacheProvider.tsx src/components/settings/SettingsResponsiveShell.tsx src/app/[locale]/(dashboard)/settings/organization/OrganizationSettingsClient.tsx src/app/[locale]/(dashboard)/settings/ai/AiSettingsClient.tsx src/components/settings/CalendarSettingsClient.tsx src/components/settings/ApplicationsSettingsClient.tsx src/app/[locale]/(dashboard)/settings/qa-lab/QaLabSettingsClient.tsx
git commit -m "feat(settings-nav): add warmed client cache for settings detail routes"
```

### Task 6: Cut hydration and bundle weight on the slowest settings pages

**Files:**
- Modify: `src/app/[locale]/(dashboard)/settings/organization/OrganizationSettingsClient.tsx`
- Modify: `src/app/[locale]/(dashboard)/settings/ai/AiSettingsClient.tsx`
- Modify: `src/components/settings/CalendarSettingsClient.tsx`
- Modify: `src/components/settings/ServiceCatalogSection.tsx`
- Modify: `src/components/settings/RequiredIntakeFieldsSection.tsx`
- Modify: `src/app/[locale]/(dashboard)/settings/plans/SubscriptionPlanManager.tsx`
- Modify: `src/app/[locale]/(dashboard)/settings/plans/SubscriptionPlanCatalog.tsx`

**Step 1: Write the failing test**

- Add source guards for `next/dynamic` on large secondary panels, tabs, or dialogs that are not needed on first paint.

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/design/navigation-performance.test.ts`

Expected: FAIL because the current clients eagerly import full settings UI trees.

**Step 3: Write minimal implementation**

- Lazy-load non-default tabs and low-frequency dialogs.
- Keep only the active tab and above-the-fold controls in the initial bundle.
- Hoist static option arrays and non-reactive config out of client components where possible.

**Step 4: Run focused tests**

Run: `npm test -- --run src/design/navigation-performance.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/app/[locale]/(dashboard)/settings/organization/OrganizationSettingsClient.tsx src/app/[locale]/(dashboard)/settings/ai/AiSettingsClient.tsx src/components/settings/CalendarSettingsClient.tsx src/components/settings/ServiceCatalogSection.tsx src/components/settings/RequiredIntakeFieldsSection.tsx src/app/[locale]/(dashboard)/settings/plans/SubscriptionPlanManager.tsx src/app/[locale]/(dashboard)/settings/plans/SubscriptionPlanCatalog.tsx src/design/navigation-performance.test.ts
git commit -m "perf(settings-nav): trim first-load hydration and bundle cost"
```

### Task 7: Verify, document, and release safely

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

**Step 1: Run focused tests**

Run: `npm test -- --run src/design/navigation-performance.test.ts src/lib/settings/route-cache.test.ts`

Expected: PASS

**Step 2: Run end-to-end navigation verification**

Run: `npx playwright test tests/e2e/settings-navigation.spec.ts`

Expected: PASS with timing assertions under budget.

**Step 3: Run production build**

Run: `npm run build`

Expected: PASS

**Step 4: Update docs**

- Mark the roadmap performance item complete.
- Add a PRD tech-decision note that settings now uses a persistent shell + warmed route cache.
- Add release notes under `[Unreleased]`.

**Step 5: Commit**

```bash
git add docs/ROADMAP.md docs/PRD.md docs/RELEASE.md
git commit -m "docs: record settings navigation performance work"
```

## Rollout Order

1. Ship Task 2 first. This removes the fake "reload" feeling immediately.
2. Ship Task 4 next for perceived speed on heavy pages.
3. Ship Task 3 to simplify the settings server path and remove render-time writes.
4. Ship Task 5 only after the shell is stable. This is the step that gets closest to Linear/Lumiso revisit speed.
5. Finish with Task 6 for bundle polish and Task 7 for verification/docs.

## Notes

- Linear-level feel is not just "faster SQL". It comes from persistent UI, hot code/data cache, and optimistic navigation. We can get close, but not by keeping every settings click as a cold server render.
- Lumiso proves the cache pattern works. We should copy the pattern, not the entire architecture.
- Do not broaden this into a full dashboard rewrite. Keep the cache and optimistic treatment scoped to `/settings` until metrics prove we need it elsewhere.
