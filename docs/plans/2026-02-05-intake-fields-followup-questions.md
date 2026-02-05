# Required Intake Fields & Smart Follow-Up Questions Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add organization-level required intake fields (chips) that auto-populate from AI, and append a smart follow-up question to bot replies when required info is missing.

**Architecture:** Store `required_intake_fields` on `offering_profiles` (org-scoped). A background AI suggestion step proposes new fields from Skills/KB/Offering Profile and auto-appends unique fields. Bot response pipeline receives the required fields list and conversation context; it returns a `followup_question` when any required fields are missing, appended to the response in the same message. UI provides a single chip input to add/remove fields.

**Tech Stack:** Next.js App Router, Supabase Postgres + RLS, next-intl, OpenAI GPT-4o-mini, Vitest.

---

### Task 1: DB field + types

**Files:**
- Create: `supabase/migrations/00046_offering_profiles_required_fields.sql`
- Modify: `src/types/database.ts`

**Step 1: Write the failing test**

```ts
// src/lib/leads/offering-profile-utils.test.ts
import { describe, expect, it } from 'vitest'
import { normalizeIntakeFields } from '@/lib/leads/offering-profile-utils'

describe('normalizeIntakeFields', () => {
  it('dedupes, trims, and drops empties', () => {
    expect(normalizeIntakeFields(['  budget ', 'budget', '', '  '])).toEqual(['budget'])
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- src/lib/leads/offering-profile-utils.test.ts`
Expected: FAIL (normalizeIntakeFields not found)

**Step 3: Write minimal implementation**

```sql
-- supabase/migrations/00046_offering_profiles_required_fields.sql
ALTER TABLE public.offering_profiles
ADD COLUMN IF NOT EXISTS required_intake_fields TEXT[] NOT NULL DEFAULT '{}';
```

```ts
// src/types/database.ts
required_intake_fields: string[]
```

```ts
// src/lib/leads/offering-profile-utils.ts
export function normalizeIntakeFields(input: string[]) {
  return Array.from(new Set(input.map((item) => item.trim()).filter(Boolean)))
}
```

**Step 4: Run test to verify it passes**

Run: `npm run test -- src/lib/leads/offering-profile-utils.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add supabase/migrations/00046_offering_profiles_required_fields.sql src/types/database.ts src/lib/leads/offering-profile-utils.ts src/lib/leads/offering-profile-utils.test.ts
git commit -m "feat(phase-6): add required intake fields to offering profile"
```

### Task 2: Organization Settings UI chips

**Files:**
- Modify: `src/components/settings/OfferingProfileSection.tsx`
- Modify: `messages/en.json`
- Modify: `messages/tr.json`

**Step 1: Write the failing test**

```ts
// src/components/settings/OfferingProfileSection.test.tsx
// Assert chips render, add via Enter, remove via X
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- src/components/settings/OfferingProfileSection.test.tsx`
Expected: FAIL

**Step 3: Write minimal implementation**

```tsx
// Add chips list + input
// On Enter: append chip, normalize via normalizeIntakeFields
// On X: remove
// Reuse existing save flow to persist required_intake_fields
```

Add i18n keys:
- `requiredFieldsTitle`
- `requiredFieldsDescription`
- `requiredFieldsPlaceholder`
- `requiredFieldsHelp`

**Step 4: Run test to verify it passes**

Run: `npm run test -- src/components/settings/OfferingProfileSection.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add src/components/settings/OfferingProfileSection.tsx messages/en.json messages/tr.json src/components/settings/OfferingProfileSection.test.tsx
git commit -m "feat(phase-6): add required intake fields chips UI"
```

### Task 3: Auto-generate intake fields from Skills/KB

**Files:**
- Modify: `src/lib/leads/offering-profile.ts`
- Modify: `src/lib/knowledge-base/actions.ts` (or existing async pipeline)
- Test: `src/lib/leads/offering-profile.test.ts`

**Step 1: Write the failing test**

```ts
// src/lib/leads/offering-profile.test.ts
import { describe, expect, it } from 'vitest'
import { mergeIntakeFields } from '@/lib/leads/offering-profile-utils'

describe('mergeIntakeFields', () => {
  it('adds new fields and preserves existing', () => {
    expect(mergeIntakeFields(['budget'], ['date', 'budget'])).toEqual(['budget', 'date'])
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- src/lib/leads/offering-profile.test.ts`
Expected: FAIL

**Step 3: Write minimal implementation**

```ts
// src/lib/leads/offering-profile-utils.ts
export function mergeIntakeFields(current: string[], proposed: string[]) {
  return normalizeIntakeFields([...current, ...proposed])
}
```

```ts
// src/lib/leads/offering-profile.ts
// After generating profile suggestions, call a new LLM prompt to output JSON: { required_intake_fields: [] }
// Merge into offering_profiles.required_intake_fields
```

**Step 4: Run test to verify it passes**

Run: `npm run test -- src/lib/leads/offering-profile.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/leads/offering-profile.ts src/lib/leads/offering-profile-utils.ts src/lib/leads/offering-profile.test.ts

git commit -m "feat(phase-6): auto-append required intake fields from AI"
```

### Task 4: Smart follow-up question appended to bot reply

**Files:**
- Modify: `src/lib/ai/prompts.ts` (or wherever response prompt is built)
- Modify: `src/app/api/webhooks/telegram/route.ts`
- Modify: `src/lib/skills/actions.ts` and/or KB fallback pipeline
- Test: `src/lib/ai/followup.test.ts`

**Step 1: Write the failing test**

```ts
// src/lib/ai/followup.test.ts
import { describe, expect, it } from 'vitest'
import { appendFollowupQuestion } from '@/lib/ai/followup'

describe('appendFollowupQuestion', () => {
  it('appends follow-up when provided', () => {
    expect(appendFollowupQuestion('Merhaba', 'Hangi hizmet?'))
      .toBe('Merhaba\n\nHangi hizmet?')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- src/lib/ai/followup.test.ts`
Expected: FAIL

**Step 3: Write minimal implementation**

```ts
// src/lib/ai/followup.ts
export function appendFollowupQuestion(reply: string, followup?: string | null) {
  if (!followup?.trim()) return reply
  return `${reply}\n\n${followup.trim()}`
}
```

Then update prompt logic to request JSON with `followup_question` and `missing_fields` from LLM. Append follow-up to bot reply in Skills/KB/fallback responses.

**Step 4: Run test to verify it passes**

Run: `npm run test -- src/lib/ai/followup.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/ai/followup.ts src/lib/ai/followup.test.ts src/lib/ai/prompts.ts src/app/api/webhooks/telegram/route.ts src/lib/skills/actions.ts

git commit -m "feat(phase-6): append smart follow-up question to bot replies"
```

### Task 5: Docs + build verification

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

**Step 1: Update docs**
- Roadmap: mark feature complete and update Last Updated date.
- PRD: add rules for required intake fields + follow-up logic; update Tech Decisions + Last Updated date.
- Release: add under [Unreleased] Added/Changed.

**Step 2: Run build**

Run: `npm run build`
Expected: SUCCESS

**Step 3: Commit**

```bash
git add docs/ROADMAP.md docs/PRD.md docs/RELEASE.md
git commit -m "docs: document required intake fields and smart follow-ups"
```
