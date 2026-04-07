# Billing History and Iyzico Upgrade Hardening Plan

**Goal:** Fix the purchase history empty state and improve Iyzico subscription upgrade correctness/traceability so payment records can be reconciled against provider transactions instead of local price-delta estimates.

**Context:**
- Purchase history currently loads the newest ledger rows without filtering to purchase events, so recent `usage_debit` rows can hide older `package_grant` and `purchase_credit` rows.
- Iyzico subscription retrieve can return a direct `data.orders` shape, not only `data.items[].orders`.
- Saved-card plan changes do not send a merchant `conversationId`, making provider-side upgrade charges harder to trace.
- The installed `iyzipay` SDK upgrade request model does not carry the documented `resetRecurrenceCount` field, so direct upgrades need a signed REST call to ensure `upgradePeriod=NOW`, `useTrial=false`, and `resetRecurrenceCount=false` reach Iyzico.
- The UI/history must not show locally calculated plan differences as confirmed upgrade charges without an Iyzico order reference and amount.

### Task 1: Add regression tests

- Add a ledger server helper test that requires `entryTypes` filtering.
- Add plan and billing source guards for purchase-history query usage and subscription metadata lookup.
- Add Iyzico checkout-result tests for direct retrieve payloads.
- Add Iyzico client/mock-checkout tests for upgrade `conversationId`, signed REST request body fields, and provider-calculated charge messaging.

### Task 2: Implement minimal fixes

- Add `entryTypes` support to `getOrganizationBillingLedger`.
- Query purchase history with `package_grant` and `purchase_credit` filtering.
- Teach Iyzico retrieve helpers to read direct subscription and order payloads.
- Pass a deterministic plan-change `conversationId` to Iyzico upgrade/downgrade calls and persist it in local metadata.
- Use the documented Iyzico subscription upgrade REST endpoint for direct upgrades so `useTrial=false` and `resetRecurrenceCount=false` are included in the signed body.
- Treat upgrade charge amounts as unavailable/provider-calculated unless provider order metadata backs the displayed amount.
- Read both `subscription_id` and `subscription_record_id` metadata keys in billing lookups.

### Task 3: Verify and document

- Run targeted billing/Iyzico tests.
- Run `npm run build`.
- Update `docs/ROADMAP.md`, `docs/PRD.md`, and `docs/RELEASE.md`.
