# GTM Prelaunch Audit

Date: 2026-03-15

## Goal

Evaluate what Qualy should do before GTM and before expanding beyond the first 5 Turkish SMB pilots.

This audit combines:

1. Current repo and route surface
2. PRD and Roadmap state
3. Existing open launch items
4. Official competitor surfaces

## Working Assumption

Qualy should launch as a focused WhatsApp-first AI qualifier for Turkish SMBs, not as a full omni-channel suite on day one.

That means the right question is not "what features do competitors have?" but:

- Which missing items will block pilot activation or conversion?
- Which gaps reduce operator trust or day-to-day usability?
- Which parity gaps can stay deferred without hurting the first 5-10 customers?

## Current Strengths

The product is already unusually strong for a pilot-stage GTM:

- Self-serve WhatsApp onboarding with Embedded Signup and post-provisioning
- Shared inbox with human takeover, manual replies, media support, unread state, and mobile-aware layout
- Grounded AI answer stack (`Skills -> KB -> fallback`) with guardrails
- Lead extraction, hot/warm/cold qualification, required-field collection, and score reasoning
- Billing, paywall, legal-consent, and iyzico lifecycle handling
- Admin read models, QA Lab, load testing, and latency telemetry

In short: core product value exists. The biggest risks are now around activation, operator workflow completeness, anti-abuse, and visible ROI.

## Repo Signals That Matter

- Signed-out root currently redirects directly to `/login`, so the app repo itself is not acting as a GTM landing/discovery surface.
- Roadmap still has a few launch-adjacent open items:
  - Inbox `Important info` manual overwrite
  - Leads `Open in WhatsApp`
  - Cross-org billing audit trail
  - Feature gating by plan
  - Upgrade prompts
  - Trial-abuse controls

These are better predictors of pilot friction than adding large new feature areas.

## Competitor Sample

Official surfaces reviewed:

- [Wati](https://www.wati.io/)
- [respond.io](https://respond.io/)
- [SleekFlow](https://sleekflow.io/)
- [Trengo](https://trengo.com/)
- [Interakt](https://www.interakt.shop/)

Representative official supporting pages:

- [Wati mobile app](https://www.wati.io/product/mobile-app/) and [Wati integrations](https://www.wati.io/integrations/)
- [respond.io Mobile App](https://respond.io/mobile-app), [Web Chat](https://respond.io/help/website-chat/widget-installation), [Reports overview](https://respond.io/help/reports/reports-overview), [Broadcasts overview](https://respond.io/help/broadcasts/broadcasts-overview), [HubSpot integration](https://respond.io/help/hubspot/hubspot-overview)
- [SleekFlow campaigns](https://sleekflow.io/features/campaign-management), [integrations](https://sleekflow.io/integrations), [mobile app](https://sleekflow.io/mobile-app), [live chat widget](https://sleekflow.io/features/live-chat)
- [Trengo PWA](https://help.trengo.com/en/articles/5497371-using-trengo-as-a-pwa-progressive-web-app), [web widget](https://help.trengo.com/en/articles/5497457-setting-up-your-web-widget), [reports](https://help.trengo.com/en/articles/5498138-reports), [broadcasts](https://help.trengo.com/en/articles/8267233-broadcasting-with-whatsapp), [integration hub](https://help.trengo.com/en/articles/5497544-integrations)
- [Interakt campaigns](https://www.interakt.shop/resource-center/what-is-whatsapp-broadcast/), [integrations/app store](https://www.interakt.shop/interakt-app-store), [WhatsApp widget](https://www.interakt.shop/resource-center/whatsapp-widget/), [campaign click analytics](https://www.interakt.shop/blog/whatsapp-click-to-open-rate)

## Common Competitor Capabilities Missing in Qualy

Across that sample, the most common visible capabilities that Qualy does not yet ship as first-class product areas are:

1. Broadcasts / campaigns
2. Website widget / live chat capture
3. Marketplace-style integrations (CRM, ecommerce, automation tools)
4. Dedicated mobile app or PWA-style operator alerting
5. Richer CRM/operator layer (editable tags, notes, custom fields, pipelines)
6. Tenant-facing performance reporting beyond usage and infra metrics

## What Is Actually GTM-Critical

Not every competitor gap is a launch blocker.

### P0: Must Do Before Scaling Beyond First 5 Pilots

1. Finish activation and conversion plumbing
   - Feature gating by plan
   - Upgrade prompts
   - Annual discount decision
   - Clear paid-upgrade story after trial

2. Close operator workflow gaps
   - Manual overwrite for `Important info`
   - `Open in WhatsApp` in lead-management surfaces
   - Editable conversation tags and private notes

3. Add pilot KPI visibility
   - `signup -> channel connected -> first AI reply -> first hot lead -> operator takeover -> paid conversion`
   - This should be tenant-facing or at least easy for internal weekly pilot review.

4. Harden anti-abuse and sales-assisted ops
   - Disposable email / VOIP / repeated device-IP checks
   - Suspicious-signup review flow
   - Admin auditability for manual billing/quota actions

5. Make GTM entry path explicit
   - If the marketing/landing experience lives outside this repo, keep it tightly aligned with the app promise.
   - If not, the current signed-out redirect-to-login flow is too narrow for discovery/demo-led GTM.

### P1: Strongly Recommended in the First 30 Days After Pilot Start

1. Mobile/PWA notifications for operators
2. Website widget or click-to-WhatsApp capture layer
3. One or two high-leverage integrations
   - Start with Google Sheets, HubSpot, Shopify, or Zapier/Make-style sync
4. Tenant-facing value reports
   - Leads handled
   - Hot leads found
   - AI-handled message ratio
   - Median response time

### Deliberate Defers

These appear in competitors, but should stay deferred unless pilots explicitly demand them:

- Campaigns / broadcasts
- Full CRM pipeline expansion
- Flow builder
- Calendar / booking
- Auto follow-up sequences

## Recommendation

Use GTM positioning discipline:

- Sell Qualy as the fastest way to stop drowning in repetitive WhatsApp traffic and surface serious buyers.
- Do not broaden the product story into "all-in-one customer messaging platform" yet.

That means the next work should improve:

- trust
- activation speed
- operator usability
- conversion visibility

before it improves breadth.

## Proposed Order

1. Close the existing open launch-adjacent roadmap items
2. Add lightweight operator CRM notes/tags
3. Add pilot KPI dashboard and weekly review workflow
4. Harden anti-abuse and manual override auditability
5. Decide whether mobile alerts or website widget becomes the first post-pilot parity move

## Bottom Line

Qualy is close enough for pilot GTM on product core.

The main risk is not missing a flow builder or broadcasts.

The main risk is launching with:

- incomplete operator workflow
- weak trial-to-paid conversion mechanics
- weak pilot reporting
- weak anti-abuse controls

If those are fixed first, competitor breadth becomes much less important for the first customers.
