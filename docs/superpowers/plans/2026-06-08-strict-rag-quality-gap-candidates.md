# Strict RAG Quality Gap Candidates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reproducible 8-band analyzer that classifies safe-but-not-9 answers and emits catalog candidate facts needed to upgrade them.

**Architecture:** Extend the existing customer-question score report module instead of adding a separate evaluator path. The analyzer consumes the main markdown table plus chronological retest artifacts, preserves the latest result metadata per question, groups current score-8 rows by quality gap/category, and emits catalog candidates with the missing fact, required evidence, and suggested catalog slot.

**Tech Stack:** TypeScript, Vitest, existing strict RAG eval artifacts, `tsx` CLI scripts.

---

### Task 1: Preserve Latest Retest Metadata

**Files:**
- Modify: `src/lib/knowledge-base/rag-eval/customer-question-score-report.ts`
- Modify: `src/lib/knowledge-base/rag-eval/customer-question-score-report.test.ts`

- [ ] **Step 1: Write failing tests**
  Add tests proving the report can return effective rows with latest retest result metadata, including `strictVerdict`, answer, citations, and artifact filename.

- [ ] **Step 2: Run RED**
  Run:
  `npm test -- --run src/lib/knowledge-base/rag-eval/customer-question-score-report.test.ts`
  Expected: fail because metadata helpers do not exist.

- [ ] **Step 3: Implement metadata merge**
  Add `CustomerEffectiveEvaluationRow`, `RetestEntryMetadata`, and `buildEffectiveEvaluationRows`.

- [ ] **Step 4: Run GREEN**
  Run the same test and confirm it passes.

### Task 2: Add 8-Band Gap Analyzer and Candidate Generator

**Files:**
- Create: `src/lib/knowledge-base/rag-eval/catalog-candidate-generator.ts`
- Create: `src/lib/knowledge-base/rag-eval/catalog-candidate-generator.test.ts`

- [ ] **Step 1: Write failing tests**
  Test finance/payment, campus transport, accreditation, clinical/lab, contact, and grounded direct fact cases.

- [ ] **Step 2: Run RED**
  Run:
  `npm test -- --run src/lib/knowledge-base/rag-eval/catalog-candidate-generator.test.ts`
  Expected: fail because module does not exist.

- [ ] **Step 3: Implement generator**
  Implement deterministic grouping from `strictVerdict`, answer text, and question text. Emit candidates only for current score-8 safe boundaries; do not emit candidates for score-9 grounded facts.

- [ ] **Step 4: Run GREEN**
  Run the candidate test and confirm it passes.

### Task 3: Extend CLI Report

**Files:**
- Modify: `scripts/knowledge/report-yiu-customer-question-scores.ts`
- Modify: `docs/evaluations/yiu-demo-customer-questions-2026-06-05.md`

- [ ] **Step 1: Add report output tests through module coverage**
  Keep CLI simple; rely on module tests for parsing/candidate logic.

- [ ] **Step 2: Extend CLI**
  Add `--with-candidates` and `--score 8` options that print category breakdown and top catalog candidates.

- [ ] **Step 3: Run report**
  Run:
  `npx tsx scripts/knowledge/report-yiu-customer-question-scores.ts --score 8 --with-candidates`
  Expected: current score distribution plus current-8 candidate categories.

- [ ] **Step 4: Document output**
  Add the latest category/candidate summary to the evaluation markdown.

### Task 4: Verify

**Files:**
- All touched files.

- [ ] **Step 1: Run focused tests**
  Run:
  `npm test -- --run src/lib/knowledge-base/rag-eval/customer-question-score-report.test.ts src/lib/knowledge-base/rag-eval/catalog-candidate-generator.test.ts`

- [ ] **Step 2: Run strict RAG regression tests**
  Run:
  `npm test -- --run src/lib/knowledge-base/rag-eval/strict-fact-catalog.test.ts src/lib/knowledge-base/rag-eval/strict-quality-rubric.test.ts src/lib/knowledge-base/rag-eval/openai-file-search-validated.test.ts`

- [ ] **Step 3: Run required AI guard tests**
  Run:
  `npm test -- --run src/lib/ai/followup.test.ts src/lib/ai/response-guards.test.ts`

- [ ] **Step 4: Build**
  Run:
  `npm run build`

### Self-Review

- Spec coverage: The plan covers source rows, latest retest metadata, 8-band category analysis, auto catalog candidates, CLI output, docs, tests, and build.
- Placeholder scan: No `TBD`/`TODO` placeholders.
- Type consistency: The plan uses the existing report module as the source boundary and adds one focused generator module.
