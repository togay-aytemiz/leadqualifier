# Knowledge AI Fill Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a persistent `Qualy AI ile doldur` helper banner to the freeform Knowledge Base create page so operators can generate and re-generate a first draft from a short structured brief.

**Architecture:** Keep v1 scoped to `Knowledge > Create`. The client create page renders a persistent helper banner above the title field, opens a guided modal, submits structured input to a server-side draft generator, and applies the returned `title/content` pair to local form state without auto-saving. Re-running generation replaces the content body each time, while the title is only filled when blank. OpenAI prompt-building, parsing, usage gating, and usage tracking live in a dedicated knowledge-base AI helper.

**Tech Stack:** Next.js App Router, React client components, server actions, OpenAI, next-intl, Vitest

---

### Task 1: Add the failing AI draft generation tests

**Files:**
- Create: `src/lib/knowledge-base/ai-draft.test.ts`
- Modify: `src/lib/knowledge-base/actions.test.ts`

**Step 1: Write the failing helper tests**

Cover:

- prompt input with structured brief fields
- JSON parsing success for `{ title, content }`
- fallback failure on empty or malformed model output
- title/content trimming behavior

**Step 2: Write the failing server-action tests**

Cover:

- usage entitlement is checked before generation
- active organization ownership is resolved correctly
- generated draft is returned without touching `knowledge_documents`

**Step 3: Run tests to verify they fail**

Run: `npm test -- --run src/lib/knowledge-base/ai-draft.test.ts src/lib/knowledge-base/actions.test.ts`

Expected: FAIL because the draft generator and server action do not exist yet.

### Task 2: Implement the server-side draft generator

**Files:**
- Create: `src/lib/knowledge-base/ai-draft.ts`
- Modify: `src/lib/knowledge-base/actions.ts`

**Step 1: Add the AI helper**

Implement:

- structured input type for the modal brief
- prompt builder with strict "use only provided facts" rules
- JSON response parser for `title` and `content`

**Step 2: Gate generation on billing entitlement**

Check organization usage before the OpenAI request. Return a controlled error for locked organizations instead of silently generating.

**Step 3: Record usage**

Record AI usage with metadata source `knowledge_ai_fill`, but keep it rolling up under the existing `documentProcessing` billing breakdown instead of adding a new visible Knowledge AI bucket.

**Step 4: Export a server-action wrapper**

Expose a client-callable action from `actions.ts`, for example `generateKnowledgeBaseDraft`, that:

- asserts tenant write allowance
- resolves the active organization
- calls the helper
- returns `{ title, content }`

### Task 3: Add the failing create-page UI tests

**Files:**
- Modify: `src/app/[locale]/(dashboard)/knowledge/create/page.test.tsx`
- Create: `src/app/[locale]/(dashboard)/knowledge/components/KnowledgeAiFillModal.test.tsx`

**Step 1: Extend the create-page source test**

Assert that the page now includes:

- the persistent helper banner copy
- the text-style `Qualy AI ile doldur` trigger
- local draft apply behavior
- content replacement on re-run
- conditional title replacement only when title is blank

**Step 2: Add the modal contract test**

Assert that the modal renders:

- the four structured fields
- the review-before-save helper line
- loading-safe action controls

**Step 3: Run tests to verify they fail**

Run: `npm test -- --run src/app/[locale]/(dashboard)/knowledge/create/page.test.tsx src/app/[locale]/(dashboard)/knowledge/components/KnowledgeAiFillModal.test.tsx`

Expected: FAIL because the modal and wiring do not exist yet.

### Task 4: Build the modal and wire it into the create page

**Files:**
- Create: `src/app/[locale]/(dashboard)/knowledge/components/KnowledgeAiFillModal.tsx`
- Modify: `src/app/[locale]/(dashboard)/knowledge/create/page.tsx`

**Step 1: Build the modal component**

Render the persistent banner plus four structured textareas/inputs in the modal:

- business basics
- service/process details
- bot guardrails
- extra notes / avoidances

Require at least one filled field before submit.

**Step 2: Add loading-safe UX**

While generation is running:

- keep the modal open
- disable close/submit controls
- show clear generating copy

**Step 3: Apply the draft into local editor state**

On success:

- if `title` is blank, set the generated title
- always replace the current content with generated content
- keep folder selection unchanged
- close the modal

**Step 4: Preserve existing typed data on failure**

Show a short error and leave current title/content untouched.

### Task 5: Add localized copy

**Files:**
- Modify: `messages/tr.json`
- Modify: `messages/en.json`

**Step 1: Add trigger and modal copy**

Add mirrored keys for:

- AI fill button label
- modal title/description
- four field labels/placeholders
- loading label
- error message
- review-before-save helper line

**Step 2: Keep the namespace consistent**

Place new keys under the existing `knowledge` namespace so the create page and modal can stay localized without inventing a new top-level structure.

### Task 6: Update product docs after implementation

**Files:**
- Modify: `docs/PRD.md`
- Modify: `docs/ROADMAP.md`
- Modify: `docs/RELEASE.md`

**Step 1: Update the PRD**

Record that freeform Knowledge Base creation now includes an optional AI drafting helper and refresh the `Last Updated` date.

**Step 2: Update the Roadmap**

Mark the item complete in the relevant phase or add a scoped new item for Knowledge Base authoring assistance, then refresh the `Last Updated` date.

**Step 3: Update Release notes**

Add the new AI drafting helper under `[Unreleased]`.

### Task 7: Verify

**Files:**
- None

**Step 1: Run targeted Knowledge Base tests**

Run: `npm test -- --run src/lib/knowledge-base/ai-draft.test.ts src/lib/knowledge-base/actions.test.ts src/app/[locale]/(dashboard)/knowledge/create/page.test.tsx src/app/[locale]/(dashboard)/knowledge/components/KnowledgeAiFillModal.test.tsx`

Expected: PASS

**Step 2: Run broader i18n/build checks**

Run: `npm run build`

Expected: successful production build with no type or translation regressions.

### Task 8: Phase 2 follow-up, only if phase 1 is validated

**Files:**
- Modify later: `src/app/[locale]/(dashboard)/knowledge/[id]/EditContentForm.tsx`
- Create later: edit-form tests

**Step 1: Decide edit semantics explicitly**

Before implementing edit support, choose one of:

- replace existing content
- append below existing content
- improve current content in place

**Step 2: Ship a separate action name**

Prefer `AI ile iyileştir` instead of reusing `AI ile doldur`, so operators understand that existing content is being transformed rather than drafted from scratch.
