# Platform Admin Org Switcher & Tenant Impersonation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let system admins switch organizations with search, view tenant modules in that organization context (Inbox/Leads/Skills/Knowledge/Settings) in read-only mode, and monitor subscription/trial/quota data from a dedicated admin area.

**Architecture:** Introduce a single server-side active-organization resolver backed by a signed cookie (`active_org_id`) instead of scattered “first membership” lookups. Use that resolver in all dashboard pages/actions so the selected organization is applied consistently. Expand platform admin pages with organization-level analytics + billing visibility modules, and structure details to include both organization and profile-level data (multi-profile-ready).

**Tech Stack:** Next.js 14 App Router, React, TypeScript, next-intl (TR/EN), Supabase Postgres + RLS + migrations.

---

## Approaches Considered

### Option A (Not Recommended): Keep localStorage-only org selection
- Pros: smallest frontend change.
- Cons: server components cannot trust localStorage; organization context stays inconsistent across pages/actions and SSR.

### Option B (Recommended): Cookie-backed active organization + shared server resolver
- Pros: works with Server Components and Server Actions, no need to append query params to every link, easy to validate against RLS-accessible orgs.
- Cons: requires one new API/server-action surface and broad refactor of org lookup helpers.

### Option C: URL query-param org context everywhere
- Pros: explicit/shareable URLs.
- Cons: requires preserving `?org=` on all navigation links and forms; high regression risk with existing route structure.

---

## Scope Boundaries (MVP)

- In scope:
  - Searchable org switcher for system admin.
  - Active-org impersonation context across Inbox, Leads, Skills, Knowledge, Simulator, Settings.
  - Impersonation is read-only in tenant modules for system admin.
  - Dedicated admin section with organization list + requested metrics.
  - Organization detail page showing trial/premium/quota state and organization + profiles overview.
- Out of scope:
  - Automated billing provider integration.
  - Payment collection and invoicing workflows.
  - Quota/premium/trial mutation controls in MVP.

---

### Task 1: Add Active Organization Context Infrastructure

**Files:**
- Create: `/Users/togay/Desktop/leadqualifier/src/lib/organizations/active-context.ts`
- Create: `/Users/togay/Desktop/leadqualifier/src/lib/organizations/active-context.test.ts`
- Modify: `/Users/togay/Desktop/leadqualifier/src/lib/supabase/server.ts`
- Modify: `/Users/togay/Desktop/leadqualifier/src/types/database.ts`

**Step 1: Write failing unit tests**
- Cover:
  - system admin selecting any organization.
  - non-admin restricted to memberships.
  - invalid/stale cookie fallback to first accessible org.

**Step 2: Implement shared resolver**
- Add helpers:
  - `getAccessibleOrganizationsForUser()`
  - `resolveActiveOrganizationContext()`
  - `assertSystemAdmin()`
- Read `active_org_id` from cookie and validate access.

**Step 3: Verify tests**
- Run: `npm test -- --run src/lib/organizations/active-context.test.ts`

### Task 2: Add Cookie Update Endpoint for Org Switching

**Files:**
- Create: `/Users/togay/Desktop/leadqualifier/src/app/api/organizations/active/route.ts`
- Create: `/Users/togay/Desktop/leadqualifier/src/app/api/organizations/active/route.test.ts`

**Step 1: Write failing route tests**
- Cases:
  - authenticated admin can set accessible org id.
  - inaccessible org id returns 403.
  - anonymous request returns 401.

**Step 2: Implement route**
- `POST` body: `{ organizationId: string }`.
- Validate with `resolveActiveOrganizationContext`.
- Persist secure cookie (`httpOnly`, `sameSite=lax`).

**Step 3: Verify tests**
- Run: `npm test -- --run src/app/api/organizations/active/route.test.ts`

### Task 3: Build Searchable Admin Org Switcher UI

**Files:**
- Create: `/Users/togay/Desktop/leadqualifier/src/components/admin/AdminOrgSwitcher.tsx`
- Modify: `/Users/togay/Desktop/leadqualifier/src/design/MainSidebar.tsx`
- Modify: `/Users/togay/Desktop/leadqualifier/src/app/[locale]/(dashboard)/layout.tsx`
- Modify: `/Users/togay/Desktop/leadqualifier/messages/en.json`
- Modify: `/Users/togay/Desktop/leadqualifier/messages/tr.json`

**Step 1: Add sidebar props from server layout**
- Pass `isSystemAdmin`, `organizations`, and `activeOrganizationId` into `MainSidebar`.

**Step 2: Implement switcher with search**
- Use existing design primitives (`SearchInput`, list items).
- Debounced local filter by org name/slug.
- On select: call `/api/organizations/active`, then `router.refresh()`.

**Step 3: Show impersonation badge/banner**
- Add clear “Viewing as {org}” state in sidebar header.
- Add “Return to default org” action.

**Step 4: Verify**
- Manual test across EN/TR locales.

### Task 4: Apply Active Org Resolver Across Dashboard Pages

**Files:**
- Modify: `/Users/togay/Desktop/leadqualifier/src/app/[locale]/(dashboard)/inbox/page.tsx`
- Modify: `/Users/togay/Desktop/leadqualifier/src/app/[locale]/(dashboard)/leads/page.tsx`
- Modify: `/Users/togay/Desktop/leadqualifier/src/app/[locale]/(dashboard)/skills/page.tsx`
- Modify: `/Users/togay/Desktop/leadqualifier/src/app/[locale]/(dashboard)/knowledge/page.tsx`
- Modify: `/Users/togay/Desktop/leadqualifier/src/app/[locale]/(dashboard)/simulator/page.tsx`
- Modify: `/Users/togay/Desktop/leadqualifier/src/app/[locale]/(dashboard)/settings/*/page.tsx`
- Modify: `/Users/togay/Desktop/leadqualifier/src/app/[locale]/(dashboard)/knowledge/components/KnowledgeSidebar.tsx`

**Step 1: Replace per-page membership-first lookup**
- Each page gets organization id from `resolveActiveOrganizationContext`.

**Step 2: Remove duplicated org selection logic**
- Ensure consistent fallback behavior for missing org.

**Step 3: Enforce read-only impersonation policy**
- In impersonation mode, hide/disable tenant mutations for system admin (create/update/delete/send).
- Show clear "read-only impersonation" warning in UI.

**Step 4: Verify regression paths**
- Inbox, Leads, Skills, Knowledge, Settings all reflect switched org data.

### Task 5: Refactor Server Actions for Explicit Organization Context + Read-Only Guard

**Files:**
- Modify: `/Users/togay/Desktop/leadqualifier/src/lib/leads/list-actions.ts`
- Modify: `/Users/togay/Desktop/leadqualifier/src/lib/knowledge-base/actions.ts`
- Modify: `/Users/togay/Desktop/leadqualifier/src/lib/organizations/actions.ts`
- Modify: `/Users/togay/Desktop/leadqualifier/src/lib/ai/settings.ts`

**Step 1: Add optional `organizationId` parameters**
- Keep safe defaults for non-admin users.
- Validate write permissions (owner/admin for tenant settings).

**Step 2: Add impersonation read-only guardrails**
- Block system-admin writes when acting through switched-org impersonation context.
- Keep read paths enabled.

**Step 3: Preserve RLS-first guardrails**
- Never bypass org access checks.

**Step 4: Add/adjust tests**
- Verify explicit org context works for system admin without breaking member flows.

### Task 6: Expand Admin Organization List with Requested Metrics

**Files:**
- Modify: `/Users/togay/Desktop/leadqualifier/src/app/[locale]/(dashboard)/admin/organizations/page.tsx`
- Create: `/Users/togay/Desktop/leadqualifier/src/lib/admin/organizations.ts`
- Create: `/Users/togay/Desktop/leadqualifier/src/lib/admin/organizations.test.ts`
- Modify: `/Users/togay/Desktop/leadqualifier/messages/en.json`
- Modify: `/Users/togay/Desktop/leadqualifier/messages/tr.json`

**Step 1: Build aggregate query helpers**
- Per org:
  - total usage (messages / activity count).
  - total AI token usage.
  - total skills count.
  - knowledge base count.
  - premium status.
  - plan status.

**Step 2: Add table search + pagination**
- Search by org name, slug, owner email.

**Step 3: Add “Details” entry action**
- Route to `/admin/organizations/[organizationId]`.

### Task 7: Add Billing/Quota Data Model (Admin Visibility)

**Files:**
- Create: `/Users/togay/Desktop/leadqualifier/supabase/migrations/00054_admin_org_billing_controls.sql`
- Modify: `/Users/togay/Desktop/leadqualifier/src/types/database.ts`

**Step 1: Add `organization_billing_controls` table**
- Suggested columns:
  - `organization_id` (PK, FK)
  - `plan_tier` (`free|trial|premium`)
  - `billing_cycle` (`monthly|yearly|none`)
  - `plan_status` (`active|paused|cancelled|past_due`)
  - `trial_ends_at`, `premium_ends_at`
  - `monthly_token_quota`, `monthly_message_quota`
  - `updated_by`, `updated_at`

**Step 2: Add RLS policies**
- Read/write for system admin only.

### Task 8: Add Organization Details Page with Admin Controls

**Files:**
- Create: `/Users/togay/Desktop/leadqualifier/src/app/[locale]/(dashboard)/admin/organizations/[organizationId]/page.tsx`
- Create: `/Users/togay/Desktop/leadqualifier/src/components/admin/OrganizationDetailsPanel.tsx`
- Create: `/Users/togay/Desktop/leadqualifier/src/lib/admin/actions.ts`
- Create: `/Users/togay/Desktop/leadqualifier/src/lib/admin/actions.test.ts`
- Modify: `/Users/togay/Desktop/leadqualifier/messages/en.json`
- Modify: `/Users/togay/Desktop/leadqualifier/messages/tr.json`

**Step 1: Read-only details modules**
- Org summary.
- current billing/plan state.
- usage snapshots.
- profile roster and profile-level summary cards (multi-profile-ready).

**Step 2: Visibility-only modules for MVP**
- Show trial/premium/quota values.
- Show clear "editable later" placeholders for future controls.

**Step 3: Add audit-ready schema hooks**
- Prepare immutable audit table shape for future mutation rollout (no mutation endpoints yet).

### Task 9: Add Admin Navigation Section

**Files:**
- Modify: `/Users/togay/Desktop/leadqualifier/src/design/MainSidebar.tsx`
- Modify: `/Users/togay/Desktop/leadqualifier/messages/en.json`
- Modify: `/Users/togay/Desktop/leadqualifier/messages/tr.json`

**Step 1: Add Admin section**
- Visible only for `isSystemAdmin`.
- Entries:
  - Admin dashboard
  - Organizations
  - Users

**Step 2: Add active-state and locale-safe links**
- Keep existing sidebar grouping style.

### Task 10: Verification and Documentation

**Files:**
- Modify: `/Users/togay/Desktop/leadqualifier/docs/ROADMAP.md`
- Modify: `/Users/togay/Desktop/leadqualifier/docs/PRD.md`
- Modify: `/Users/togay/Desktop/leadqualifier/docs/RELEASE.md`

**Step 1: Verification**
- Run: `npm test`
- Run: `npm run lint`
- Run: `npm run build`

**Step 2: Manual QA checklist**
- Switch org as system admin and confirm Inbox/Leads/Skills/KB/Settings data changes.
- Confirm non-admin cannot switch outside memberships.
- Confirm admin details updates persist and are auditable.

**Step 3: Docs updates**
- Update roadmap checkboxes phase-by-phase.
- Add PRD section for platform admin impersonation + billing controls.
- Add release notes entries.

---

## Confirmed Decisions

1. Impersonation mode will be **read-only** in tenant modules.
2. Quotas will be **visibility-only** in MVP (no enforcement controls yet).
3. Details model will include **both organization and profiles**, designed for **multiple profiles per organization**.
