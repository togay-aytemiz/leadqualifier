# Web Widget Simulator Decoupling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the demo-backed website widget preview with an organization-scoped web widget that answers through the same simulator pipeline and never loads public demo branding or stored demo messages.

**Architecture:** Add a separate `/embed/web/[organizationId]` widget script, iframe page, and chat API. The Web channel setup page generates that script from the active organization, while the widget client keeps only in-memory messages and sends recent turns to a route that calls `simulateChat`.

**Tech Stack:** Next.js App Router, React client component state, next-intl TR/EN messages, existing `simulateChat` server logic, Vitest source/route tests.

---

### Task 1: Web Widget Routes And Source Guards

**Files:**
- Create: `src/app/embed/web/[organizationId]/widget.js/route.ts`
- Create: `src/app/embed/web/[organizationId]/widget.js/route.source.test.ts`
- Create: `src/app/embed/web/[organizationId]/page.tsx`
- Create: `src/app/embed/web/[organizationId]/page.source.test.ts`
- Modify: `src/components/channels/WebOnboardingPage.tsx`
- Modify: `src/components/channels/WebOnboardingPage.source.test.ts`

- [x] **Step 1: Write failing source tests**

Assert Web setup no longer emits `/embed/demo/`, the new widget route points iframe traffic at `/embed/web/`, and the embed page does not import demo-channel helpers.

- [x] **Step 2: Run tests to verify red**

Run:

```bash
npm test -- --run src/components/channels/WebOnboardingPage.source.test.ts 'src/app/embed/web/[organizationId]/widget.js/route.source.test.ts' 'src/app/embed/web/[organizationId]/page.source.test.ts'
```

Expected: FAIL before the new files/routes exist and before the setup page is changed.

- [x] **Step 3: Implement minimal routes and snippet changes**

Create the new web embed script/page pair, keep script attributes brandable, and point `WebOnboardingPage` at `/embed/web/${organizationId}/widget.js`.

- [x] **Step 4: Run tests to verify green**

Run the same command. Expected: PASS.

### Task 2: Web Widget Chat Client And Simulator API

**Files:**
- Create: `src/components/web-widget/WebWidgetChatClient.tsx`
- Create: `src/components/web-widget/WebWidgetChatClient.source.test.ts`
- Create: `src/app/api/web-widget/[organizationId]/chat/route.ts`
- Create: `src/app/api/web-widget/[organizationId]/chat/route.test.ts`
- Modify: `messages/tr.json`
- Modify: `messages/en.json`

- [x] **Step 1: Write failing client/API tests**

Assert the client posts to `/api/web-widget/${organizationId}/chat`, does not use `localStorage`, carries recent in-memory history, and the route calls `simulateChat` with `organizationId`, message, threshold, and history.

- [x] **Step 2: Run tests to verify red**

Run:

```bash
npm test -- --run src/components/web-widget/WebWidgetChatClient.source.test.ts 'src/app/api/web-widget/[organizationId]/chat/route.test.ts'
```

Expected: FAIL before implementation.

- [x] **Step 3: Implement minimal client/API**

Build a compact chat surface with title/subtitle/logo props, close/reset controls, in-memory session only, and an API route that returns `response` plus optional skill image from `simulateChat`.

- [x] **Step 4: Run tests to verify green**

Run the same command. Expected: PASS.

### Task 3: Docs And Verification

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

- [x] **Step 1: Update docs**

Record that the UI-only Web widget is no longer demo-backed and uses simulator-style org Skills/KB responses without Inbox persistence.

- [x] **Step 2: Run focused checks**

Run:

```bash
npm run i18n:check
npm test -- --run src/components/channels/WebOnboardingPage.source.test.ts src/components/web-widget/WebWidgetChatClient.source.test.ts 'src/app/embed/web/[organizationId]/widget.js/route.source.test.ts' 'src/app/embed/web/[organizationId]/page.source.test.ts' 'src/app/api/web-widget/[organizationId]/chat/route.test.ts'
```

Expected: PASS.

- [x] **Step 3: Run build**

Run:

```bash
npm run build
```

Expected: PASS.

## Self-Review

- Spec coverage: Covers demo decoupling, org-scoped simulator answers, no stored preview messages, translatable text, docs, and build verification.
- Placeholder scan: No TBD/TODO placeholders.
- Scope check: Does not add full persistent Web Chat, allowed-domain enforcement, or Inbox persistence in this iteration.
- Type consistency: Route, client, and source-test names all use `organizationId`.
