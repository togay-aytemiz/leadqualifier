# Disjoint Routing and Clarification Evaluation Design

**Date:** 2026-06-20

## Goal

Measure the current production assistant without tuning it during the run:

1. Run 100 questions that do not overlap with the latest 100-question seed.
2. Run 20 realistic, two-turn prospective-student conversations that genuinely require clarification.
3. Manually review every result for factual correctness, Skill/subject matching, no-info correctness, clarification quality, and unsafe inference.

## Scope

This work changes only the evaluation harness and evaluation documentation. It does not change production routing, prompts, thresholds, Skills, File Search configuration, or demo maintenance state.

## Experiment A — Disjoint 100

- Source: the existing 508-question YİÜ routing pool.
- Exclusion set: every `poolId` selected by the latest same-seed 100 artifact.
- Sampling: deterministic new seed over the remaining pool.
- Invariant: selected count is 100 and overlap with the exclusion set is exactly zero.
- Target: deployed public demo at `https://app.askqualy.com`.
- No retries that silently replace failed questions; errors and timeouts remain visible in the report.

Each row will be manually judged for:

- answer correctness and completeness;
- whether the selected Skill subject and facet match the question;
- whether RAG, no-info, refusal, or clarification was the right behavior;
- whether the answer makes an unsupported or adjacent-evidence inference;
- request errors, timeouts, and latency.

## Experiment B — 20 Clarification Conversations

The first messages will sound like real prospective students, not synthetic slot labels. They will cover program fees, scores, ranking, campus, internships, duration, registration, scholarships, preparation year, accreditation, facilities, attendance, and career outcomes.

Examples of the intended style:

- `ücreti ne kadar acaba`
- `puanı kaçla kapatmış`
- `staj işi nasıl oluyor`
- `hangi kampüste okuyacağım`

Each case has one pre-authored short reply representing the missing information, such as `anestezi`, `burslu İngilizce tıp`, or `YKS kaydı`. The reply:

- answers only the clarification question;
- does not restate the original question;
- does not use generic acceptance such as `evet`, `olur`, or `devam et`;
- is sent in the same public-demo conversation so pending state is exercised end to end.

If the first turn fails to clarify, that is recorded as a failed case rather than forcing pending state artificially.

Each conversation will be manually judged for:

- whether clarification was necessary;
- whether the bot asked one useful, answerable question;
- whether the short reply bound to the intended subject/facet;
- whether the second turn avoided repeating the clarification;
- whether the final answer was factual and limited to the requested information;
- whether the route and evidence source were appropriate.

## Artifacts

- machine-readable raw JSON for both runs;
- generated Markdown summaries;
- a separate Codex manual-review report with row-level verdicts and aggregate metrics;
- updated PRD, roadmap, and release notes.

## Acceptance Criteria

- 100 newly selected routing rows with zero overlap against the prior artifact.
- 20 unique realistic clarification fixtures.
- Production results captured without mid-run tuning.
- Every routing row and every clarification conversation manually reviewed.
- Errors, timeouts, wrong answers, incorrect no-info outcomes, and unsafe positives are reported without being hidden by retries.
- Evaluation harness tests and `npm run build` pass before completion.
