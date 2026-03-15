# Operator Workflow Details Panel Design

Date: 2026-03-15

## Goal

Close the highest-priority operator workflow gaps for pilot GTM without expanding the Inbox into a full CRM.

This design covers:

1. Manual overwrite for Inbox `Important info`
2. Editable conversation tags
3. Shared private notes

It intentionally keeps all of these actions inside the Inbox `Details` surface so the main chat area remains focused on messaging.

## Product Decisions

Validated decisions from brainstorming:

- Interaction model: `Details-first`
- Important info overwrite policy: `manual lock`
- Tags model: `freeform tags`
- Private notes visibility: `shared team note`

## Why This Shape

Qualy's pilot value is not "all-in-one CRM breadth". It is fast WhatsApp handling plus trustworthy AI qualification. That means the operator must be able to:

- correct AI-extracted data safely
- add lightweight context for teammates
- do this without cluttering the conversation timeline

Putting editing inside the `Details` panel gives a predictable home for all non-message actions and aligns with the current Inbox layout.

## UX Scope

The `Details` panel should gain three editable sections:

### 1. Important info

Render each required intake field as a row with:

- field label
- current value
- source chip: `AI` or `Manual`
- row action: `Edit`

Editing behavior:

- Clicking `Edit` opens inline edit mode for that single row
- `Save` writes the value as a manual override
- `Cancel` closes edit mode without persisting
- Once saved, the row source becomes `Manual`
- Manual values are locked against future AI extraction overwrites
- Optional secondary action: `Return to AI`

`Return to AI` removes the manual override for that field and falls back to the latest AI-collected value if present.

### 2. Tags

Conversation tags remain lightweight and operational:

- existing tags render as chips
- operator can add a new freeform tag from an input
- operator can remove existing chips

Behavior rules:

- duplicate-safe
- trimmed before save
- length-limited
- count-limited

No admin tag catalog is required in the first version.

### 3. Private notes

Private notes are shared across the organization, not author-only.

The section should show:

- a textarea
- `Save` action
- last updated timestamp
- last updated by user name when available

This is a single shared conversation note, not a threaded note feed.

## Data Model

### Important info

Current direction already exists in the product:

- AI values: `leads.extracted_fields.required_intake_collected`
- manual precedence support: `leads.extracted_fields.required_intake_overrides`

This design extends that with lightweight metadata:

- `required_intake_override_meta`
  - field key
  - `updated_by`
  - `updated_at`
  - `source = manual`

Read precedence:

1. `required_intake_overrides`
2. `required_intake_collected`
3. empty

### Tags

Use the existing `conversations.tags` field and make it editable.

Normalization:

- trim whitespace
- compare tags case-insensitively for duplicates
- preserve display text in a simple normalized format

### Private notes

Add conversation-level fields:

- `private_note`
- `private_note_updated_at`
- `private_note_updated_by`

No note history in v1.

## Save Rules

### Important info save

- saves one field at a time
- updates `required_intake_overrides`
- never allows AI reruns to replace a manual value

### Return to AI

- removes the override for that field only
- preserves all other manual overrides

### Extraction reruns

- AI may continue updating `required_intake_collected`
- AI must never overwrite fields that exist in `required_intake_overrides`

## Concurrency and Safety

For `Important info` and `Private notes`, use lightweight stale-write protection:

- the client sends the current known `updated_at`
- if the server sees a newer version, save is rejected with a refresh message

For tags, last-write-wins is acceptable for v1.

System-admin read-only impersonation mode must disable all editing actions.

## Components

Expected UI/component additions:

- `ImportantInfoEditor` inside Inbox details
- inline `ImportantInfoRowEditor`
- `ConversationTagsEditor`
- `ConversationPrivateNoteEditor`

These should be reused in desktop details and mobile details sheet, with behavior kept identical.

## Error Handling

- save error: inline section-level error, keep local input intact
- stale conflict: show short refresh-required warning
- invalid tag: reject client-side before request
- empty private note save: allow empty string only when user is intentionally clearing the note

## Testing

### Unit

- required-info precedence prefers manual over AI
- extraction rerun does not replace manual override
- tag normalization removes duplicates
- `Return to AI` removes only the targeted override

### Component

- row edit -> save -> source chip becomes `Manual`
- cancel restores previous value
- tag add/remove interactions
- private note save and empty-clear flow

### Integration

- inbox details action persists override payload correctly
- mobile details sheet matches desktop behavior
- read-only admin impersonation blocks mutation actions

## Delivery Order

1. Manual overwrite for `Important info`
2. Editable tags
3. Shared private note
4. Mobile parity pass
5. Regression coverage

## Non-Goals

This design does not include:

- full CRM pipeline stages
- threaded internal comments
- mentions
- admin tag presets
- note history
- automation based on tags or notes

## Success Criteria

The feature is successful when an operator can:

- correct a wrong AI field in under 10 seconds
- trust that AI will not overwrite the correction later
- add simple team context without leaving Inbox
- hand off a conversation without losing local knowledge
