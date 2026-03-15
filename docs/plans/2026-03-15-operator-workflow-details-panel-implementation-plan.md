# Operator Workflow Details Panel Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add trustworthy operator-side correction tools to Inbox Details so teams can manually lock AI-extracted important info, edit conversation tags, and keep one shared private note without leaving the conversation view.

**Architecture:** Keep the chat timeline unchanged and move all non-message editing into reusable Details-panel components shared by desktop and mobile. Persist manual required-intake corrections inside `leads.extracted_fields`, keep tags and shared note on `conversations`, and protect important-info/private-note saves with lightweight stale-write checks.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Next Intl, Supabase server actions, PostgreSQL migrations, Vitest.

---

## Working Rules

- Use `@brainstorming` decisions already validated in `/Users/togay/Desktop/leadqualifier/docs/plans/2026-03-15-operator-workflow-details-panel-design.md`.
- Execute each task with `@test-driven-development`: write the failing test first, then the minimal implementation.
- Finish with `@verification-before-completion`: targeted tests, `npm run lint`, and `npm run build`.
- The worktree is already dirty. Do not touch unrelated modified files.
- Keep strings translatable in both `/Users/togay/Desktop/leadqualifier/messages/en.json` and `/Users/togay/Desktop/leadqualifier/messages/tr.json`.
- Reasonable MVP limits for this feature:
  - max tags: `12`
  - max tag length: `32`
  - max private note length: `2000`

### Task 1: Preserve Manual Required-Intake Data During Extraction

**Files:**
- Modify: `/Users/togay/Desktop/leadqualifier/src/lib/leads/required-intake.ts`
- Modify: `/Users/togay/Desktop/leadqualifier/src/lib/leads/required-intake.test.ts`
- Modify: `/Users/togay/Desktop/leadqualifier/src/lib/leads/extraction.ts`
- Modify: `/Users/togay/Desktop/leadqualifier/src/lib/leads/extraction.test.ts`

**Step 1: Write the failing tests**

Add coverage that proves the UI can see both the resolved value and its source, and that extraction reruns keep manual overrides plus metadata:

```ts
it('returns source metadata for manually overridden required intake fields', () => {
    const result = resolveCollectedRequiredIntake({
        requiredFields: ['Telefon'],
        extractedFields: {
            required_intake_collected: { Telefon: '0555 000 00 00' },
            required_intake_overrides: { telefon: '0555 111 11 11' },
            required_intake_override_meta: {
                telefon: { updated_at: '2026-03-15T10:00:00.000Z', updated_by: 'profile-1' }
            }
        }
    })

    expect(result).toEqual([
        {
            field: 'Telefon',
            value: '0555 111 11 11',
            source: 'manual',
            updatedAt: '2026-03-15T10:00:00.000Z',
            updatedBy: 'profile-1'
        }
    ])
})

it('keeps required intake overrides and metadata when AI extraction reruns', () => {
    const merged = mergeExtractionWithExisting(incomingExtraction, {
        extracted_fields: {
            required_intake_collected: { Telefon: '0555 000 00 00' },
            required_intake_overrides: { telefon: '0555 111 11 11' },
            required_intake_override_meta: {
                telefon: { updated_at: '2026-03-15T10:00:00.000Z', updated_by: 'profile-1' }
            }
        }
    })

    expect(merged.required_intake_overrides).toEqual({ telefon: '0555 111 11 11' })
    expect(merged.required_intake_override_meta).toEqual({
        telefon: { updated_at: '2026-03-15T10:00:00.000Z', updated_by: 'profile-1' }
    })
})
```

**Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- --run src/lib/leads/required-intake.test.ts src/lib/leads/extraction.test.ts
```

Expected: FAIL because `resolveCollectedRequiredIntake` does not return source metadata yet and `mergeExtractionWithExisting` does not preserve manual override structures.

**Step 3: Write the minimal implementation**

Update the resolver result shape so each row includes source metadata:

```ts
export interface ResolvedRequiredIntakeItem {
    field: string
    value: string
    source: 'ai' | 'manual'
    updatedAt?: string | null
    updatedBy?: string | null
}
```

In `/Users/togay/Desktop/leadqualifier/src/lib/leads/extraction.ts`, extend the normalized/merged extraction shape so these keys survive every rerun:

```ts
required_intake_overrides: normalizeCollectedFieldValues(existingExtracted.required_intake_overrides),
required_intake_override_meta: normalizeRequiredIntakeOverrideMeta(existingExtracted.required_intake_override_meta)
```

Also include both keys in the `leads.upsert({ extracted_fields: ... })` payload.

**Step 4: Run tests to verify they pass**

Run:

```bash
npm test -- --run src/lib/leads/required-intake.test.ts src/lib/leads/extraction.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/lib/leads/required-intake.ts src/lib/leads/required-intake.test.ts src/lib/leads/extraction.ts src/lib/leads/extraction.test.ts
git commit -m "feat(phase-3): preserve manual required intake metadata"
```

### Task 2: Add Important-Info Override Actions With Stale-Write Guard

**Files:**
- Modify: `/Users/togay/Desktop/leadqualifier/src/lib/inbox/actions.ts`
- Modify: `/Users/togay/Desktop/leadqualifier/src/lib/inbox/actions.test.ts`

**Step 1: Write the failing tests**

Add server-action tests for both save and reset flows:

```ts
it('stores one required intake override and records manual metadata', async () => {
    const result = await setConversationRequiredIntakeOverride({
        conversationId: 'conv-1',
        organizationId: 'org-1',
        field: 'Telefon',
        value: '0555 111 11 11',
        knownLeadUpdatedAt: '2026-03-15T10:00:00.000Z'
    })

    expect(result).toEqual({ ok: true })
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
        extracted_fields: expect.objectContaining({
            required_intake_overrides: { telefon: '0555 111 11 11' },
            required_intake_override_meta: {
                telefon: expect.objectContaining({ updated_by: 'profile-1' })
            }
        })
    }))
})

it('rejects important info save when the lead row changed since the panel opened', async () => {
    const result = await setConversationRequiredIntakeOverride({
        conversationId: 'conv-1',
        organizationId: 'org-1',
        field: 'Telefon',
        value: '0555 111 11 11',
        knownLeadUpdatedAt: '2026-03-15T10:00:00.000Z'
    })

    expect(result).toEqual({ ok: false, reason: 'stale_conflict' })
})

it('clears one override and falls back to AI data', async () => {
    const result = await clearConversationRequiredIntakeOverride({
        conversationId: 'conv-1',
        organizationId: 'org-1',
        field: 'Telefon',
        knownLeadUpdatedAt: '2026-03-15T10:00:00.000Z'
    })

    expect(result).toEqual({ ok: true })
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
        extracted_fields: expect.objectContaining({
            required_intake_overrides: {},
            required_intake_override_meta: {}
        })
    }))
})
```

**Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- --run src/lib/inbox/actions.test.ts
```

Expected: FAIL because the new actions and result types do not exist.

**Step 3: Write the minimal implementation**

In `/Users/togay/Desktop/leadqualifier/src/lib/inbox/actions.ts`, add:

```ts
export async function setConversationRequiredIntakeOverride(input: {
    conversationId: string
    organizationId: string
    field: string
    value: string
    knownLeadUpdatedAt: string | null
}): Promise<{ ok: true } | { ok: false; reason: 'missing_lead' | 'stale_conflict' | 'request_failed' }>
```

and

```ts
export async function clearConversationRequiredIntakeOverride(input: {
    conversationId: string
    organizationId: string
    field: string
    knownLeadUpdatedAt: string | null
}): Promise<{ ok: true } | { ok: false; reason: 'missing_lead' | 'stale_conflict' | 'request_failed' }>
```

Implementation rules:

- call `assertTenantWriteAllowed(input.organizationId)`
- load the `leads` row by `conversation_id`
- compare `lead.updated_at` with `knownLeadUpdatedAt`; mismatch returns `stale_conflict`
- normalize the field key exactly like `/Users/togay/Desktop/leadqualifier/src/lib/leads/required-intake.ts`
- merge only the targeted field into `required_intake_overrides`
- write `required_intake_override_meta[field] = { updated_at, updated_by, source: 'manual' }`
- `clear...` removes only the targeted key, not the full object

**Step 4: Run tests to verify they pass**

Run:

```bash
npm test -- --run src/lib/inbox/actions.test.ts
```

Expected: PASS for the new important-info action cases.

**Step 5: Commit**

```bash
git add src/lib/inbox/actions.ts src/lib/inbox/actions.test.ts
git commit -m "feat(phase-3): add important info override actions"
```

### Task 3: Add Editable Conversation Tags

**Files:**
- Create: `/Users/togay/Desktop/leadqualifier/src/lib/inbox/conversation-tags.ts`
- Create: `/Users/togay/Desktop/leadqualifier/src/lib/inbox/conversation-tags.test.ts`
- Modify: `/Users/togay/Desktop/leadqualifier/src/lib/inbox/actions.ts`
- Modify: `/Users/togay/Desktop/leadqualifier/src/lib/inbox/actions.test.ts`

**Step 1: Write the failing tests**

Add helper tests for normalization and action tests for persistence:

```ts
it('normalizes tags by trimming, deduping, and enforcing limits', () => {
    expect(normalizeConversationTags([' VIP ', 'vip', 'Hot Lead'])).toEqual(['VIP', 'Hot Lead'])
})

it('rejects more than 12 tags', () => {
    expect(() => normalizeConversationTags(new Array(13).fill('tag'))).toThrow('too_many_tags')
})

it('updates conversation tags with normalized values', async () => {
    const result = await updateConversationTags({
        conversationId: 'conv-1',
        organizationId: 'org-1',
        tags: [' VIP ', 'vip', 'Hot Lead']
    })

    expect(result).toEqual({ ok: true, tags: ['VIP', 'Hot Lead'] })
})
```

**Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- --run src/lib/inbox/conversation-tags.test.ts src/lib/inbox/actions.test.ts
```

Expected: FAIL because the helper and action do not exist.

**Step 3: Write the minimal implementation**

Create `/Users/togay/Desktop/leadqualifier/src/lib/inbox/conversation-tags.ts`:

```ts
export const MAX_CONVERSATION_TAGS = 12
export const MAX_CONVERSATION_TAG_LENGTH = 32

export function normalizeConversationTags(tags: string[]) {
    const normalized: string[] = []
    const seen = new Set<string>()

    for (const rawTag of tags) {
        const trimmed = rawTag.trim()
        if (!trimmed) continue
        if (trimmed.length > MAX_CONVERSATION_TAG_LENGTH) throw new Error('tag_too_long')
        const dedupeKey = trimmed.toLocaleLowerCase('tr')
        if (seen.has(dedupeKey)) continue
        seen.add(dedupeKey)
        normalized.push(trimmed)
    }

    if (normalized.length > MAX_CONVERSATION_TAGS) throw new Error('too_many_tags')
    return normalized
}
```

Then add `updateConversationTags(...)` in `/Users/togay/Desktop/leadqualifier/src/lib/inbox/actions.ts` to update `conversations.tags`.

**Step 4: Run tests to verify they pass**

Run:

```bash
npm test -- --run src/lib/inbox/conversation-tags.test.ts src/lib/inbox/actions.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/lib/inbox/conversation-tags.ts src/lib/inbox/conversation-tags.test.ts src/lib/inbox/actions.ts src/lib/inbox/actions.test.ts
git commit -m "feat(phase-3): add editable conversation tags"
```

### Task 4: Add Shared Private Note Storage And Action

**Files:**
- Create: `/Users/togay/Desktop/leadqualifier/supabase/migrations/00092_conversation_private_notes.sql`
- Modify: `/Users/togay/Desktop/leadqualifier/src/types/database.ts`
- Modify: `/Users/togay/Desktop/leadqualifier/src/lib/inbox/actions.ts`
- Modify: `/Users/togay/Desktop/leadqualifier/src/lib/inbox/actions.test.ts`

**Step 1: Write the failing tests**

Add action tests that cover save, clear, and stale conflict:

```ts
it('updates the shared private note and stamps editor metadata', async () => {
    const result = await updateConversationPrivateNote({
        conversationId: 'conv-1',
        organizationId: 'org-1',
        note: 'Müşteri hafta içi 17:00 sonrası aranmalı.',
        knownConversationUpdatedAt: '2026-03-15T10:00:00.000Z'
    })

    expect(result).toEqual({ ok: true })
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
        private_note: 'Müşteri hafta içi 17:00 sonrası aranmalı.',
        private_note_updated_by: 'profile-1'
    }))
})

it('rejects private note save on stale conversation data', async () => {
    const result = await updateConversationPrivateNote({
        conversationId: 'conv-1',
        organizationId: 'org-1',
        note: 'Yeni not',
        knownConversationUpdatedAt: '2026-03-15T10:00:00.000Z'
    })

    expect(result).toEqual({ ok: false, reason: 'stale_conflict' })
})
```

**Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- --run src/lib/inbox/actions.test.ts
```

Expected: FAIL because the schema fields and action do not exist.

**Step 3: Write the minimal implementation**

Create the migration:

```sql
alter table conversations
    add column if not exists private_note text,
    add column if not exists private_note_updated_at timestamptz,
    add column if not exists private_note_updated_by uuid;
```

Extend `/Users/togay/Desktop/leadqualifier/src/types/database.ts`:

```ts
private_note?: string | null
private_note_updated_at?: string | null
private_note_updated_by?: string | null
```

Then add `updateConversationPrivateNote(...)` in `/Users/togay/Desktop/leadqualifier/src/lib/inbox/actions.ts`:

- call `assertTenantWriteAllowed`
- fetch the conversation row and compare `updated_at` with `knownConversationUpdatedAt`
- trim the incoming note, allow `''` only to clear the note
- stamp `private_note_updated_at` and `private_note_updated_by`

**Step 4: Run tests to verify they pass**

Run:

```bash
npm test -- --run src/lib/inbox/actions.test.ts
```

Expected: PASS for the new private-note cases.

**Step 5: Commit**

```bash
git add supabase/migrations/00092_conversation_private_notes.sql src/types/database.ts src/lib/inbox/actions.ts src/lib/inbox/actions.test.ts
git commit -m "feat(phase-3): add shared conversation private notes"
```

### Task 5: Build The Important Info Editor UI

**Files:**
- Create: `/Users/togay/Desktop/leadqualifier/src/components/inbox/ImportantInfoEditor.tsx`
- Create: `/Users/togay/Desktop/leadqualifier/src/components/inbox/importantInfoEditor.test.tsx`
- Modify: `/Users/togay/Desktop/leadqualifier/src/components/inbox/InboxContainer.tsx`
- Modify: `/Users/togay/Desktop/leadqualifier/messages/en.json`
- Modify: `/Users/togay/Desktop/leadqualifier/messages/tr.json`

**Step 1: Write the failing tests**

Add a small `renderToStaticMarkup` smoke test for the editor states:

```tsx
it('renders manual source chips and return-to-ai action', () => {
    const markup = renderToStaticMarkup(
        <ImportantInfoEditor
            items={[{ field: 'Telefon', value: '0555 111 11 11', source: 'manual' }]}
            isReadOnly={false}
            onSave={async () => ({ ok: true })}
            onReturnToAi={async () => ({ ok: true })}
        />
    )

    expect(markup).toContain('Manual')
    expect(markup).toContain('Return to AI')
})
```

**Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- --run src/components/inbox/importantInfoEditor.test.tsx
```

Expected: FAIL because the component does not exist.

**Step 3: Write the minimal implementation**

Create `/Users/togay/Desktop/leadqualifier/src/components/inbox/ImportantInfoEditor.tsx` with row-level edit state:

```tsx
type ImportantInfoEditorProps = {
    items: ResolvedRequiredIntakeItem[]
    isReadOnly: boolean
    onSave: (input: { field: string; value: string; knownLeadUpdatedAt: string | null }) => Promise<ActionResult>
    onReturnToAi: (input: { field: string; knownLeadUpdatedAt: string | null }) => Promise<ActionResult>
}
```

Behavior to wire in `/Users/togay/Desktop/leadqualifier/src/components/inbox/InboxContainer.tsx`:

- replace the current read-only required-info block in both desktop and mobile sections
- show a source chip per row: `AI` or `Manual`
- allow only one open row editor at a time
- keep local draft text on save errors
- disable edit/save/reset when `isReadOnly === true`
- map `stale_conflict` to a short refresh message

Add new translation keys under `inbox`:

```json
"leadRequiredInfoAi": "AI",
"leadRequiredInfoManual": "Manual",
"leadRequiredInfoEdit": "Edit",
"leadRequiredInfoSave": "Save",
"leadRequiredInfoReturnToAi": "Return to AI",
"leadRequiredInfoConflict": "This info changed in another session. Refresh and try again."
```

Mirror them in Turkish.

**Step 4: Run tests to verify they pass**

Run:

```bash
npm test -- --run src/components/inbox/importantInfoEditor.test.tsx src/lib/inbox/actions.test.ts src/lib/leads/required-intake.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/components/inbox/ImportantInfoEditor.tsx src/components/inbox/importantInfoEditor.test.tsx src/components/inbox/InboxContainer.tsx messages/en.json messages/tr.json
git commit -m "feat(phase-3): add important info editor to inbox details"
```

### Task 6: Build Editable Tags And Shared Note Editors

**Files:**
- Create: `/Users/togay/Desktop/leadqualifier/src/components/inbox/ConversationTagsEditor.tsx`
- Create: `/Users/togay/Desktop/leadqualifier/src/components/inbox/ConversationPrivateNoteEditor.tsx`
- Create: `/Users/togay/Desktop/leadqualifier/src/components/inbox/conversationDetailsEditors.test.tsx`
- Modify: `/Users/togay/Desktop/leadqualifier/src/components/inbox/InboxContainer.tsx`
- Modify: `/Users/togay/Desktop/leadqualifier/messages/en.json`
- Modify: `/Users/togay/Desktop/leadqualifier/messages/tr.json`

**Step 1: Write the failing tests**

Add smoke tests for tag chips and note metadata:

```tsx
it('renders editable tags with add affordance', () => {
    const markup = renderToStaticMarkup(
        <ConversationTagsEditor
            tags={['VIP', 'Hot Lead']}
            isReadOnly={false}
            onSave={async () => ({ ok: true, tags: ['VIP', 'Hot Lead'] })}
        />
    )

    expect(markup).toContain('VIP')
    expect(markup).toContain('Add')
})

it('renders shared note metadata', () => {
    const markup = renderToStaticMarkup(
        <ConversationPrivateNoteEditor
            note="Müşteri hafta içi aranmalı"
            updatedAt="2026-03-15T10:00:00.000Z"
            updatedByLabel="Ayşe"
            isReadOnly={false}
            onSave={async () => ({ ok: true })}
        />
    )

    expect(markup).toContain('Ayşe')
})
```

**Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- --run src/components/inbox/conversationDetailsEditors.test.tsx
```

Expected: FAIL because the components do not exist.

**Step 3: Write the minimal implementation**

Create `/Users/togay/Desktop/leadqualifier/src/components/inbox/ConversationTagsEditor.tsx` and `/Users/togay/Desktop/leadqualifier/src/components/inbox/ConversationPrivateNoteEditor.tsx`.

Wire them into `/Users/togay/Desktop/leadqualifier/src/components/inbox/InboxContainer.tsx`:

- render the tag editor inside existing Details tags section
- call `updateConversationTags(...)` and update local conversation state on success
- render the shared note editor below tags in both desktop and mobile details panels
- call `updateConversationPrivateNote(...)`
- show last-updated label using `private_note_updated_at` and `private_note_updated_by`
- keep the note textarea explicit-save only; do not autosave
- disable all controls in read-only mode

Add translations:

```json
"privateNote": "Private note",
"privateNotePlaceholder": "Add internal context for your team...",
"privateNoteSave": "Save note",
"privateNoteSavedBy": "Last updated by {name}",
"privateNoteConflict": "This note changed in another session. Refresh and try again.",
"tagsPlaceholder": "Type a tag",
"tagValidationTooLong": "Tags must be 32 characters or fewer.",
"tagValidationTooMany": "You can add up to 12 tags."
```

Mirror them in Turkish.

**Step 4: Run tests to verify they pass**

Run:

```bash
npm test -- --run src/components/inbox/conversationDetailsEditors.test.tsx src/lib/inbox/conversation-tags.test.ts src/lib/inbox/actions.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/components/inbox/ConversationTagsEditor.tsx src/components/inbox/ConversationPrivateNoteEditor.tsx src/components/inbox/conversationDetailsEditors.test.tsx src/components/inbox/InboxContainer.tsx messages/en.json messages/tr.json
git commit -m "feat(phase-3): add tags and private note editors to inbox details"
```

### Task 7: Update Product Docs And Verify The Full Slice

**Files:**
- Modify: `/Users/togay/Desktop/leadqualifier/docs/ROADMAP.md`
- Modify: `/Users/togay/Desktop/leadqualifier/docs/PRD.md`
- Modify: `/Users/togay/Desktop/leadqualifier/docs/RELEASE.md`

**Step 1: Update the roadmap and PRD**

Record the shipped scope:

- mark the relevant Inbox/operator workflow checklist items as complete in `/Users/togay/Desktop/leadqualifier/docs/ROADMAP.md`
- add the finalized behavior and limits to `/Users/togay/Desktop/leadqualifier/docs/PRD.md`
- update “Last Updated” dates in both docs

**Step 2: Update release notes**

Add entries under `[Unreleased]` in `/Users/togay/Desktop/leadqualifier/docs/RELEASE.md`:

- `Added`: important-info manual overwrite, editable tags, shared private note
- `Changed`: Inbox details panel now exposes operator editing controls

**Step 3: Run targeted tests**

Run:

```bash
npm test -- --run src/lib/leads/required-intake.test.ts src/lib/leads/extraction.test.ts src/lib/inbox/conversation-tags.test.ts src/lib/inbox/actions.test.ts src/components/inbox/importantInfoEditor.test.tsx src/components/inbox/conversationDetailsEditors.test.tsx
```

Expected: PASS.

**Step 4: Run lint and build**

Run:

```bash
npm run lint
npm run build
```

Expected: PASS for both commands.

**Step 5: Commit**

```bash
git add docs/ROADMAP.md docs/PRD.md docs/RELEASE.md
git commit -m "docs: record operator workflow details panel launch readiness"
```

## Implementation Notes

- Reuse the same editor components in desktop and mobile details surfaces; do not fork behavior.
- Keep server actions focused on one mutation each. Do not create a general “update conversation details” endpoint.
- Prefer local optimistic state only after a successful server response; stale-write protection matters more than speed for this flow.
- When reading `private_note_updated_by`, start with the raw profile id in state if no user label is already loaded. Converting that id into a readable teammate name can be a thin follow-up if existing inbox data does not already expose it.
- If the UI becomes too dense inside `/Users/togay/Desktop/leadqualifier/src/components/inbox/InboxContainer.tsx`, extract only the new details-editor sections. Do not refactor unrelated inbox logic in the same branch.
