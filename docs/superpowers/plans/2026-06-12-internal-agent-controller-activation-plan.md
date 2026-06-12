# Internal Agent Controller Activation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the Bounded Internal Agent Controller from shadow-only planning to the shared customer-facing decision boundary.

**Architecture:** Add a generic activation runtime that uses the existing planner/controller modules, registers read-only internal tools, and treats the current high-quality provider path as an approved evidence-producing bridge while real tool adapters are extracted incrementally. The controller owns clarify/refuse/no-info decisions before expensive retrieval when possible; research decisions execute approved internal tools and return only verified/current-provider evidence through the behavior-aware presentation boundary.

**Tech Stack:** TypeScript, Vitest, OpenAI Chat Completions, existing agent contracts/controller, validated File Search, simulator, shared inbound channel pipeline.

---

## File Map

- Create `src/lib/ai/agent/activation.ts`: shared activation runtime, enablement flags, real read-only bridge tools, controller verifier, final decision presentation, and fail-open fallback.
- Create `src/lib/ai/agent/activation.test.ts`: controller-owned clarify/research/fallback behavior.
- Modify `src/lib/knowledge-base/rag-eval/types.ts`: add activation diagnostics to provider result metadata.
- Modify `src/lib/knowledge-base/rag-eval/openai-file-search-validated.ts`: export the current provider body and wrap it with activation before shadow diagnostics.
- Modify `src/lib/knowledge-base/rag-eval/openai-file-search-validated.test.ts`: prove activation can answer clarification without running retrieval and can return current provider evidence for research.
- Modify `src/lib/chat/actions.ts`: pass simulator replies through activation before returning to the UI.
- Modify `src/lib/channels/inbound-ai-pipeline.ts`: pass outbound text through activation before delivery/persistence where practical, while keeping fail-open fallback.
- Modify `docs/PRD.md`, `docs/ROADMAP.md`, `docs/RELEASE.md`: record activation state and rollback behavior.

## Task 1: Shared Activation Runtime

- [x] Write failing tests in `src/lib/ai/agent/activation.test.ts`:
  - Planner `clarify` returns the clarification question and does not call `executeCurrent`.
  - Planner `research` calls `executeCurrent` through an internal evidence tool and returns the current answer.
  - Planner/controller failure falls back to the current answer and records an activation diagnostic.
- [x] Implement `runInternalAgentActivatedTurn` in `src/lib/ai/agent/activation.ts`.
- [x] Run `npm test -- --run src/lib/ai/agent/activation.test.ts`.

## Task 2: Validated File Search Activation

- [x] Export `runOpenAiFileSearchValidatedQuestionCurrent`.
- [x] Wrap `runOpenAiFileSearchValidatedQuestion` with `runInternalAgentActivatedTurn`.
- [x] Keep current provider as the fallback and as the approved bridge evidence for research decisions.
- [x] Run `npm test -- --run src/lib/knowledge-base/rag-eval/openai-file-search-validated.test.ts`.

## Task 3: Simulator And Shared Inbound Boundaries

- [x] Use activation in simulator final response construction.
- [x] Use activation around shared outbound text delivery where the message is customer-facing text.
- [x] Keep images/provider delivery rows out of activation.
- [x] Run `npm test -- --run src/lib/chat/actions.test.ts src/lib/channels/inbound-ai-pipeline.test.ts`.

## Task 4: Acceptance And Documentation

- [x] Run planner/activation/follow-up/guard tests.
- [x] Run synthetic shadow acceptance.
- [x] Run lint and build.
- [x] Update PRD, ROADMAP, and RELEASE.
