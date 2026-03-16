# Inbox Service Override Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let operators manually change the lead service inside Inbox Details by selecting from the active organization service list, while preserving that manual choice across future lead-extraction reruns.

**Architecture:** Load the active `service_catalog` into Inbox server props, render a compact inline service editor in the existing `Hizmet` row, and persist manual service changes through a lightweight `service_override` value stored under `leads.extracted_fields`. Lead extraction merge logic will keep the override authoritative until the operator explicitly clears it back to AI-derived service data.

**Tech Stack:** Next.js App Router, React 19, Supabase server actions, Vitest, next-intl.

---

### Task 1: Test manual service override persistence

**Files:**
- Modify: `src/lib/leads/extraction.test.ts`
- Modify: `src/lib/inbox/actions.test.ts`

**Steps:**
1. Add a failing extraction merge test that proves an existing manual `service_override` survives a new AI extraction rerun.
2. Add a failing inbox action test that proves a valid catalog service selection updates the lead and stamps manual metadata.
3. Run the targeted tests and verify both fail for the expected missing behavior.

### Task 2: Implement service override persistence

**Files:**
- Modify: `src/lib/leads/extraction.ts`
- Modify: `src/lib/inbox/actions.ts`

**Steps:**
1. Extend normalized lead extraction shape to carry `service_override` and its metadata from existing extracted fields.
2. Update extraction merge/upsert logic so manual override keeps `lead.service_type` authoritative while preserving AI-extracted `services[]` for fallback.
3. Add inbox server actions to set and clear the service override with catalog validation and stale-write protection.
4. Re-run the targeted server tests until green.

### Task 3: Add compact Inbox service editor UI

**Files:**
- Create: `src/components/inbox/LeadServiceEditor.tsx`
- Create: `src/components/inbox/leadServiceEditor.test.tsx`
- Modify: `src/components/inbox/InboxContainer.tsx`
- Modify: `src/app/[locale]/(dashboard)/inbox/page.tsx`

**Steps:**
1. Add a failing component test that proves the service select stays collapsed by default behind a compact edit action.
2. Load active service catalog items on the Inbox page and pass normalized service names into `InboxContainer`.
3. Render a compact inline editor in the existing `Hizmet` row with `Düzenle`, `Kaydet`, `İptal`, and `AI verisine dön` actions.
4. Update local lead state after save/clear so the details panel reflects the change immediately.
5. Re-run the targeted UI tests until green.

### Task 4: Propagate display consistency and documentation

**Files:**
- Modify: `src/components/leads/LeadsTable.tsx`
- Modify: `src/components/leads/mobile-table.ts`
- Modify: `messages/en.json`
- Modify: `messages/tr.json`
- Modify: `docs/PRD.md`
- Modify: `docs/ROADMAP.md`
- Modify: `docs/RELEASE.md`

**Steps:**
1. Reuse one lead-service resolver so lists/details prefer manual override consistently.
2. Add TR/EN strings for the compact service editor states and errors.
3. Update product docs to reflect operator-editable service selection in Inbox Details.

### Task 5: Verify end-to-end

**Steps:**
1. Run `npm test -- --run src/lib/leads/extraction.test.ts src/lib/inbox/actions.test.ts src/components/inbox/leadServiceEditor.test.tsx src/components/inbox/conversationDetailsEditors.test.tsx`.
2. Run `npm run i18n:check`.
3. Run `npm run build`.
