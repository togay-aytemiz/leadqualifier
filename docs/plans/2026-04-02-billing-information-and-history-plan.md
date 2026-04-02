# Billing Information and History Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an MVP `Billing Information` surface and a text-style `History` action so operators can review purchase events and maintain the minimum billing profile needed for Iyzico flows.

**Architecture:** Extend `Settings > Billing` instead of introducing a separate billing portal. Reuse existing organization and auth data for prefills, persist a small org-scoped billing profile table for address/invoice fields, and surface a compact history modal derived from existing subscription/order/ledger data rather than trying to build full invoices.

**Tech Stack:** Next.js App Router, Supabase Postgres + RLS, next-intl, server components + client modal components, Vitest.

---

### Task 1: Define the billing profile persistence model

**Files:**
- Create: `supabase/migrations/00106_billing_profiles.sql`
- Test/Inspect: existing patterns in `supabase/migrations/00001_initial_schema.sql`

**Step 1: Write the failing test**

Add a source/schema guard or data-layer test that expects a dedicated org-scoped billing profile storage path to exist.

**Step 2: Run test to verify it fails**

Run: `npm test -- --run "src/app/[locale]/(dashboard)/settings/billing/BillingSettingsPageContent.test.tsx"`

Expected: FAIL because no billing profile source exists yet.

**Step 3: Write minimal implementation**

Create a new table for:
- `organization_id`
- `company_name`
- `billing_email`
- `address_line_1`
- `address_line_2`
- `city`
- `state_region`
- `postal_code`
- `country_code`
- timestamps

Add RLS for organization-scoped select/update and a trigger for `updated_at`.

**Step 4: Run test to verify it passes**

Run the targeted billing settings tests again.

**Step 5: Commit**

```bash
git add supabase/migrations/00106_billing_profiles.sql
git commit -m "feat(phase-8.5): add org billing profile storage"
```

### Task 2: Add failing UI tests for billing information and history

**Files:**
- Create: `src/app/[locale]/(dashboard)/settings/billing/BillingSettingsPageContent.test.tsx`
- Modify: `src/app/[locale]/(dashboard)/settings/billing/BillingLedgerTable.test.tsx`

**Step 1: Write the failing test**

Add tests that expect:
- a `Billing Information` card with company name + billing email prefills
- a text-style `History` action
- a modal or expandable history surface with purchase rows
- no provider-invoice language; use `History`

**Step 2: Run test to verify it fails**

Run: `npm test -- --run "src/app/[locale]/(dashboard)/settings/billing/BillingSettingsPageContent.test.tsx"`

Expected: FAIL because the UI does not exist yet.

**Step 3: Write minimal implementation**

Keep the tests scoped to the MVP behavior only.

**Step 4: Run test to verify it passes**

Run the same targeted tests.

**Step 5: Commit**

```bash
git add src/app/[locale]/(dashboard)/settings/billing/BillingSettingsPageContent.test.tsx src/app/[locale]/(dashboard)/settings/billing/BillingLedgerTable.test.tsx
git commit -m "test(phase-8.5): cover billing information and history surfaces"
```

### Task 3: Load billing profile + purchase history data on the billing page

**Files:**
- Modify: `src/app/[locale]/(dashboard)/settings/billing/BillingSettingsPageContent.tsx`
- Create: `src/lib/billing/history.ts`
- Create: `src/lib/billing/history.test.ts`

**Step 1: Write the failing test**

Cover the mapper that turns subscription records + top-up orders + ledger context into a unified history row model.

**Step 2: Run test to verify it fails**

Run: `npm test -- --run "src/lib/billing/history.test.ts"`

Expected: FAIL because the helper is missing.

**Step 3: Write minimal implementation**

Build a compact history model with:
- date
- type (`subscription_start`, `upgrade`, `renewal`, `topup`, `card_update` optional only if already available)
- amount label
- status
- short detail

Query only recent rows needed for the modal.

**Step 4: Run test to verify it passes**

Run the same helper test.

**Step 5: Commit**

```bash
git add src/lib/billing/history.ts src/lib/billing/history.test.ts src/app/[locale]/(dashboard)/settings/billing/BillingSettingsPageContent.tsx
git commit -m "feat(phase-8.5): load unified billing history data"
```

### Task 4: Implement the billing information form and history modal

**Files:**
- Create: `src/app/[locale]/(dashboard)/settings/billing/BillingInformationCard.tsx`
- Create: `src/app/[locale]/(dashboard)/settings/billing/BillingHistoryModal.tsx`
- Modify: `src/app/[locale]/(dashboard)/settings/billing/BillingSettingsPageContent.tsx`

**Step 1: Write the failing test**

Expect:
- `Company name` prefilled from organization or saved profile
- `Billing email` prefilled from current user or saved profile
- other fields editable
- `History` as text-style button/link
- modal shows history rows or a compact empty state

**Step 2: Run test to verify it fails**

Run: `npm test -- --run "src/app/[locale]/(dashboard)/settings/billing/BillingSettingsPageContent.test.tsx"`

Expected: FAIL because the card/modal are not wired.

**Step 3: Write minimal implementation**

Use simple local modal state and a small editable form. Keep visuals consistent with existing settings UI. No invoice download, VAT engine, or PDF generation.

**Step 4: Run test to verify it passes**

Run the page-content test again.

**Step 5: Commit**

```bash
git add src/app/[locale]/(dashboard)/settings/billing/BillingInformationCard.tsx src/app/[locale]/(dashboard)/settings/billing/BillingHistoryModal.tsx src/app/[locale]/(dashboard)/settings/billing/BillingSettingsPageContent.tsx
git commit -m "feat(phase-8.5): add billing information card and history modal"
```

### Task 5: Add save action for the billing profile

**Files:**
- Modify: `src/app/[locale]/(dashboard)/settings/billing/BillingSettingsPageContent.tsx`
- Create: `src/app/[locale]/(dashboard)/settings/billing/billing-profile.actions.test.ts`

**Step 1: Write the failing test**

Add a server-action test covering:
- organization-scoped save
- trimmed values
- prefill fallback preserved when fields are omitted

**Step 2: Run test to verify it fails**

Run: `npm test -- --run "src/app/[locale]/(dashboard)/settings/billing/billing-profile.actions.test.ts"`

Expected: FAIL because the save action does not exist.

**Step 3: Write minimal implementation**

Persist the billing profile with upsert semantics. Keep validation minimal:
- non-empty company name
- valid-ish billing email
- optional address fields
- optional country code

**Step 4: Run test to verify it passes**

Run the same action test.

**Step 5: Commit**

```bash
git add src/app/[locale]/(dashboard)/settings/billing/billing-profile.actions.test.ts src/app/[locale]/(dashboard)/settings/billing/BillingSettingsPageContent.tsx
git commit -m "feat(phase-8.5): save billing information profile"
```

### Task 6: Add translations, docs, and verification

**Files:**
- Modify: `messages/tr.json`
- Modify: `messages/en.json`
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

**Step 1: Write/adjust failing checks**

Make sure i18n checks or page tests reference the new keys.

**Step 2: Run checks to verify any failures**

Run:
- `npm run i18n:check`

**Step 3: Write minimal implementation**

Add bilingual copy for:
- billing information section
- history action
- empty history state
- form labels
- save/cancel feedback

Update roadmap, PRD, and release notes with the MVP scope.

**Step 4: Run full verification**

Run:
- `npm test -- --run "src/app/[locale]/(dashboard)/settings/billing/BillingSettingsPageContent.test.tsx"`
- `npm test -- --run "src/lib/billing/history.test.ts"`
- `npm test -- --run "src/app/[locale]/(dashboard)/settings/billing/BillingLedgerTable.test.tsx"`
- `npm run i18n:check`
- `npm run build`

Expected: all pass.

**Step 5: Commit**

```bash
git add messages/tr.json messages/en.json docs/ROADMAP.md docs/PRD.md docs/RELEASE.md
git commit -m "feat(phase-8.5): ship billing information and history mvp"
```
