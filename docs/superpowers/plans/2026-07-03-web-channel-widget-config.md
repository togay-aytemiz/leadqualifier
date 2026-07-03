# Web Channel Widget Config Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a simple Settings > Channels > Web screen where admins can configure a website chat widget preview and copy an embed script.

**Architecture:** Keep this MVP lightweight and demo-backed: no new Web channel config table, no persistent save, no allowed-domain enforcement. The Web channel is a catalog entry that opens a client component with local form state; it hides the backing demo slug from first-time users, generates a script snippet for the existing `/embed/demo/[slug]/widget.js` endpoint, uploads launcher logos to Supabase Storage through a signed-upload action, and shows a live preview iframe/host area using the same settings.

**Tech Stack:** Next.js App Router, React client component state, next-intl TR/EN messages, existing Channels settings components, existing public demo embed/widget routes.

---

### Task 1: Add Web As A Virtual Channel Card

**Files:**
- Modify: `src/components/channels/channelCatalog.ts`
- Modify: `src/components/channels/channelCards.ts`
- Modify: `src/lib/channels/platform-icons.ts`
- Modify: `src/lib/channels/platform-icons.test.ts`
- Modify: `messages/tr.json`
- Modify: `messages/en.json`

- [ ] **Step 1: Extend UI-only channel types**

Add `web` to the catalog/card/icon type unions without changing `Channel['type']`.

- [ ] **Step 2: Add catalog entry**

Add a Web entry with `href: '/settings/channels/web'`, `tone: 'sky'`, `onboardingSurface: 'interactive'`, and no resources.

- [ ] **Step 3: Make channel lookup virtual**

Ensure `getChannelCardConfigs()` treats both `messenger` and `web` as virtual entries with no DB-backed `channel`.

- [ ] **Step 4: Add labels and card copy**

Add TR/EN `Channels.types.web` and `Channels.gallery.cards.web.description`.

- [ ] **Step 5: Verify tests**

Run:

```bash
npm test -- --run src/lib/channels/platform-icons.test.ts src/components/channels/channelCatalog.test.ts src/components/channels/ChannelsList.source.test.ts
```

Expected: PASS.

### Task 2: Build Web Channel Config Page

**Files:**
- Create: `src/components/channels/WebOnboardingPage.tsx`
- Create: `src/components/channels/WebOnboardingPage.source.test.ts`
- Modify: `src/app/[locale]/(dashboard)/settings/channels/[channel]/page.tsx`
- Modify: `messages/tr.json`
- Modify: `messages/en.json`

- [ ] **Step 1: Add source guard**

Create a source test that expects `WebOnboardingPage` to include:
- `data-qualy-title`
- `data-qualy-subtitle`
- `data-qualy-open-label`
- `data-qualy-logo-url`
- `/embed/demo/`
- copy-to-clipboard
- preview controls

- [ ] **Step 2: Implement client component**

Build a compact page inside `ChannelOnboardingShell` with:
- No visible demo slug input; use the current demo-backed widget route internally
- Bot title input, defaulted from AI Settings `bot_name`
- Subtitle input, defaulted from localized copy
- Launcher label input, defaulted from the active organization name, e.g. `YİÜ'ye sor`
- Logo/icon upload, stored in Supabase Storage and inserted into the script as `data-qualy-logo-url`
- Read-only script textarea
- Copy button using `navigator.clipboard.writeText`
- Live preview area that injects the generated script with a React `key` so changes remount it

- [ ] **Step 3: Route Web channel**

In `[channel]/page.tsx`, return `WebOnboardingPage` when `catalogEntry.type === 'web'`.

- [ ] **Step 4: Add TR/EN copy**

Add `Channels.onboarding.web.*` labels, helper text, copy button text, copied state, preview title, and snippet label.

- [ ] **Step 5: Verify tests**

Run:

```bash
npm run i18n:check
npm test -- --run src/components/channels/WebOnboardingPage.source.test.ts
```

Expected: PASS.

### Task 3: Let Widget Launcher Use Logo/Icon

**Files:**
- Modify: `src/app/embed/demo/[slug]/widget.js/route.ts`
- Modify: `src/app/embed/demo/[slug]/widget.js/route.source.test.ts`

- [ ] **Step 1: Add logo data attribute**

Read `data-qualy-logo-url` from the script tag.

- [ ] **Step 2: Render logo when present**

Replace the hardcoded `Q` launcher mark with an `<img>` when logo URL exists; keep `Q` fallback.

- [ ] **Step 3: Keep safe escaping**

Use existing `escapeHtml` before inserting logo URL into `innerHTML`.

- [ ] **Step 4: Verify tests**

Run:

```bash
npm test -- --run 'src/app/embed/demo/[slug]/widget.js/route.source.test.ts'
```

Expected: PASS.

### Task 4: Docs And Rendered Verification

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

- [ ] **Step 1: Update docs**

Record that Web channel config is UI-only in this iteration and uses the existing demo widget route.

Record that the user-facing screen should read as a product website-chat setup flow, not as a public demo setup flow.

- [ ] **Step 2: Run full verification**

Run:

```bash
npm run i18n:check
npm test -- --run src/lib/channels/platform-icons.test.ts src/components/channels/channelCatalog.test.ts src/components/channels/WebOnboardingPage.source.test.ts src/app/embed/layout.source.test.ts src/proxy.source.test.ts src/components/demo-chat/DemoChatClient.source.test.ts 'src/app/[locale]/demo/[slug]/page.source.test.ts' 'src/app/embed/demo/[slug]/page.source.test.ts' 'src/app/embed/demo/[slug]/widget.js/route.source.test.ts' 'src/app/embed/demo/[slug]/preview/page.source.test.ts'
npm run build
```

Expected: all commands PASS.

- [ ] **Step 3: Browser verification**

Open `http://localhost:3001/settings/channels/web` or the localized equivalent, verify the script textarea updates when fields change, the copy button reports copied state, and the preview launcher uses the logo/icon instead of `Q`.

---

## Self-Review

- Spec coverage: Covers card entry, Web settings page, snippet generation, preview, launcher logo, docs, tests.
- Placeholder scan: No TBD/TODO placeholders.
- Scope check: Intentionally no database persistence, allowed-domain enforcement, or generalized non-demo Web Chat API in this iteration.
- Type consistency: `web` is a virtual UI-only channel type, not a `Channel['type']`.
