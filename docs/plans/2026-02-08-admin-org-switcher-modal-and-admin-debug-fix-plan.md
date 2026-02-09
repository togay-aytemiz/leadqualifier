# Admin Org Switcher Modal + Admin Debug Fix Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace always-open admin organization switcher with a compact modal flow and fix admin dashboard/inbox visibility pain points for system admin users.

**Architecture:** Keep tenant context source-of-truth as `active_org_id` cookie but change sidebar UX to “current org + Select/Change” with modal selection. Harden admin reads by downgrading expected RPC fallback logging and adding resilient organization discovery fallback for system-admin context resolution.

**Tech Stack:** Next.js App Router, React client components, next-intl, Supabase RLS/read models.

---

### Task 1: Switcher UX refactor (compact + modal)

**Files:**
- Modify: `src/design/MainSidebar.tsx`
- Modify: `messages/en.json`
- Modify: `messages/tr.json`

**Step 1: Introduce modal state and compact trigger UI**
- Replace always-expanded org list block with current-org summary and `Select/Change` action.

**Step 2: Implement modal organization picker**
- Add searchable modal list with active-org highlight, switch action, and reset action.

**Step 3: Preserve collapsed behavior**
- Keep an accessible modal trigger in collapsed sidebar mode.

**Step 4: Verify i18n parity**
- Add new TR/EN labels and ensure mirror keys.

### Task 2: Admin dashboard fallback error hardening

**Files:**
- Modify: `src/lib/admin/read-models.ts`

**Step 1: Classify expected missing-RPC conditions**
- Detect known “RPC missing/unavailable” errors.

**Step 2: Adjust logging severity**
- Use non-error logging for expected fallback paths to avoid noisy dev error overlays.

### Task 3: System-admin organization discovery resilience

**Files:**
- Modify: `src/lib/organizations/active-context.ts`

**Step 1: Add fallback organization resolution for system admins**
- If all-organizations query fails/returns empty, fallback to membership-linked organizations.

**Step 2: Keep behavior backward-compatible**
- Continue preferring full organization list when available.

### Task 4: Docs + verification

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

**Step 1: Update roadmap/prd/release notes**
- Reflect new modal switcher UX and admin fallback hardening.

**Step 2: Run verification**
- Run `npm run build`
- Run `npm run i18n:check`
