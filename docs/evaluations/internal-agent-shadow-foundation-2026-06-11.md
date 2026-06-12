# Internal Agent Shadow Foundation - 2026-06-11

## Scope

Implemented the fail-open foundation slice for the Bounded Internal Agent Controller plan.

- Provider-neutral internal agent contracts, tool registry, evidence graph, LLM planner, bounded controller loop, shadow diagnostics, and runtime shadow request builder are now in place.
- Validated File Search can run the internal planner in shadow mode and attach planned-vs-observed diagnostics without changing answer text, citations, refusal state, or customer usage.
- Shared inbound reply persistence can attach internal_agent_shadow metadata for text bot replies when INTERNAL_AGENT_SHADOW=1.
- Simulator responses can expose agentShadow when shadow mode is enabled.
- The report command agent:shadow:report summarizes shadow trace status, planned tools, observed tools, missing planned tools, extra observed tools, reasons, duration, and estimated credits.

## Rollout Boundary

This slice is observation-only. It does not give the internal agent ownership over customer answers, billing-visible usage, external web research, retrieval execution, or final presentation. Existing RAG, Skills, catalog, fallback, and polish paths remain the answer owners.

## Verification

- npm test -- --run src/lib/ai/agent/contracts.test.ts src/lib/ai/agent/tool-registry.test.ts src/lib/ai/agent/evidence-graph.test.ts src/lib/ai/agent/planner.test.ts src/lib/ai/agent/controller.test.ts src/lib/ai/agent/shadow.test.ts src/lib/ai/agent/runtime-shadow.test.ts src/lib/knowledge-base/rag-eval/openai-file-search-validated.test.ts src/lib/channels/inbound-ai-pipeline.test.ts src/lib/chat/actions.test.ts src/lib/ai/followup.test.ts src/lib/ai/response-guards.test.ts scripts/knowledge/report-agent-shadow.test.ts
  - Result: 13 files passed, 257 tests passed.
- npm run build
  - Result: passed. Next.js emitted only the existing multi-lockfile workspace-root warning for the local worktree.
- npm run lint
  - Result: passed with two existing Next.js img-element warnings in ChatBubble.tsx and SkillsContainer.tsx; i18n checks passed.

## Next Gate

Before activation, run a real shadow sample across customer-style turns and review:

- answer parity: customer-visible answers unchanged
- tool agreement: planned internal tools match observed current paths
- missing planned tools: where the current pipeline skipped a capability the planner expected
- extra observed tools: where the current pipeline did work the planner did not expect
- latency and credit budget for shadow planner calls
- refusal, clarification, no-information, and unsafe-request handling

Activation should be a separate plan after this report shows stable parity and useful tool-agreement diagnostics.
