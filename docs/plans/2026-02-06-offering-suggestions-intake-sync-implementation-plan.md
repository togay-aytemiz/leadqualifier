# Offering Suggestions Indicator & Intake Sync Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make Organization Settings clearly surface new offering suggestions (including deep-link auto-open from Knowledge), and auto-generate deduplicated Required Intake chips on Skill/KB updates.

**Architecture:** Keep UI behavior in settings components (query-driven accordion open + inline pending indicator). Keep dedupe/normalization logic in `offering-profile-utils` and reuse it in both UI/manual edits and server-side AI updates. Trigger required-intake AI generation from the same Skill/KB pipelines that already append offering suggestions.

**Tech Stack:** Next.js App Router, next-intl, Supabase server actions, OpenAI GPT-4o-mini, Vitest.

---

### Task 1: TDD for normalization and query intent helpers

**Files:**
- Modify: `src/lib/leads/offering-profile-utils.ts`
- Modify: `src/lib/leads/offering-profile-utils.test.ts`

1. Add failing tests for case-insensitive intake dedupe and “only missing fields” filtering.
2. Add failing tests for parsing AI payloads into required-field arrays.
3. Add helper implementation and re-run tests until green.

### Task 2: Generate required intake chips on Skill/KB updates

**Files:**
- Modify: `src/lib/leads/offering-profile.ts`
- Modify: `src/lib/skills/actions.ts`
- Modify: `src/lib/knowledge-base/actions.ts`

1. Add server-side function to propose required intake fields from new Skill/KB content.
2. Include existing required fields in prompt so LLM returns only missing candidates.
3. Normalize and dedupe against existing/manual fields before updating `offering_profiles`.
4. Wire function into Skill create/update and Knowledge processing flow.

### Task 3: UI indicator + KB deep-link auto-expand

**Files:**
- Modify: `src/components/settings/OfferingProfileSection.tsx`
- Modify: `src/app/[locale]/(dashboard)/settings/organization/OrganizationSettingsClient.tsx`
- Modify: `src/app/[locale]/(dashboard)/knowledge/components/KnowledgeContainer.tsx`

1. Add pending indicator inside the accordion content (not only header/sidebar).
2. Add query-driven auto-open behavior in Offering Profile suggestions accordion.
3. Update Knowledge banner review CTA link to include deep-link query param.

### Task 4: Verify and document

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

1. Run targeted tests and `npm run build`.
2. Update roadmap/PRD/release entries for this behavior.
3. Prepare commit message aligned with phase convention.
