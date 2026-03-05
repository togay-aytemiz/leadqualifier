# WhatsApp Existing-Number Onboarding Productization Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace blind WhatsApp self-serve connect with an existing-number-first onboarding flow that routes most businesses into concierge-assisted setup and only opens Meta OAuth for prequalified cases.

**Architecture:** Keep Meta Cloud API as the channel runtime, but change onboarding from a single `Connect with Meta` action into a staged flow: preflight intake -> eligibility classification -> concierge/operator queue -> controlled Meta connect step. Optimize for businesses that already use WhatsApp Business on their existing number; treat brand-new number onboarding as secondary. Do not assume prior `business.facebook.com` usage; the flow must handle businesses that need to create or connect a Meta business portfolio during assisted signup.

**Tech Stack:** Next.js App Router, React client components, Supabase Postgres + RLS, next-intl TR/EN, existing channel settings surfaces, Meta OAuth routes.

---

### Task 1: Lock the product decision in docs before code changes

**Files:**
- Modify: `docs/PRD.md`
- Modify: `docs/ROADMAP.md`
- Modify: `docs/RELEASE.md`
- Create: `docs/plans/2026-03-05-whatsapp-existing-number-onboarding-productization-plan.md`

**Notes:**
- Record the MVP decision as `concierge-first existing-number onboarding`.
- State explicitly that standard self-serve Meta OAuth is not the default path for businesses already using WhatsApp Business.
- Keep `new number` as a secondary path, not the primary happy path.

### Task 2: Replace the current WhatsApp connect CTA with an onboarding preflight

**Files:**
- Modify: `src/components/channels/ConnectWhatsAppModal.tsx`
- Modify: `src/components/channels/ChannelsList.tsx`
- Modify: `src/components/channels/ChannelCard.tsx`
- Modify: `messages/en.json`
- Modify: `messages/tr.json`
- Test: `src/components/channels/channelCards.test.ts`

**Scope:**
- Replace the current generic Meta checklist with a short decision flow:
  - `I want to keep my current WhatsApp number`
  - `I can use a new number`
- For existing-number cases, collect the minimum facts needed for triage:
  - country
  - current use of WhatsApp Business app
  - same number retention
  - access to Meta Business account/admin
  - willingness for assisted setup call
- Add a short prep checklist for existing-number cases:
  - WhatsApp Business app is in active use on that number
  - latest app version is installed on the primary phone
  - the business can access a QR-capable primary device during setup
  - the business can link or has linked the number to a Facebook Page / Meta business assets
- Do not send this branch directly to Meta OAuth.

### Task 3: Persist onboarding requests and operator-facing status

**Files:**
- Create: `supabase/migrations/00084_whatsapp_onboarding_requests.sql`
- Modify: `src/types/database.ts`
- Create: `src/lib/channels/onboarding.ts`
- Create: `src/lib/channels/onboarding.test.ts`

**Scope:**
- Add an organization-scoped onboarding request table for WhatsApp setup.
- Suggested fields:
  - `organization_id`
  - `requested_phone`
  - `country_code`
  - `current_whatsapp_mode` (`business_app`, `personal`, `unknown`)
  - `wants_existing_number`
  - `has_meta_business_access`
  - `status` (`submitted`, `qualified_for_oauth`, `needs_concierge`, `blocked`, `completed`)
  - `classification_reason`
  - `operator_notes`
- Add tenant-safe insert/read helpers and basic validation tests.

### Task 4: Add a deterministic eligibility classifier and gate Meta OAuth behind it

**Files:**
- Modify: `src/lib/channels/actions.ts`
- Modify: `src/lib/channels/actions.test.ts`
- Modify: `src/app/api/channels/meta/start/route.ts`
- Modify: `src/app/api/channels/meta/callback/route.ts`
- Modify: `src/lib/channels/meta-oauth.ts`
- Modify: `src/lib/channels/meta-oauth.test.ts`

**Scope:**
- Introduce a small rule-based classifier for onboarding outcomes:
  - `new_number_direct_oauth`
  - `existing_number_concierge`
  - `existing_number_blocked`
- Only allow direct Meta OAuth when the request is explicitly eligible.
- Preserve current OAuth/callback behavior for approved cases.
- Log structured failure reasons so support can distinguish:
  - missing asset access
  - already-registered number
  - migration/coexistence required
  - unsupported or unclear setup state

### Task 5: Add a lightweight admin/onboarding queue for manual setup

**Files:**
- Create: `src/app/[locale]/(dashboard)/admin/whatsapp-onboarding/page.tsx`
- Create: `src/app/[locale]/(dashboard)/admin/whatsapp-onboarding/WhatsAppOnboardingAdminClient.tsx`
- Modify: `src/lib/organizations/actions.ts`
- Modify: `messages/en.json`
- Modify: `messages/tr.json`

**Scope:**
- Show submitted onboarding requests with status, phone, org, and classification.
- Allow operators/admins to:
  - mark `qualified_for_oauth`
  - mark `needs_concierge`
  - mark `blocked`
  - store internal notes
- Keep MVP narrow; no calendar scheduling or complex CRM workflow.

### Task 6: Add customer-facing onboarding states and next-step guidance

**Files:**
- Modify: `src/components/channels/ConnectWhatsAppModal.tsx`
- Modify: `src/components/channels/ChannelsList.tsx`
- Modify: `messages/en.json`
- Modify: `messages/tr.json`

**Scope:**
- Replace vague Meta errors with productized next steps:
  - `We received your setup request`
  - `This number needs assisted migration/setup`
  - `This number is ready for Meta connect`
  - `This setup is currently blocked`
- Explain that existing WhatsApp Business numbers may require migration/coexistence and that the team will guide setup when needed.

### Task 7: Add success metrics and rollout guardrails

**Files:**
- Modify: `docs/PRD.md`
- Modify: `docs/ROADMAP.md`
- Optional: `src/lib/channels/actions.ts`

**Scope:**
- Track funnel counts:
  - preflight started
  - submitted
  - qualified for OAuth
  - concierge required
  - connected successfully
  - blocked
- Define MVP exit criteria:
  - no blind Meta redirect for existing-number businesses
  - support can classify every failed connect into a visible bucket
  - first 5-10 pilot onboardings complete without requiring users to self-diagnose Meta account state

### Task 8: Verification

**Commands:**
- `npm test -- --run src/lib/channels/actions.test.ts`
- `npm test -- --run src/lib/channels/meta-oauth.test.ts`
- `npm test -- --run src/components/channels/channelCards.test.ts`
- `npm run build`

### Recommended commit sequence

**Commits:**
- `docs(phase-2): define concierge-first whatsapp onboarding strategy`
- `feat(phase-2): add whatsapp onboarding preflight intake`
- `feat(phase-2): persist whatsapp onboarding requests and classification`
- `feat(phase-2): gate meta oauth behind onboarding eligibility`
- `feat(phase-2): add admin whatsapp onboarding queue`
