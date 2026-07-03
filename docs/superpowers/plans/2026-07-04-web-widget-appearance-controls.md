# Web Widget Appearance Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add first-pass appearance controls to the UI-only Web widget setup and apply them to the copied widget script, launcher, iframe chat header, composer, and footer note.

**Architecture:** Keep appearance settings as local setup-page state, serialize them into `data-qualy-*` script attributes, pass them through the web embed query string, validate the color on the server page, and render the widget with in-memory state only. No database persistence is added in this iteration.

**Tech Stack:** Next.js App Router, React client state, next-intl TR/EN messages, existing web widget embed routes, Vitest source guards.

---

### Task 1: Source Guards

**Files:**
- Modify: `src/components/channels/WebOnboardingPage.source.test.ts`
- Modify: `src/app/embed/web/[organizationId]/widget.js/route.source.test.ts`
- Modify: `src/app/embed/web/[organizationId]/page.source.test.ts`
- Modify: `src/components/web-widget/WebWidgetChatClient.source.test.ts`

- [x] **Step 1: Write failing source tests**

Expect `data-qualy-theme-color`, logo/text visibility flags, editable footer text, `readBooleanSearchParam`, `normalizeThemeColor`, and `--web-widget-accent`.

- [x] **Step 2: Run tests to verify red**

Run:

```bash
npm test -- --run src/components/channels/WebOnboardingPage.source.test.ts src/components/web-widget/WebWidgetChatClient.source.test.ts 'src/app/embed/web/[organizationId]/widget.js/route.source.test.ts' 'src/app/embed/web/[organizationId]/page.source.test.ts'
```

Expected before implementation: FAIL on missing appearance controls.

### Task 2: Implementation

**Files:**
- Modify: `src/components/channels/WebOnboardingPage.tsx`
- Modify: `src/app/embed/web/[organizationId]/widget.js/route.ts`
- Modify: `src/app/embed/web/[organizationId]/page.tsx`
- Modify: `src/components/web-widget/WebWidgetChatClient.tsx`
- Modify: `messages/tr.json`
- Modify: `messages/en.json`

- [x] **Step 1: Add setup controls**

Add theme color swatches/color picker, logo visibility, launcher text visibility, launcher subtitle visibility, header subtitle visibility, footer visibility, and editable footer note.

- [x] **Step 2: Serialize and render settings**

Write settings into script `data-qualy-*` attributes, forward them to the iframe, and render the widget using the configured accent color and visibility flags.

- [x] **Step 3: Add translations**

Add mirrored TR/EN labels and default footer text.

### Task 3: Verification

**Files:**
- Modify: `docs/PRD.md`
- Modify: `docs/ROADMAP.md`
- Modify: `docs/RELEASE.md`

- [x] **Step 1: Update docs**

Record the UI-only appearance controls and the lack of persisted tenant configuration.

- [x] **Step 2: Run focused checks**

Run:

```bash
npm run i18n:check
npm test -- --run src/components/channels/WebOnboardingPage.source.test.ts src/components/web-widget/WebWidgetChatClient.source.test.ts 'src/app/embed/web/[organizationId]/widget.js/route.source.test.ts' 'src/app/embed/web/[organizationId]/page.source.test.ts'
```

Expected: PASS.

- [x] **Step 3: Run build**

Run:

```bash
npm run build
```

Expected: PASS.

## Self-Review

- Spec coverage: Covers all approved controls, including editable footer note.
- Placeholder scan: No placeholders.
- Scope check: No persisted widget settings, allowed-domain controls, or Inbox persistence added.
