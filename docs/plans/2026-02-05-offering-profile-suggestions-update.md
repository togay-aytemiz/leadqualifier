# Offering Profile Suggestion Updates Implementation Plan

> **For Agent:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Generate hybrid service-profile suggestions (short intro + max 5 bullets) and treat conflicts as update suggestions that can revise existing approved suggestions.

**Architecture:** Extend `offering_profile_suggestions` with `update_of` to link update proposals to an approved suggestion. The LLM prompt outputs a structured hybrid summary and optionally selects an existing approved suggestion to update. Approving an update applies the new content to the target suggestion and hides update proposals from approved/rejected lists and lead-extraction inputs.

**Tech Stack:** Next.js (App Router), Supabase Postgres + RLS, OpenAI GPT-4o-mini, next-intl, Tailwind.

---

### Task 1: Add DB support for update suggestions

**Files:**
- Create: `supabase/migrations/00040_offering_profile_suggestions_update_of.sql`
- Modify: `src/types/database.ts`

**Step 1: Write the migration**
```sql
ALTER TABLE public.offering_profile_suggestions
  ADD COLUMN IF NOT EXISTS update_of UUID REFERENCES public.offering_profile_suggestions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS offering_profile_suggestions_update_of_idx
  ON public.offering_profile_suggestions (organization_id, update_of, created_at DESC);
```

**Step 2: Update types**
```ts
export interface OfferingProfileSuggestion {
  // ...
  update_of: string | null
}
```

**Step 3: Commit**
```bash
git add supabase/migrations/00040_offering_profile_suggestions_update_of.sql src/types/database.ts
git commit -m "feat(phase-3): add update linkage for offering profile suggestions"
```

---

### Task 2: Make AI suggestion prompt hybrid + update-aware

**Files:**
- Modify: `src/lib/leads/offering-profile.ts`
- Test: `src/lib/leads/offering-profile.test.ts` (new)

**Step 1: Write failing tests**
```ts
import { describe, expect, it } from 'vitest'
import { parseSuggestionPayload, buildSuggestionSystemPrompt } from '@/lib/leads/offering-profile'

describe('offering profile suggestion parsing', () => {
  it('parses suggestion with update_index', () => {
    const result = parseSuggestionPayload('{"suggestion":"Intro\n- A\n- B","update_index":2}')
    expect(result).toEqual({ suggestion: 'Intro\n- A\n- B', updateIndex: 2 })
  })

  it('parses suggestion without update_index', () => {
    const result = parseSuggestionPayload('{"suggestion":"Intro\n- A"}')
    expect(result).toEqual({ suggestion: 'Intro\n- A', updateIndex: null })
  })
})
```

**Step 2: Run tests to confirm failure**
Run: `npm run test -- src/lib/leads/offering-profile.test.ts`
Expected: FAIL (functions not exported)

**Step 3: Implement minimal code to pass**
- Export a `parseSuggestionPayload` helper from `offering-profile.ts`.
- Update `buildSuggestionSystemPrompt` to enforce:
  - “service profile only” scope
  - one short intro sentence
  - up to 5 bullets total
  - optional `update_index` (1-based) when it should update an existing approved suggestion
- Fetch up to 5 approved suggestions for locale (and `update_of IS NULL`) to supply as context.
- If `update_index` resolves, insert suggestion with `update_of` set to the matching id.

**Step 4: Run tests**
Run: `npm run test -- src/lib/leads/offering-profile.test.ts`
Expected: PASS

**Step 5: Commit**
```bash
git add src/lib/leads/offering-profile.ts src/lib/leads/offering-profile.test.ts
git commit -m "feat(phase-3): generate hybrid offering suggestions with update hints"
```

---

### Task 3: Apply update suggestions on review

**Files:**
- Modify: `src/lib/leads/settings.ts`

**Step 1: Update review handler logic**
```ts
// when approving a suggestion with update_of:
// 1) update target suggestion content
// 2) mark update suggestion reviewed
```

**Step 2: Commit**
```bash
git add src/lib/leads/settings.ts
git commit -m "feat(phase-3): apply update suggestions on approval"
```

---

### Task 4: UI adjustments for update suggestions + extraction filter

**Files:**
- Modify: `src/components/settings/OfferingProfileSection.tsx`
- Modify: `src/lib/leads/extraction.ts`
- Modify: `src/app/[locale]/(dashboard)/settings/organization/page.tsx`
- Modify: `src/app/[locale]/(dashboard)/settings/organization/OrganizationSettingsClient.tsx`
- Modify: `src/lib/leads/settings.ts`
- Modify: `messages/en.json`
- Modify: `messages/tr.json`

**Step 1: Adjust grouping**
- Pending tab includes update suggestions.
- Approved/Rejected tabs exclude suggestions with `update_of` set.

**Step 2: Add “Güncelleme önerisi” badge**
- Show badge for items with `update_of` in pending list.

**Step 3: Exclude update suggestions from lead extraction**
- Add `.is('update_of', null)` to approved suggestion query in `runLeadExtraction`.

**Step 4: Add i18n strings**
- `offeringProfileSuggestionUpdateBadge`
- `offeringProfileSuggestionUpdateHelp` (optional helper text)

**Step 5: Commit**
```bash
git add src/components/settings/OfferingProfileSection.tsx src/lib/leads/extraction.ts src/app/[locale]/(dashboard)/settings/organization/page.tsx src/app/[locale]/(dashboard)/settings/organization/OrganizationSettingsClient.tsx src/lib/leads/settings.ts messages/en.json messages/tr.json
git commit -m "feat(phase-3): surface update suggestions in UI and exclude from extraction"
```

---

### Task 5: Docs + build verification

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

**Step 1: Update docs**
- ROADMAP: mark completed items, update Last Updated.
- PRD: add update-suggestion behavior + hybrid format to Tech Decisions, update Last Updated.
- RELEASE: add under Unreleased → Added/Changed.

**Step 2: Run build**
Run: `npm run build`
Expected: PASS

**Step 3: Commit**
```bash
git add docs/ROADMAP.md docs/PRD.md docs/RELEASE.md
git commit -m "docs: document offering profile suggestion updates"
```

---

Plan complete and saved to `docs/plans/2026-02-05-offering-profile-suggestions-update.md`.

Two execution options:
1. Subagent-Driven (this session) – I dispatch a fresh subagent per task, review between tasks, fast iteration
2. Parallel Session (separate) – Open new session with executing-plans, batch execution with checkpoints

Which approach?
