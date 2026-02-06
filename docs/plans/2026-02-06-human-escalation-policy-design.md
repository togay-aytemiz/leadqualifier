# Human Escalation Policy — Design

Date: 2026-02-06

## Summary
Introduce a centralized escalation policy that can hand conversations from AI to a human operator in two ways:
- Skill-triggered escalation (`Requires Human Handover` on a skill).
- Lead-score-triggered escalation (hot lead threshold in AI Settings).

The policy must support two action modes (`notify_only`, `switch_to_operator`) and two customer notice modes (`assistant_promise`, `silent`). Skill-triggered escalation is a strict override and always uses `switch_to_operator` + `assistant_promise`.

## Goals
- Provide one consistent escalation decision engine for all live channels.
- Allow business owners to configure hot lead escalation behavior in AI Settings.
- Allow skill-specific mandatory handover.
- Keep customer-facing handover message centralized and editable from one place.

## Non-goals
- Channel-specific escalation rules in MVP.
- Separate promise text per skill in MVP.
- Full notification provider implementation details (email/SMS/push) in this phase.

## Product Decisions (Validated)
- Precedence: `skill override > hot lead score rule > no escalation`.
- If `skill.requires_human_handover = true`:
  - Action is always `switch_to_operator`.
  - Customer notice is always `assistant_promise`.
  - Promise text uses the org-level handover message from AI Settings.
- Skill form shows the promise text as read-only and deep-links to AI Settings for editing.
- Deep link behavior: navigate to AI Settings, scroll to Human Escalation section, and focus `handover_message`.

## Data Model

### `organization_ai_settings` (new fields)
- `hot_lead_score_threshold` INT NOT NULL DEFAULT `7` CHECK (`0 <= value <= 10`)
- `hot_lead_action` TEXT NOT NULL DEFAULT `notify_only` CHECK (`notify_only`, `switch_to_operator`)
- `hot_lead_notice_mode` TEXT NOT NULL DEFAULT `assistant_promise` CHECK (`assistant_promise`, `silent`)
- `hot_lead_handover_message` TEXT NOT NULL DEFAULT:
  - EN: `I've notified the team. Since they might be with a client, they'll get back to you as soon as possible.`
  - TR: `Ekibi bilgilendirdim. Şu anda bir müşteriyle ilgileniyor olabilirler, size en kısa sürede dönüş yapacaklar.`

### `skills` (new field)
- `requires_human_handover` BOOLEAN NOT NULL DEFAULT `false`

## AI Settings UX
Add a new section: **Human Escalation**
- **Hot Lead Score**: numeric input (`>= N` behavior, 0-10).
- **Action**: `Notify Only` or `Switch to Operator`.
- **Customer Notice**: `The Assistant’s Promise (Recommended)` or `Silent Notify`.
- **Handover Message**: editable textarea (active when notice mode is promise).

## Skills UX
In skill create/edit:
- Toggle: **Requires Human Handover**.
- Read-only preview: customer promise message (same source as AI Settings).
- CTA link: **Edit in AI Settings**.
- Link target includes section anchor + autofocus intent for `handover_message`.

## Runtime Decision Flow
Create centralized policy helper (e.g. `src/lib/ai/escalation.ts`):
- Input:
  - `skillMatched` / `matchedSkill.requires_human_handover`
  - `leadScore`
  - `organization_ai_settings` escalation fields
  - `conversation` state (`active_agent`, `assignee_id`)
- Output:
  - `shouldEscalate`
  - `action` (`notify_only` | `switch_to_operator`)
  - `noticeMode` (`assistant_promise` | `silent`)
  - `noticeMessage`
  - `reason` (`skill_handover` | `hot_lead`)

Execution order for live channels:
1. Send normal AI response (skill/KB/fallback) when allowed.
2. Evaluate escalation policy.
3. If notice mode is promise and conversation is not already operator-locked, send promise message.
4. If action is switch, atomically set `active_agent='operator'` (and assign when possible).
5. Emit owner notification event (for both notify-only and switch).

## Safety / Idempotency
- If conversation is already operator-locked, do not re-send promise message.
- Avoid repeated escalation side effects for back-to-back hot messages in the same lock window.
- Preserve existing “AI silence when operator active” behavior.

## Testing Plan
- Unit tests:
  - Policy precedence and normalization.
  - Skill override forcing switch + promise.
  - Hot lead threshold boundary behavior.
- Integration tests:
  - Webhook flow sends normal reply then promise then switch.
  - Notify-only flow does not switch agent.
  - Existing operator lock suppresses duplicate promise.
- UI tests:
  - AI Settings section rendering and field validation.
  - Skill read-only preview + deep-link scroll/focus behavior.
- i18n checks:
  - EN/TR parity for all new keys.

## Rollout Notes
- Default behavior is safe (`notify_only`, threshold `7`, promise enabled).
- Existing orgs get backfilled defaults via migration.
- Centralized policy is channel-agnostic and reusable for future WhatsApp webhook.
