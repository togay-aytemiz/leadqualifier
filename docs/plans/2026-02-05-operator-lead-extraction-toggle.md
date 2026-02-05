# Operator Takeover Lead Extraction Toggle Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let orgs decide whether lead extraction continues when an operator takes over (default OFF), configured in AI Settings.

**Architecture:** Add an org-level boolean setting on `org_ai_settings` (default false). AI Settings UI exposes a toggle. Webhook gating uses the toggle to decide whether to run lead extraction when `active_agent=operator` or `assignee_id` is set; replies remain blocked. Inbox “paused” banner respects the setting.

**Tech Stack:** Next.js App Router, Supabase (Postgres + RLS), next-intl, Vitest.

---

### Task 1: Add DB setting + types

**Files:**
- Modify: `supabase/migrations/00029_ai_settings_simplify.sql` (or new migration if preferred)
- Modify: `src/types/database.ts`

**Step 1: Write the failing test**

```ts
// src/lib/ai/settings.test.ts (new or existing)
import { describe, expect, it } from 'vitest'

// Pseudo: ensure default is false when setting missing
// You may need a helper or mock depending on existing patterns.
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- src/lib/ai/settings.test.ts`
Expected: FAIL (setting not present).

**Step 3: Write minimal implementation**

```sql
-- migration snippet
ALTER TABLE public.org_ai_settings
ADD COLUMN IF NOT EXISTS allow_lead_extraction_during_operator BOOLEAN NOT NULL DEFAULT FALSE;
```

```ts
// src/types/database.ts
allow_lead_extraction_during_operator: boolean
```

**Step 4: Run test to verify it passes**

Run: `npm run test -- src/lib/ai/settings.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add supabase/migrations/00029_ai_settings_simplify.sql src/types/database.ts src/lib/ai/settings.test.ts
git commit -m "feat(phase-6): add operator lead extraction toggle setting"
```

### Task 2: Expose toggle in AI Settings

**Files:**
- Modify: `src/lib/ai/settings.ts`
- Modify: `src/app/[locale]/(dashboard)/settings/ai/*`
- Modify: `messages/en.json`
- Modify: `messages/tr.json`

**Step 1: Write the failing test**

```ts
// src/app/[locale]/(dashboard)/settings/ai/__tests__/AiSettingsClient.test.tsx (if tests exist)
// Assert toggle renders and persists.
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- src/app/[locale]/(dashboard)/settings/ai/__tests__/AiSettingsClient.test.tsx`
Expected: FAIL

**Step 3: Write minimal implementation**

```ts
// src/lib/ai/settings.ts
// include allow_lead_extraction_during_operator in read + update payloads
```

```tsx
// AI Settings UI
// label: "Keep lead extraction on while operator active"
// helper: "When enabled, lead extraction continues even if an operator takes over. Replies remain off."
```

Add i18n keys in EN/TR with mirrored structure.

**Step 4: Run test to verify it passes**

Run: `npm run test -- src/app/[locale]/(dashboard)/settings/ai/__tests__/AiSettingsClient.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/ai/settings.ts src/app/[locale]/(dashboard)/settings/ai messages/en.json messages/tr.json
git commit -m "feat(phase-6): add operator lead extraction toggle in AI settings"
```

### Task 3: Update gating logic + paused banner

**Files:**
- Modify: `src/app/api/webhooks/telegram/route.ts`
- Modify: `src/components/inbox/InboxContainer.tsx`
- Test: `src/lib/ai/bot-mode.test.ts` (new)

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'

// pseudo: when operator is active and toggle true => allow lead extraction
// when toggle false => skip extraction
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- src/lib/ai/bot-mode.test.ts`
Expected: FAIL

**Step 3: Write minimal implementation**

```ts
// telegram webhook
// if operator active: allowLeadExtraction = setting ? true : false
// replies remain off
```

```tsx
// inbox details
// leadExtractionPaused should ignore operatorActive when setting is true
```

**Step 4: Run test to verify it passes**

Run: `npm run test -- src/lib/ai/bot-mode.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/app/api/webhooks/telegram/route.ts src/components/inbox/InboxContainer.tsx src/lib/ai/bot-mode.test.ts
git commit -m "feat(phase-6): respect operator lead extraction toggle"
```

### Task 4: Docs + build verification

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

**Step 1: Update docs**

- Roadmap: mark new toggle as completed; update Last Updated date.
- PRD: add requirement + add Tech Decisions entry; update Last Updated date.
- Release: add under [Unreleased] Added/Changed.

**Step 2: Run build**

Run: `npm run build`
Expected: SUCCESS

**Step 3: Commit**

```bash
git add docs/ROADMAP.md docs/PRD.md docs/RELEASE.md
git commit -m "docs: document operator lead extraction toggle"
```
