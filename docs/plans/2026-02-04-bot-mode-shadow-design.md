# Bot Mode (Active / Shadow / Off) — Design

Date: 2026-02-04

## Summary
Add an organization-level bot mode that controls whether the AI replies, runs in shadow (lead extraction only), or is fully off. The mode applies to all real channels (Telegram now, WhatsApp later) and explicitly excludes the Simulator. Provide a visible status indicator in the main sidebar with a link to AI Settings; the mode itself is configured in AI Settings.

## Goals
- Prevent accidental live replies while the system is still being validated.
- Allow real traffic collection for lead extraction without outbound responses.
- Make the current bot state visible but safe from accidental toggles.

## Non-goals
- Channel-specific bot modes.
- Simulator behavior changes.
- Lead extraction implementation itself (Phase 6 handles that).

## Decisions
- Store mode as `bot_mode` on `organization_ai_settings`.
- Values: `active`, `shadow`, `off`. Default: `active`.
- Simulator ignores `bot_mode` and always runs.
- Sidebar shows status + link; no inline toggle.

## Data Model
- `organization_ai_settings.bot_mode` (TEXT, NOT NULL, default `active`).
- TypeScript type: `OrganizationAiSettings.bot_mode` union.
- Normalization: invalid/null -> `active`.

## UI/UX
- AI Settings page: new “Bot Durumu” section above sensitivity/prompt.
  - Options: Aktif, Shadow (Sadece Lead Extraction), Kapalı.
  - Description clarifies Simulator is unaffected.
- Main Sidebar: small status row below logo, above “Workspace” eyebrow.
  - Example: `Bot: Aktif` / `Bot: Shadow` / `Bot: Kapalı`.
  - Click navigates to AI Settings.
  - Collapsed state shows an icon + colored dot with tooltip text.

## Runtime Behavior
- Webhooks (Telegram now, WhatsApp later):
  - Save message + update conversation as usual.
  - If `active_agent === 'operator'` or `assignee_id` present, skip AI as today.
  - Else read `bot_mode`:
    - `off`: return immediately (no LLM calls).
    - `shadow`: run lead extraction only (no outbound). Placeholder until Phase 6.
    - `active`: current skill → KB → fallback flow unchanged.
- Simulator: always uses current simulation logic regardless of `bot_mode`.

## Data Flow (Sidebar Status)
- `AiSettingsClient` saves `bot_mode` via `updateOrgAiSettings`.
- After save, dispatch `ai-settings-updated` event.
- `MainSidebar` listens for the event and refetches `organization_ai_settings.bot_mode`.
- If fetch fails, keep last known UI state and log quietly.

## i18n
Add EN/TR keys for:
- AI Settings: bot mode title + descriptions + option labels.
- Sidebar: bot status label + mode names + tooltip.

## Error Handling
- `getOrgAiSettings` applies defaults and normalizes `bot_mode` to `active`.
- Webhooks treat missing/invalid `bot_mode` as `active`.
- Sidebar fetch errors do not block navigation.

## Testing
- Unit: `getOrgAiSettings` normalization for invalid `bot_mode`.
- Integration: webhook path with `bot_mode=off` does not call outbound APIs.
- UI: AI Settings saves `bot_mode` and updates sidebar indicator.

## Rollout Notes
- Safe by default (`active`) for existing orgs.
- No simulator impact, so teams can iterate while live channels are muted.
