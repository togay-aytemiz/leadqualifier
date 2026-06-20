# Unique Skill Candidate Retrieval and Selector Model A/B Design

## Goal

Separate retrieval quality from selector-model quality before changing production behavior. The route stays:

`exact match -> query normalizer -> semantic Skill candidates -> one LLM selector -> Skill or File Search`

## Decisions

### 1. Retrieve top-X unique Skills, not top-X embedding rows

Each Skill can have many embedding rows. `match_skills` must score every enabled Skill by its best matching embedding row, keep one row per Skill, sort those Skill-level scores, and only then apply `match_count`.

The returned `trigger_text` is the best-matching embedding text for that Skill. Application-side merging remains a defensive step for multiple query variants, but it is no longer responsible for repairing duplicates inside one RPC result.

### 2. Freeze selector inputs after the retrieval fix

The focused ten-question YİÜ set is captured after the unique-Skill RPC is deployed. Every frozen case contains:

- latest user message;
- normalized standalone query, subject, and facet;
- exactly the ordered candidate payload supplied to the selector;
- the expected Skill id, or `null` when the correct route is File Search.

Frozen payloads contain no API keys, embeddings, or customer secrets.

### 3. Run a controlled model A/B

The same frozen cases, candidate order, prompt, and strict JSON schema are sent three times to each configuration:

- `gpt-4.1-mini`;
- `gpt-5.5` with `reasoning.effort = none`;
- `gpt-5.5` with `reasoning.effort = low`.

The harness uses the Responses API and Structured Outputs for every configuration so only model/reasoning changes. It records exact selection accuracy, false-Skill rate on File Search cases, positive-Skill recall, latency, and token usage.

### 4. Precision is the release gate

The focused set contains eight File Search cases and two known positive Skill controls. A production model is eligible only if all repeated runs satisfy both:

- zero false Skill selections on expected File Search cases;
- both positive controls select the exact expected Skill.

If multiple configurations pass, prefer lower p90 latency and token usage. If none passes, keep `gpt-4.1-mini` and do not add thresholds, question-specific rules, or another verifier.

## Verification

- Migration test proves Skill grouping occurs before the final limit.
- A live RPC probe confirms returned candidate ids are unique and the requested count is not consumed by duplicate embedding rows.
- Harness unit tests prove immutable payload construction, response parsing, scoring, and release-gate behavior.
- The live A/B report preserves per-case outputs and aggregate metrics for review.
- Existing Skill/RAG, mandatory intake guards, and `npm run build` remain green.
