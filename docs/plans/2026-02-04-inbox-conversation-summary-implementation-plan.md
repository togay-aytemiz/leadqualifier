# Inbox Conversation Summary Implementation Plan

> **For Agent:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an on-demand conversation summary in Inbox that summarizes the last five contact messages plus the last bot message and shows a single-paragraph recap inside an accordion with a refresh control.

**Architecture:** A server action queries recent messages (contact + bot) with org scoping, builds a constrained prompt, and calls OpenAI. The Inbox UI manages summary state, renders an accordion header (content-hug) with a refresh icon that only appears when open, and shows an animated loading/success/error panel inline above the composer. Header and refresh are disabled with a tooltip when insufficient messages exist.

**Tech Stack:** Next.js App Router, React, Supabase server actions, OpenAI SDK, next-intl, Tailwind CSS.

---

### Task 1: Add server action for conversation summary

**Files:**
- Modify: `src/lib/inbox/actions.ts`

**Step 1: Add a failing manual check note (no test runner)**
There is no automated test runner configured. We will validate via manual checks and build.

**Step 2: Implement summary action**
Add a new export (example signature):

```ts
export type ConversationSummaryResult =
  | { ok: true; summary: string }
  | { ok: false; reason: 'insufficient_data' | 'missing_api_key' | 'request_failed' }

export async function getConversationSummary(conversationId: string, organizationId: string): Promise<ConversationSummaryResult> {
  // 1) Ensure OPENAI_API_KEY exists
  // 2) Fetch last 5 contact messages + last bot message scoped by org + conversation
  // 3) If insufficient, return ok:false with reason
  // 4) Build prompt with timestamps + order
  // 5) Call OpenAI gpt-4o-mini, temperature ~0.2-0.3
  // 6) Return summary or error
}
```

Implementation notes:
- Use `sender_type = 'contact'` for user messages and `sender_type = 'bot'` for bot.
- Order combined messages by `created_at` ascending before formatting.
- Truncate message content per message (e.g., 500-800 chars) to cap tokens.
- Format lines as: `1. [2026-02-04T12:34:56.000Z] User: ...`

**Step 3: Manual verification**
- With valid data, action returns `{ ok: true, summary }`.
- With fewer than 5 contact messages or no bot message, returns `{ ok: false, reason: 'insufficient_data' }`.

**Step 4: Commit**
```bash
git add src/lib/inbox/actions.ts
git commit -m "feat(phase-3.6): add inbox summary server action"
```

---

### Task 2: Add Inbox UI state, button, tooltip, and panel

**Files:**
- Modify: `src/components/inbox/InboxContainer.tsx`
- Modify: `messages/en.json`
- Modify: `messages/tr.json`

**Step 1: Add i18n keys (no test)**
Add keys under `inbox`:
- `summary.button`
- `summary.loading`
- `summary.error`
- `summary.tooltip.insufficient`

Example EN values:
```json
"summary": {
  "button": "Conversation Summary",
  "loading": "Preparing summary...",
  "error": "Summary unavailable. Try again.",
  "tooltip": {
    "insufficient": "Not enough messages for a summary"
  }
}
```
Example TR values:
```json
"summary": {
  "button": "Konusma Ozeti",
  "loading": "Ozet hazirlaniyor...",
  "error": "Ozet alinamadi. Tekrar deneyin.",
  "tooltip": {
    "insufficient": "Ozet icin yeterli mesaj yok"
  }
}
```
(Use proper Turkish diacritics in actual file.)

**Step 2: Add state + reset on conversation change**
In `InboxContainer`:
- State: `summaryStatus`, `summaryText`.
- Reset when `selectedId` changes.
- Compute `canSummarize` from `messages` (`contact` count >=5 and `bot` count >=1).

**Step 3: Add accordion header + tooltip**
Add an accordion header row above the input. Always visible, content-hug, and show tooltip (simple hover bubble with `group-hover`) when disabled. The refresh icon only appears after a summary finishes generating while the accordion is open.

**Step 4: Add panel**
When the accordion is open, render a card above the input with animated open/close (height/opacity). Show a blue gradient skeleton while loading and expand the panel width when the summary arrives:
- `loading`: show `t('summary.loading')` + spinner
- `success`: show `summaryText`
- `error`: show `t('summary.error')`

**Step 5: Wire handlers**
Open/close the accordion on header click. If opening and no summary exists, call `getConversationSummary(selectedId, organizationId)`. The refresh icon always re-runs the summary.

**Step 6: Manual verification**
- Button visible always.
- Disabled + tooltip when insufficient messages.
- Loading -> success/error states render panel.
- Switching conversations clears summary panel.

**Step 7: Commit**
```bash
git add src/components/inbox/InboxContainer.tsx messages/en.json messages/tr.json
git commit -m "feat(phase-3.6): add inbox summary button and panel"
```

---

### Task 3: Documentation + build verification

**Files:**
- Modify: `docs/ROADMAP.md` (mark summary item done, update date)
- Modify: `docs/PRD.md` (update Last Updated date)
- Modify: `docs/RELEASE.md` (add feature under Unreleased -> Added)

**Step 1: Update docs**
- ROADMAP: mark "On-demand conversation summary" as `[x]` and set Last Updated to `2026-02-04`.
- PRD: update Last Updated to `2026-02-04` (and ensure summary decision is reflected).
- RELEASE: add "Inbox conversation summary" to Unreleased -> Added.

**Step 2: Run build**
```bash
npm run build
```
Expected: success (existing Next.js warning about middleware/proxy is acceptable).

**Step 3: Commit**
```bash
git add docs/ROADMAP.md docs/PRD.md docs/RELEASE.md
git commit -m "docs(phase-3.6): record inbox summary"
```

---

Plan complete and saved to `docs/plans/2026-02-04-inbox-conversation-summary-implementation-plan.md`. Two execution options:

1. Subagent-Driven (this session) - I dispatch fresh subagent per task, review between tasks, fast iteration
2. Parallel Session (separate) - Open new session with executing-plans, batch execution with checkpoints

Which approach?
