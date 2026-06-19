# Simple Skill-First File Search Design

## Goal

Public Demo Chat should answer with an approved Skill whenever one directly covers the user's request. Otherwise it should use one history-aware standalone query to search the organization's OpenAI vector store and generate one grounded answer.

## Flow

1. Use recent conversation history only to resolve references and produce a standalone query.
2. Match exact Skill triggers, then semantically retrieve Skill candidates from the standalone query and let one LLM selector choose a directly covering Skill.
3. If no Skill is selected, search the organization-specific OpenAI vector store once with the same standalone query.
4. Generate one answer from returned chunks. Return no-info only when retrieval returns no usable chunks or the answer model reports that the chunks do not support a useful answer.

## Removed Complexity

- No post-retrieval organization or audience keyword filtering inside an organization-specific store.
- No broadened retry query.
- No second answer-verifier model.
- No organization-specific program catalog, facility, hospital, or operational keyword guards.

## Grounding

The answer generator must cite valid returned chunk IDs. Exact numeric, date, address, phone, email, and URL values must occur in the selected chunks. This is the only deterministic factual guard retained.

## Verification

Run focused unit tests for history-aware rewrite, direct grounded File Search answers, no-result no-info, and Skill candidate selection. Then run the project build.
