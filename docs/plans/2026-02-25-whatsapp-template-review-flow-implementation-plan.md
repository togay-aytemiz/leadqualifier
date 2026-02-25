# WhatsApp Template Review Flow Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an in-app WhatsApp template visibility and test-send flow that can be shown in Meta App Review screencasts for `whatsapp_business_management`.

**Architecture:** Extend `WhatsAppClient` with template list/send APIs, expose guarded server actions that read connected WhatsApp channel credentials, and add a small channel-card modal for operators/admins to list templates and send a test template message. Keep this isolated from core inbox runtime to avoid behavioral regressions.

**Tech Stack:** Next.js App Router, Server Actions, next-intl (TR/EN), Supabase-backed channel config, Vitest.

---

### Task 1: WhatsApp Graph client template primitives (TDD)

**Files:**
- Modify: `src/lib/whatsapp/client.test.ts`
- Modify: `src/lib/whatsapp/client.ts`

1. Add failing tests for `getMessageTemplates` and `sendTemplate` payload shape.
2. Run focused tests and confirm RED failures.
3. Implement minimal client methods for:
   - `GET /{waba_id}/message_templates?fields=id,name,status,language,category&limit=100`
   - `POST /{phone_number_id}/messages` with `type=template` and optional body params.
4. Re-run focused tests and confirm GREEN.

### Task 2: Channel server actions for template list/send (TDD)

**Files:**
- Modify: `src/lib/channels/actions.test.ts`
- Modify: `src/lib/channels/actions.ts`

1. Add failing action tests for:
   - list templates on connected WhatsApp channel
   - validation errors for wrong channel or missing fields
   - send template success and normalized failure.
2. Implement minimal server actions:
   - `listWhatsAppMessageTemplates(channelId)`
   - `sendWhatsAppTemplateMessage({ channelId, to, templateName, languageCode, bodyParameters })`
3. Re-run focused tests and confirm GREEN.

### Task 3: Channels UI modal for review demo flow

**Files:**
- Modify: `src/components/channels/ChannelCard.tsx`
- Create: `src/components/channels/WhatsAppTemplateModal.tsx`
- Modify: `messages/en.json`
- Modify: `messages/tr.json`

1. Add a WhatsApp-only "Template Tools" action on connected channel card.
2. Build modal that:
   - loads template list
   - lets user pick template + recipient
   - accepts optional body params (line-based)
   - sends template and shows success/error state.
3. Keep all labels translatable (EN/TR parity).

### Task 4: Project docs + verification gates

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

1. Update roadmap/PRD/release notes for new template review support.
2. Run verification:
   - `npm test -- src/lib/whatsapp/client.test.ts src/lib/channels/actions.test.ts`
   - `npm run build`
3. Share results and commit message suggestion.
