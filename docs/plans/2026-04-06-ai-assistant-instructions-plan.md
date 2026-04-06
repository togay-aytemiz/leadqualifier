# AI Assistant Instructions Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the raw `AI Prompt` setting with structured `Yapay zeka asistan talimatları` fields, preserve legacy custom prompts, and keep customer-facing reply behavior compatible.

**Architecture:** Add four nullable instruction columns to `organization_ai_settings`, resolve locale-aware starter values plus legacy-prompt carryover inside the AI settings layer, and continue exposing a compiled `prompt` string for existing customer-reply pipelines. Replace the settings UI with four instruction textareas and a mobile-friendly `Nasıl çalışır?` modal, while leaving internal extraction/router/summary logic unchanged.

**Tech Stack:** Next.js App Router, React client components, Supabase migrations, next-intl, Vitest

---

### Task 1: Add the failing settings-resolution tests

**Files:**
- Modify: `src/lib/ai/settings.test.ts`
- Create: `src/lib/ai/assistant-instructions.ts`

**Step 1: Write the failing tests**

Add tests that cover:

- locale-aware starter instruction fields when no custom data exists
- legacy custom `prompt` flowing into `assistant_other_instructions`
- compiled `prompt` omitting empty instruction blocks
- hard/soft instruction ordering in the compiled result

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/lib/ai/settings.test.ts`

Expected: FAIL because the new instruction fields and compiler do not exist yet.

### Task 2: Add the schema and type support

**Files:**
- Create: `supabase/migrations/00109_ai_assistant_instructions.sql`
- Modify: `src/types/database.ts`

**Step 1: Add the migration**

Add nullable `assistant_role`, `assistant_intake_rule`, `assistant_never_do`, and `assistant_other_instructions` columns to `public.organization_ai_settings`.

**Step 2: Extend the TypeScript model**

Add the same four fields to `OrganizationAiSettings` so server/client settings code can read and write them safely.

### Task 3: Implement instruction defaults, legacy carryover, and prompt compilation

**Files:**
- Create: `src/lib/ai/assistant-instructions.ts`
- Modify: `src/lib/ai/prompts.ts`
- Modify: `src/lib/ai/settings.ts`

**Step 1: Add locale-aware starter text helpers**

Implement helper functions that return starter field values for TR and EN workspaces.

**Step 2: Add legacy prompt resolution**

Resolve old custom `prompt` values into `assistant_other_instructions` when the new fields are empty, without trying to split the text heuristically.

**Step 3: Compile the customer-facing prompt**

Build one final prompt string from the structured fields, keeping `Asla yapma` as the strongest workspace rule and skipping empty fields.

**Step 4: Keep compatibility in `getOrgAiSettings` and `updateOrgAiSettings`**

Return both the raw fields and the compiled `prompt` value from `getOrgAiSettings`, and persist the compiled prompt snapshot when settings are saved so existing reply paths keep working.

### Task 4: Add the failing AI settings UI tests

**Files:**
- Modify: `src/app/[locale]/(dashboard)/settings/ai/AiSettingsForm.test.tsx`
- Create: `src/app/[locale]/(dashboard)/settings/ai/AiSettingsClient.test.tsx`

**Step 1: Write the failing form contract test**

Replace the old prompt expectations with assertions for:

- `assistantInstructionsTitle`
- the four new field labels
- `howItWorksAction`
- absence of the old raw prompt field

**Step 2: Write the failing modal interaction test**

Add a client test that clicks `Nasıl çalışır?` / `How it works` and verifies the modal sections render, including the “does not override KB/guardrails” explanation.

**Step 3: Run tests to verify they fail**

Run: `npm test -- --run src/app/[locale]/(dashboard)/settings/ai/AiSettingsForm.test.tsx src/app/[locale]/(dashboard)/settings/ai/AiSettingsClient.test.tsx`

Expected: FAIL because the new UI and modal do not exist yet.

### Task 5: Replace the settings UI with structured instruction fields and help modal

**Files:**
- Modify: `src/app/[locale]/(dashboard)/settings/ai/AiSettingsClient.tsx`
- Modify: `src/app/[locale]/(dashboard)/settings/ai/AiSettingsForm.tsx`
- Create: `src/app/[locale]/(dashboard)/settings/ai/AiInstructionsHelpModal.tsx`

**Step 1: Replace prompt state with four instruction states**

Track the new instruction fields in the client, include them in dirty-state/save/discard logic, and remove direct editing of the legacy raw `prompt`.

**Step 2: Render the new section in `Behavior & Logic`**

Replace the old prompt textarea with the `Yapay zeka asistan talimatları` section, four textareas, and the underlined `Nasıl çalışır?` action.

**Step 3: Add the mobile-friendly help modal**

Create a portal modal with compact icon rows and three sections:

- `Ne işe yarar?`
- `Örnek kullanım`
- `Ne zaman uygulanmaz?`

Match the low-emphasis text-action trigger language used in Plans, but keep the modal layout optimized for mobile and desktop.

### Task 6: Add translation copy for the new UI and modal

**Files:**
- Modify: `messages/en.json`
- Modify: `messages/tr.json`

**Step 1: Add section and field copy**

Add TR/EN keys for the new section title, descriptions, field labels, field descriptions, and the `How it works` trigger.

**Step 2: Add modal copy**

Add mirrored TR/EN copy for the help modal title, descriptions, example guidance, “does not apply” rules, and close action.

### Task 7: Update product docs for the new settings model

**Files:**
- Modify: `docs/PRD.md`
- Modify: `docs/ROADMAP.md`
- Modify: `docs/RELEASE.md`

**Step 1: Update the PRD**

Record that `Settings > AI > Behavior & Logic` now uses structured assistant instructions instead of a raw prompt, and refresh the `Last Updated` date.

**Step 2: Update the Roadmap**

Mark the work complete in the relevant phase/add a new item if needed, and refresh the `Last Updated` date.

**Step 3: Update Release notes**

Add the new settings behavior under `[Unreleased]`.

### Task 8: Verify

**Files:**
- None

**Step 1: Run targeted settings tests**

Run: `npm test -- --run src/lib/ai/settings.test.ts src/app/[locale]/(dashboard)/settings/ai/AiSettingsForm.test.tsx src/app/[locale]/(dashboard)/settings/ai/AiSettingsClient.test.tsx`

Expected: PASS

**Step 2: Run customer-reply regression tests**

Run: `npm test -- --run src/lib/channels/inbound-ai-pipeline.test.ts src/app/api/webhooks/telegram/route.test.ts`

Expected: PASS with no regressions in customer-facing reply paths.

**Step 3: Run build**

Run: `npm run build`

Expected: successful production build with no new type/runtime errors.
