# Sales-Led Billing Request Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace visible self-service billing checkout actions with a lightweight sales-led request flow that stores requests, emails the admin through Resend, and lets admins assign manually recurring packages.

**Architecture:** Keep Iyzico and self-service code in place, but remove it from normal Plans CTAs. Add a narrow purchase-request module with DB persistence, best-effort Resend email notification, and a small admin read model. Extend existing admin manual billing RPCs/UI for named plan assignment and manual monthly renewal.

**Tech Stack:** Next.js App Router, server actions, Supabase/Postgres/RLS/RPC, next-intl, Resend REST API via `fetch`, Vitest, TypeScript.

---

### Task 1: Purchase Request Schema

**Files:**
- Create: `supabase/migrations/00116_billing_purchase_requests.sql`
- Modify: `src/types/database.ts`
- Test: `src/lib/supabase/migration-version-uniqueness.test.ts`

- [ ] Add `billing_purchase_request_type`, `billing_purchase_request_status`, and `billing_purchase_request_email_status` enums.
- [ ] Add `billing_purchase_requests` with organization/user foreign keys, request details, status, email status, metadata, timestamps, and indexes.
- [ ] Add RLS policies: members insert for own org, members can read own org rows, system admins can select/update all.
- [ ] Update database types with the new table and enums.
- [ ] Run `npm test -- --run src/lib/supabase/migration-version-uniqueness.test.ts`.

### Task 2: Request Email Adapter

**Files:**
- Create: `src/lib/billing/purchase-request-email.ts`
- Test: `src/lib/billing/purchase-request-email.test.ts`

- [ ] Write failing tests for disabled Resend config, successful payload construction, and failed Resend response.
- [ ] Implement `sendBillingPurchaseRequestEmail` using `fetch` against `https://api.resend.com/emails`.
- [ ] Read `RESEND_API_KEY`, `BILLING_REQUEST_EMAIL_TO`, and `BILLING_REQUEST_EMAIL_FROM`.
- [ ] Return typed statuses: `not_configured`, `sent`, or `failed` with short error text.
- [ ] Run `npm test -- --run src/lib/billing/purchase-request-email.test.ts`.

### Task 3: Purchase Request Server Action

**Files:**
- Create: `src/lib/billing/purchase-request.actions.ts`
- Test: `src/lib/billing/purchase-request.actions.test.ts`

- [ ] Write failing tests for plan request insert, top-up request insert, unauthorized user, invalid plan/top-up, and email failure still returning success.
- [ ] Implement `createBillingPurchaseRequest`.
- [ ] Validate `organizationId`, request type, plan/top-up ids, and authenticated membership through `assert_org_member_or_admin`.
- [ ] Load organization, requester profile, and pricing catalog in parallel where possible.
- [ ] Insert request with `email_status = not_configured` first, send email, then update email status.
- [ ] Return a small result object for Plans redirects.
- [ ] Run `npm test -- --run src/lib/billing/purchase-request.actions.test.ts`.

### Task 4: Plans UI Sales-Led Mode

**Files:**
- Modify: `src/app/[locale]/(dashboard)/settings/plans/PlansSettingsPageContent.tsx`
- Modify: `src/app/[locale]/(dashboard)/settings/plans/SubscriptionPlanCatalog.tsx`
- Modify: `src/app/[locale]/(dashboard)/settings/plans/SubscriptionPlanManager.tsx`
- Modify: `src/app/[locale]/(dashboard)/settings/plans/TopupCheckoutCard.tsx`
- Modify: `messages/en.json`
- Modify: `messages/tr.json`
- Test: existing `settings/plans/*.test.tsx` and source guards, plus new source guard if needed.

- [ ] Write failing/source tests proving plan/top-up CTAs use request actions and no hosted checkout modal is opened from the normal Plans cards.
- [ ] Replace legal-consent checkout modals with lightweight request confirmation modals.
- [ ] Add success/error query handling for `purchase_request_status`.
- [ ] Wire plan, plan-change, and top-up forms to `createBillingPurchaseRequest`.
- [ ] Add mirrored TR/EN copy.
- [ ] Run targeted Plans tests and `npm test -- --run src/i18n/messages.test.ts`.

### Task 5: Admin Request Visibility And Named Plan Assignment

**Files:**
- Modify: `src/lib/admin/read-models.ts`
- Modify: `src/lib/admin/billing-manual.ts`
- Modify: `src/app/[locale]/(dashboard)/admin/organizations/[id]/page.tsx`
- Modify: `messages/en.json`
- Modify: `messages/tr.json`
- Test: `src/lib/admin/billing-manual.test.ts` and an admin source/read-model test if local pattern supports it.

- [ ] Write failing tests for named plan assignment payload and request rows appearing in the admin organization detail model.
- [ ] Add recent purchase requests to `getAdminOrganizationDetail`.
- [ ] Add `adminAssignNamedPremiumPlan` wrapper that resolves catalog plan id to credits/price.
- [ ] Add a compact admin section showing recent requests and an assign-by-plan form.
- [ ] Keep existing freeform/manual credit forms.
- [ ] Run targeted admin tests and i18n mirror test.

### Task 6: Manual Recurring Renewal

**Files:**
- Create: `supabase/migrations/00117_manual_recurring_billing_renewal.sql`
- Create/Modify: `src/lib/billing/manual-renewal.ts`
- Modify: `src/lib/billing/server.ts`
- Modify: `src/lib/billing/entitlements.ts`
- Modify: `src/lib/billing/snapshot.ts` or `src/lib/billing/policy.ts` only if needed.
- Test: `src/lib/billing/manual-renewal.test.ts`, `src/lib/billing/snapshot.test.ts`, `src/lib/billing/entitlements.test.ts`

- [ ] Write failing tests showing a manual premium subscription past period end renews once and remains usable.
- [ ] Add an idempotent RPC to renew active `manual_admin` subscriptions monthly.
- [ ] Call the renewal helper before billing snapshot and entitlement reads.
- [ ] Ensure non-manual/Iyzico expired premium behavior stays unchanged.
- [ ] Run targeted billing tests.

### Task 7: Docs, Release Notes, And Verification

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`
- Modify: `.env` only if documenting placeholder env vars is already a local pattern; otherwise do not change secrets.

- [ ] Update roadmap last updated date and mark/add sales-led billing tasks.
- [ ] Add PRD tech decision/update note for Resend-backed manual billing requests.
- [ ] Add release notes under Unreleased.
- [ ] Run `npm test -- --run` for touched targeted tests.
- [ ] Run `npm run build`.
- [ ] Provide commit message: `feat(phase-7): add sales-led billing request flow`.

