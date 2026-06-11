# Bounded Internal Agent Controller Design

**Date:** 2026-06-11
**Status:** Approved for implementation planning

## Context

Qualy already has contextual orchestration, typed conversation state, structured catalogs, hybrid retrieval, validated File Search, research planning, evidence packs, claim ledgers, evaluator/repair loops, and behavior-aware presentation polish. These capabilities currently enter through different provider and channel paths, with much of the validated flow concentrated in `openai-file-search-validated.ts`.

The next step is not another domain-specific rule or an unrestricted autonomous agent. Qualy needs one tenant-independent controller that can understand a turn, choose among approved internal capabilities, collect enough evidence, verify each customer-facing claim, and stop safely. The controller must serve every customer-facing channel and response path while preserving tenant isolation and organization behavior policy.

## Goals

- Give one LLM-led controller responsibility for choosing approved internal tools and deciding when enough evidence exists.
- Apply the same planning, verification, state, and presentation contract to Demo Chat, WhatsApp, Instagram, Telegram, Simulator, validated RAG, legacy RAG, catalogs, tables, Skills, clarifications, refusals, and no-information answers.
- Decompose compound questions into atomic claims and retrieve only the missing evidence for each claim.
- Preserve claim-level provenance, authority, freshness, conflicts, and validation outcomes in an evidence graph.
- Ask clarification when the user intent or required slots are genuinely unresolved.
- Prevent unsupported institutional claims, repeated tool calls, runaway loops, and accidental external research.
- Keep the design provider-neutral so individual retrieval implementations can change without changing channel code.

## Non-Goals

- No live web browsing, external search engine, or unapproved external API research.
- No LangChain or LangGraph migration as a prerequisite.
- No open-ended autonomous loop.
- No replacement of existing catalogs, hybrid retrieval, File Search, claim ledgers, or behavior polish.
- No organization-specific routing rules in the shared controller.
- No change to tenant isolation or Supabase RLS boundaries.

## Architectural Decision

Use a bounded planner-executor-verifier controller with explicit state transitions:

```text
Channel Adapter
  -> Agent Request
  -> Turn Interpreter
  -> Task Decomposer
  -> Tool Planner
  -> Tool Executor
  -> Evidence Graph
  -> Claim Verifier
  -> Decision Layer
       -> answer
       -> retry missing claims
       -> clarify
       -> refuse
       -> no_info
  -> Behavior-aware Presenter
  -> Customer
```

The controller owns decisions, not facts. Facts can only come from approved internal tools. Existing deterministic validators remain hard boundaries around LLM decisions.

## Universal Entry Boundary

Every customer-facing response is converted into an `AgentRequest` before a final reply is returned. Channel adapters may supply channel-specific metadata but may not bypass verification or presentation.

Included paths:

- Public Demo Chat
- WhatsApp, Instagram, and Telegram inbound replies
- Simulator
- Validated and legacy RAG
- Structured catalog and table answers
- Skill and fast-path answers
- Clarification, refusal, and no-information responses

Excluded paths:

- Admin-only tools and diagnostics
- Background ingestion and indexing jobs
- Internal technical error messages that are not customer replies

## Core Contracts

### AgentRequest

```ts
type AgentRequest = {
  organizationId: string
  conversationId?: string
  channel: 'demo_chat' | 'whatsapp' | 'instagram' | 'telegram' | 'simulator'
  locale: string
  latestUserMessage: string
  recentMessages: ConversationTurn[]
  conversationState?: TypedConversationState
  behaviorPolicy: CompiledBehaviorPolicy
  availableTools: AgentToolDescriptor[]
  sourcePolicy: SourcePolicy
  budget: AgentBudget
}
```

The most recent ordered user and assistant turns remain available to the interpreter. Typed state supplements raw history; it does not replace it.

### AtomicClaim

```ts
type AtomicClaim = {
  id: string
  question: string
  subject?: string
  facet?: string
  requiredEvidence: EvidenceRequirement
  risk: 'low' | 'medium' | 'high'
  status: 'unresolved' | 'supported' | 'conflicted' | 'unsupported'
}
```

Compound questions produce multiple claims. The controller may answer supported claims while explicitly separating unresolved ones, as long as the resulting answer remains useful and non-misleading.

### Tool Plan

```ts
type ToolPlan = {
  turnDecision: 'research' | 'clarify' | 'refuse' | 'direct'
  claims: AtomicClaim[]
  steps: ToolPlanStep[]
  stopConditions: StopCondition[]
  clarification?: ClarificationRequest
}
```

Each step names one registered internal tool, the claims it serves, its arguments, dependencies, and whether it can run in parallel. Assistant messages and internal prompts are never retrieval queries.

### ToolResult

```ts
type ToolResult = {
  tool: string
  status: 'success' | 'empty' | 'error' | 'timeout'
  evidence: EvidenceNode[]
  supportedClaimIds: string[]
  sourceIds: string[]
  usage?: AgentUsage
  diagnostics?: Record<string, unknown>
}
```

Tools return evidence, not customer prose. Direct-answer tools may return an answer candidate, but it is still represented as evidence and must pass the verifier and presenter.

## Internal Tool Registry

The shared registry initially exposes existing approved capabilities:

- Typed conversation state resolver
- Behavior policy and boundary resolver
- Operator-authored Skills
- Structured fact catalogs
- Structured table lookup
- Tenant Knowledge Base hybrid retrieval
- OpenAI File Search over the organization's approved ingested corpus
- Existing focused retrieval and source-priority groups
- Existing official-contact or next-step data when stored internally

Each tool descriptor declares:

- Supported claim and evidence types
- Required inputs
- Tenant and source constraints
- Typical latency and cost class
- Whether results are authoritative, advisory, or retrieval candidates
- Whether parallel execution is safe
- Whether a later tool may broaden or override it

The planner receives descriptors, not implementation details. Adding a future internal tool should require registry registration rather than prompt-specific routing edits.

## Source Policy

The source policy is tenant-configurable and compiled from organization settings plus approved corpus metadata. It defines:

- Allowed source groups
- Priority order
- Authority rank
- Validity period and academic/business period when applicable
- Freshness requirements
- Whether lower-priority sources may fill missing facts
- Conflict behavior

The controller tries higher-priority approved evidence first. It may use lower-priority evidence for unresolved claims, but it may not silently use a lower-priority source to overwrite a conflicting higher-priority fact. Conflict produces either another targeted internal lookup, a qualified answer, or a clarification/no-information decision.

## Evidence Graph

The existing blackboard evolves into a typed evidence graph:

- Claim nodes represent what must be answered.
- Evidence nodes contain quotes or structured values, source identity, authority, validity, and retrieval metadata.
- Support edges show which evidence entails which claim.
- Conflict edges record incompatible values or policies.
- Attempt nodes record tool calls, arguments, outcomes, timing, and usage.

The graph is append-only during one request. The next planner iteration receives a compact unresolved-claim view rather than the whole raw trace. This keeps retries focused and prevents the model from repeating successful work.

## Execution Loop

1. Interpret the latest turn using recent ordered history, typed state, and behavior policy.
2. Decide whether the turn is fresh, a clarification answer, mixed, unsafe, impossible, or out of scope.
3. Decompose answerable intent into atomic claims.
4. Produce a tool plan using only registered internal tools.
5. Execute independent steps in parallel and dependent steps sequentially.
6. Merge results into the evidence graph.
7. Verify claims using deterministic requirements first and an LLM evaluator where semantic judgment is needed.
8. Stop when all required claims are supported, a safe boundary decision is reached, or the budget is exhausted.
9. If only some claims are unresolved, plan another iteration only for those claims.
10. Produce one decision: answer, clarify, refuse, or no information.
11. Send every customer-facing answer through the organization-aware presentation layer.

Default bounded limits:

- Maximum 3 planning/execution rounds
- Maximum 6 tool calls per request
- No identical tool and argument call twice
- One clarification question at a time
- Request-level latency, token, and credit budgets
- Early stop when claim requirements are satisfied

Limits are configurable by environment or tenant plan, but hard server-side ceilings remain mandatory.

## Verification and Presentation

Verification is claim-by-claim rather than answer-by-answer. The verifier combines:

- Existing strict claim ledger
- Universal claim ledger driven by behavior policy
- Source authority and freshness checks
- Facet and subject alignment
- Exact-value and policy-marker support
- Conflict detection
- Safety and sensitive-data boundaries

The LLM may repair wording or compose supported facts, but it may not turn an unsupported claim into a supported one. Repair output is verified again.

Every final customer reply then passes through the behavior-aware presenter. The presenter receives only verified facts, the decision type, conversation context needed for natural phrasing, and the tenant's tone policy. It must hide retrieval mechanics by default and preserve exact validated values. Source links may be appended according to the channel/source policy without exposing internal table, row, brochure, chunk, or tool language unless provenance is explicitly requested.

## Failure Handling

- **Planner failure:** Fall back to a conservative direct plan using typed state and existing provider routing. Never expose planner errors.
- **Tool error or timeout:** Record the failed attempt and continue with independent tools. Retry only if the next call changes scope, source group, or query.
- **No evidence:** Return an actionable no-information boundary or clarification; do not infer an institutional fact.
- **Conflicting evidence:** Prefer the configured authority policy. If the conflict remains material, state that it requires confirmation rather than selecting silently.
- **Verifier failure:** Do not return the draft. Retry unresolved claims within budget, then clarify/refuse/no-info.
- **Presenter failure:** Return the verified pre-presentation answer through a minimal safe formatter. Grounding must never depend on polish success.
- **Budget exhaustion:** Return the best verified partial answer and clearly bound unresolved parts. If no useful verified claim exists, use no-info.
- **State corruption or stale state:** Ignore unusable typed state and reinterpret from ordered raw history. Do not consume a fresh question as an old clarification answer.

## Observability

Each request emits one trace with:

- Interpreted turn type and confidence
- Typed state transition
- Atomic claims and risk levels
- Planned and executed tools
- Source groups and priority decisions
- Evidence graph summary
- Claim verdicts and conflicts
- Retry and stop reasons
- Final decision and presentation outcome
- Latency, tokens, credits, and model usage per stage

Operator diagnostics may expose this trace. Customer replies may not.

## Rollout Strategy

1. Extract provider-neutral contracts and adapters around existing behavior without changing customer output.
2. Run the controller in shadow mode beside current Demo Chat and shared inbound flows; compare decisions, claims, tools, evidence, latency, and cost.
3. Enable controller-owned decisions for one internal test organization while keeping existing generation and presentation.
4. Enable Public Demo Chat and Simulator.
5. Enable WhatsApp, Instagram, and Telegram through the same shared inbound boundary.
6. Retire channel/provider bypasses only after parity and regression gates pass.

Rollout flags apply to the common controller, not to organization-specific code. Per-organization activation is allowed for canarying.

## Testing Strategy

### Unit Tests

- Tool registry capability matching
- Atomic claim decomposition schema validation
- Plan validation and forbidden-tool rejection
- Evidence graph merge, support, conflict, and deduplication
- Loop budget and duplicate-call prevention
- Source authority and freshness resolution
- Claim verifier outcomes
- Typed state transitions
- Presenter grounding preservation

### Contract Tests

Every tool adapter must pass the same result-contract suite for tenant isolation, evidence identity, empty/error behavior, and diagnostics. Every channel adapter must prove that no customer reply bypasses controller verification and presentation.

### Scenario Tests

Maintain multilingual, typo-heavy, student/customer-style scenarios covering:

- Direct facts
- Compound and multi-hop questions
- Missing slots and clarification replies
- Relevant and irrelevant follow-ups
- Conflicting or stale sources
- Unsupported institutional claims
- Off-topic, unsafe, sensitive-data, and trolling requests
- Tool failure, timeout, and budget exhaustion
- Cross-channel output parity

### Shadow and Regression Gates

- No unsupported critical claim may be promoted over the current pipeline.
- No customer-facing path may bypass final verification and presentation.
- Existing follow-up and response-guard suites remain mandatory.
- Build and focused RAG tests must pass before canary activation.
- Shadow traces must show bounded tool use with no duplicate calls.
- Quality must improve without unacceptable p95 latency growth; thresholds are recorded before implementation rollout.

## Implementation Boundaries

The initial implementation should extract contracts and controller modules rather than rewrite the 3,000+ line validated provider at once. Existing functions become adapters behind the tool registry. Channel code moves to a shared customer-reply entry boundary incrementally.

The design intentionally does not require LangChain or LangGraph. If the native state-transition implementation later becomes difficult to inspect or evolve, a graph framework can be evaluated behind the same contracts without changing channel or tool interfaces.

## Acceptance Criteria

- All customer-facing channels call the common agent boundary.
- The controller can select and combine at least catalog, table, hybrid retrieval, File Search, Skill, and typed-state tools.
- Compound questions are represented as multiple claims and only unresolved claims are retried.
- External web access is impossible through the registered tool set.
- Every factual final answer has a supported claim ledger entry or is explicitly bounded as unknown.
- Source conflicts and stale evidence cannot be silently converted into definitive claims.
- Every final reply passes behavior-aware presentation or its verified safe fallback.
- Tool loops respect hard call, round, latency, token, and credit ceilings.
- Diagnostics make the full decision path auditable without leaking it to customers.
- Existing customer-facing behavior remains available during staged rollout and rollback.
