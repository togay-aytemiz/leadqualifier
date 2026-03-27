# Inbox Manual Unread Toggle Design

## Context

Inbox currently auto-marks the previously opened conversation as read when the operator switches to another thread. That works for passive unread handling, but it breaks a Gmail-like reminder workflow where an operator intentionally marks the currently open conversation as unread for later follow-up.

## Options Considered

1. Client-only manual unread override

- Pros: smallest code change, no schema update
- Cons: breaks on refresh, tab sync, and realtime state reconciliation

2. Persisted `manual_unread` flag on conversations

- Pros: survives refreshes, keeps multi-surface behavior deterministic, integrates with existing unread counters
- Cons: requires one schema change and a small amount of inbox read-state logic

## Decision

Use a persisted `manual_unread` flag.

The header action toggles between `mark as unread` and `mark as read`. Marking unread sets `unread_count` to at least `1` and enables `manual_unread`. The existing auto-read-on-switch flow must skip conversations where `manual_unread` is true. When the operator later returns to that thread from a different conversation, the revisit itself counts as a fresh read and clears both `unread_count` and `manual_unread`.

## UI Contract

- Add one icon-only button in the selected-conversation header near the existing controls.
- Use envelope-style icons for the action state: unread action on read threads, read action on unread threads.
- Keep labels in tooltip and `aria-label` only to avoid crowding the header.

## Testing

- Unit-test the manual unread selection helpers.
- Unit-test server actions for read/unread updates.
- Verify with a production build.
