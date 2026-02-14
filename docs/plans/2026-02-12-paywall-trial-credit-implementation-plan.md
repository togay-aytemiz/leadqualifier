# Paywall + Subscription Credits (TR/EN) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship a production-safe paywall where trial users must convert to a recurring monthly premium package (price `X TL`, included credits `Y`), with no top-up during trial, and top-up enabled only for active premium users after package credits are exhausted; expose this model through a dedicated `Plans & Credits` settings surface and always-visible trial/premium indicators in navigation.

**Architecture:** Add a billing domain centered on (1) subscription state, (2) monthly package credit allocation/consumption, and (3) immutable credit ledger for all debits/grants. Enforce entitlements before token-consuming runtime paths. Keep policy-driven pricing/credits admin-configurable with versioned effective timestamps. Split tenant UX into `Settings > Plans` (subscribe/top-up/trial status management) and `Settings > Billing` (usage + receipts/ledger).

**Tech Stack:** Next.js App Router, Supabase Postgres + RLS + SQL triggers/functions, next-intl, payment provider with TR-compliant recurring support (primary recommendation: Iyzico), Vitest.

---

## Execution Snapshot (As of 2026-02-14)

- Completed:
  - Billing schema + SQL entitlement/admin foundations (`00057_billing_subscription_foundation.sql`)
  - Runtime entitlement enforcement on inbound + token-consuming dashboard flows
  - Tenant billing visibility cards + credit ledger history on `/settings/billing`
  - Desktop sidebar + mobile More quick billing visibility
  - Admin billing visibility read models and screens
  - Admin platform defaults controls + per-organization manual billing overrides
  - Tenant `Settings > Plans` checkout-management surface with mock subscription/top-up actions (success/failure simulation), trial/premium status cards, and policy-aware blocked-state messaging
  - Rollout migration `00058_trial_backfill_mock_checkout_and_admin_overrides.sql` (existing non-system-admin org trial backfill + mock checkout SQL + extended admin override SQL)
  - Admin organization detail action coverage expanded: trial credit adjust, package credit adjust, membership/lock override
- In progress / pending:
  - Provider-backed recurring subscription checkout + top-up checkout + payment webhook sync (replace mock checkout)
  - Turkish provider selection + settlement/invoice compliance integration (Iyzico/PayTR decision gate)

## UI Contract (Plans + Trial Visibility)

- Settings information architecture:
  - `/settings/plans` is the commercial control center (subscription + top-up + trial conversion)
  - `/settings/billing` is detailed usage/receipts/ledger (existing breakdown remains)
- Trial visibility (must always exist):
  - trial users see: remaining days, remaining trial credits, trial end datetime, and lock condition explanation
  - top-up purchase actions are visible but disabled/guarded during trial with explicit reason copy
- Premium visibility:
  - active package status, package remaining/used, renewal/reset date
  - top-up purchase options visible and enabled only when policy allows
- Sidebar/mobile visibility:
  - show current state (`trial_active`, `trial_exhausted`, `premium_active`, etc.)
  - show quick remaining credits and trial countdown (when in trial)
  - deep link to `/settings/plans` for action; `/settings/billing` for details

---

## Policy Lock (Implementation Contract)

- Trial model: trial-only onboarding (already decided)
- Trial defaults for new organizations:
  - `trial_days = 14`
  - `trial_credits = 120.0`
- Trial lock precedence:
  - system locks when either time or trial credits is exhausted first
- Conversion order:
  - trial -> recurring monthly premium package (mandatory) -> optional top-up overflow
- Premium package (v1):
  - monthly recurring package
  - price `X TL` (admin-configurable)
  - included credits `Y` (admin-configurable)
- Top-up rule:
  - top-up is disabled during trial
  - top-up is enabled only for active premium subscriptions after package monthly credits are exhausted (or near exhausted by policy)
- Package credit rollover rule:
  - monthly package credits do not roll over to the next billing cycle
- Admin defaults scope:
  - trial defaults apply to newly created organizations
  - premium package updates follow policy versioning/effective-date rules

## Runtime Behavior Contract

- Allow token-consuming operations when:
  - trial active + trial credits remaining
  - OR premium subscription active + remaining monthly package credits
  - OR premium active + granted top-up credits remaining
- Block token-consuming operations when:
  - trial exhausted and no active premium
  - trial active but user attempts to purchase/use top-up flow
  - premium not active (`past_due`, `canceled`, `admin_locked`)
  - premium active but package credits exhausted and no top-up balance

## Membership + Lock State Contract

- `membership_state`:
  - `trial_active`, `trial_exhausted`, `premium_active`, `past_due`, `canceled`, `admin_locked`
- `credit_pool_state`:
  - `trial_pool`, `package_pool`, `topup_pool`
- `lock_reason`:
  - `none`, `trial_time_expired`, `trial_credits_exhausted`, `subscription_required`, `package_credits_exhausted`, `past_due`, `admin_locked`

---

### Task 1: Add Billing Schema for Subscription-First Model

**Files:**
- Create: `supabase/migrations/00057_billing_subscription_foundation.sql`
- Modify: `supabase/migrations/00006_fix_auth_triggers.sql`

**Step 1: Define enums/tables**
- Enums:
  - `membership_state`, `lock_reason`, `credit_ledger_type`, `credit_pool_type`
- Tables:
  - `platform_billing_settings` (trial + package defaults)
  - `billing_package_versions` (price TL + included credits + effective window)
  - `organization_billing_accounts` (state snapshot)
  - `organization_credit_ledger` (immutable)
  - `organization_subscription_records` (provider status timeline)
  - `credit_purchase_orders` (top-up orders)

**Step 2: SQL functions**
- `initialize_org_billing_account(org_id)`
- `compute_credit_cost(input_tokens, output_tokens)`
- `resolve_org_entitlement(org_id)`
- `apply_usage_debit(org_id, usage_id, input_tokens, output_tokens)`
- `allocate_monthly_package_credits(org_id, billing_period)`

**Step 3: Trigger wiring**
- On organization create -> initialize billing account + trial defaults
- On `organization_ai_usage` insert -> debit appropriate pool via entitlement function

**Step 4: RLS**
- org members read own billing summaries
- service role/system admin write critical billing state

**Step 5: Verify**
Run: `supabase db reset`
Expected: PASS.

**Step 6: Commit**
```bash
git add supabase/migrations/00057_billing_subscription_foundation.sql supabase/migrations/00006_fix_auth_triggers.sql
git commit -m "feat(phase-8.5): add subscription-first billing schema"
```

---

### Task 2: Extend Database and Domain Types

**Files:**
- Modify: `src/types/database.ts`
- Create: `src/lib/billing/types.ts`
- Test: `src/lib/billing/types.test.ts`

**Step 1: Add failing tests for state unions and DTOs**
**Step 2: Add types for package version, subscription record, ledger entries, entitlement snapshot**
**Step 3: Run tests**
Run: `npm run test -- src/lib/billing/types.test.ts`
Expected: PASS.

**Step 4: Commit**
```bash
git add src/types/database.ts src/lib/billing/types.ts src/lib/billing/types.test.ts
git commit -m "feat(phase-8.5): add subscription billing domain types"
```

---

### Task 3: Implement Entitlement Resolver (Trial/Package/Top-Up Pools)

**Files:**
- Create: `src/lib/billing/entitlements.ts`
- Create: `src/lib/billing/entitlements.test.ts`

**Step 1: Write failing tests**
- trial active + credits -> allowed
- trial exhausted + no premium -> blocked (`subscription_required`)
- premium active + package credits -> allowed
- premium active + package exhausted + top-up balance -> allowed
- premium active + package exhausted + no top-up -> blocked (`package_credits_exhausted`)
- past_due/admin_locked -> blocked

**Step 2: Implement resolver**
- return:
  - `isAllowed`
  - `lockReason`
  - `activePool`
  - `remainingTrialCredits`
  - `remainingPackageCredits`
  - `remainingTopupCredits`
  - `trialEndsAt`
  - `currentPeriodEnd`

**Step 3: Run tests**
Run: `npm run test -- src/lib/billing/entitlements.test.ts`
Expected: PASS.

**Step 4: Commit**
```bash
git add src/lib/billing/entitlements.ts src/lib/billing/entitlements.test.ts
git commit -m "feat(phase-8.5): add multi-pool entitlement resolver"
```

---

### Task 4: Integrate Credit Accounting with AI Usage Pipeline

**Files:**
- Modify: `src/lib/ai/usage.ts`
- Modify: `src/lib/billing/usage.ts`
- Test: `src/lib/ai/usage.test.ts`

**Step 1: Add failing tests for usage metadata and debit traceability**
**Step 2: Keep `organization_ai_usage` as usage source of truth**
**Step 3: Ensure debit trigger receives trace keys (`conversation_id`, `category`, `source`)**
**Step 4: Run tests**
Run: `npm run test -- src/lib/ai/usage.test.ts`
Expected: PASS.

**Step 5: Commit**
```bash
git add src/lib/ai/usage.ts src/lib/billing/usage.ts src/lib/ai/usage.test.ts
git commit -m "feat(phase-8.5): wire ai usage to subscription credit debit"
```

---

### Task 5: Enforce Paywall in Runtime (Inbound + Dashboard Actions)

**Files:**
- Modify: `src/lib/channels/inbound-ai-pipeline.ts`
- Modify: `src/lib/inbox/actions.ts`
- Modify: `src/lib/chat/actions.ts`
- Test: `src/lib/channels/inbound-ai-pipeline.test.ts`
- Test: `src/lib/inbox/actions.test.ts`
- Test: `src/lib/chat/actions.test.ts`

**Step 1: Add failing lock-state tests**
- trial exhausted and no premium -> blocked
- premium past_due -> blocked
- package exhausted with no top-up -> blocked
- package exhausted with top-up -> allowed

**Step 2: Apply entitlement checks before token-consuming operations**
- extraction, router/RAG/fallback, summary, reasoning, simulator send

**Step 3: Return actionable blocked payloads for UI banners**
- include `lockReason` + CTA type (`subscribe`, `topup`, `update_payment`)

**Step 4: Run tests**
Run: `npm run test -- src/lib/channels/inbound-ai-pipeline.test.ts src/lib/inbox/actions.test.ts src/lib/chat/actions.test.ts`
Expected: PASS.

**Step 5: Commit**
```bash
git add src/lib/channels/inbound-ai-pipeline.ts src/lib/inbox/actions.ts src/lib/chat/actions.ts src/lib/channels/inbound-ai-pipeline.test.ts src/lib/inbox/actions.test.ts src/lib/chat/actions.test.ts
git commit -m "feat(phase-8.5): enforce subscription-first paywall in runtime"
```

---

### Task 6: Settings IA Realignment (`Plans` vs `Billing`)

**Files:**
- Modify: `src/components/settings/mobilePaneState.ts`
- Modify: `src/components/settings/mobilePaneState.test.ts`
- Modify: `src/components/settings/SettingsResponsiveShell.tsx`
- Create: `src/app/[locale]/(dashboard)/settings/plans/page.tsx`
- Modify: `messages/en.json`
- Modify: `messages/tr.json`

**Step 1: Add failing nav tests**
- `/settings/plans` resolves active settings nav item as `plans`
- `Plans` row has a real href (not placeholder)
- `Billing` row remains mapped to receipts/usage detail (`/settings/billing`)

**Step 2: Wire route + nav**
- make `Plans` item route to `/settings/plans`
- keep `/settings/billing` for usage/ledger/receipts
- ensure mobile single-pane settings flow supports `plans`

**Step 3: Add i18n clarifications**
- `Sidebar.plans` stays action-oriented (“Plans & Credits”)
- `Sidebar.receipts` keeps usage/receipt meaning

**Step 4: Run tests**
Run: `npm run test -- src/components/settings/mobilePaneState.test.ts`
Expected: PASS.

**Step 5: Commit**
```bash
git add src/components/settings/mobilePaneState.ts src/components/settings/mobilePaneState.test.ts src/components/settings/SettingsResponsiveShell.tsx src/app/[locale]/(dashboard)/settings/plans/page.tsx messages/en.json messages/tr.json
git commit -m "feat(phase-8.5): split settings plans and billing surfaces"
```

---

### Task 7: Build `Plans & Credits` Tenant Surface (Trial-First)

**Files:**
- Modify: `src/lib/billing/server.ts`
- Create: `src/lib/billing/plan-context.ts`
- Create: `src/lib/billing/plan-context.test.ts`
- Create: `src/app/[locale]/(dashboard)/settings/plans/page.tsx`
- Create: `src/app/[locale]/(dashboard)/settings/plans/PlanStatusCard.tsx`
- Create: `src/app/[locale]/(dashboard)/settings/plans/SubscriptionSection.tsx`
- Create: `src/app/[locale]/(dashboard)/settings/plans/TopupSection.tsx`
- Modify: `messages/en.json`
- Modify: `messages/tr.json`

**Step 1: Add failing tests (trial + premium states)**
- trial active card shows:
  - remaining trial credits
  - remaining days
  - trial end datetime
  - conversion CTA (`Subscribe`)
- trial exhausted card shows lock reason + subscribe-required CTA
- premium active card shows package remaining/used + next reset date
- top-up section hidden/disabled during trial with explicit reason text
- top-up section visible for premium; enabled only when entitlement allows

**Step 2: Build plan-context mapper**
- centralize UI-ready plan state:
  - `membershipState`
  - `lockReason`
  - `trialRemainingDays`, `trialRemainingCredits`
  - `packageRemainingCredits`, `topupBalance`
  - `isTopupAllowed`, `isUsageAllowed`

**Step 3: Implement page layout (`/settings/plans`)**
- header: “Plans & Credits”
- status card:
  - trial users: “You are on Trial”
  - premium users: “You are on Premium”
  - locked users: explicit lock + required next action
- subscription section:
  - current package price (`X TL`) + monthly credits (`Y`)
  - subscribe/manage CTA (provider checkout wiring in Task 8)
- top-up section:
  - package cards + CTA
  - trial users see disabled state + helper copy

**Step 4: Run tests + lint**
Run: `npm run test -- src/lib/billing/plan-context.test.ts`
Expected: PASS.

Run: `npm run lint`
Expected: PASS.

**Step 5: Commit**
```bash
git add src/lib/billing/server.ts src/lib/billing/plan-context.ts src/lib/billing/plan-context.test.ts src/app/[locale]/(dashboard)/settings/plans/page.tsx src/app/[locale]/(dashboard)/settings/plans/PlanStatusCard.tsx src/app/[locale]/(dashboard)/settings/plans/SubscriptionSection.tsx src/app/[locale]/(dashboard)/settings/plans/TopupSection.tsx messages/en.json messages/tr.json
git commit -m "feat(phase-8.5): add plans-and-credits trial-first tenant page"
```

---

### Task 8: Sidebar + Mobile Trial/Premium Visibility Refinement

**Files:**
- Modify: `src/design/MainSidebar.tsx`
- Modify: `src/design/MobileBottomNav.tsx`
- Create: `src/lib/billing/sidebar-status.ts`
- Create: `src/lib/billing/sidebar-status.test.ts`
- Modify: `messages/en.json`
- Modify: `messages/tr.json`

**Step 1: Add failing formatter tests**
- trial active status line includes both:
  - remaining trial days
  - remaining trial credits
- trial exhausted status line includes lock reason (`subscription required`)
- premium active line includes package remaining credits + reset date (if exists)

**Step 2: Refine desktop sidebar card placement + copy**
- keep visibility always-on when org context exists
- move/position card near “Other”/profile zone (final placement decision during implementation)
- primary action link goes to `/settings/plans`
- optional secondary text link goes to `/settings/billing` for detailed receipts

**Step 3: Refine mobile More menu status row**
- show same trial/premium summary logic
- quick action to `/settings/plans`
- secondary action to `/settings/billing` retained

**Step 4: Run tests + lint**
Run: `npm run test -- src/lib/billing/sidebar-status.test.ts`
Expected: PASS.

Run: `npm run lint`
Expected: PASS.

**Step 5: Commit**
```bash
git add src/design/MainSidebar.tsx src/design/MobileBottomNav.tsx src/lib/billing/sidebar-status.ts src/lib/billing/sidebar-status.test.ts messages/en.json messages/tr.json
git commit -m "feat(phase-8.5): refine sidebar trial and premium visibility"
```

---

### Task 9: Payment Provider Integration (TR Recurring + Top-Up)

**Files:**
- Create: `src/lib/billing/provider.ts`
- Create: `src/lib/billing/provider-iyzico.ts`
- Create: `src/lib/billing/provider-iyzico.test.ts`
- Create: `src/app/api/billing/checkout/subscribe/route.ts`
- Create: `src/app/api/billing/checkout/topup/route.ts`

**Step 1: Provider abstraction**
- `createSubscriptionCheckout`
- `createTopupCheckout`
- `verifyWebhook`

**Step 2: Implement recurring subscription checkout route**
- create pending subscription record
- redirect URL handling

**Step 3: Implement top-up checkout route**
- reject when membership is `trial_active` or no active premium
- allow only when entitlement says package exhausted/near-threshold policy

**Step 4: Run tests**
Run: `npm run test -- src/lib/billing/provider-iyzico.test.ts`
Expected: PASS.

**Step 5: Commit**
```bash
git add src/lib/billing/provider.ts src/lib/billing/provider-iyzico.ts src/lib/billing/provider-iyzico.test.ts src/app/api/billing/checkout/subscribe/route.ts src/app/api/billing/checkout/topup/route.ts
git commit -m "feat(phase-8.5): add tr-recurring payment provider integration"
```

---

### Task 10: Webhooks (Subscription Lifecycle + Credit Grants)

**Files:**
- Create: `src/app/api/billing/webhooks/provider/route.ts`
- Create: `src/app/api/billing/webhooks/provider/route.test.ts`
- Modify: `src/lib/billing/credits.ts`

**Step 1: Add failing lifecycle tests**
- subscription activated -> `premium_active` + allocate package credits
- renewal success -> refresh period + allocate next package credits
- renewal success with remaining package credits -> clear previous-cycle package pool (non-rollover) before allocating new cycle credits
- payment failure -> `past_due`
- cancellation -> `canceled`
- top-up success -> ledger credit + top-up balance
- idempotency for duplicate webhook events

**Step 2: Implement handlers**
**Step 3: Run tests**
Run: `npm run test -- src/app/api/billing/webhooks/provider/route.test.ts`
Expected: PASS.

**Step 4: Commit**
```bash
git add src/app/api/billing/webhooks/provider/route.ts src/app/api/billing/webhooks/provider/route.test.ts src/lib/billing/credits.ts
git commit -m "feat(phase-8.5): handle subscription lifecycle and top-up webhooks"
```

---

### Task 11: Abuse Prevention + Audit Trail

**Files:**
- Create: `supabase/migrations/00058_trial_abuse_guards.sql`
- Create: `supabase/migrations/00059_billing_audit_log.sql`
- Create: `src/lib/billing/trial-abuse.ts`
- Create: `src/lib/billing/trial-abuse.test.ts`
- Create: `src/app/[locale]/(dashboard)/admin/billing/audit/page.tsx`

**Step 1: Add one-trial-per-business guardrail and cooldown storage**
**Step 2: Add billing admin audit rows for config/override actions**
- include all manual support operations:
  - trial extension
  - credit adjustments
  - premium assignment/cancel
**Step 3: Run tests**
Run: `npm run test -- src/lib/billing/trial-abuse.test.ts`
Expected: PASS.

**Step 4: Commit**
```bash
git add supabase/migrations/00058_trial_abuse_guards.sql supabase/migrations/00059_billing_audit_log.sql src/lib/billing/trial-abuse.ts src/lib/billing/trial-abuse.test.ts src/app/[locale]/(dashboard)/admin/billing/audit/page.tsx
git commit -m "feat(phase-8.5): add trial abuse guards and billing audit trail"
```

---

### Task 12: E2E + Verification Gates

**Files:**
- Create: `tests/e2e/billing-subscription-paywall.spec.ts`
- Modify: `tests/e2e/helpers/auth.ts`
- Modify: `playwright.config.ts`

**Step 1: E2E scenarios**
- trial active -> AI usable
- trial exhausted -> subscribe paywall appears
- premium active -> package credits consumed
- package exhausted -> top-up CTA appears
- top-up success -> AI resumes
- admin updates package config -> new signup/org reflects policy version

**Step 2: Verification commands**
Run: `npm run test -- src/lib/billing/*.test.ts src/lib/admin/*.test.ts`
Expected: PASS.

Run: `npm run test:e2e:admin`
Expected: PASS or explicit env-gated skip.

Run: `npm run build`
Expected: PASS.

**Step 3: Commit**
```bash
git add tests/e2e/billing-subscription-paywall.spec.ts tests/e2e/helpers/auth.ts playwright.config.ts
git commit -m "test(phase-8.5): add subscription-first paywall e2e coverage"
```

---

### Task 13: Documentation Updates (Required)

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

**Step 1: Mark completed roadmap items with `[x]`**
**Step 2: Update PRD monetization + tech decisions**
**Step 3: Add release notes entries (Added/Changed/Fixed)**
**Step 4: Final build verification**
Run: `npm run build`
Expected: PASS.

---

## Provider Selection Track (TR)

- Required capabilities:
  - recurring monthly subscription
  - webhook lifecycle events
  - one-time top-up payments
  - Turkish business compliance/invoicing support
- Recommendation order for implementation spike:
  1. Iyzico (primary: TR subscription-ready path)
  2. PayTR (fallback/alternative: recurring flow via stored-card recurring model)
  3. Stripe (only if operating via a supported non-TR Stripe account/entity; do not assume direct TR local onboarding)

## Environment Variables (Planned)

- `BILLING_PROVIDER=iyzico`
- `IYZICO_API_KEY`
- `IYZICO_SECRET_KEY`
- `IYZICO_BASE_URL`
- `IYZICO_WEBHOOK_SECRET`

## Risks

- Subscription state drift between provider webhooks and internal DB.
- Monthly credit re-allocation edge cases around timezone boundaries.
- Inconsistent top-up gating if entitlement checks are bypassed in one runtime path.
- RLS leaks for billing tables in cross-tenant admin contexts.

## Skills Used In Execution

- `@brainstorming`
- `@writing-plans`
- `@test-driven-development`
- `@troubleshooting`
- `@verification-before-completion`

Plan complete and saved to `docs/plans/2026-02-12-paywall-trial-credit-implementation-plan.md`. Two execution options:

1. Subagent-Driven (this session) - I dispatch fresh subagent per task, review between tasks, fast iteration
2. Parallel Session (separate) - Open new session with executing-plans, batch execution with checkpoints
