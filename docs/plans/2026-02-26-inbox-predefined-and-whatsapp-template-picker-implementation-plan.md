# Inbox Predefined + WhatsApp Template Picker Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add organization-scoped predefined message templates and a unified Inbox template picker that can insert selected text into the composer (instead of sending immediately), while preserving WhatsApp official template send capability for 24-hour-window-expired flows.

**Architecture:** Keep the existing WhatsApp direct-template-send path for policy/compliance-critical scenarios, and introduce a new composer-centric template picker. The picker supports predefined templates for all platforms and shows a second tab for WhatsApp official templates only on WhatsApp conversations. Selection populates composer text; actual send still happens via existing `Send Reply` (or direct WhatsApp template send in expired-window fallback).

**Tech Stack:** Next.js App Router, Server Actions (`src/lib/inbox/actions.ts`), Supabase Postgres + RLS migrations, `next-intl` (`messages/en.json`, `messages/tr.json`), Vitest.

---

### Task 1: Data Model for Predefined Templates

**Files:**
- Create: `supabase/migrations/00072_inbox_predefined_templates.sql`
- Modify: `src/types/database.ts`

**Step 1: Write migration with strict tenant-safe schema**
- Create `public.inbox_predefined_templates` with:
  - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
  - `organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE`
  - `title TEXT NOT NULL`
  - `content TEXT NOT NULL`
  - `created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL`
  - `updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL`
  - `created_at TIMESTAMPTZ DEFAULT now()`
  - `updated_at TIMESTAMPTZ DEFAULT now()`
- Add constraints:
  - non-empty title/content (`length(trim(...)) > 0`)
  - title max length (e.g. `<= 80`), content max length (e.g. `<= 2000`)
- Add index: `(organization_id, updated_at DESC)`.
- Enable RLS.

**Step 2: Add RLS policies**
- `SELECT`: org members + system admin.
- `INSERT/UPDATE/DELETE`: org members + system admin (align current Inbox operational behavior unless product decides admin-only).

**Step 3: Add updated_at trigger**
- Reuse `update_updated_at_column` trigger pattern.

**Step 4: Update TypeScript DB types**
- Add `InboxPredefinedTemplate` interface.
- Add `Database.public.Tables.inbox_predefined_templates` row/insert/update types.

**Step 5: Verification**
- Run migration lint/check flow used in project.
- Ensure `npm run build` typechecks `database.ts` changes.

---

### Task 2: Server Actions for Predefined Templates

**Files:**
- Modify: `src/lib/inbox/actions.ts`
- Modify: `src/lib/inbox/actions.test.ts`

**Step 1: Write failing tests first**
- Add tests for:
  - list templates by conversation (resolves conversation org and returns org templates)
  - create template (valid input)
  - update template
  - delete template
  - validation failures (blank title/content, too long)
  - non-existing conversation/template handling

**Step 2: Add action types and DTOs**
- `InboxPredefinedTemplateSummary` / create-update input types.
- Result unions with explicit reasons: `validation | missing_conversation | missing_template | billing_locked | request_failed`.

**Step 3: Implement actions**
- `listConversationPredefinedTemplates(conversationId)`
- `createConversationPredefinedTemplate({ conversationId, title, content })`
- `updateConversationPredefinedTemplate({ conversationId, templateId, title, content })`
- `deleteConversationPredefinedTemplate({ conversationId, templateId })`
- Use conversation-derived `organization_id` for tenant-safe scoping.
- Use `assertTenantWriteAllowed` for write actions.

**Step 4: Keep WhatsApp actions unchanged**
- Preserve:
  - `listConversationWhatsAppTemplates`
  - `sendConversationWhatsAppTemplateMessage`

**Step 5: Run tests**
- `npm run test -- src/lib/inbox/actions.test.ts`

---

### Task 3: Unified Template Picker Modal (Composer-Oriented)

**Files:**
- Create: `src/components/inbox/TemplatePickerModal.tsx`
- Create: `src/components/inbox/template-picker-state.ts`
- Create: `src/components/inbox/template-picker-state.test.ts`
- Modify: `messages/en.json`
- Modify: `messages/tr.json`

**Step 1: Add state helper + tests first**
- Add pure helper for:
  - which tabs are visible (`predefined only` vs `predefined + whatsapp`)
  - footer action labels and disabled rules
- Unit test helper without UI complexity.

**Step 2: Build modal UI**
- For WhatsApp conversation:
  - Tab A: `Predefined` / `Hazır mesajlar`
  - Tab B: `WhatsApp templates` / `WhatsApp şablonları`
- For non-WhatsApp:
  - show predefined panel directly (no tabs).

**Step 3: Predefined panel behavior**
- list templates
- create/edit/delete inline or via small sub-form
- select one template
- click `OK` (`Insert to reply`) => returns text to parent via callback (no send)

**Step 4: WhatsApp panel behavior**
- list approved templates from Meta
- allow optional body variables
- on `OK` compose preview text and return it to parent composer callback
- do not call `sendConversationWhatsAppTemplateMessage` in this modal

**Step 5: i18n**
- Add complete EN/TR keys for:
  - modal title/description
  - tab labels
  - create/edit/delete labels
  - validations
  - insert button label
- Keep TR wording with `şablon` consistently.

---

### Task 4: Inbox Integration and UX Rules

**Files:**
- Modify: `src/components/inbox/InboxContainer.tsx`
- Keep/Modify minimally: `src/components/inbox/WhatsAppTemplateSendModal.tsx`

**Step 1: Add picker state and composer insertion callback**
- New state: `isTemplatePickerOpen`.
- Add callback `handleInsertTemplateToComposer(text: string)`.
- Behavior recommendation:
  - if composer empty -> set text
  - if composer has content -> append with newline

**Step 2: Action-row button behavior**
- All platforms: show `Templates` / `Şablonlar` button to open picker.
- WhatsApp: same button opens dual-tab picker.

**Step 3: Preserve expired-window capability**
- Keep existing direct WhatsApp template send path for `window_expired` fallback (`WhatsAppTemplateSendModal`), because it is needed when free-form reply cannot be sent.
- Expired panel CTA stays direct-send oriented (`Send WhatsApp Template`) to avoid regression.

**Step 4: Do not auto-send on picker confirm**
- Picker only hydrates composer.
- Actual send remains existing `Send Reply` action.

**Step 5: Manual UX check**
- non-WhatsApp conversation: predefined only
- WhatsApp conversation with open window: insert flow works
- WhatsApp conversation with expired window: direct-send modal still works

---

### Task 5: Testing, Docs, and Release Hygiene

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

**Step 1: Test suite run**
- `npm run test -- src/lib/inbox/actions.test.ts src/components/inbox/template-picker-state.test.ts`
- run any touched component tests if added.

**Step 2: Build verification**
- `npm run build`

**Step 3: Documentation updates**
- ROADMAP: add/check off new Inbox template-picker + predefined-template items.
- PRD: reflect composer-insert behavior and distinction between predefined vs official WhatsApp template send.
- RELEASE: add Added/Changed entries with touched files.

**Step 4: Commit strategy (small and frequent)**
1. `feat(phase-3.6): add predefined template schema and inbox actions`
2. `feat(phase-3.6): add inbox template picker modal with whatsapp tabs`
3. `docs: update roadmap prd and release for template picker flow`

---

## Product Decision to Confirm Before Implementation

To avoid breaking current WhatsApp policy-safe flow, implement with this rule:
- **Picker modal:** inserts text into composer only.
- **Expired WhatsApp window panel:** keeps existing direct WhatsApp template send modal.

If you want, we can also add an optional secondary action in picker (`Send official WhatsApp template now`) later, but not in first iteration.
