# RAG Demo Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Yüksek İhtisas public demo safer to hand back to the customer by preventing usage-led reply loss, checking the public demo surface, and producing evidence/debug reports for the final RAG challenge.

**Architecture:** Keep the runtime answer path small and fail-soft: usage/audit write failures must not block an already grounded RAG reply. Readiness evidence stays in scripts/reports so production behavior is not made customer-specific.

**Tech Stack:** Next.js 16 App Router, Supabase, OpenAI Chat Completions, Vitest, TypeScript scripts, public demo API.

---

### Task 1: Fail-Soft AI Usage Recording

**Files:**
- Modify: `src/lib/channels/inbound-ai-pipeline.ts`
- Test: `src/lib/channels/inbound-ai-pipeline.test.ts`

- [ ] Add a failing test where RAG generates a valid answer, `recordAiUsage` rejects with `Failed to record AI usage`, and the pipeline still sends/persists the answer.
- [ ] Run the targeted test and confirm it fails because the current pipeline returns before sending the RAG reply.
- [ ] Add a small helper in `inbound-ai-pipeline.ts` that catches usage recording errors for post-completion usage writes and logs them without throwing.
- [ ] Replace the RAG completion usage write with that helper.
- [ ] Run the targeted test and the inbound pipeline regression subset.

### Task 2: Public Demo Canary

**Files:**
- Create or modify: `scripts/knowledge/qa-public-demo-canary.mjs`

- [ ] Implement a canary runner that opens the configured public demo slug/API, sends 10-12 critical questions, polls until replies are ready, and verifies required answer terms plus source-link formatting.
- [ ] Run it against `https://app.askqualy.com/demo/yiu-qualy-ai-demo` or the matching local/public endpoint available in env.
- [ ] Save a timestamped markdown report under `tmp/crawl-output/`.

### Task 3: Retrieval Debug Evidence

**Files:**
- Modify or promote: `tmp/live-yiu-challenge-pipeline-qa.ts` or a tracked `scripts/knowledge/*` runner
- Modify: `src/lib/knowledge-base/actions.ts` only if a minimal debug hook is needed

- [ ] Add per-question debug output that records the winning source title/url, whether answer repair changed the response, and available token usage.
- [ ] Keep debug output report-only; do not add customer-specific runtime behavior.
- [ ] Run the 33-question challenge and save a report.

### Task 4: Corpus Health Report

**Files:**
- Create: `scripts/knowledge/report-yiu-corpus-health.mjs`

- [ ] Query YİÜ Knowledge Base documents/chunks for missing source URLs, oversized chunks, empty/low-content chunks, duplicate titles/source URLs, document type drift, and stale-looking campus/contact evidence.
- [ ] Write JSON and markdown reports under `tmp/crawl-output/`.

### Task 5: Final 50-60 Question Challenge Pack

**Files:**
- Modify: existing live QA runner or create `scripts/knowledge/qa-live-yiu-demo-final-pack.ts`

- [ ] Expand the challenge from 33 to 50-60 questions with paraphrases, typo-heavy variants, follow-up/source-link questions, and negative/no-answer controls.
- [ ] Run with default `gpt-4o-mini`.
- [ ] Report pass/fail, token usage, and any manual review flags.

### Task 6: Docs and Verification

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

- [ ] Update docs with the readiness outcomes and model/default decision.
- [ ] Run RAG/inbound targeted tests.
- [ ] Run `npm run build`.
- [ ] Summarize remaining risks before asking the customer to test again.
