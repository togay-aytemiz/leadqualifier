# Organization AI Extraction Loading State Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show a visible AI extraction loading state on `Settings > Organization` while Knowledge Base document-derived business setup extraction is still running.

**Architecture:** Resolve the initial extraction status on the server from `knowledge_documents.status`, pass it into the organization settings client, and keep it fresh on the client with a lightweight status check plus page refresh when processing completes. Render a non-blocking banner so operators can still edit manually while AI extraction continues.

**Tech Stack:** Next.js App Router, React client components, Supabase browser/server clients, next-intl, Vitest

---

### Task 1: Add the failing UI contract test

**Files:**
- Modify: `src/app/[locale]/(dashboard)/settings/organization/OrganizationSettingsClient.test.tsx`

**Step 1: Write the failing test**

Add a test that renders `OrganizationSettingsClient` with `initialKnowledgeExtractionInProgress={true}` and expects the AI extraction banner copy to be present.

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/app/[locale]/(dashboard)/settings/organization/OrganizationSettingsClient.test.tsx`

Expected: FAIL because the client does not yet accept/render that loading state.

### Task 2: Wire extraction status into the page and client

**Files:**
- Modify: `src/app/[locale]/(dashboard)/settings/organization/OrganizationSettingsPageContent.tsx`
- Modify: `src/app/[locale]/(dashboard)/settings/organization/OrganizationSettingsClient.tsx`

**Step 1: Read the processing state on the server**

Fetch whether the current organization has any `knowledge_documents` rows in `processing` status and pass that boolean to the client component.

**Step 2: Add client-side status tracking**

Initialize client state from the server boolean, poll/recheck while processing is active, and `router.refresh()` when extraction finishes so profile/service/required-field data updates.

**Step 3: Render the non-blocking banner**

Add a localized spinner/banner near the top of the settings content that explains AI extraction is still preparing the business profile, service list, and required info from Knowledge Base documents.

### Task 3: Localize and document the behavior

**Files:**
- Modify: `messages/en.json`
- Modify: `messages/tr.json`
- Modify: `docs/PRD.md`
- Modify: `docs/ROADMAP.md`
- Modify: `docs/RELEASE.md`

**Step 1: Add translation keys**

Add TR/EN copy for the extraction banner title and description.

**Step 2: Update product docs**

Record the new organization-settings loading-state behavior in PRD, Roadmap, and Release notes, and refresh the `Last Updated` fields.

### Task 4: Verify

**Files:**
- None

**Step 1: Run targeted test**

Run: `npm test -- --run src/app/[locale]/(dashboard)/settings/organization/OrganizationSettingsClient.test.tsx`

Expected: PASS

**Step 2: Run build**

Run: `npm run build`

Expected: successful production build with no new type/runtime errors
