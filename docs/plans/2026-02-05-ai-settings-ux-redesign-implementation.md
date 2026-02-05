# AI Settings UX Redesign Implementation Plan

> **For Agent:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement the redesigned Organization Settings UX with a single AI toggle controlling both Offering Profile and Required Fields, plus the new AI-enabled/disabled behaviors.

**Architecture:** The single `aiSuggestionsEnabled` flag drives UI state. Offering Profile summary stays in `offering_profiles.summary` but is hidden when AI is enabled and rebuilt from approved items. Required fields remain in `offering_profiles.required_intake_fields` and are tagged in UI when AI adds them.

**Tech Stack:** Next.js App Router, React client components, next-intl, Supabase actions.

---

### Task 1: Add plan-aligned i18n strings

**Files:**
- Modify: `messages/en.json`
- Modify: `messages/tr.json`

**Step 1: Write the failing test**

If i18n validation exists, add a key mirror test. Otherwise proceed to implementation.

**Step 2: Implement strings**
- Add labels for AI control band, AI-linked indicators, custom textarea actions, and empty states for new flows.

**Step 3: Commit**

```bash
git add messages/en.json messages/tr.json
git commit -m "docs: add AI settings UX strings"
```

---

### Task 2: Add AI control band to Organization Settings

**Files:**
- Modify: `src/app/[locale]/(dashboard)/settings/organization/OrganizationSettingsClient.tsx`

**Step 1: Write the failing test**

If component tests exist, create a test that toggles AI flag and asserts section visibility. Otherwise proceed to implementation.

**Step 2: Implement UI**
- Add AI control band above sections (checkbox + helper text).
- Ensure toggle updates `aiSuggestionsEnabled` state.
- Add “AI bağlı” indicator prop for sections when enabled.

**Step 3: Commit**

```bash
git add src/app/[locale]/(dashboard)/settings/organization/OrganizationSettingsClient.tsx
git commit -m "feat(phase-2): add global AI toggle band"
```

---

### Task 3: Refactor OfferingProfileSection for AI/Manual modes

**Files:**
- Modify: `src/components/settings/OfferingProfileSection.tsx`

**Step 1: Write the failing test**

If tests exist, add one test for AI-enabled hiding textarea and showing suggestions.

**Step 2: Implement**
- When `aiSuggestionsEnabled` is **false**: show only textarea; hide AI suggestions and manual-override UI.
- When `aiSuggestionsEnabled` is **true**: hide textarea; show AI suggestions accordion.
- In **Approved** tab, add “Kendi metnimi eklemek istiyorum” button that opens a **single textarea**; Save adds one item to approved list; Cancel closes.
- Remove inline add/edit list UI previously introduced.

**Step 3: Commit**

```bash
git add src/components/settings/OfferingProfileSection.tsx
git commit -m "feat(phase-2): gate offering profile UI by AI toggle"
```

---

### Task 4: Separate Required Fields section and AI tag behavior

**Files:**
- Create: `src/components/settings/RequiredIntakeFieldsSection.tsx`
- Modify: `src/app/[locale]/(dashboard)/settings/organization/OrganizationSettingsClient.tsx`

**Step 1: Write the failing test**

If component tests exist, add one test for “+ Alan ekle” open/close behavior.

**Step 2: Implement**
- Move required fields UI to its own section.
- AI enabled: show AI tags on AI-generated items; allow manual add.
- AI disabled: show manual only; hide AI tags.

**Step 3: Commit**

```bash
git add src/components/settings/RequiredIntakeFieldsSection.tsx src/app/[locale]/(dashboard)/settings/organization/OrganizationSettingsClient.tsx
git commit -m "feat(phase-2): split required fields into dedicated section"
```

---

### Task 5: Ensure approved suggestions update summary when AI enabled

**Files:**
- Modify: `src/app/[locale]/(dashboard)/settings/organization/OrganizationSettingsClient.tsx`
- Modify: `src/lib/leads/offering-profile-content.ts`

**Step 1: Write failing test**

```ts
import { mergeOfferingProfileItems } from '@/lib/leads/offering-profile-content'

describe('approved suggestions', () => {
  it('appends approved suggestion content', () => {
    expect(mergeOfferingProfileItems(['A'], ['B'])).toEqual(['A', 'B'])
  })
})
```

**Step 2: Implement**
- On approval, append suggestion content to summary list and persist.
- On manual override save (textarea), append as a single item.

**Step 3: Commit**

```bash
git add src/app/[locale]/(dashboard)/settings/organization/OrganizationSettingsClient.tsx src/lib/leads/offering-profile-content.ts
git commit -m "feat(phase-2): persist approved offerings into summary"
```

---

### Task 6: Docs + build verification

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

**Step 1: Update docs**
- Roadmap: mark items and update Last Updated to 2026-02-05.
- PRD: add Tech Decisions; update Last Updated.
- Release notes: add changes under [Unreleased].

**Step 2: Run build**

Run: `npm run build`
Expected: PASS

**Step 3: Commit**

```bash
git add docs/ROADMAP.md docs/PRD.md docs/RELEASE.md
git commit -m "docs: update roadmap prd release for AI settings UX"
```

