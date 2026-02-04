# Inbox Conversation Summary -- Design

## Overview
Add an on-demand conversation summary in the Inbox composer area. The summary is produced only when the user clicks a button, and it is derived strictly from the last five user messages plus the last bot message (with timestamps and order preserved). The UI shows a single short paragraph summary (no raw messages in the panel).

## Goals
- Provide a quick, human-readable recap for operators.
- Keep token usage fully user-controlled (no background refresh).
- Preserve "no hallucination" behavior by grounding on message history only.

## Non-Goals
- No automatic refresh or scheduled summaries.
- No caching or persistent storage of summary output.
- No full transcript rendering in the panel.

## UX & Behavior
- A "Conversation Summary" button appears above the input field.
- The button is always visible.
- It is disabled when there are fewer than 5 user messages or no bot message; hover shows tooltip: "Not enough messages for a summary."
- On click, the inline panel opens above the input and shows a loading state.
- Success shows a single-paragraph summary. A second click re-runs the summary.
- Switching conversations clears summary state and closes the panel.

## Architecture & Data Flow
- UI state in `InboxContainer`: `summaryStatus` (idle/loading/success/error) + `summaryText`.
- New server action in `src/lib/inbox/actions.ts`: `getConversationSummary(conversationId)`.
- Server action queries last 5 user messages + last bot message ordered by timestamp.
- The prompt includes `[#order] <timestamp> <role>: <text>` lines to preserve sequence.
- No background job or cache; each click triggers a fresh model call.

## Prompt & Safety
- System: "Summarize only from the provided messages. Do not add facts."
- User: "Summarize in Turkish, 2-3 sentences, single paragraph."
- If insufficient data, return a "not enough data" error without calling the model.
- Truncate long messages server-side (per-message max length) to protect token limits.

## Error Handling
- Data missing -> disabled button + tooltip (client), and server returns a safe error if called.
- Model/API failure -> inline error text and allow retry.
- Unexpected response -> fallback error message.

## i18n
- All UI text uses `messages/en.json` and `messages/tr.json` with mirrored keys.
- Keys: `inbox.summary.button`, `inbox.summary.loading`, `inbox.summary.error`, `inbox.summary.tooltip.insufficient`.

## Testing
- Manual: enabled/disabled states, tooltip text, loading, error, success, and conversation switching.
- Verify summary is not generated without user click.

## Decisions
- On-demand only (no background refresh or cache).
- Summary-only display (no raw message list).
- Button always visible; disabled + tooltip when insufficient messages.
