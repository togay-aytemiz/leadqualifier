# Leads Avatar Row Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show the conversation contact avatar in Leads rows, immediately to the left of the existing social platform icon, using the same visual size as the platform icon while keeping the current platform indicator.

**Architecture:** Reuse the conversation-level `contact_avatar_url` that Inbox already hydrates and persists. Extend the leads list query to include that field, then render a compact `Avatar` in the Leads table and mobile cards ahead of the existing platform icon so both surfaces stay visually aligned.

**Tech Stack:** Next.js App Router, React client components, Supabase server actions, Vitest

---

### Task 1: Extend leads query contract

**Files:**
- Modify: `src/lib/leads/list-actions.ts`
- Test: `src/lib/leads/list-actions.test.ts`

**Step 1: Write the failing test**

Add a test proving `getLeads()` returns `conversation.contact_avatar_url` when the joined conversation row includes it.

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/lib/leads/list-actions.test.ts`

Expected: FAIL because the current type/query contract omits `contact_avatar_url`.

**Step 3: Write minimal implementation**

Update the select and `LeadWithConversation` type so the avatar URL flows through.

**Step 4: Run test to verify it passes**

Run: `npm test -- --run src/lib/leads/list-actions.test.ts`

Expected: PASS.

### Task 2: Render avatar next to the social icon

**Files:**
- Modify: `src/components/leads/LeadsTable.tsx`

**Step 1: Keep row layout compact**

Add `Avatar` before the existing platform icon in both mobile and desktop leads rows.

**Step 2: Match icon scale**

Use the same visual size as the platform icon (`18px`) so avatar + platform badge read as a single identity cluster.

**Step 3: Preserve current behavior**

Keep the platform icon visible and keep name truncation/spacing stable.

### Task 3: Verify and document

**Files:**
- Modify: `docs/PRD.md`
- Modify: `docs/ROADMAP.md`
- Modify: `docs/RELEASE.md`

**Step 1: Run targeted tests**

Run:
- `npm test -- --run src/lib/leads/list-actions.test.ts`
- `npm test -- --run src/components/leads/mobile-table.test.ts`

**Step 2: Run build**

Run: `npm run build`

**Step 3: Update docs**

Document that Leads now mirrors Inbox identity treatment by showing compact social avatars next to existing platform icons.
