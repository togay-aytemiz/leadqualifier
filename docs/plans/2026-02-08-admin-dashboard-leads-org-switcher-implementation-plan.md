# Admin Dashboard + Lead List + Org Switcher Wiring Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete platform-admin workflow with a dedicated admin lead list, dashboard lead visibility, and org-switcher-driven context wiring.

**Architecture:** Extend existing system-admin pages under `/admin` by adding a read-only leads route scoped to the active organization context (`active_org_id` cookie). Reuse existing lead query/table components to avoid duplicated logic and keep behavior consistent with tenant leads.

**Tech Stack:** Next.js App Router, next-intl, Supabase, existing dashboard/design primitives.

---

### Task 1: Add admin lead list route

**Files:**
- Create: `src/app/[locale]/(dashboard)/admin/leads/page.tsx`
- Create: `src/app/[locale]/(dashboard)/admin/leads/loading.tsx`

**Step 1: Write failing route skeleton**
- Add server component route requiring system-admin access.

**Step 2: Wire data loading**
- Resolve active organization context.
- Load leads + required fields for active org via existing lead actions.

**Step 3: Render read-only admin lead list UI**
- Add header, breadcrumb, read-only banner, active organization card, and leads table/search integration.

**Step 4: Run targeted checks**
- Type-check via build.

**Step 5: Commit**
- Commit route additions.

### Task 2: Wire admin dashboard to lead list + active org context

**Files:**
- Modify: `src/app/[locale]/(dashboard)/admin/page.tsx`

**Step 1: Add active-org aware lead preview query**
- Read active organization context and fetch recent leads for preview.

**Step 2: Add UI bindings**
- Add quick action to `/admin/leads`.
- Add selected organization summary and recent leads preview block.

**Step 3: Keep read-only semantics**
- Ensure copy clearly communicates read-only behavior.

**Step 4: Run targeted checks**
- Build validation.

**Step 5: Commit**
- Commit dashboard wiring.

### Task 3: Expose admin leads in sidebar + translations

**Files:**
- Modify: `src/design/MainSidebar.tsx`
- Modify: `messages/en.json`
- Modify: `messages/tr.json`

**Step 1: Add admin sidebar navigation item**
- Add `/admin/leads` entry under admin section.

**Step 2: Add i18n keys**
- Add `mainSidebar.adminLeads` and `admin.leads.*` copy keys in EN/TR.

**Step 3: Verify EN/TR parity**
- Ensure identical key structure in both locale files.

**Step 4: Run checks**
- Build validation (includes i18n/lint in current project flow).

**Step 5: Commit**
- Commit sidebar + translation updates.

### Task 4: Update docs (Roadmap/PRD/Release)

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

**Step 1: Roadmap updates**
- Mark skill playground as satisfied by simulator (no separate MVP feature).
- Mark admin dashboard/lead list/org switcher items completed where implemented.
- Keep Last Updated date accurate.

**Step 2: PRD updates**
- Reflect admin lead list and org-switcher-driven admin monitoring workflow.
- Reflect decision: simulator is the skill testing path for MVP.

**Step 3: Release notes**
- Add entries under `[Unreleased]` for Added/Changed docs and features.

**Step 4: Verify**
- Run `npm run build`.

**Step 5: Commit**
- Commit doc updates.
