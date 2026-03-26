# Captioned Media Lead Extraction Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ensure lead extraction ignores media assets themselves but still uses the text/caption sent alongside inbound media messages.

**Architecture:** Keep the existing conversation-context builder as the single filtering boundary. Replace the current binary "media row => drop" rule with a text-aware rule that discards pure placeholders/media-only rows while preserving meaningful caption/text content from media-backed messages across WhatsApp and Instagram metadata shapes.

**Tech Stack:** TypeScript, Vitest, Next.js, Supabase message metadata

---

### Task 1: Add failing extraction-context regressions

**Files:**
- Modify: `src/lib/leads/extraction.test.ts`
- Test: `src/lib/leads/extraction.test.ts`

**Step 1: Write the failing test**

Add focused tests that prove:
- a WhatsApp media message with caption text remains in `conversationTurns` / `customerMessages`
- an Instagram media message with caption text also remains in context
- pure placeholder media rows still stay excluded

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/lib/leads/extraction.test.ts`

Expected: FAIL on the new captioned-media expectation while existing extraction tests still run.

### Task 2: Implement minimal context-filter fix

**Files:**
- Modify: `src/lib/leads/extraction.ts`
- Test: `src/lib/leads/extraction.test.ts`

**Step 1: Write minimal implementation**

Update the extraction-context filter so it:
- reads message metadata once
- recognizes media-backed rows for both WhatsApp and Instagram
- excludes only media-only placeholder/fallback rows
- preserves meaningful message text/caption content for extraction

**Step 2: Run targeted test to verify it passes**

Run: `npm test -- --run src/lib/leads/extraction.test.ts`

Expected: PASS

### Task 3: Verify and document

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

**Step 1: Run focused verification**

Run: `npm test -- --run src/lib/leads/extraction.test.ts`

Expected: PASS

**Step 2: Run build verification**

Run: `npm run build`

Expected: PASS

**Step 3: Update docs**

Document that lead extraction now keeps caption/text from media-backed inbound turns while continuing to ignore media-only placeholders.
