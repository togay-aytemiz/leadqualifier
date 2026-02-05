# Offering Profile List Refactor Implementation Plan

> **For Agent:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refactor Organization Settings so the offering profile becomes a single list-based source of truth with AI suggestion flow, and separate required intake fields into their own section with manual + AI chips.

**Architecture:** Keep the existing `offering_profiles.summary` column as the storage format, but serialize it as a newline-delimited list of items. The UI renders items as a list with inline add/edit/remove. AI suggestions move items into this list when approved. Required intake fields stay in `offering_profiles.required_intake_fields` with chips and a hidden manual input opened on demand.

**Tech Stack:** Next.js App Router, React client components, next-intl, Supabase actions.

---

### Task 1: Add helper utilities for offering profile list parsing/serialization

**Files:**
- Create: `src/lib/leads/offering-profile-content.ts`
- Test: `src/lib/leads/offering-profile-content.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { parseOfferingProfileSummary, serializeOfferingProfileItems, mergeOfferingProfileItems } from './offering-profile-content'

describe('offering profile content helpers', () => {
  it('parses newline summary into trimmed list', () => {
    expect(parseOfferingProfileSummary('  A\n\nB  ')).toEqual(['A', 'B'])
  })

  it('serializes list into newline summary', () => {
    expect(serializeOfferingProfileItems(['A', 'B'])).toBe('A\nB')
  })

  it('merges items without duplicates (case-insensitive)', () => {
    expect(mergeOfferingProfileItems(['A'], ['a', 'B'])).toEqual(['A', 'B'])
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- --run src/lib/leads/offering-profile-content.test.ts`
Expected: FAIL with module not found or missing exports

**Step 3: Write minimal implementation**

```ts
const normalizeItem = (value: string) => value.trim()

export function parseOfferingProfileSummary(summary: string): string[] {
  return summary
    .split('\n')
    .map(normalizeItem)
    .filter(Boolean)
}

export function serializeOfferingProfileItems(items: string[]): string {
  return items.map(normalizeItem).filter(Boolean).join('\n')
}

export function mergeOfferingProfileItems(base: string[], incoming: string[]): string[] {
  const seen = new Set(base.map(item => item.toLowerCase()))
  const next = [...base]
  for (const item of incoming) {
    const normalized = item.trim()
    if (!normalized) continue
    const key = normalized.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    next.push(normalized)
  }
  return next
}
```

**Step 4: Run test to verify it passes**

Run: `npm run test -- --run src/lib/leads/offering-profile-content.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/leads/offering-profile-content.ts src/lib/leads/offering-profile-content.test.ts
git commit -m "test(phase-2): add offering profile content helpers"
```

---

### Task 2: Refactor OfferingProfileSection to list-based content with inline manual add/edit

**Files:**
- Modify: `src/components/settings/OfferingProfileSection.tsx`
- Modify: `messages/en.json`
- Modify: `messages/tr.json`

**Step 1: Write the failing test**

If component tests are set up:

```ts
import { render, screen, fireEvent } from '@testing-library/react'
import { OfferingProfileSection } from './OfferingProfileSection'

test('adds a manual item to the offering profile list', () => {
  const onSummaryChange = vi.fn()
  render(
    <OfferingProfileSection
      summary="A"
      aiSuggestionsEnabled
      requiredIntakeFields={[]}
      suggestions={[]}
      onSummaryChange={onSummaryChange}
      onAiSuggestionsEnabledChange={() => {}}
      onRequiredIntakeFieldsChange={() => {}}
      onReviewSuggestion={() => {}}
    />
  )
  fireEvent.click(screen.getByRole('button', { name: /add item/i }))
  fireEvent.change(screen.getByPlaceholderText(/type item/i), { target: { value: 'B' } })
  fireEvent.keyDown(screen.getByPlaceholderText(/type item/i), { key: 'Enter' })
  expect(onSummaryChange).toHaveBeenCalled()
})
```

If no component test infra exists, skip this step and continue with manual verification.

**Step 2: Implement UI changes**
- Replace the textarea with a list-based UI derived from `parseOfferingProfileSummary(summary)`.
- Add inline “Add item” button that reveals an input; on Enter adds to list and closes input.
- Add edit/remove affordances per item (inline input on edit, remove button with icon).
- Show subtle “AI” tag for items that originated from AI suggestions (requires tracking; see Task 3).
- Keep “AI otomatik öneri üret” checkbox (default on) + “Şimdi üret” button in the section header.
- Convert AI suggestions block into an accordion (collapsed by default).

**Step 3: Run tests (if available)**

Run: `npm run test -- --run src/components/settings/OfferingProfileSection.test.tsx`
Expected: PASS (or skip with note if no tests)

**Step 4: Commit**

```bash
git add src/components/settings/OfferingProfileSection.tsx messages/en.json messages/tr.json
git commit -m "feat(phase-2): refactor offering profile to list-based editor"
```

---

### Task 3: Persist list-based content and auto-apply approved suggestions

**Files:**
- Modify: `src/app/[locale]/(dashboard)/settings/organization/OrganizationSettingsClient.tsx`
- Modify: `src/lib/leads/settings.ts`
- Modify: `src/types/database.ts` (if new fields added)

**Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { mergeOfferingProfileItems } from '@/lib/leads/offering-profile-content'

describe('approved suggestions merge', () => {
  it('appends approved suggestion content to summary list', () => {
    const base = ['A']
    const next = mergeOfferingProfileItems(base, ['B'])
    expect(next).toEqual(['A', 'B'])
  })
})
```

**Step 2: Implement**
- In `OrganizationSettingsClient`, keep `profileSummary` as serialized string, but derive list UI from helpers.
- When approving a suggestion in `handleReviewSuggestion`, append suggestion content to the list and call `updateOfferingProfileSummary` with the serialized summary.
- Track AI-origin items so the UI can display a subtle “AI” tag (store an in-memory set of suggestion IDs or compare against approved suggestion contents).
- Ensure Save/Discard still works with the serialized summary.

**Step 3: Run tests**

Run: `npm run test -- --run src/lib/leads/offering-profile-content.test.ts`
Expected: PASS

**Step 4: Commit**

```bash
git add src/app/[locale]/(dashboard)/settings/organization/OrganizationSettingsClient.tsx src/lib/leads/settings.ts src/types/database.ts
git commit -m "feat(phase-2): apply approved suggestions into offering profile list"
```

---

### Task 4: Move “Gerekli bilgiler” to its own section with manual+AI chips

**Files:**
- Create: `src/components/settings/RequiredIntakeFieldsSection.tsx`
- Modify: `src/app/[locale]/(dashboard)/settings/organization/OrganizationSettingsClient.tsx`
- Modify: `messages/en.json`
- Modify: `messages/tr.json`

**Step 1: Write the failing test**

```ts
import { render, screen, fireEvent } from '@testing-library/react'
import { RequiredIntakeFieldsSection } from './RequiredIntakeFieldsSection'

test('adds a manual intake field when input is opened', () => {
  const onChange = vi.fn()
  render(
    <RequiredIntakeFieldsSection
      fields={[]}
      onChange={onChange}
    />
  )
  fireEvent.click(screen.getByRole('button', { name: /add field/i }))
  fireEvent.change(screen.getByPlaceholderText(/type field/i), { target: { value: 'Budget' } })
  fireEvent.keyDown(screen.getByPlaceholderText(/type field/i), { key: 'Enter' })
  expect(onChange).toHaveBeenCalled()
})
```

**Step 2: Implement**
- Extract required intake fields UI into its own SettingsSection component.
- Show chip list (manual + AI items together); add subtle AI tag when source is AI.
- Keep input hidden by default; open with “+ Alan ekle” button.

**Step 3: Run tests**

Run: `npm run test -- --run src/components/settings/RequiredIntakeFieldsSection.test.tsx`
Expected: PASS (or skip with note if no tests)

**Step 4: Commit**

```bash
git add src/components/settings/RequiredIntakeFieldsSection.tsx src/app/[locale]/(dashboard)/settings/organization/OrganizationSettingsClient.tsx messages/en.json messages/tr.json
git commit -m "feat(phase-2): split required fields into dedicated section"
```

---

### Task 5: Update AI suggestion accordion labels and defaults

**Files:**
- Modify: `messages/en.json`
- Modify: `messages/tr.json`

**Step 1: Write the failing test**

If i18n key validation exists, add a test; otherwise proceed to implementation.

**Step 2: Implement**
- Rename labels to “AI ile öneri üret” / “AI otomatik öneri üret” / “Şimdi üret”.
- Ensure default for automatic suggestion generation is enabled in initial state if missing.

**Step 3: Commit**

```bash
git add messages/en.json messages/tr.json
git commit -m "docs: refine AI suggestion copy for offering profile"
```

---

### Task 6: Documentation + build verification

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

**Step 1: Update roadmap**
- Mark completed items.
- Update “Last Updated” date to 2026-02-05.

**Step 2: Update PRD**
- Add decision to Tech Decisions appendix.
- Update “Last Updated” date.

**Step 3: Update release notes**
- Add under [Unreleased] → Added.

**Step 4: Run build**

Run: `npm run build`
Expected: PASS

**Step 5: Commit**

```bash
git add docs/ROADMAP.md docs/PRD.md docs/RELEASE.md
git commit -m "docs: update roadmap prd and release for settings refactor"
```
