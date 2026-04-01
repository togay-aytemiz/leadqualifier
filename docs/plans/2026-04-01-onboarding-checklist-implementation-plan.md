# Onboarding Checklist and Trial Banner Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an organization-scoped onboarding checklist with first-visit redirect, desktop/mobile navigation entry points, and a trial-tied global banner that guides new workspaces through Qualy setup in the right order.

**Architecture:** Persist only the onboarding facts that cannot be derived (`first seen` and manual intro acknowledgment) in a dedicated org-level table, and derive the rest of the checklist from existing product state (`knowledge`, `organization details`, `WhatsApp readiness`, `billing status`). Reuse one shared onboarding resolver for the dashboard entry redirect, top banner, sidebar/mobile navigation visibility, and `/onboarding` page UI so the product surfaces stay consistent. Resolve that onboarding snapshot once in the dashboard shell with a cached server helper, hydrate it into client surfaces, and refresh it only through explicit mutation events plus `router.refresh()`/`revalidatePath()` instead of mount-time polling from each component.

**Tech Stack:** Next.js App Router, React 19, next-intl, Supabase/Postgres + RLS, shared dashboard shell components, Vitest, Tailwind UI primitives.

---

### Task 1: Lock the onboarding rules with failing tests

**Files:**
- Create: `src/lib/onboarding/state.test.ts`
- Modify: `src/lib/navigation/default-home-route.test.ts`
- Modify: `src/design/mobile-navigation.test.ts`
- Modify: `src/components/settings/SettingsResponsiveShell.test.tsx`
- Modify: `src/app/[locale]/(dashboard)/settings/layout.test.ts`
- Create: `src/components/onboarding/OnboardingPageClient.test.tsx`
- Create: `src/components/onboarding/OnboardingTrialBanner.test.tsx`

**Step 1: Write the failing tests**

Assert that:
- the onboarding resolver distinguishes `showBanner`, `showChecklistCta`, `showNavigationEntry`, `shouldAutoOpen`, and per-step completion
- first dashboard entry redirects tenant users to `/onboarding` once when the org has not seen onboarding yet
- `/onboarding` resolves under the mobile `other` tab
- mobile/desktop navigation source guards expect an onboarding entry when onboarding is incomplete
- the onboarding page renders four steps, keeps all steps visible, and opens the first step by default
- the banner hides entirely after upgrade, but incomplete onboarding still keeps the nav entry visible
- banner/sidebar/mobile onboarding surfaces do not perform their own client-side Supabase fetch loop on mount

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/lib/onboarding/state.test.ts src/lib/navigation/default-home-route.test.ts src/design/mobile-navigation.test.ts src/components/settings/SettingsResponsiveShell.test.tsx src/app/[locale]/(dashboard)/settings/layout.test.ts src/components/onboarding/OnboardingPageClient.test.tsx src/components/onboarding/OnboardingTrialBanner.test.tsx`

Expected: FAIL because onboarding state, route logic, and UI surfaces do not exist yet.

### Task 2: Add org-scoped onboarding persistence and resolver

**Files:**
- Create: `supabase/migrations/00103_organization_onboarding_states.sql`
- Modify: `src/types/database.ts`
- Create: `src/lib/onboarding/state.ts`
- Create: `src/lib/onboarding/actions.ts`
- Create: `src/lib/onboarding/events.ts`

**Step 1: Write the minimal implementation**

- Add `organization_onboarding_states` with `organization_id`, `first_seen_at`, `intro_acknowledged_at`, `created_at`, and `updated_at`
- Add org-member-readable and org-admin-manageable RLS policies consistent with existing tenant tables
- Update database types manually
- Implement a shared onboarding resolver that reads:
  - `organization_onboarding_states` for first-visit/manual intro state
  - `knowledge_base` / knowledge entries for KB completion
  - `offering_profiles`, `required_intake_fields`, and `service_catalog` for business-setup completion
  - WhatsApp channel readiness for connect completion
  - `organization_billing_accounts` for trial/upgrade banner visibility
- Wrap the main `getOrganizationOnboardingState(organizationId)` helper in `cache(...)` so banner, sidebar, mobile nav, and page rendering share one server read path per request
- Add server actions for `markOnboardingSeen` and `acknowledgeOnboardingIntro`
- Add a small client event contract such as `ONBOARDING_STATE_UPDATED_EVENT` for optimistic UI refresh after onboarding mutations

**Step 2: Run focused tests**

Run: `npm test -- --run src/lib/onboarding/state.test.ts src/lib/navigation/default-home-route.test.ts`

Expected: PASS for derived state and auto-open routing logic.

### Task 3: Build the onboarding page and shared UI

**Files:**
- Create: `src/app/[locale]/(dashboard)/onboarding/page.tsx`
- Create: `src/components/onboarding/OnboardingPageClient.tsx`
- Create: `src/components/onboarding/OnboardingChecklist.tsx`
- Create: `src/components/onboarding/OnboardingStepCard.tsx`
- Create: `src/components/onboarding/OnboardingTrialBanner.tsx`
- Create: `src/components/onboarding/OnboardingStateProvider.tsx`
- Create: `src/components/onboarding/onboarding-content.tsx`
- Modify: `messages/en.json`
- Modify: `messages/tr.json`

**Step 1: Write the minimal implementation**

- Add a first-class `/onboarding` dashboard route
- Build the four-step checklist:
  - learn how Qualy works
  - set up AI agent
  - review business info for AI
  - connect WhatsApp last
- Keep the first accordion expanded by default
- Show completed steps as checked but still visible/collapsed
- Use icon-led placeholder content instead of media assets
- Hydrate one onboarding snapshot into a tiny client provider/context so banner, nav, and page components read shared state instead of fetching independently
- Make CTA targets align with real product routes:
  - `/knowledge`
  - `/skills`
  - `/settings/organization`
  - `/settings/channels/whatsapp`
  - `/settings/plans`
- Add full TR/EN copy, including `Got it`, progress text, banner text, and step descriptions

**Step 2: Run targeted UI tests**

Run: `npm test -- --run src/components/onboarding/OnboardingPageClient.test.tsx src/components/onboarding/OnboardingTrialBanner.test.tsx`

Expected: PASS for checklist rendering, default expansion, CTA visibility, and banner state.

### Task 4: Integrate the banner, redirect, and navigation entry points

**Files:**
- Modify: `src/lib/navigation/default-home-route.ts`
- Modify: `src/app/[locale]/page.tsx`
- Modify: `src/app/[locale]/(dashboard)/layout.tsx`
- Modify: `src/design/MainSidebar.tsx`
- Modify: `src/design/MobileBottomNav.tsx`
- Modify: `src/design/mobile-navigation.ts`
- Modify: `src/components/settings/SettingsResponsiveShell.tsx`

**Step 1: Write the minimal implementation**

- Route first-time tenant users to `/onboarding` once via the default home route flow
- Resolve onboarding state once in the dashboard layout and pass the hydrated snapshot into the banner, sidebar, and mobile navigation
- Render the global onboarding/trial banner at the top of the dashboard shell
- Keep the banner visible only while trial remains active and the org is not upgraded
- Hide only the `Onboarding checklist` CTA when onboarding is complete
- Keep the full banner hidden after upgrade even if onboarding is incomplete
- Add a desktop sidebar `Onboarding` item while onboarding is incomplete
- Add a matching mobile `Onboarding` entry inside the bottom-nav `other` menu while onboarding is incomplete
- Refresh the shared onboarding snapshot only when:
  - the user acknowledges the intro step
  - the user first lands on `/onboarding`
  - a known setup action completes and dispatches `ONBOARDING_STATE_UPDATED_EVENT`
- Avoid interval/poll-based completion checks in shell components
- Make the nav entry future-ready for owner-only restriction, but keep the current behavior available to the active workspace user because owner gating is not fully modeled yet

**Step 2: Run integration-oriented tests**

Run: `npm test -- --run src/lib/navigation/default-home-route.test.ts src/design/mobile-navigation.test.ts src/components/settings/SettingsResponsiveShell.test.tsx src/app/[locale]/(dashboard)/settings/layout.test.ts src/components/onboarding/OnboardingTrialBanner.test.tsx`

Expected: PASS for redirect, banner placement, and desktop/mobile nav visibility.

### Task 5: Add source-of-truth wiring for step completion

**Files:**
- Modify: `src/app/[locale]/(dashboard)/knowledge/page.tsx`
- Modify: `src/app/[locale]/(dashboard)/settings/organization/OrganizationSettingsPageContent.tsx`
- Modify: `src/app/[locale]/(dashboard)/settings/channels/page.tsx`
- Modify: `src/components/channels/channelCatalog.ts`
- Modify: `src/lib/channels/connection-readiness.ts`
- Modify: `src/lib/leads/settings.ts`

**Step 1: Write the minimal implementation**

- Reuse existing read models where possible so the onboarding resolver can determine:
  - whether the org has enough knowledge content to mark the AI setup step complete
  - whether business info has meaningful setup content
  - whether WhatsApp is connected and ready
- Avoid duplicating completion rules inside page components
- Add any tiny helper functions needed to keep completion thresholds explicit and testable

**Step 2: Run focused tests**

Run: `npm test -- --run src/lib/onboarding/state.test.ts src/lib/channels/connection-readiness.test.ts src/lib/leads/settings.test.ts src/lib/knowledge-base/actions.test.ts`

Expected: PASS with onboarding completion driven by shared domain helpers instead of UI-only heuristics.

### Task 6: Document, localize, and verify end-to-end

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

**Step 1: Update docs**

- Add the onboarding checklist/banner feature to roadmap progress
- Record the onboarding behavior in PRD update notes and tech decisions
- Add release notes for the new onboarding page, banner, and org-scoped completion model

**Step 2: Run final verification**

Run: `npm test -- --run src/lib/onboarding/state.test.ts src/lib/navigation/default-home-route.test.ts src/design/mobile-navigation.test.ts src/components/settings/SettingsResponsiveShell.test.tsx src/app/[locale]/(dashboard)/settings/layout.test.ts src/components/onboarding/OnboardingPageClient.test.tsx src/components/onboarding/OnboardingTrialBanner.test.tsx src/lib/channels/connection-readiness.test.ts`

Run: `npm run i18n:check`

Run: `npm run build`

Expected: All pass.

**Step 3: Commit**

```bash
git add docs/plans/2026-04-01-onboarding-checklist-implementation-plan.md \
  supabase/migrations/00103_organization_onboarding_states.sql \
  src/lib/onboarding/state.ts \
  src/lib/onboarding/actions.ts \
  src/app/[locale]/(dashboard)/onboarding/page.tsx \
  src/components/onboarding \
  src/app/[locale]/(dashboard)/layout.tsx \
  src/design/MainSidebar.tsx \
  src/design/MobileBottomNav.tsx \
  messages/en.json \
  messages/tr.json \
  docs/ROADMAP.md \
  docs/PRD.md \
  docs/RELEASE.md
git commit -m "feat(phase-3): add onboarding checklist and trial banner"
```
