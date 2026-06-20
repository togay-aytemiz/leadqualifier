# Unique Skill Candidate Retrieval and Selector Model A/B Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make semantic retrieval return top-X unique Skills, freeze the resulting selector inputs, and compare selector models on identical payloads before any production model change.

**Architecture:** Rank embedding rows inside Postgres, retain the best row per Skill, and apply the result limit only after that grouping. A focused evaluation harness captures deterministic selector payloads from the fixed RPC, then uses the OpenAI Responses API with one strict schema to benchmark three model/reasoning configurations.

**Tech Stack:** PostgreSQL/pgvector, Supabase RPC and CLI, TypeScript, Vitest, OpenAI Node SDK Responses API.

---

### Task 1: Top-X unique Skill retrieval

**Files:**
- Create: `supabase/migrations/<generated>_match_skills_unique_candidates.sql`
- Create: `supabase/migrations/<generated>_match_skills_unique_candidates.test.ts`

- [ ] **Step 1: Generate the migration scaffold with the installed Supabase CLI**

Run:

```bash
npx supabase migration new match_skills_unique_candidates
```

Expected: one empty timestamped SQL migration is created under `supabase/migrations`.

- [ ] **Step 2: Write the failing migration contract test**

The test must read the generated SQL and assert that it contains a per-Skill rank such as:

```sql
ROW_NUMBER() OVER (
  PARTITION BY s.id
  ORDER BY se.embedding <=> query_embedding
)
```

It must also assert that `embedding_rank = 1` is filtered before `LIMIT match_count`.

- [ ] **Step 3: Run the migration test and verify RED**

Run:

```bash
npm test -- --run supabase/migrations/<generated>_match_skills_unique_candidates.test.ts
```

Expected: FAIL because the generated migration does not yet group embedding rows by Skill.

- [ ] **Step 4: Implement the minimal SQL change**

Replace `public.match_skills` with a stable SQL function that computes similarity once, ranks rows per `s.id`, keeps `embedding_rank = 1`, orders by similarity descending, and applies `LIMIT match_count` last. Preserve the existing return columns and organization/enabled/threshold filters.

- [ ] **Step 5: Run the migration test and migration-version guard**

Run:

```bash
npm test -- --run supabase/migrations/<generated>_match_skills_unique_candidates.test.ts src/lib/supabase/migration-version-uniqueness.test.ts
```

Expected: PASS.

- [ ] **Step 6: Push and verify the linked migration**

Discover flags with `npx supabase db push --help`, push the linked migration with the existing workspace credentials, then call the RPC for the focused queries and assert `candidate_count === unique_skill_id_count`.

### Task 2: Frozen selector payloads

**Files:**
- Create: `scripts/knowledge/yiu-skill-selector-model-ab.ts`
- Create: `scripts/knowledge/yiu-skill-selector-model-ab.test.ts`
- Create: `scripts/knowledge/fixtures/yiu-skill-selector-focused-cases.json`
- Create: `docs/evaluations/yiu-skill-selector-frozen-payloads-2026-06-20.json`

- [ ] **Step 1: Write failing payload tests**

Cover these contracts:

```ts
expect(buildFrozenCase(input).candidates.map(candidate => candidate.skill_id))
  .toEqual([...new Set(input.candidates.map(candidate => candidate.skill_id))])
expect(() => buildFrozenCase(duplicateCandidates)).toThrow(/duplicate skill/i)
expect(() => buildFrozenCase(missingPositiveControl)).toThrow(/expected skill/i)
```

Also assert the focused fixture has ten cases, eight `expectedSkillId: null` cases, and the exact Anestezi/Ebelik positive ids.

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
npm test -- --run scripts/knowledge/yiu-skill-selector-model-ab.test.ts
```

Expected: FAIL because the harness functions do not exist.

- [ ] **Step 3: Implement capture mode**

Add a `--capture` mode that safely loads the existing environment, resolves the YİÜ demo organization, embeds each frozen standalone query with `text-embedding-3-small`, calls `match_skills` with threshold `0.35` and count `20`, rejects duplicate ids, and writes the normalized selector inputs and full ordered candidates to the dated JSON artifact.

- [ ] **Step 4: Run tests and capture payloads**

Run the unit test again, then:

```bash
npx tsx scripts/knowledge/yiu-skill-selector-model-ab.ts --capture
```

Expected: PASS, then a ten-case artifact where every candidate list contains unique Skill ids and both positive controls contain their expected Skill.

### Task 3: Controlled selector A/B

**Files:**
- Modify: `scripts/knowledge/yiu-skill-selector-model-ab.ts`
- Modify: `scripts/knowledge/yiu-skill-selector-model-ab.test.ts`
- Create: `docs/evaluations/yiu-skill-selector-model-ab-<timestamp>.json`
- Create: `docs/evaluations/yiu-skill-selector-model-ab-<timestamp>.md`

- [ ] **Step 1: Write failing request/score tests**

Assert that every configuration receives byte-identical instruction and user payloads, uses the same strict JSON schema, and differs only by model/reasoning. Add a scoring case where one false Skill makes the precision gate fail even if total accuracy is otherwise high.

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
npm test -- --run scripts/knowledge/yiu-skill-selector-model-ab.test.ts
```

Expected: FAIL on missing request builder/scoring behavior.

- [ ] **Step 3: Implement A/B mode**

Read only the frozen artifact, call `client.responses.create` with Structured Outputs for `gpt-4.1-mini`, `gpt-5.5`/`none`, and `gpt-5.5`/`low`, repeat each case three times, and record selection, coverage, confidence, reason, latency, and token usage.

- [ ] **Step 4: Run tests and the live A/B**

Run:

```bash
npm test -- --run scripts/knowledge/yiu-skill-selector-model-ab.test.ts
npx tsx scripts/knowledge/yiu-skill-selector-model-ab.ts --run --repeats 3
```

Expected: unit tests pass and JSON/Markdown result artifacts are written.

### Task 4: Production decision and full verification

**Files:**
- Modify only if a challenger passes: `src/lib/demo-chat/skill-candidate-verifier.ts`
- Modify only if a challenger passes: `src/lib/demo-chat/skill-candidate-verifier.test.ts`
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

- [ ] **Step 1: Apply the measured decision**

If a challenger passes every repeated precision/recall gate, add a failing production-model regression test, verify RED, then make the smallest model/API configuration change and verify GREEN. If no challenger passes, keep production unchanged and document the rejection.

- [ ] **Step 2: Run focused routing and mandatory guard tests**

Run:

```bash
npm test -- --run src/lib/skills/actions.test.ts src/lib/demo-chat/skill-candidate-verifier.test.ts 'src/app/api/demo/[slug]/chat/route.test.ts'
npm test -- --run src/lib/ai/followup.test.ts
npm test -- --run src/lib/ai/response-guards.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run the production build**

Run:

```bash
npm run build
```

Expected: Next.js production build succeeds with no type errors.

- [ ] **Step 4: Update required project documents**

Record the unique-Skill retrieval contract, frozen-payload A/B metrics, production model decision, and 2026-06-20 last-updated date in `ROADMAP.md`, `PRD.md`, and `RELEASE.md`.

## Self-Review

- Spec coverage: retrieval grouping, frozen inputs, three model configurations, repeated scoring, precision-first gate, production decision, and required verification each map to an explicit task.
- Placeholder scan: `<generated>` and `<timestamp>` denote CLI/runtime-generated filenames required by the commands; there are no deferred implementation decisions.
- Type consistency: all tasks use the existing `SkillMatch` field names (`skill_id`, `title`, `response_text`, `routing_description`, `coverage_facets`, `trigger_text`, `similarity`) and `expectedSkillId` for labels.
