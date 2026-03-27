# Inbox Bot Display Name Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Keep Inbox operator-facing bot labels generic (`AI Assistant` / `Yapay Zeka Asistanı`) when the workspace still uses the default stored bot name, but show the user-defined name once it has been customized.

**Architecture:** Add one small helper that distinguishes default bot names from custom ones without changing persisted AI settings or prompt/runtime behavior. Feed Inbox header/details/message identity surfaces from that helper so mobile and desktop stay consistent.

**Tech Stack:** Next.js App Router, React 19, TypeScript, next-intl, Vitest

---

### Task 1: Define the display-name rule

**Files:**
- Create: `src/lib/ai/bot-name.test.ts`

**Step 1: Write the failing test**

Assert that blank/default stored bot names resolve to a generic assistant label, while custom names pass through unchanged.

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/lib/ai/bot-name.test.ts`

Expected: FAIL because the helper does not exist yet.

### Task 2: Implement and wire the helper

**Files:**
- Create: `src/lib/ai/bot-name.ts`
- Modify: `src/components/inbox/InboxContainer.tsx`

**Step 1: Write minimal implementation**

Add a reusable display-name resolver and replace Inbox header/details/message sender bot labels with the resolved name.

**Step 2: Run test to verify it passes**

Run: `npm test -- --run src/lib/ai/bot-name.test.ts`

Expected: PASS

### Task 3: Record and verify

**Files:**
- Modify: `docs/PRD.md`
- Modify: `docs/ROADMAP.md`
- Modify: `docs/RELEASE.md`

**Step 1: Document the rule**

Note that default stored bot names keep generic operator-facing assistant labels in Inbox until the user chooses a custom name.

**Step 2: Run verification**

Run:
- `npm test -- --run src/lib/ai/bot-name.test.ts`
- `npm run build`

Expected: All pass.
