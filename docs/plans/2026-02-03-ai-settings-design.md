# AI Settings (Strict/Flexible) — Design

## Overview
We need org-level AI configuration that keeps responses safe while improving engagement. The system should handle small-talk via core skills, answer from Skills/KB when possible, and provide a safe fallback when nothing matches. Flexible mode is always on (no mode selection); the single prompt field is used as the base prompt for LLM fallback responses.

## Architecture
Add a new table `organization_ai_settings` keyed by `organization_id`. It stores: `mode` (fixed to flexible), `match_threshold`, and `prompt`. RLS allows org members to read and org admins to update. A trigger inserts defaults for new organizations, and a migration backfills existing orgs.

Runtime flow:
1. Small-talk is handled by core skills (preloaded, editable).
2. Skill matching uses `match_threshold`.
3. KB retrieval uses `match_threshold` (with a lower fallback threshold if empty).
4. If no match, LLM generates 1–2 sentences, using only Skill/KB titles as topics, then asks one clarifying question.

The prompt is stored in DB and appended to all fallback LLM calls.

## Components
- **DB:** `organization_ai_settings` table, trigger, RLS.
- **Server actions:** `getOrgAiSettings`, `updateOrgAiSettings`, and `buildFallbackResponse` (shared by simulator + webhooks).
- **UI:** New Settings → AI page with a fixed-mode notice, single sensitivity slider, and a single prompt field.

## Data Flow
User → Skill match → KB match → Fallback. Fallback pulls topic titles from enabled skills + ready knowledge documents, de-duplicates, and uses them in the LLM fallback prompt. Settings are fetched per org and cached per request; simulator defaults slider to org `match_threshold`.

## Error Handling
If OpenAI is unavailable, Flexible fallback degrades to the Strict response. If settings cannot load, defaults are used. Invalid updates are clamped (thresholds 0–1).

## Testing
- Unit tests for settings normalization and `{topics}` replacement.
- Manual checks in simulator:
  - “GKN nedir?” should route to KB or show topic suggestions.
  - “Merhaba, nasılsın?” should hit core skill.
  - Strict fallback should respect custom text.
