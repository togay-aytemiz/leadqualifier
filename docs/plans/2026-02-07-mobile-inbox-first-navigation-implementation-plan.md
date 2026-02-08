# Mobile Inbox-First Navigation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deliver mobile app-style navigation and inbox behavior without changing desktop UX.

**Architecture:** Keep desktop sidebar/layout untouched at `lg+`, and add a mobile-only shell with bottom navigation. Implement inbox mobile behavior as single-pane list-to-conversation flow with an inline details toggle while preserving existing desktop three-column behavior.

**Tech Stack:** Next.js App Router, React client components, Tailwind CSS, next-intl, Vitest.

---

### Task 1: Add mobile navigation route logic

**Files:**
- Create: `src/design/mobile-navigation.ts`
- Test: `src/design/mobile-navigation.test.ts`

**Step 1: Write failing test**
- Add route-to-tab expectations for inbox/leads/skills/knowledge/other routes (with locale prefixes).

**Step 2: Run test to verify it fails**
- Run: `npm test -- --run src/design/mobile-navigation.test.ts`

**Step 3: Write minimal implementation**
- Implement `resolveMobileNavActiveItem(pathname)` with locale normalization and route prefix checks.

**Step 4: Run test to verify it passes**
- Run: `npm test -- --run src/design/mobile-navigation.test.ts`

### Task 2: Add mobile bottom navbar shell

**Files:**
- Create: `src/design/MobileBottomNav.tsx`
- Modify: `src/app/[locale]/(dashboard)/layout.tsx`

**Step 1: Implement mobile-only bottom navbar**
- Render 5 items and “Other” quick menu (`Simulator`, `Settings`, `Signout`) under `lg`.

**Step 2: Integrate in dashboard layout**
- Hide `MainSidebar` on mobile and attach `MobileBottomNav` with safe-area bottom spacing.

### Task 3: Implement mobile inbox single-pane flow

**Files:**
- Modify: `src/components/inbox/InboxContainer.tsx`

**Step 1: Add mobile view state**
- Introduce `isMobileConversationOpen` and `isMobileDetailsOpen`.

**Step 2: Implement list -> conversation transition**
- Open chat detail on conversation select; add mobile back action to return to list.

**Step 3: Add mobile details toggle**
- Add header-level details button that toggles compact contact + lead snapshot cards.

**Step 4: Keep desktop behavior unchanged**
- Gate mobile layout with `lg:hidden` and keep desktop behavior on `lg+`.

### Task 4: i18n and docs updates

**Files:**
- Modify: `messages/en.json`
- Modify: `messages/tr.json`
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

**Step 1: Add new translation keys**
- Add mobile navigation + inbox mobile action labels in EN/TR with key parity.

**Step 2: Update project docs**
- Mark roadmap items complete, append PRD tech decisions, and add release notes.

### Task 5: Verify build and checks

**Step 1: Run i18n parity checks**
- Run: `npm run i18n:check`

**Step 2: Run build verification**
- Run: `npm run build`

**Step 3: Record known test baseline issues**
- Run: `npm test -- --run` and note pre-existing failing suites if unrelated.
