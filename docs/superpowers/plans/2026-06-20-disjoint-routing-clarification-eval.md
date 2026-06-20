# Disjoint Routing and Clarification Evaluation Implementation Plan

> Execute in the current clean checkout because this task is an evaluation-only change and the user explicitly authorized starting the production measurement. Do not modify production routing behavior during the experiment.

**Goal:** Add reproducible disjoint sampling and realistic two-turn clarification evaluation, run both against production, and manually assess every result.

**Architecture:** Extend the existing YİÜ evaluation CLI instead of creating a second HTTP/trace runtime. Keep selection and fixture validation as small pure modules with tests, then use the existing public-demo session and trace capture for live runs.

**Tech Stack:** TypeScript, Vitest, Next.js, Supabase trace data, public demo HTTP API.

---

### Task 1: Add disjoint routing selection

**Files:**
- Create: `scripts/knowledge/yiu-eval-selection.ts`
- Create: `scripts/knowledge/yiu-eval-selection.test.ts`
- Modify: `scripts/knowledge/qa-yiu-routing-and-followup-eval.ts`

1. Write failing tests for loading excluded `poolId` values and removing them from the candidate pool.
2. Implement the smallest pure selection helpers.
3. Add `--exclude-routing-artifact` to the existing CLI and include overlap metadata in output.
4. Run the focused test and a dry run proving 100 selected rows and zero overlap.

### Task 2: Add realistic clarification fixtures and validation

**Files:**
- Create: `scripts/knowledge/fixtures/yiu-prospective-student-clarification-cases.json`
- Create: `scripts/knowledge/yiu-clarification-cases.ts`
- Create: `scripts/knowledge/yiu-clarification-cases.test.ts`

1. Write failing validation tests for uniqueness, required fields, short replies, and rejection of generic acceptance replies.
2. Implement fixture parsing and validation.
3. Author 20 realistic prospective-student first messages with short slot-only replies.
4. Run focused tests.

### Task 3: Add two-turn live clarification mode

**Files:**
- Modify: `scripts/knowledge/qa-yiu-routing-and-followup-eval.ts`
- Modify: `scripts/knowledge/yiu-clarification-cases.ts`
- Modify: `scripts/knowledge/yiu-clarification-cases.test.ts`

1. Write failing pure tests for clarification-flow classification.
2. Add a `clarification` CLI mode that sends the first message and only sends the short reply when the first turn actually requests clarification.
3. Preserve the same session and capture both traces, routes, answers, evidence metadata, latency, and failure reasons.
4. Generate raw JSON and Markdown output.

### Task 4: Run the experiments against production

**Files:**
- Generate: `tmp/crawl-output/*`
- Generate: `docs/evaluations/*`

1. Run the disjoint 100 with a fixed new seed and the prior 100 artifact excluded.
2. Verify selected count and overlap before interpreting scores.
3. Run all 20 clarification conversations against the same production deployment.
4. Preserve errors/timeouts as observed results.

### Task 5: Codex manual review

**Files:**
- Create: `docs/evaluations/yiu-disjoint-100-and-clarification-codex-review-2026-06-20.md`

1. Review all 100 routing rows against question intent, returned answer, selected Skill/RAG behavior, citations, and diagnostics.
2. Review both turns of all 20 clarification conversations.
3. Record row-level verdicts and aggregate correctness, Skill match, correct non-match/no-info, clarification resolution, unsafe inference, error, timeout, and latency metrics.
4. Separate observed facts from Codex judgment and list concrete failure clusters without tuning the system.

### Task 6: Verify, document, commit, push, and confirm deployment state

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

1. Run focused evaluation-harness tests.
2. Run `npm run build`.
3. Update required project documents and dates.
4. Inspect the final diff and repository status.
5. Commit with a phase-referenced message, push, and verify the remote/deployment state so no local code, migration, or Edge Function drift remains.
