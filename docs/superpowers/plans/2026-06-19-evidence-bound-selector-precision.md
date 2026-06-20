# Evidence-Bound Selector Precision Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reject adjacent Skill and risky RAG answers unless the existing verifier returns direct subject/facet coverage backed by an exact approved-response or selected-chunk quote.

**Architecture:** Extend the two existing verifier contracts rather than adding orchestration. Both validators fail closed when structured coverage or evidence is missing, while preserving the current one-rewrite, one-search, one-answer flow.

**Tech Stack:** TypeScript, Next.js App Router, OpenAI chat completions, Vitest.

---

### Task 1: Bind Skill selection to approved response evidence

**Files:**
- Modify: `src/lib/demo-chat/skill-candidate-verifier.test.ts`
- Modify: `src/lib/demo-chat/skill-candidate-verifier.ts`
- Modify: `src/lib/demo-chat/skill-routing-diagnostics.test.ts`
- Modify: `src/lib/demo-chat/skill-routing-diagnostics.ts`

- [x] **Step 1: Write failing tests for subject mismatch, facet mismatch, and missing/invalid answer quotes**

Use structured verifier payloads such as:

```ts
{
  skill_id: 'skill-program-rank',
  coverage: 'direct',
  subject_coverage: 'mismatch',
  facet_coverage: 'direct',
  answer_quote: 'Bilgisayar Programcılığı başarı sırası 416.098.',
  confidence: 0.99,
  reason: 'The Skill is only one program.'
}
```

Assert `decision: 'no_skill'`. Keep a positive exact program/facet case with a quote copied from `response_text`.

- [x] **Step 2: Run the Skill verifier tests and verify RED**

Run: `npm test -- --run src/lib/demo-chat/skill-candidate-verifier.test.ts src/lib/demo-chat/skill-routing-diagnostics.test.ts`

Expected: mismatch/quote tests fail because the current parser accepts any supplied candidate with `coverage: direct`.

- [x] **Step 3: Implement the strict structured contract**

Add normalized enums and a quote-containment helper. Accept a Skill only when:

```ts
coverage === 'direct'
  && subjectCoverage === 'direct'
  && facetCoverage === 'direct'
  && quoteIsContained(match.response_text, answerQuote)
```

Return a safe `no_skill` result for any failed check, preserving coverage fields and reason for diagnostics. Update the prompt JSON schema and generic direct-coverage instructions.

- [x] **Step 4: Expose compact coverage fields in diagnostics**

Add `subjectCoverage`, `facetCoverage`, and a normalized/truncated `answerQuote` to `summarizeSkillVerification()` and its tests.

- [x] **Step 5: Run the Skill verifier tests and verify GREEN**

Run: `npm test -- --run src/lib/demo-chat/skill-candidate-verifier.test.ts src/lib/demo-chat/skill-routing-diagnostics.test.ts`

Expected: all tests pass.

### Task 2: Bind risky RAG pass verdicts to selected chunk evidence

**Files:**
- Modify: `src/lib/knowledge-base/simple-rag/evidence-verifier.test.ts`
- Modify: `src/lib/knowledge-base/simple-rag/evidence-verifier.ts`
- Modify: `src/lib/knowledge-base/simple-rag/pipeline.test.ts`

- [x] **Step 1: Write failing verifier tests for absent evidence quotes**

Return `verdict: 'pass'` with an `evidence_quote` not present in any selected chunk and assert `status: 'no_info'`. Add a positive case with `subject_coverage: 'direct'`, `facet_coverage: 'direct'`, and an exact selected-chunk quote.

- [x] **Step 2: Run evidence tests and verify RED**

Run: `npm test -- --run src/lib/knowledge-base/simple-rag/evidence-verifier.test.ts src/lib/knowledge-base/simple-rag/pipeline.test.ts`

Expected: invented-quote pass is incorrectly accepted by the current verifier.

- [x] **Step 3: Implement direct quote and coverage validation**

Require `subject_coverage` and `facet_coverage` to equal `direct`, and require a normalized non-trivial quote to occur in at least one selected chunk. Otherwise return no-info with a diagnostic reason. Add the four general adjacent-evidence counterexamples to the verifier prompt.

- [x] **Step 4: Add verifier regressions and a focused live probe for adjacent hospital and procurement evidence**

Assert hospital-foundation evidence and procurement/tender policy cannot support hospital status or tuition-registration policy answers, while directly quoted policy evidence still passes.

- [x] **Step 5: Run evidence and pipeline tests and verify GREEN**

Run: `npm test -- --run src/lib/knowledge-base/simple-rag/evidence-verifier.test.ts src/lib/knowledge-base/simple-rag/pipeline.test.ts`

Expected: all tests pass.

### Task 3: Verify the complete change and document it

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

- [x] **Step 1: Run focused routing/RAG suites**

Run:

```bash
npm test -- --run src/lib/demo-chat/skill-candidate-verifier.test.ts src/lib/demo-chat/skill-routing-diagnostics.test.ts 'src/app/api/demo/[slug]/chat/route.test.ts' src/lib/knowledge-base/simple-rag/evidence-verifier.test.ts src/lib/knowledge-base/simple-rag/pipeline.test.ts
```

Expected: all focused tests pass.

- [x] **Step 2: Run mandatory intake guard suites**

Run:

```bash
npm test -- --run src/lib/ai/followup.test.ts
npm test -- --run src/lib/ai/response-guards.test.ts
```

Expected: both suites pass.

- [x] **Step 3: Run the production build**

Run: `npm run build`

Expected: exit code `0`.

- [x] **Step 4: Update product documentation**

Record the evidence-bound single-call verifier decision in PRD Tech Decisions, mark the roadmap work complete, and add Changed/Fixed release notes. Preserve the pending live same-seed rerun as a separate validation step.

- [x] **Step 5: Check patch integrity**

Run: `git diff --check`

Expected: no output and exit code `0`.
