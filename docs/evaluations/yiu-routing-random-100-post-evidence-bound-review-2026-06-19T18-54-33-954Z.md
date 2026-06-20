# YİÜ Same-Seed Random 100 — Post Evidence-Bound Review

Date: 2026-06-19  
Seed: `yiu-program-facts-random-100-2026-06-18-c`  
Base URL: `http://127.0.0.1:3001`  
Run: `docs/evaluations/yiu-routing-random-100-2026-06-19T18-54-33-954Z.md`

## Verdict

**Gate failed. Do not run the disjoint random 100 yet.**

The full same-seed rerun completed `100/100` with zero runtime/API errors, but the evidence-bound selector lost too much valid Skill recall and increased latency:

| Metric | Before evidence-bound selector | After | Change |
|---|---:|---:|---:|
| Skill answers | 51 | 33 | -18 |
| Grounded RAG | 26 | 28 | +2 |
| No-info | 20 | 35 | +15 |
| Clarify | 0 | 2 | +2 |
| Refuse | 2 | 1 | -1 |
| Identity | 1 | 1 | 0 |
| Average latency | 9.0s | 12.6s | +3.6s |
| p90 latency | 14.7s | 20.1s | +5.4s |

The agreed gate required known explicit program facts to remain on Skills and p90 to stay near or below `16s`; both failed.

## Route transitions

| Transition | Count |
|---|---:|
| Skill -> Skill | 32 |
| grounded RAG -> no-info | 13 |
| grounded RAG -> grounded RAG | 13 |
| Skill -> grounded RAG | 10 |
| Skill -> no-info | 7 |
| no-info -> grounded RAG | 5 |
| Skill -> clarify | 2 |

The remaining transitions account for stable identity/refusal/no-info rows, one new Skill, and one refusal-to-no-info change.

## What improved

- `Başarı sıralamaları nedir?` no longer selects one arbitrary program Skill; it asks which program/faculty is meant.
- `Hastane değişebilir mi?` no longer selects the program-change/yatay-geçiş Skill.
- `Hastane projeniz var mı?` and affiliated-hospital type questions fall to no-info instead of using general university/foundation evidence.
- `Kayıtta pazarlık yapılıyor mu?` falls to no-info instead of treating procurement rules as student-registration policy.
- The broad social/romantic question no longer selects the student-facilities Skill.

## Critical regressions

1. **Correct high-confidence program Skills can fail the quote guard.**
   - `Anestezi kontenjanı nedir?` selected the correct Anestezi Skill with direct subject/facet coverage and confidence `1`, but failed `answer_quote_not_found` because the model prefixed the extractive values with synthesized wording.
   - `Ebelik kontenjanı nedir?` failed for the same reason and produced an unnecessary clarification.

2. **Program-fact recall became too conservative.**
   - `grafik tasarım kaç para` timed out in verification and moved to RAG.
   - `TYT puanıyla sağlık alanında hangi programları tercih edebilirim?` became no-info.
   - Other formerly useful Skills moved to RAG/no-info for accommodation, scholarships, registration documents, clinical skills, and broad applied-training questions.

3. **Risky RAG positives still exist.**
   - `Psikoloji bölümü var mı?` produced a positive RAG existence claim.
   - `Yakınlarda devlet yurdu var mı?` produced a categorical negative/alternative-housing answer from insufficient evidence.
   - `Devlet hastanesinde staj yapabilir miyim?` still generalized workplace-approval evidence to a state-hospital answer.
   - `Afiliye hastaneniz hangi şehirde?` still selected the general university Skill and answered the university location rather than the hospital entity.

## Selector diagnostics

| Terminal outcome | Count |
|---|---:|
| exact_skill | 15 |
| verified_skill | 18 |
| verification_no_skill | 62 |
| verification_timeout | 1 |
| rewrite_timeout | 2 |
| no_candidate_queries | 1 |
| no Skill diagnostics (identity) | 1 |

Of the `62` `verification_no_skill` rows, `54` retained a verifier result and `8` had no parsed verification object. The retained decisions contained `35` model `none`, `10` model `partial`, `7` `scope_evidence_missing`, and `2` `answer_quote_not_found` outcomes.

## Recommended next step

Do not tune against a new sample yet. First restore the same-seed recall gate while keeping the subject/facet precision wins:

1. Treat extractive quote validation as advisory for a high-similarity candidate when the model returns direct subject/facet coverage and deterministic scope grounding passes.
2. Keep scope grounding mandatory so general university/program responses cannot answer hospital, lab-age, or state-hospital constraints.
3. Reduce invalid/truncated verifier payloads without adding another model call, then rerun the same seed.
4. Run the disjoint random 100 only after explicit program facts recover and the same-seed p90/false-no-info gates pass.
