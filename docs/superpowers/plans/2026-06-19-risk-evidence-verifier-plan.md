# Risk Evidence Verifier Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the simplified Skill-first File Search design, while blocking high-risk positive RAG claims unless selected chunks directly support the requested subject and facet.

**Architecture:** The rewriter remains responsible for one standalone search query, and the answer generator remains responsible for one grounded draft. A new small risk evidence verifier runs only after positive answers for high-risk questions such as hospital, accreditation, program existence, facility/resource, clinical practice, fees, quotas, ranking, payment, credential, housing, transport, or campus-life claims. Verifier failure returns a normal no-info/clarification instead of a positive unsupported answer.

**Tech Stack:** Next.js, TypeScript, OpenAI Chat Completions, OpenAI Vector Stores File Search, Vitest.

---

### Task 1: Prove the unsupported high-risk positive claim

**Files:**
- Modify: `src/lib/knowledge-base/simple-rag/pipeline.test.ts`

- [x] **Step 1: Add a failing regression**

Add a test where the answer generator claims an affiliated hospital is private from a selected chunk that only mentions the founding hospital foundation.

- [x] **Step 2: Run the targeted test**

Run:

```bash
npm test -- --run src/lib/knowledge-base/simple-rag/pipeline.test.ts -t "blocks high-risk positive RAG claims"
```

Expected before implementation: FAIL because the verifier is not called and the positive answer is returned.

### Task 2: Add the focused verifier

**Files:**
- Create: `src/lib/knowledge-base/simple-rag/evidence-verifier.ts`
- Modify: `src/lib/knowledge-base/simple-rag/pipeline.ts`
- Modify: `src/lib/knowledge-base/simple-rag/pipeline.test.ts`

- [x] **Step 1: Implement risk detection**

Create a narrow detector that skips obvious no-info answers and only triggers on positive answers involving high-risk factual domains.

- [x] **Step 2: Implement LLM verifier**

Ask the verifier to return JSON with `pass`, `no_info`, or `clarify`, requiring direct evidence for the user’s exact subject and requested facet.

- [x] **Step 3: Wire verifier after answer generation**

When verifier returns `no_info`, return the standard no-info answer with diagnostics `strictVerdict: "risk_evidence_no_info"`. When it returns `clarify`, return the verifier’s clarification with pending clarification diagnostics. When skipped or passed, keep the generated answer.

- [x] **Step 4: Update existing risk-positive tests**

For existing pipeline tests that intentionally return valid fee/quota/location/program answers, provide a mock verifier pass so tests remain offline and deterministic.

### Task 3: Verify and document

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

- [x] **Step 1: Run focused simple RAG tests**

```bash
npm test -- --run src/lib/knowledge-base/simple-rag/pipeline.test.ts src/lib/knowledge-base/simple-rag/answer-generator.test.ts src/lib/knowledge-base/simple-rag/query-rewriter.test.ts
```

- [x] **Step 2: Run mandatory AI guard regressions**

```bash
npm test -- --run src/lib/ai/followup.test.ts
npm test -- --run src/lib/ai/response-guards.test.ts
```

- [x] **Step 3: Run build**

```bash
npm run build
```

- [x] **Step 4: Update roadmap, PRD, and release notes**

Record the risk-gated verifier behavior, the simplified router/rewriter boundary, and the YİÜ evidence issue under the 2026-06-19 updates.
