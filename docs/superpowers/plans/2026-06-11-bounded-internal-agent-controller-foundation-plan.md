# Bounded Internal Agent Controller Foundation and Shadow Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the provider-neutral agent contracts, registry, evidence graph, generic LLM planner, bounded execution loop, and production-safe shadow instrumentation needed before the controller owns customer replies.

**Architecture:** Add a focused `src/lib/ai/agent/` subsystem whose planner sees typed conversation state, compiled behavior policy, and registered internal tool descriptors. The controller executes injected read-only tools under hard budgets and verifies claim coverage through a typed evidence graph; during this first rollout slice, existing customer pipelines keep answer ownership while shadow diagnostics compare the agent plan with the tools and evidence the current pipeline actually used.

**Tech Stack:** TypeScript, Next.js 16, Vitest, OpenAI Chat Completions, existing Qualy behavior policy/typed state/RAG diagnostics, Supabase message metadata.

---

## Scope Boundary

This is the first independently deployable slice from the approved design. It does not switch customer answers to the new controller. It provides:

- Provider-neutral contracts and schema validation
- Internal tool registry with an explicit no-external-tool boundary
- Claim-level evidence graph
- Generic LLM planner over registered internal capabilities
- Bounded execution loop with dependency, duplicate-call, and budget enforcement
- Shadow-plan comparison against validated File Search and shared inbound pipeline diagnostics
- Canary flags, trace metadata, and an offline report

A second implementation plan will activate real catalog/table/hybrid/File Search adapters behind the controller and migrate final answer ownership channel by channel after shadow acceptance gates pass.

## File Map

Create these focused modules:

- `src/lib/ai/agent/contracts.ts`: shared request, claim, plan, tool, evidence, budget, decision, trace, and shadow types.
- `src/lib/ai/agent/contracts.test.ts`: normalization and invalid-input tests.
- `src/lib/ai/agent/tool-registry.ts`: internal capability registration and allowlisting.
- `src/lib/ai/agent/tool-registry.test.ts`: duplicate, external-tool, organization-scope, and descriptor tests.
- `src/lib/ai/agent/evidence-graph.ts`: append-only claims, evidence, support/conflict edges, attempts, and unresolved-claim summary.
- `src/lib/ai/agent/evidence-graph.test.ts`: merge, dedupe, conflict, and resolution tests.
- `src/lib/ai/agent/planner.ts`: generic LLM tool planner, JSON parsing, prompt, and injected completion boundary.
- `src/lib/ai/agent/planner.test.ts`: prompt, parsing, unknown-tool, clarification, and malformed-output tests.
- `src/lib/ai/agent/controller.ts`: bounded planner/executor/verifier loop.
- `src/lib/ai/agent/controller.test.ts`: parallel execution, retries, early stop, duplicate prevention, and budget tests.
- `src/lib/ai/agent/shadow.ts`: feature flags, current-trace observation, planned/observed comparison, and fail-open runner.
- `src/lib/ai/agent/shadow.test.ts`: comparison and failure-isolation tests.
- `scripts/knowledge/report-agent-shadow.ts`: summarize shadow traces from JSON exports.
- `scripts/knowledge/report-agent-shadow.test.ts`: report aggregation tests.

Modify these integration points:

- `src/lib/knowledge-base/rag-eval/types.ts`: add typed `internalAgentShadow` diagnostics.
- `src/lib/knowledge-base/rag-eval/openai-file-search-validated.ts`: wrap the existing provider result with shadow comparison without changing answer/citations/usage.
- `src/lib/knowledge-base/rag-eval/openai-file-search-validated.test.ts`: prove shadow mode cannot change the reply and fails open.
- `src/lib/channels/inbound-ai-pipeline.ts`: append shadow metadata at the central bot-message persistence boundary for canary organizations.
- `src/lib/channels/inbound-ai-pipeline.test.ts`: prove outbound content and delivery order remain unchanged.
- `src/lib/chat/actions.ts`: attach optional shadow diagnostics to simulator responses.
- `src/lib/chat/actions.test.ts`: prove simulator response parity.
- `package.json`: add `agent:shadow:report`.
- `docs/PRD.md`, `docs/ROADMAP.md`, `docs/RELEASE.md`: record implementation and rollout state.

### Task 1: Define the Provider-Neutral Agent Contracts

**Files:**
- Create: `src/lib/ai/agent/contracts.ts`
- Create: `src/lib/ai/agent/contracts.test.ts`

- [ ] **Step 1: Write failing contract normalization tests**

```ts
import { describe, expect, it } from 'vitest'
import { normalizeAgentBudget, normalizeAgentPlan } from './contracts'

describe('internal agent contracts', () => {
  it('clamps request budgets to server ceilings', () => {
    expect(normalizeAgentBudget({ maxRounds: 99, maxToolCalls: 99, maxLatencyMs: 999_999 })).toEqual({
      maxRounds: 3,
      maxToolCalls: 6,
      maxLatencyMs: 15_000,
      maxInputTokens: 20_000,
      maxOutputTokens: 2_000,
      maxEstimatedCredits: 50,
    })
  })

  it('rejects a plan without atomic claims', () => {
    expect(normalizeAgentPlan({ decision: 'research', claims: [], steps: [] })).toBeNull()
  })

  it('accepts a one-question clarification plan with no tool steps', () => {
    expect(normalizeAgentPlan({
      decision: 'clarify',
      claims: [{ id: 'claim-1', question: 'Which service?', requiredEvidence: 'direct', risk: 'low' }],
      steps: [],
      clarification: { question: 'Hangi hizmet için bilgi almak istiyorsunuz?', missingSlots: ['service'] },
      stopConditions: ['clarification_required'],
    })?.decision).toBe('clarify')
  })
})
```

- [ ] **Step 2: Run the test and confirm the module is missing**

Run: `npm test -- --run src/lib/ai/agent/contracts.test.ts`

Expected: FAIL because `./contracts` does not exist.

- [ ] **Step 3: Implement the complete contract surface and normalizers**

```ts
import type { BehaviorPolicy } from '@/lib/ai/behavior-policy'
import type { RagTypedConversationState } from '@/lib/knowledge-base/rag-eval/typed-conversation-state'
import type { KnowledgeSearchPlanningTurn } from '@/lib/knowledge-base/query-planner'

export type AgentChannel = 'demo_chat' | 'whatsapp' | 'instagram' | 'telegram' | 'simulator'
export type AgentRisk = 'low' | 'medium' | 'high' | 'critical'
export type AgentDecision = 'research' | 'direct' | 'clarify' | 'refuse' | 'no_info'
export type AgentClaimStatus = 'unresolved' | 'supported' | 'conflicted' | 'unsupported'
export type AgentToolStatus = 'success' | 'empty' | 'error' | 'timeout'

export type AgentBudget = {
  maxRounds: number
  maxToolCalls: number
  maxLatencyMs: number
  maxInputTokens: number
  maxOutputTokens: number
  maxEstimatedCredits: number
}

export const DEFAULT_AGENT_BUDGET: AgentBudget = {
  maxRounds: 3,
  maxToolCalls: 6,
  maxLatencyMs: 15_000,
  maxInputTokens: 20_000,
  maxOutputTokens: 2_000,
  maxEstimatedCredits: 50,
}

export type AgentRequest = {
  organizationId: string
  conversationId?: string
  channel: AgentChannel
  locale: string
  latestUserMessage: string
  recentMessages: KnowledgeSearchPlanningTurn[]
  conversationState?: RagTypedConversationState | null
  behaviorPolicy: BehaviorPolicy
  sourcePolicy: {
    allowedSourceGroups: string[]
    priority: string[]
  }
  budget: AgentBudget
}

export type AtomicAgentClaim = {
  id: string
  question: string
  subject?: string
  facet?: string
  requiredEvidence: string
  risk: AgentRisk
  status: AgentClaimStatus
}

export type AgentPlanStep = {
  id: string
  tool: string
  claimIds: string[]
  args: Record<string, unknown>
  dependsOn: string[]
}

export type AgentPlan = {
  decision: AgentDecision
  claims: AtomicAgentClaim[]
  steps: AgentPlanStep[]
  stopConditions: string[]
  clarification?: { question: string; missingSlots: string[] }
  reason?: string
  confidence?: number
}

export type AgentEvidence = {
  id: string
  sourceId: string
  sourceGroup?: string
  authority?: number
  validFrom?: string
  validTo?: string
  quote?: string
  structuredValue?: unknown
}

export type AgentToolResult = {
  tool: string
  status: AgentToolStatus
  evidence: AgentEvidence[]
  supportedClaimIds: string[]
  conflictedClaimIds?: string[]
  usage?: { inputTokens?: number; outputTokens?: number; estimatedCredits?: number }
  diagnostics?: Record<string, unknown>
}

export function normalizeAgentBudget(value: Partial<AgentBudget> = {}): AgentBudget {
  const clamp = (candidate: number | undefined, fallback: number, ceiling: number) =>
    Math.max(1, Math.min(ceiling, Number.isFinite(candidate) ? Math.round(candidate as number) : fallback))
  return {
    maxRounds: clamp(value.maxRounds, 3, 3),
    maxToolCalls: clamp(value.maxToolCalls, 6, 6),
    maxLatencyMs: clamp(value.maxLatencyMs, 15_000, 15_000),
    maxInputTokens: clamp(value.maxInputTokens, 20_000, 20_000),
    maxOutputTokens: clamp(value.maxOutputTokens, 2_000, 2_000),
    maxEstimatedCredits: clamp(value.maxEstimatedCredits, 50, 50),
  }
}

export function normalizeAgentPlan(value: unknown): AgentPlan | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const decision = record.decision
  if (!['research', 'direct', 'clarify', 'refuse', 'no_info'].includes(String(decision))) return null
  if (!Array.isArray(record.claims) || record.claims.length === 0) return null
  const claims = record.claims.map(normalizeClaim).filter((claim): claim is AtomicAgentClaim => Boolean(claim))
  if (claims.length !== record.claims.length || new Set(claims.map((claim) => claim.id)).size !== claims.length) return null
  const steps = (Array.isArray(record.steps) ? record.steps : []).map(normalizeStep).filter((step): step is AgentPlanStep => Boolean(step))
  if (new Set(steps.map((step) => step.id)).size !== steps.length) return null
  const claimIds = new Set(claims.map((claim) => claim.id))
  const stepIds = new Set(steps.map((step) => step.id))
  if (steps.some((step) => step.claimIds.some((id) => !claimIds.has(id)) || step.dependsOn.some((id) => !stepIds.has(id)))) return null
  const clarification = normalizeClarification(record.clarification)
  if (decision === 'clarify' && !clarification) return null
  return {
    decision: decision as AgentDecision,
    claims,
    steps,
    stopConditions: readStringArray(record.stopConditions ?? record.stop_conditions, 8, 80),
    ...(clarification ? { clarification } : {}),
    ...(readString(record.reason, 240) ? { reason: readString(record.reason, 240) } : {}),
    ...(typeof record.confidence === 'number' ? { confidence: Math.max(0, Math.min(1, record.confidence)) } : {}),
  }
}
```

Implement `readString`, `readStringArray`, `normalizeClaim`, `normalizeStep`, and `normalizeClarification` as private functions in the same file. `normalizeClaim` sets status to `unresolved`; string readers collapse whitespace and enforce the limits passed above; `normalizeClarification` accepts exactly one non-empty question and at least one normalized missing-slot value.

- [ ] **Step 4: Run contract tests**

Run: `npm test -- --run src/lib/ai/agent/contracts.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the contracts**

```bash
git add src/lib/ai/agent/contracts.ts src/lib/ai/agent/contracts.test.ts
git commit -m "feat(phase-3): add internal agent contracts"
```

### Task 2: Build the Internal Tool Registry

**Files:**
- Create: `src/lib/ai/agent/tool-registry.ts`
- Create: `src/lib/ai/agent/tool-registry.test.ts`

- [ ] **Step 1: Write failing registry boundary tests**

```ts
import { describe, expect, it } from 'vitest'
import { createInternalAgentToolRegistry } from './tool-registry'

describe('internal agent tool registry', () => {
  it('rejects external network capabilities', () => {
    expect(() => createInternalAgentToolRegistry([{
      name: 'web.search',
      description: 'Search the public internet',
      capability: 'external_search',
      sourceGroups: ['external_web'],
      execute: async () => ({ tool: 'web.search', status: 'empty', evidence: [], supportedClaimIds: [] }),
    }])).toThrow('External agent tools are not allowed')
  })

  it('rejects duplicate tool names', () => {
    const tool = {
      name: 'internal.catalog',
      description: 'Read approved structured facts',
      capability: 'structured_fact',
      sourceGroups: ['structured_catalog'],
      execute: async () => ({ tool: 'internal.catalog', status: 'empty' as const, evidence: [], supportedClaimIds: [] }),
    }
    expect(() => createInternalAgentToolRegistry([tool, tool])).toThrow('Duplicate agent tool')
  })
})
```

- [ ] **Step 2: Verify the tests fail**

Run: `npm test -- --run src/lib/ai/agent/tool-registry.test.ts`

Expected: FAIL because the registry module is missing.

- [ ] **Step 3: Implement the registry**

```ts
import type { AgentRequest, AgentToolResult } from './contracts'

export type InternalAgentTool = {
  name: `internal.${string}`
  description: string
  capability: string
  sourceGroups: string[]
  costClass?: 'free' | 'low' | 'medium' | 'high'
  canRunInParallel?: boolean
  execute: (input: {
    request: AgentRequest
    args: Record<string, unknown>
    claimIds: string[]
    signal: AbortSignal
  }) => Promise<AgentToolResult>
}

export function createInternalAgentToolRegistry(tools: InternalAgentTool[]) {
  const map = new Map<string, InternalAgentTool>()
  for (const tool of tools) {
    if (!tool.name.startsWith('internal.') || tool.sourceGroups.includes('external_web')) {
      throw new Error('External agent tools are not allowed')
    }
    if (map.has(tool.name)) throw new Error(`Duplicate agent tool: ${tool.name}`)
    map.set(tool.name, tool)
  }
  return {
    get: (name: string) => map.get(name),
    descriptors: () => Array.from(map.values()).map(({ execute: _execute, ...descriptor }) => descriptor),
    names: () => Array.from(map.keys()),
  }
}
```

Add a `validateSourceGroups(request, tool)` check that rejects execution when a tool's requested source groups are outside `request.sourcePolicy.allowedSourceGroups`.

- [ ] **Step 4: Run registry tests**

Run: `npm test -- --run src/lib/ai/agent/tool-registry.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the registry**

```bash
git add src/lib/ai/agent/tool-registry.ts src/lib/ai/agent/tool-registry.test.ts
git commit -m "feat(phase-3): add internal agent tool registry"
```

### Task 3: Implement the Typed Evidence Graph

**Files:**
- Create: `src/lib/ai/agent/evidence-graph.ts`
- Create: `src/lib/ai/agent/evidence-graph.test.ts`

- [ ] **Step 1: Write failing evidence graph tests**

```ts
import { describe, expect, it } from 'vitest'
import { createAgentEvidenceGraph } from './evidence-graph'

describe('agent evidence graph', () => {
  it('resolves one claim while leaving another unresolved', () => {
    const graph = createAgentEvidenceGraph([
      { id: 'fee', question: 'What is the fee?', requiredEvidence: 'exact_value', risk: 'high', status: 'unresolved' },
      { id: 'duration', question: 'How long is it?', requiredEvidence: 'direct', risk: 'low', status: 'unresolved' },
    ])
    graph.addToolResult('step-1', { tool: 'internal.table', status: 'success', evidence: [{ id: 'e1', sourceId: 'table-1', structuredValue: 720000 }], supportedClaimIds: ['fee'] })
    expect(graph.summary().supportedClaimIds).toEqual(['fee'])
    expect(graph.summary().unresolvedClaimIds).toEqual(['duration'])
  })

  it('marks a claim conflicted when two authoritative values disagree', () => {
    const graph = createAgentEvidenceGraph([{ id: 'fee', question: 'Fee?', requiredEvidence: 'exact_value', risk: 'high', status: 'unresolved' }])
    graph.addToolResult('a', { tool: 'internal.table', status: 'success', evidence: [{ id: 'e1', sourceId: 'a', authority: 100, structuredValue: 720000 }], supportedClaimIds: ['fee'] })
    graph.addToolResult('b', { tool: 'internal.file_search', status: 'success', evidence: [{ id: 'e2', sourceId: 'b', authority: 100, structuredValue: 700000 }], supportedClaimIds: ['fee'], conflictedClaimIds: ['fee'] })
    expect(graph.summary().conflictedClaimIds).toEqual(['fee'])
  })
})
```

- [ ] **Step 2: Verify failure**

Run: `npm test -- --run src/lib/ai/agent/evidence-graph.test.ts`

Expected: FAIL because the graph module is missing.

- [ ] **Step 3: Implement append-only graph operations**

Create maps for claims/evidence and arrays for support edges, conflict edges, and attempts. Deduplicate evidence by `sourceId + quote + structuredValue`, reject unknown claim ids, and expose only these operations:

```ts
export type AgentEvidenceGraph = {
  addToolResult(stepId: string, result: AgentToolResult): void
  markUnsupported(claimIds: string[], reason: string): void
  hasSuccessfulAttempt(stepId: string): boolean
  summary(): {
    supportedClaimIds: string[]
    unresolvedClaimIds: string[]
    conflictedClaimIds: string[]
    unsupportedClaimIds: string[]
    attemptCount: number
  }
  snapshot(): AgentEvidenceGraphSnapshot
}
```

Never overwrite an evidence node or delete an attempt. A conflict must take precedence over supported status until a verifier resolves it through source authority.

- [ ] **Step 4: Run graph tests**

Run: `npm test -- --run src/lib/ai/agent/evidence-graph.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the graph**

```bash
git add src/lib/ai/agent/evidence-graph.ts src/lib/ai/agent/evidence-graph.test.ts
git commit -m "feat(phase-3): add claim evidence graph"
```

### Task 4: Add the Generic LLM Tool Planner

**Files:**
- Create: `src/lib/ai/agent/planner.ts`
- Create: `src/lib/ai/agent/planner.test.ts`

- [ ] **Step 1: Write failing planner tests**

```ts
import { describe, expect, it, vi } from 'vitest'
import { planInternalAgentTurn } from './planner'

describe('internal agent planner', () => {
  it('receives history, typed state, behavior policy, and only registered tools', async () => {
    const createCompletion = vi.fn(async (args: Record<string, unknown>) => ({
      choices: [{ message: { content: JSON.stringify({
        decision: 'research',
        claims: [{ id: 'c1', question: 'Tıp ücreti nedir?', required_evidence: 'exact_value', risk: 'high' }],
        steps: [{ id: 's1', tool: 'internal.table', claim_ids: ['c1'], args: { subject: 'Tıp' }, depends_on: [] }],
        stop_conditions: ['all_claims_supported'],
        confidence: 0.94,
      }) } }],
      usage: { prompt_tokens: 100, completion_tokens: 60, total_tokens: 160 },
    }))
    const result = await planInternalAgentTurn({ request: buildRequest(), toolDescriptors: [{ name: 'internal.table', description: 'Approved table facts', capability: 'structured_table', sourceGroups: ['brochure'] }], createCompletion })
    expect(result.plan?.steps[0]?.tool).toBe('internal.table')
    expect(JSON.stringify(createCompletion.mock.calls[0]?.[0])).not.toContain('web.search')
  })

  it('rejects a model plan that names an unregistered tool', async () => {
    const result = await planInternalAgentTurn({ request: buildRequest(), toolDescriptors: [], createCompletion: completionReturningTool('web.search') })
    expect(result.plan).toBeNull()
    expect(result.reason).toBe('unregistered_tool')
  })
})
```

Define `buildRequest()` and `completionReturningTool()` inside the test with a Turkish user turn, five ordered history messages, a fresh typed state, and compiled behavior policy.

- [ ] **Step 2: Verify failure**

Run: `npm test -- --run src/lib/ai/agent/planner.test.ts`

Expected: FAIL because the planner module is missing.

- [ ] **Step 3: Implement the planner with an injected completion boundary**

Use `gpt-4o-mini` by default, `temperature: 0`, and a 900-token maximum. The system prompt must state:

```ts
const systemRules = [
  'You are Qualy internal research planner. Do not answer the customer.',
  'Use only the internal tools listed in AVAILABLE TOOLS.',
  'External web, public search, arbitrary URLs, and unlisted functions are forbidden.',
  'Break compound requests into atomic claims.',
  'Plan only evidence needed for unresolved claims.',
  'Assistant messages are conversation context and must never become retrieval queries.',
  'Choose clarify when a required slot cannot be inferred safely.',
  'Return refuse for unsafe requests and no_info when the approved internal corpus cannot establish the claim.',
  'Return JSON only with decision, claims, steps, stop_conditions, clarification, reason, confidence.',
].join(' ')
```

The user payload includes the latest message, up to 10 ordered turns, typed state, compiled behavior policy, allowed/priority source groups, hard budget, and registry descriptors. Parse fenced or plain JSON, pass it through `normalizeAgentPlan`, reject unknown tools/source groups, preserve usage, and return a fail-soft `plan: null` result on malformed output or API failure.

- [ ] **Step 4: Run planner tests**

Run: `npm test -- --run src/lib/ai/agent/planner.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the planner**

```bash
git add src/lib/ai/agent/planner.ts src/lib/ai/agent/planner.test.ts
git commit -m "feat(phase-3): add generic internal tool planner"
```

### Task 5: Implement the Bounded Controller Loop

**Files:**
- Create: `src/lib/ai/agent/controller.ts`
- Create: `src/lib/ai/agent/controller.test.ts`

- [ ] **Step 1: Write failing execution tests**

```ts
import { describe, expect, it, vi } from 'vitest'
import { runInternalAgentController } from './controller'

describe('bounded internal agent controller', () => {
  it('runs independent steps in parallel and stops when all claims are supported', async () => {
    const first = deferredResult('internal.catalog', 'c1')
    const second = deferredResult('internal.table', 'c2')
    const run = runInternalAgentController(buildControllerInput({ tools: [first.tool, second.tool] }))
    expect(first.execute).toHaveBeenCalledTimes(1)
    expect(second.execute).toHaveBeenCalledTimes(1)
    first.resolve()
    second.resolve()
    const result = await run
    expect(result.decision).toBe('answer')
    expect(result.trace.rounds).toBe(1)
  })

  it('never executes the same tool with identical arguments twice', async () => {
    const tool = successfulTool('internal.catalog', [])
    const result = await runInternalAgentController(buildControllerInput({ tools: [tool], repeatedPlan: true }))
    expect(tool.execute).toHaveBeenCalledTimes(1)
    expect(result.trace.stopReason).toBe('duplicate_tool_call')
  })

  it('stops at the hard round and tool-call ceilings', async () => {
    const result = await runInternalAgentController(buildControllerInput({ alwaysUnresolved: true }))
    expect(result.trace.rounds).toBeLessThanOrEqual(3)
    expect(result.trace.toolCalls).toBeLessThanOrEqual(6)
  })
})
```

- [ ] **Step 2: Verify failure**

Run: `npm test -- --run src/lib/ai/agent/controller.test.ts`

Expected: FAIL because the controller module is missing.

- [ ] **Step 3: Implement the loop**

Define the controller boundary in `controller.ts` before the function:

```ts
type AgentPlannerResult = {
  plan: AgentPlan | null
  reason: string
  usage?: { inputTokens?: number; outputTokens?: number; estimatedCredits?: number }
}

type AgentVerifierResult = {
  decision: 'answer' | 'retry' | 'clarify' | 'refuse' | 'no_info'
  reason: string
}

export type ControllerInput = {
  request: AgentRequest
  registry: ReturnType<typeof createInternalAgentToolRegistry>
  plan: (input: {
    request: AgentRequest
    graph: AgentEvidenceGraphSnapshot
    toolDescriptors: ReturnType<ReturnType<typeof createInternalAgentToolRegistry>['descriptors']>
  }) => Promise<AgentPlannerResult>
  verify: (graph: AgentEvidenceGraphSnapshot, plan: AgentPlan) => AgentVerifierResult
}

export type ControllerResult = {
  decision: 'answer' | 'clarify' | 'refuse' | 'no_info'
  plan?: AgentPlan
  evidence: AgentEvidenceGraphSnapshot
  trace: {
    rounds: number
    toolCalls: number
    stopReason: string
  }
}
```

```ts
export async function runInternalAgentController(input: ControllerInput): Promise<ControllerResult> {
  const startedAt = Date.now()
  const graph = createAgentEvidenceGraph([])
  const callKeys = new Set<string>()
  let toolCalls = 0

  for (let round = 1; round <= input.request.budget.maxRounds; round += 1) {
    if (Date.now() - startedAt >= input.request.budget.maxLatencyMs) {
      return finish('no_info', 'latency_budget', graph, round - 1, toolCalls)
    }
    const planned = await input.plan({
      request: input.request,
      graph: graph.snapshot(),
      toolDescriptors: input.registry.descriptors(),
    })
    if (!planned.plan) return finish('no_info', planned.reason, graph, round - 1, toolCalls)
    if (planned.plan.decision !== 'research') {
      return finish(planned.plan.decision, planned.plan.reason ?? planned.plan.decision, graph, round, toolCalls, planned.plan)
    }

    const ready = planned.plan.steps.filter((step) => step.dependsOn.every((id) => graph.hasSuccessfulAttempt(id)))
    const executions = ready.map(async (step) => {
      const key = `${step.tool}:${stableJson(step.args)}`
      if (callKeys.has(key)) return { duplicate: true as const, step }
      if (toolCalls >= input.request.budget.maxToolCalls) return { budget: true as const, step }
      callKeys.add(key)
      toolCalls += 1
      return { step, result: await executeWithDeadline(input.registry, input.request, step, startedAt) }
    })
    const results = await Promise.all(executions)
    for (const execution of results) {
      if ('result' in execution) graph.addToolResult(execution.step.id, execution.result)
    }
    const verdict = input.verify(graph.snapshot(), planned.plan)
    if (verdict.decision !== 'retry') return finish(verdict.decision, verdict.reason, graph, round, toolCalls, planned.plan)
  }
  return finish('no_info', 'round_budget', graph, input.request.budget.maxRounds, toolCalls)
}
```

Add these helpers in the same module so later tasks do not depend on undeclared behavior:

```ts
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

async function executeWithDeadline(
  registry: ReturnType<typeof createInternalAgentToolRegistry>,
  request: AgentRequest,
  step: AgentPlanStep,
  startedAt: number
) {
  const tool = registry.get(step.tool)
  if (!tool) return { tool: step.tool, status: 'error' as const, evidence: [], supportedClaimIds: [], diagnostics: { reason: 'unregistered_tool' } }
  const remainingMs = Math.max(1, request.budget.maxLatencyMs - (Date.now() - startedAt))
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), remainingMs)
  try {
    return await tool.execute({ request, args: step.args, claimIds: step.claimIds, signal: controller.signal })
  } catch (error) {
    return { tool: step.tool, status: controller.signal.aborted ? 'timeout' as const : 'error' as const, evidence: [], supportedClaimIds: [], diagnostics: { reason: error instanceof Error ? error.message : 'tool_error' } }
  } finally {
    clearTimeout(timeout)
  }
}

function finish(
  decision: 'answer' | 'clarify' | 'refuse' | 'no_info',
  stopReason: string,
  graph: AgentEvidenceGraph,
  rounds: number,
  toolCalls: number,
  plan?: AgentPlan
): ControllerResult {
  return {
    decision,
    plan,
    evidence: graph.snapshot(),
    trace: { rounds, toolCalls, stopReason },
  }
}
```

Combine token/credit usage after every planner/tool call and return verified partial claim ids when budget expires. A tool failure records an attempt and does not throw out successful sibling results.

- [ ] **Step 4: Run controller tests**

Run: `npm test -- --run src/lib/ai/agent/controller.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the controller**

```bash
git add src/lib/ai/agent/controller.ts src/lib/ai/agent/controller.test.ts
git commit -m "feat(phase-3): add bounded internal agent loop"
```

### Task 6: Add Shadow Trace Observation and Comparison

**Files:**
- Create: `src/lib/ai/agent/shadow.ts`
- Create: `src/lib/ai/agent/shadow.test.ts`
- Modify: `src/lib/knowledge-base/rag-eval/types.ts`

- [ ] **Step 1: Write failing shadow tests**

```ts
import { describe, expect, it, vi } from 'vitest'
import { compareAgentPlanWithObservedTrace, runInternalAgentShadow } from './shadow'

describe('internal agent shadow mode', () => {
  it('detects a planned tool omitted by the current pipeline', () => {
    expect(compareAgentPlanWithObservedTrace({
      plannedTools: ['internal.table', 'internal.claim_verifier'],
      observedTools: ['internal.table'],
    }).missingPlannedTools).toEqual(['internal.claim_verifier'])
  })

  it('fails open without changing the current answer', async () => {
    const current = { answer: 'Mevcut güvenli cevap', citations: [] }
    const result = await runInternalAgentShadow({ current, runPlanner: vi.fn(async () => { throw new Error('planner down') }) })
    expect(result.current).toBe(current)
    expect(result.shadow.status).toBe('error')
  })
})
```

- [ ] **Step 2: Verify failure**

Run: `npm test -- --run src/lib/ai/agent/shadow.test.ts`

Expected: FAIL because the shadow module is missing.

- [ ] **Step 3: Implement canary flags and trace comparison**

Export this stable diagnostic contract from `shadow.ts` and reference it from RAG/provider metadata types:

```ts
export type InternalAgentShadowDiagnostics = {
  status: 'completed' | 'error' | 'skipped'
  reason?: string
  plannedDecision?: string
  observedDecision?: string
  plannedTools: string[]
  observedTools: string[]
  missingPlannedTools: string[]
  extraObservedTools: string[]
  claimCount: number
  plannerConfidence?: number
  durationMs: number
  inputTokens?: number
  outputTokens?: number
  estimatedCredits?: number
}
```

Use these exact controls:

```ts
export function isInternalAgentShadowEnabled(organizationId: string) {
  if (process.env.INTERNAL_AGENT_SHADOW !== '1') return false
  const allowlist = (process.env.INTERNAL_AGENT_SHADOW_ORG_IDS ?? '')
    .split(',').map((value) => value.trim()).filter(Boolean)
  return allowlist.length === 0 || allowlist.includes(organizationId)
}
```

Map existing diagnostics to canonical observed tools:

- `catalog_direct` -> `internal.catalog`
- `brochure_table_fact` -> `internal.table`
- research blackboard attempt -> `internal.file_search`
- `claimLedger` or `universalClaimLedger` -> `internal.claim_verifier`
- clarification -> `internal.typed_state`
- presentation polish -> `internal.presenter`
- matched Skill metadata -> `internal.skill`
- current Supabase RAG metadata -> `internal.hybrid_retrieval`

Return status, planned/observed tools, missing tools, extra observed tools, claim count, planner confidence, duration, usage, and error reason. Add the same shape to `RagProviderResult.diagnostics.internalAgentShadow`.

- [ ] **Step 4: Run shadow tests and RAG type tests**

Run: `npm test -- --run src/lib/ai/agent/shadow.test.ts src/lib/knowledge-base/rag-eval/openai-file-search-validated.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit shadow comparison**

```bash
git add src/lib/ai/agent/shadow.ts src/lib/ai/agent/shadow.test.ts src/lib/knowledge-base/rag-eval/types.ts
git commit -m "feat(phase-3): add internal agent shadow diagnostics"
```

### Task 7: Shadow the Validated File Search Provider

**Files:**
- Modify: `src/lib/knowledge-base/rag-eval/openai-file-search-validated.ts`
- Modify: `src/lib/knowledge-base/rag-eval/openai-file-search-validated.test.ts`

- [ ] **Step 1: Add failing answer-parity tests**

Add two tests around the existing exported provider:

```ts
it('attaches internal agent shadow diagnostics without changing the validated answer', async () => {
  process.env.INTERNAL_AGENT_SHADOW = '1'
  process.env.INTERNAL_AGENT_SHADOW_ORG_IDS = 'org-1'
  const result = await runOpenAiFileSearchValidatedQuestion(buildInput({ organizationId: 'org-1' }))
  expect(result.answer).toBe('Tıp Fakültesi ücreti 720.000 TL\n\nhttps://example.edu/source')
  expect(result.citations).toEqual(expectedCitations)
  expect(result.diagnostics?.internalAgentShadow?.status).toBe('completed')
})

it('returns the original validated result when shadow planning fails', async () => {
  const result = await runOpenAiFileSearchValidatedQuestion(buildInput({ shadowCreateCompletion: rejectingCompletion }))
  expect(result.answer).toBe(expectedAnswer)
  expect(result.diagnostics?.internalAgentShadow?.status).toBe('error')
})
```

- [ ] **Step 2: Run the focused tests and verify failure**

Run: `npm test -- --run src/lib/knowledge-base/rag-eval/openai-file-search-validated.test.ts`

Expected: FAIL because shadow diagnostics are not attached.

- [ ] **Step 3: Wrap the existing provider without touching internal return branches**

Rename the current function to `runOpenAiFileSearchValidatedQuestionCurrent`. Add a new exported wrapper:

```ts
export async function runOpenAiFileSearchValidatedQuestion(input: OpenAiFileSearchValidatedQuestionInput) {
  const current = await runOpenAiFileSearchValidatedQuestionCurrent(input)
  if (!input.organizationId || !isInternalAgentShadowEnabled(input.organizationId)) return current
  const shadow = await observeValidatedFileSearchAgentPlan({ input, current })
  return {
    ...current,
    diagnostics: {
      ...current.diagnostics,
      internalAgentShadow: shadow,
    },
  }
}
```

Extend `OpenAiFileSearchValidatedQuestionInput` with optional `organizationId`, `conversationId`, `channel`, and `shadowCreateCompletion`. Build the shadow request from existing history, pending/typed state, settings-derived behavior policy, source priority groups, and current result diagnostics. The wrapper must not add shadow usage to customer-billed `result.usage` during the comparison period; record it only inside shadow diagnostics.

- [ ] **Step 4: Run validated provider regression tests**

Run: `npm test -- --run src/lib/knowledge-base/rag-eval/openai-file-search-validated.test.ts`

Expected: PASS with identical answer/citation expectations.

- [ ] **Step 5: Commit provider shadow mode**

```bash
git add src/lib/knowledge-base/rag-eval/openai-file-search-validated.ts src/lib/knowledge-base/rag-eval/openai-file-search-validated.test.ts
git commit -m "feat(phase-3): shadow agent plans in validated file search"
```

### Task 8: Add Shared Inbound and Simulator Shadow Hooks

**Files:**
- Modify: `src/lib/channels/inbound-ai-pipeline.ts`
- Modify: `src/lib/channels/inbound-ai-pipeline.test.ts`
- Modify: `src/lib/chat/actions.ts`
- Modify: `src/lib/chat/actions.test.ts`

- [ ] **Step 1: Add failing shared-pipeline parity tests**

```ts
it('stores agent shadow metadata without delaying or rewriting the outbound reply', async () => {
  process.env.INTERNAL_AGENT_SHADOW = '1'
  process.env.INTERNAL_AGENT_SHADOW_ORG_IDS = 'org-1'
  await processInboundAiPipeline(buildInput(supabase, sendOutbound, { organizationId: 'org-1' }))
  expect(sendOutbound).toHaveBeenCalledWith('Mevcut cevap')
  expect(insertedBotMessage.metadata.internal_agent_shadow.status).toBe('completed')
})

it('still sends the current reply when shadow planning rejects', async () => {
  shadowPlannerMock.mockRejectedValueOnce(new Error('planner unavailable'))
  await processInboundAiPipeline(buildInput(supabase, sendOutbound))
  expect(sendOutbound).toHaveBeenCalledTimes(1)
  expect(insertedBotMessage.metadata.internal_agent_shadow.status).toBe('error')
})
```

Add simulator parity coverage that checks `response`, `matchedSkill`, and token usage are unchanged while optional `agentShadow` diagnostics are present.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npm test -- --run src/lib/channels/inbound-ai-pipeline.test.ts src/lib/chat/actions.test.ts`

Expected: FAIL because no shadow hooks exist.

- [ ] **Step 3: Attach shadow observation at shared finalization boundaries**

In `persistBotMessage`, compute shadow metadata only for text bot replies when the canary flag is enabled. Use `options.text`, ordered history when loaded, compiled `aiSettings`, channel, organization/conversation ids, and the current response metadata. Do not observe image placeholders or provider delivery-status rows. Catch every shadow exception and persist `{ status: 'error', reason: 'shadow_runner_error' }`.

In `simulateChat`, route each return through:

```ts
async function withSimulatorAgentShadow(input: {
  organizationId: string
  message: string
  history: ConversationTurn[]
  response: SimulationResponse
  aiSettings: Awaited<ReturnType<typeof getOrgAiSettings>>
}) {
  if (!isInternalAgentShadowEnabled(input.organizationId)) return input.response
  const agentShadow = await observeSimulatorAgentPlan(input)
  return { ...input.response, agentShadow }
}
```

Add `agentShadow?: InternalAgentShadowDiagnostics` to `SimulationResponse`. Shadow work must remain disabled by default and must never change response text, buttons, images, handover state, delivery ordering, or customer-billed token usage.

- [ ] **Step 4: Run mandatory follow-up and guard regressions plus channel tests**

Run:

```bash
npm test -- --run src/lib/channels/inbound-ai-pipeline.test.ts src/lib/chat/actions.test.ts
npm test -- --run src/lib/ai/followup.test.ts
npm test -- --run src/lib/ai/response-guards.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit shared shadow hooks**

```bash
git add src/lib/channels/inbound-ai-pipeline.ts src/lib/channels/inbound-ai-pipeline.test.ts src/lib/chat/actions.ts src/lib/chat/actions.test.ts
git commit -m "feat(phase-3): shadow agent plans across customer reply paths"
```

### Task 9: Add the Shadow Quality Report

**Files:**
- Create: `scripts/knowledge/report-agent-shadow.ts`
- Create: `scripts/knowledge/report-agent-shadow.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write failing report aggregation tests**

```ts
import { describe, expect, it } from 'vitest'
import { summarizeAgentShadowTraces } from './report-agent-shadow'

describe('agent shadow report', () => {
  it('groups agreement, missing tools, planner failures, latency, and cost', () => {
    const summary = summarizeAgentShadowTraces([
      { status: 'completed', plannedTools: ['internal.table'], observedTools: ['internal.table'], durationMs: 120, estimatedCredits: 1 },
      { status: 'completed', plannedTools: ['internal.catalog'], observedTools: ['internal.file_search'], durationMs: 300, estimatedCredits: 2 },
      { status: 'error', reason: 'planner_error', plannedTools: [], observedTools: [], durationMs: 20, estimatedCredits: 0 },
    ])
    expect(summary.total).toBe(3)
    expect(summary.exactToolAgreement).toBe(1)
    expect(summary.errors).toBe(1)
    expect(summary.averageDurationMs).toBeCloseTo(146.67, 1)
  })
})
```

- [ ] **Step 2: Verify failure**

Run: `npm test -- --run scripts/knowledge/report-agent-shadow.test.ts`

Expected: FAIL because the report module is missing.

- [ ] **Step 3: Implement JSON/Markdown reporting**

Accept a JSON array or JSONL input containing `internal_agent_shadow` / `internalAgentShadow`. Report:

- Total/completed/error/skipped traces
- Exact tool-set agreement
- Missing and extra tool frequency
- Decision agreement when available
- Planned claim count and unresolved-claim frequency
- Average/p50/p95 shadow latency
- Input/output tokens and estimated shadow credits
- Breakdown by channel, response kind, and current route

Add this package command:

```json
"agent:shadow:report": "npx tsx scripts/knowledge/report-agent-shadow.ts"
```

The CLI usage is `npm run agent:shadow:report -- --input tmp/agent-shadow.json --output tmp/agent-shadow-report.md` and exits non-zero only for malformed input, not for low agreement.

- [ ] **Step 4: Run report tests**

Run: `npm test -- --run scripts/knowledge/report-agent-shadow.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit reporting**

```bash
git add scripts/knowledge/report-agent-shadow.ts scripts/knowledge/report-agent-shadow.test.ts package.json
git commit -m "feat(phase-3): add agent shadow quality report"
```

### Task 10: Run the Foundation Acceptance Gate and Update Documentation

**Files:**
- Modify: `docs/PRD.md`
- Modify: `docs/ROADMAP.md`
- Modify: `docs/RELEASE.md`
- Create: `docs/evaluations/internal-agent-shadow-foundation-2026-06-11.md`

- [ ] **Step 1: Run all new agent tests**

Run:

```bash
npm test -- --run \
  src/lib/ai/agent/contracts.test.ts \
  src/lib/ai/agent/tool-registry.test.ts \
  src/lib/ai/agent/evidence-graph.test.ts \
  src/lib/ai/agent/planner.test.ts \
  src/lib/ai/agent/controller.test.ts \
  src/lib/ai/agent/shadow.test.ts \
  scripts/knowledge/report-agent-shadow.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run integration and mandatory regression tests**

Run:

```bash
npm test -- --run \
  src/lib/knowledge-base/rag-eval/openai-file-search-validated.test.ts \
  src/lib/channels/inbound-ai-pipeline.test.ts \
  src/lib/chat/actions.test.ts \
  src/lib/ai/followup.test.ts \
  src/lib/ai/response-guards.test.ts
```

Expected: PASS with no changed answer snapshots unless a test explicitly checks new metadata.

- [ ] **Step 3: Run a 30-case local shadow smoke**

Use 10 direct facts, 10 compound/multi-hop questions, and 10 clarification/follow-up/off-topic/safety cases from the existing evaluation fixtures. Enable shadow only for the test organization:

```bash
test -n "$AGENT_SHADOW_TEST_ORG_ID"
INTERNAL_AGENT_SHADOW=1 \
INTERNAL_AGENT_SHADOW_ORG_IDS="$AGENT_SHADOW_TEST_ORG_ID" \
npm run rag:eval -- --provider file-search-validated --cases tmp/agent-shadow-30-cases.json --out tmp/agent-shadow
```

Export the 30 `internalAgentShadow` diagnostics to `tmp/agent-shadow/traces.json`, then run:

```bash
npm run agent:shadow:report -- \
  --input tmp/agent-shadow/traces.json \
  --output tmp/agent-shadow/report.md
```

Acceptance criteria:

- 30/30 current answers and citations remain byte-for-byte unchanged with shadow on versus off.
- 0 external or unregistered tools are planned.
- 0 duplicate tool+argument plans survive plan validation.
- 0 shadow errors affect customer output.
- Every compound question contains at least two atomic claims or an explicit planner reason why only one claim is needed.
- Planner/observed tool agreement and p95 latency are recorded, not guessed.

- [ ] **Step 4: Write the durable evaluation report**

Create `docs/evaluations/internal-agent-shadow-foundation-2026-06-11.md` using the exact generated metrics. The report must contain these sections and must not contain blank metric cells:

```md
# Internal Agent Shadow Foundation Evaluation

## Scope
- 30 cases: 10 direct, 10 compound, 10 clarification/boundary
- Shadow mode only; customer answers remained owned by the current pipeline

## Results
| Metric | Result |
|---|---:|
| Answer/citation parity | 30/30 |
| External tool plans | 0 |
| Duplicate calls accepted | 0 |
| Shadow failures affecting replies | 0 |

## Activation Gaps
List the measured missing adapters, planner disagreements, and latency/cost findings that the activation plan must close.
```

Append the generated report's exact agreement, p95 latency, token, credit, and per-channel rows directly below the fixed safety rows.

- [ ] **Step 5: Update product documentation**

In `docs/ROADMAP.md`, mark the foundation/shadow phase complete and add unchecked activation work for real read-only tool adapters, controller-owned verification/presentation, and staged channel activation. Update the `Last Updated` line.

In `docs/PRD.md`, record that shadow diagnostics are non-customer-facing and non-billable during comparison, and that activation requires answer parity plus no external/unregistered plans. Update the `Last Updated` line and Tech Decisions appendix.

In `docs/RELEASE.md`, add the shipped contracts, registry, evidence graph, planner, bounded controller, shadow integrations, and evaluation artifact under `[Unreleased]`.

- [ ] **Step 6: Run full project verification**

Run:

```bash
npm run lint
npm run build
```

Expected: both commands exit 0.

- [ ] **Step 7: Commit the verified foundation**

```bash
git add docs/PRD.md docs/ROADMAP.md docs/RELEASE.md docs/evaluations/internal-agent-shadow-foundation-2026-06-11.md
git commit -m "docs: record internal agent shadow foundation"
```

## Follow-On Plan Trigger

After this plan passes its shadow acceptance gate, write a separate activation plan that:

1. Extracts real read-only adapters for Skill, catalog, table, hybrid retrieval, and approved-corpus File Search.
2. Makes the controller own claim verification while current answer generation remains the rollback path.
3. Makes the controller own final decision and presentation first in Simulator and Demo Chat.
4. Activates the shared inbound path for WhatsApp, Instagram, and Telegram by organization canary.
5. Removes bypasses only after quality, latency, cost, and rollback gates pass.
