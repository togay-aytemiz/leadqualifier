# Positive-Signal Skill Routing Implementation Plan

1. Add regression tests for positive-only embeddings and selector decisions without quote/token evidence.
2. Remove `routing_description` from embedding text generation while preserving coverage facets and response facts.
3. Roll back the recent Skill and RAG quote/token guard additions, retaining the existing focused risk verifier.
4. Run targeted routing, RAG, mandatory guardrail, and build verification.
5. Republish and verify YİÜ Skill embeddings.
6. Run the focused probe, then the same-seed random 100 if the focused gate is healthy.
7. Record implementation and evaluation outcomes in PRD, roadmap, and release notes.
