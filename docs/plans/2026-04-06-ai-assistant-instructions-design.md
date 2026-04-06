# AI Assistant Instructions Design

**Date:** 2026-04-06

## Summary

Replace the raw `AI Prompt` setting with a structured, operator-friendly configuration called `Yapay zeka asistan talimatları`.

This feature gives the workspace owner a clear way to brief the assistant "like a newly hired advisor" without forcing them to write a free-form system prompt.

## Product Decision

The new structure lives in `Settings > AI > Behavior & Logic` and directly replaces the current `AI Prompt` textarea.

The section contains four optional fields:

1. `Asistanın görevi`
2. `Eksik bilgi toplama kuralı`
3. `Asla yapma`
4. `Diğer talimatlar`

All four fields are optional. New workspaces should see locale-aware prefilled starter text. Existing workspaces with a custom legacy prompt should have that prompt carried into `Diğer talimatlar` instead of being heuristically split.

## Scope

These instructions affect customer-facing AI replies only.

They must guide:

- Knowledge Base / RAG replies
- Flexible fallback replies
- Other customer reply flows that depend on `organization_ai_settings.prompt`

They must not change:

- Lead extraction
- Lead scoring
- Router decisions
- Summary-generation prompts
- Existing escalation logic
- Existing intake/response guardrails

## Instruction Semantics

The new fields are not equal in strength.

- `Asla yapma` is a hard behavioral rule unless it conflicts with system-level guardrails.
- `Asistanın görevi`, `Eksik bilgi toplama kuralı`, and `Diğer talimatlar` are strong guidance, not absolute overrides.

System rules remain higher priority than workspace instructions. The assistant still cannot invent prices, policies, services, or guarantees, and it must continue honoring no-pressure / no-repeat intake guardrails.

## UX

The `Behavior & Logic` tab should show a section called `Yapay zeka asistan talimatları`.

That section should include:

- A short explanatory description in plain product language
- Four multi-line textareas for the instruction fields
- A low-emphasis, underlined `Nasıl çalışır?` action styled like the Plans page text actions

Clicking `Nasıl çalışır?` opens a mobile-friendly modal with compact icon rows and three sections:

1. `Ne işe yarar?`
2. `Örnek kullanım`
3. `Ne zaman uygulanmaz?`

The modal must clearly explain that these instructions do not replace Knowledge Base facts and do not override internal safety / guardrail logic.

## Data Model

Add four nullable columns to `organization_ai_settings`:

- `assistant_role`
- `assistant_intake_rule`
- `assistant_never_do`
- `assistant_other_instructions`

Keep the legacy `prompt` column for compatibility during the transition, but remove it from the operator UI.

## Resolution Rules

When reading AI settings:

- If the new columns contain any saved values, use them as the source of truth.
- If the new columns are empty and the stored `prompt` matches the existing default prompt family, resolve locale-aware starter values.
- If the new columns are empty and the stored `prompt` is a real custom legacy prompt, map that prompt into `assistant_other_instructions`.

When saving AI settings:

- Persist the four raw instruction fields
- Keep `prompt` as a compiled compatibility snapshot so customer-facing runtime code can continue reading `aiSettings.prompt`

## Runtime Compilation

Compile the saved instruction fields into one customer-facing base instruction string.

Recommended compilation order:

1. Existing base assistant rules
2. `Asla yapma`
3. `Asistanın görevi`
4. `Eksik bilgi toplama kuralı`
5. `Diğer talimatlar`

Only non-empty fields should be included in the compiled result.

## Rollout

No phased rollout or feature flag is required for this change. There are no active users, so the product can switch directly to the new UI and storage model in one release.

## Success Criteria

- Operators no longer see a raw `AI Prompt` field
- Operators can brief the assistant in plain language
- Existing custom prompts are preserved via `Diğer talimatlar`
- Customer-facing AI replies continue working without touching internal extraction/router logic
- TR/EN UI copy stays mirrored
