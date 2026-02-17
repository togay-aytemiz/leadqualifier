# Iyzico Billing Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace mock subscription/top-up checkout with production-ready iyzico integration (subscription + payment link), webhook-driven state sync, and idempotent credit grants for `Settings > Plans`.

**Architecture:** Keep current billing domain model (`organization_billing_accounts`, `organization_subscription_records`, `credit_purchase_orders`, `organization_credit_ledger`) as source of truth. Add an iyzico provider layer that creates checkout intents and processes webhook callbacks, while preserving existing entitlement rules and UI contracts (`checkout_status`, lock states, renewal behavior).

**Tech Stack:** Next.js App Router, Supabase Postgres/RPC, server actions, iyzico API (subscription + iyzilink), Vitest.

---

## External Prerequisites (Merchant Side, Blocking)

These steps are required before code rollout:

1. Create production merchant account from `merchant.iyzipay.com` (`Başvuru Yap`).
2. Complete KYC/company onboarding and wait for live merchant activation.
3. Activate subscription product in iyzico panel (`Eklentiler > Satın Al`).  
   Note: Sandbox subscription activation is requested via `destek@iyzico.com`.
4. Enable webhook events for subscription/link payment and define callback URL placeholders.
5. Share with engineering:
   - `IYZICO_API_KEY`
   - `IYZICO_SECRET_KEY`
   - `IYZICO_BASE_URL` (`https://api.iyzipay.com` live, `https://sandbox-api.iyzipay.com` sandbox)
   - Webhook verification secret/details from panel

No implementation should start in live mode until these are complete.

---

### Task 1: Introduce Provider Config + Runtime Guards

**Files:**
- Create: `src/lib/billing/providers/config.ts`
- Create: `src/lib/billing/providers/config.test.ts`
- Modify: `src/lib/billing/mock-checkout.ts`
- Modify: `src/lib/billing/subscription-renewal.ts`

**Step 1: Write failing tests**
- Add tests for:
  - missing iyzico env vars => `provider_not_configured`
  - sandbox/live base URL selection
  - safe fallback in non-production when iyzico disabled

**Step 2: Run targeted tests**
- Run: `npm run test -- --run src/lib/billing/providers/config.test.ts`

**Step 3: Implement minimal config module**
- Add typed env resolver and explicit error mapping.
- Keep current mock flow available behind feature flag (for local/dev).

**Step 4: Re-run tests**
- Run: `npm run test -- --run src/lib/billing/providers/config.test.ts`

**Step 5: Commit**
- `feat(phase-8): add billing provider config and safety guards`

---

### Task 2: Build Iyzico HTTP Client + Signature Verification

**Files:**
- Create: `src/lib/billing/providers/iyzico/client.ts`
- Create: `src/lib/billing/providers/iyzico/signature.ts`
- Create: `src/lib/billing/providers/iyzico/client.test.ts`
- Create: `src/lib/billing/providers/iyzico/signature.test.ts`

**Step 1: Write failing tests**
- Cover request auth header generation (`IYZWSv2`), nonce/timestamp behavior, and signature verification failure/success paths.

**Step 2: Run tests**
- Run: `npm run test -- --run src/lib/billing/providers/iyzico/signature.test.ts src/lib/billing/providers/iyzico/client.test.ts`

**Step 3: Implement client**
- Add shared POST/GET wrapper with structured error mapping.
- Normalize iyzico API error payloads into internal provider error codes.

**Step 4: Re-run tests**
- Same command as Step 2.

**Step 5: Commit**
- `feat(phase-8): add iyzico client and webhook signature verification`

---

### Task 3: Replace Subscription Mock Checkout with Iyzico Subscription Init

**Files:**
- Create: `src/lib/billing/providers/iyzico/subscription.ts`
- Create: `src/lib/billing/providers/iyzico/subscription.test.ts`
- Modify: `src/lib/billing/mock-checkout.ts`
- Modify: `src/app/[locale]/(dashboard)/settings/plans/page.tsx`

**Step 1: Write failing tests**
- Add tests for:
  - plan change request creates external iyzico subscription checkout/init call
  - downgrade scheduling metadata is preserved (`pending_plan_change`)
  - provider failure returns mapped `checkout_error`

**Step 2: Run tests**
- Run: `npm run test -- --run src/lib/billing/mock-checkout.test.ts src/lib/billing/providers/iyzico/subscription.test.ts`

**Step 3: Implement**
- Keep existing domain output contract:
  - `success | scheduled | failed | blocked | error`
- Save `provider_subscription_id`/checkout token into `organization_subscription_records` + metadata.
- Preserve `TR` vs `USD` pricing from `pricing-catalog` and region rule.

**Step 4: Re-run tests**
- Same command as Step 2.

**Step 5: Commit**
- `feat(phase-8): integrate iyzico subscription checkout flow`

---

### Task 4: Integrate Top-up Payment Link Flow (Iyzico Link)

**Files:**
- Create: `src/lib/billing/providers/iyzico/link.ts`
- Create: `src/lib/billing/providers/iyzico/link.test.ts`
- Modify: `src/lib/billing/mock-checkout.ts`
- Modify: `src/app/[locale]/(dashboard)/settings/plans/TopupCheckoutCard.tsx`
- Modify: `src/app/[locale]/(dashboard)/settings/plans/page.tsx`

**Step 1: Write failing tests**
- Add tests for top-up order creation:
  - creates `credit_purchase_orders` with provider checkout/link reference
  - returns redirect URL for payment link
  - handles blocked top-up states unchanged

**Step 2: Run tests**
- Run: `npm run test -- --run src/lib/billing/mock-checkout.test.ts src/lib/billing/providers/iyzico/link.test.ts`

**Step 3: Implement**
- Replace simulated top-up success path with “pending order + redirect to iyzico link URL”.
- Maintain existing UI status query params for post-callback feedback.

**Step 4: Re-run tests**
- Same command as Step 2.

**Step 5: Commit**
- `feat(phase-8): integrate iyzico payment link flow for topups`

---

### Task 5: Add Webhook Endpoint + Idempotent Event Processing

**Files:**
- Create: `src/app/api/webhooks/iyzico/route.ts`
- Create: `src/app/api/webhooks/iyzico/route.test.ts`
- Create: `src/lib/billing/providers/iyzico/webhook.ts`
- Create: `src/lib/billing/providers/iyzico/webhook.test.ts`
- Create: `supabase/migrations/00065_iyzico_webhook_events.sql`
- Modify: `src/types/database.ts`

**Step 1: Write failing tests**
- Cover:
  - invalid signature rejected (`401/403`)
  - duplicate event ignored (idempotent)
  - successful payment updates order/subscription and grants credits once

**Step 2: Run tests**
- Run: `npm run test -- --run src/app/api/webhooks/iyzico/route.test.ts src/lib/billing/providers/iyzico/webhook.test.ts`

**Step 3: Implement**
- Add webhook event log table with unique event key.
- Process subscription renewals/cancel/past_due transitions into billing tables.
- Process top-up payment success into `organization_credit_ledger` and `topup_credit_balance`.

**Step 4: Re-run tests**
- Same command as Step 2.

**Step 5: Commit**
- `feat(phase-8): add iyzico webhook processing with idempotency`

---

### Task 6: Renewal/Cancellation API Wiring

**Files:**
- Modify: `src/lib/billing/subscription-renewal.ts`
- Create: `src/lib/billing/subscription-renewal-iyzico.test.ts`
- Modify: `src/app/[locale]/(dashboard)/settings/plans/SubscriptionPlanManager.tsx`

**Step 1: Write failing tests**
- cancel-at-period-end / resume flows map to iyzico subscription lifecycle APIs.

**Step 2: Run tests**
- Run: `npm run test -- --run src/lib/billing/subscription-renewal.test.ts src/lib/billing/subscription-renewal-iyzico.test.ts`

**Step 3: Implement**
- Replace mock RPC renewal toggles with provider-backed calls.
- Keep UI behavior unchanged (`cancel_at_period_end`, `pending plan` messaging).

**Step 4: Re-run tests**
- Same command as Step 2.

**Step 5: Commit**
- `feat(phase-8): connect subscription renewal controls to iyzico`

---

### Task 7: Migration/Data Backfill + Documentation Sync

**Files:**
- Modify: `docs/PRD.md`
- Modify: `docs/ROADMAP.md`
- Modify: `docs/RELEASE.md`
- Create/Modify: provider runbook doc (recommended: `docs/plans/2026-02-17-iyzico-go-live-runbook.md`)

**Step 1: Update docs**
- PRD tech decisions: provider choice, webhook idempotency rule, reconciliation policy.
- ROADMAP: mark iyzico checkout/webhook tasks complete only after test/build pass.
- RELEASE: Added/Changed entries for subscription/top-up integration.

**Step 2: Add go-live checklist**
- Sandbox -> production cutover steps, secrets, callback URLs, rollback switches.

**Step 3: Commit**
- `docs: add iyzico integration decisions and go-live checklist`

---

### Task 8: Verification Gate

**Files:**
- No new files; verification only.

**Step 1: Run focused tests**
- `npm run test -- --run src/lib/billing/mock-checkout.test.ts src/lib/billing/subscription-renewal.test.ts src/lib/billing/providers/iyzico/*.test.ts src/app/api/webhooks/iyzico/route.test.ts`

**Step 2: Run i18n checks**
- `npm run i18n:check`

**Step 3: Run production build**
- `npm run build`

**Step 4: Manual QA smoke**
- Trial org: top-up blocked
- Premium org: top-up purchase success -> credit grant
- Premium cancel/resume flow
- Webhook duplicate replay no-op

**Step 5: Commit verification notes**
- `test: verify iyzico billing integration regression suite`

---

## Implementation Notes (Critical)

- Keep all monetary amounts normalized in provider metadata with original currency (`TRY`/`USD`) and amount.
- Never grant credits on client redirect callback alone; grant only after validated webhook success.
- Use provider event/order unique keys to guarantee exactly-once ledger effects.
- Preserve current lock semantics (`subscription_required`, `past_due`, `admin_locked`) across webhook status changes.
- Keep mock mode as a feature flag fallback until production cutover is stable.
