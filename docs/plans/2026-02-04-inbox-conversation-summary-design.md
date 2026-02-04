# Inbox Conversation Summary -- Design

## Overview
Add an on-demand conversation summary in the Inbox composer area. The summary is produced only when the user opens the accordion or hits refresh, and it is derived strictly from the last five user messages plus the last bot message (with timestamps and order preserved). The UI shows a single short paragraph summary (no raw messages in the panel).

## Goals
- Provide a quick, human-readable recap for operators.
- Keep token usage fully user-controlled (no background refresh).
- Preserve "no hallucination" behavior by grounding on message history only.

## Non-Goals
- No automatic refresh or scheduled summaries.
- No caching or persistent storage of summary output.
- No full transcript rendering in the panel.

## UX & Behavior
- The summary area is an accordion placed above the AI banner and above the input field.
- The header row is content-hug (not full width).
- The refresh icon is only visible after a summary finishes generating (success or error) while the accordion is open.
- The header and refresh are disabled when there are fewer than 5 user messages or no bot message; hover shows tooltip: "Not enough messages for a summary."
- Opening the accordion triggers a summary only when there is no existing summary yet.
- The refresh icon always re-generates the summary without requiring a close/open cycle.
- While loading, show an animated blue-gradient skeleton; the panel expands to full width once the summary arrives.
- The panel animates open/close (height + opacity).
- Switching conversations clears summary state and collapses the accordion.

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
- Keys: `inbox.summary.button`, `inbox.summary.loading`, `inbox.summary.error`, `inbox.summary.refresh`, `inbox.summary.tooltip.insufficient`.

## Testing
- Manual: enabled/disabled states, tooltip text, loading, error, success, and conversation switching.
- Verify summary is not generated without user click.

## Decisions
- On-demand only (no background refresh or cache).
- Summary-only display (no raw message list).
- Accordion header always visible; disabled + tooltip when insufficient messages.
- Refresh control lives in the header and re-generates the summary on demand.
