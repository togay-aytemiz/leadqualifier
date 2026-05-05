# Sales-Led Billing Request Flow Design

## Context

Qualy currently has a self-service billing surface around Iyzico checkout, subscription changes, top-ups, payment recovery, billing history, and admin billing controls. Iyzico subscriptions require an annual fee, and we do not yet know whether enough customers will use self-service payment flows to justify more billing investment.

For launch speed, the product should keep public plan/top-up pricing visible but convert operator-facing purchase actions into a lightweight sales-led request flow. Existing self-service and Iyzico code must remain in place for future reuse.

## Goals

- Keep `Settings > Plans` useful as a pricing and package comparison surface.
- Replace customer self-service checkout actions with a purchase request confirmation.
- Send the admin a real email notification through Resend when a request is submitted.
- Store each request in the database so email delivery failures do not lose customer intent.
- Let the system admin manually assign packages and top-up credits from the existing admin area.
- Support manual premium packages that renew monthly until an admin changes or cancels them.
- Avoid a large billing rebuild.

## Non-Goals

- Do not remove Iyzico checkout, webhook, callback, or recovery code.
- Do not implement invoices, payment collection, tax documents, or payment method management.
- Do not build a full CRM, sales pipeline, or automated follow-up system.
- Do not expose campaigns, broadcasts, auto follow-up sequences, calendar integration, or a flow builder.

## User Experience

Operators see the same plan and top-up prices in `Settings > Plans`, but purchase CTAs become request CTAs:

- Trial or inactive workspaces can request a monthly package.
- Premium workspaces can request a package change.
- Premium workspaces can request an extra-credit top-up.
- Custom-package contact remains available as a quieter path.

After submission, the page shows a localized success banner:

- TR: `Satın alma talebiniz ekibimize iletildi. En kısa sürede sizinle iletişime geçeceğiz.`
- EN: `Your purchase request was sent to our team. We will contact you shortly.`

If the request cannot be saved, show a localized error. If the request is saved but email sending fails, still show success and record the email failure for admin visibility.

## Data Model

Add a small table named `billing_purchase_requests`:

- `id`
- `organization_id`
- `requested_by`
- `request_type`: `plan`, `plan_change`, `topup`, `custom`
- `requested_plan_id`
- `requested_topup_pack_id`
- `requested_credits`
- `requested_amount`
- `requested_currency`
- `status`: `new`, `seen`, `handled`, `dismissed`
- `email_status`: `not_configured`, `sent`, `failed`
- `email_error`
- `metadata`
- `created_at`
- `updated_at`

RLS should allow organization members to insert requests for their own organization. Tenant-facing UI does not need to list previous requests in this iteration. System admins can read and update all request rows. The server action should use normal authenticated Supabase access for tenant inserts and admin-gated reads for admin surfaces.

## Email

Use Resend for admin notification.

Environment variables:

- `RESEND_API_KEY`
- `BILLING_REQUEST_EMAIL_TO`
- `BILLING_REQUEST_EMAIL_FROM`

The email is best-effort after DB insert. The admin email should include:

- organization name and id
- requester name/email
- request type
- selected plan or top-up pack
- displayed amount and currency
- included credits
- locale
- timestamp
- admin organization detail URL

If Resend is not configured, save the request with `email_status = not_configured`. If Resend returns an error, save `email_status = failed` and a short error string. Do not expose provider errors to operators.

## Admin Experience

Keep the existing admin billing controls, but make them faster for this sales-led flow:

- Show recent purchase requests on the admin organization detail page.
- Add named package assignment for `starter`, `growth`, and `scale` using the current pricing catalog.
- Keep the existing freeform premium assignment as an advanced/manual override path if it remains useful.
- Keep existing top-up/package/trial credit adjustment actions and audit logging.

Admin handling remains manual in this iteration. The admin detail page should show request status, but a status-changing action can be deferred if implementation time gets tight because manual package assignment is the launch-critical path.

## Manual Recurring Packages

Current manual premium assignment sets a period end, and entitlement logic treats expired premium periods as canceled after the grace window. That conflicts with “renew monthly until I change it.”

Add manual recurring semantics for admin-assigned premium packages:

- Manual package records should be identifiable through `organization_subscription_records.provider = manual_admin` or metadata.
- Manual recurring records default to auto-renew on.
- When the current period has ended and the manual record is still active, renew the package period monthly, reset monthly package usage to zero, and add a `package_grant` ledger entry.
- Renewal must be idempotent for a given period.
- Admin cancellation should stop future renewal and lock or cancel access according to the chosen admin action.

Implementation can use a small server-side renewal helper that runs before billing snapshot/entitlement reads, or a database RPC called from those server paths. A detached cron can be added later, but should not be required for correctness.

## React And Next.js Notes

- Keep the plans page server-owned for organization, billing, pricing, and request data.
- Use small client components only for modal/request interactions.
- Do not add heavy email or admin dependencies to the client bundle.
- Preserve current lazy-loading patterns around settings modals.
- Keep translations mirrored in `messages/en.json` and `messages/tr.json`.

## Testing

Add focused coverage for:

- purchase request creation with valid organization membership
- Resend payload construction and disabled-provider fallback
- email failure does not fail a saved request
- Plans UI no longer routes request CTAs into hosted checkout for the sales-led mode
- admin organization detail can show recent requests
- named admin package assignment calls the correct billing action/RPC payload
- manual recurring renewal keeps premium active after period end and grants the next package period once
- i18n key mirror
- `npm run build`

## Rollout

Default `Settings > Plans` to sales-led mode. Keep the existing Iyzico routes and callbacks deployed but unreachable from normal CTAs. A later feature flag can re-enable self-service checkout when the business decides it is worth the investment.
