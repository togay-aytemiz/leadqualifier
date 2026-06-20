# YİÜ Positive-Signal Selector Review — 2026-06-19

## Implemented contract

`exact match -> query normalizer -> positive semantic candidates -> one LLM selector -> Skill or File Search`

- `routing_description` is selector-only context and is no longer embedded.
- Embeddings retain title, positive triggers, coverage facets, and approved-response facts.
- The extractive quote and token-overlap post-selector vetoes were removed.
- The query normalizer must preserve the user's requested outcome instead of replacing it with a nearby Skill topic.
- The selector uses one compact direct-answer contract; no new threshold, question-specific rule, or verifier was added.

## Production data verification

- Active Skills: `70`
- Verified program Skills: `26`
- Active/expected embeddings: `2545/2545`
- Previous routing-aware count: `2615`; the exact `70`-row reduction confirms one `routing_description` embedding was removed per active Skill.

## Focused final probe

Artifact: `docs/evaluations/yiu-routing-random-10-2026-06-19T21-44-01-457Z.md`

- Completed: `10/10`, errors: `0`
- Routes: `4 Skill`, `5 grounded RAG`, `1 no-info`
- Latency: `10.78s` average, `13.85s` p90
- Correct positive controls: Anestezi fee and Ebelik quota reached their exact program Skills.
- Correctly removed Skill routes: state-hospital internship, romantic-outcome, laboratory-age, hospital ownership/project, and registration-bargaining prompts did not use an adjacent Skill.
- Remaining wrong Skill routes:
  - `Hastane değişebilir mi?` -> post-registration program-change Skill
  - broad `Başarı sıralamaları nedir?` -> one Turkish Medicine program Skill

The focused selector gate therefore did not pass, and a disjoint random 100 was not started.

## Rejected model experiment

An intermediate `gpt-5.4-mini` selector run completed the same 100-question seed (`docs/evaluations/yiu-routing-random-100-2026-06-19T21-24-48-116Z.md`) with `46 Skill`, `34 grounded RAG`, `18 no-info`, `1 refusal`, and `1 identity` at `9.66s` average / `16.15s` p90. Manual Skill review found roughly `12/46` adjacent or non-answering Skill selections, so the model change was rejected and reverted. It is not the final configuration.

## Conclusion

The implementation is materially simpler and restores program-fact recall without the quote/token false-negative collapse. It does not prove that one lightweight selector can deliver the required Skill precision on its own. Under the approved constraint set, the honest next decision is whether to accept that precision ceiling or separately evaluate a stronger single-selector configuration; adding another verifier, a question-specific rule, or a new threshold would violate this design.
