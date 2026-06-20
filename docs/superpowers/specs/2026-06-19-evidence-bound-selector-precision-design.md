# Evidence-Bound Selector Precision Design

## Context

The post-timeout same-seed YİÜ run recovered the intended program Skills, but four semantic selections still treated adjacent coverage as a direct answer. The same run also showed the RAG evidence verifier accepting adjacent hospital/foundation/regulation evidence. Candidate recall is healthy; the remaining problem is decision precision.

## Decision

Keep the current simple architecture and both existing single LLM decisions:

1. One shared rewrite.
2. Exact/semantic Skill recall.
3. One Skill candidate verifier.
4. One File Search and answer generation when no Skill directly covers the request.
5. One focused evidence verifier only for risky positive RAG answers.

Do not add a second router, second retrieval, organization-specific rules, or Turkish keyword guards.

## Skill candidate contract

The candidate verifier must return:

- selected `skill_id` or `null`;
- overall `coverage`;
- `subject_coverage`: `direct`, `broad`, `missing`, or `mismatch`;
- `facet_coverage`: `direct`, `partial`, `missing`, or `mismatch`;
- an extractive `answer_quote` copied from the selected Skill response;
- confidence and a short reason.

The server accepts a Skill only when overall, subject, and facet coverage are all direct, the quote tokens occur in the approved response in the same order, and the approved response contains sufficient rewritten subject/facet scope tokens. The ordered extractive check allows the model to omit unrelated values between quoted facts without permitting invented or reordered claims. Missing/invalid evidence fails closed to `no_skill`. This prevents a single-program rank Skill from answering an all-program rank request and prevents nearby internship, hospital, or social-life answers from being selected merely because they share topic words.

## RAG evidence contract

A risky RAG `pass` verdict must include:

- `subject_coverage: direct`;
- `facet_coverage: direct`;
- an exact `evidence_quote` copied from one selected chunk.

The server validates the quote against the selected chunks. Missing, short, or invented quotes fail closed to no-info. The verifier prompt will explicitly state the general non-equivalences observed in the eval: a founding foundation does not establish hospital ownership/status; a regulation defining a center does not prove a currently operating facility; procurement/tender policy does not establish tuition/registration policy; and one department's facility does not establish a university-wide claim.

## Diagnostics

Compact Skill diagnostics will retain subject coverage, facet coverage, and the short answer quote. RAG diagnostics continue to store the verifier action and reason; no customer-facing evidence mechanics are exposed.

## Testing

- Skill verifier unit tests reproduce broad ranking, wrong hospital-change subject, and adjacent internship coverage as rejected structured decisions.
- A positive program-specific fee/quota selection remains accepted.
- Evidence-verifier tests reject a `pass` verdict with an absent quote and accept a directly quoted program fact.
- Pipeline tests cover hospital-foundation and unrelated procurement evidence falling to no-info.
- Existing route, simple-RAG, follow-up, response-guard, and build checks remain green.

## Success criteria

- Explicit program facts continue to select their precise Skills.
- The four reviewed adjacent Skill selections cannot pass the structured verifier contract.
- Risky RAG cannot pass without direct quoted selected-chunk evidence for the requested subject and facet.
- No additional model call or retrieval attempt is introduced.
