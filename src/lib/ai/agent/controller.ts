import type {
  AgentPlan,
  AgentPlanStep,
  AgentRequest,
  AgentToolResult,
  AtomicAgentClaim,
} from './contracts'
import {
  createAgentEvidenceGraph,
  type AgentEvidenceGraph,
  type AgentEvidenceGraphSnapshot,
} from './evidence-graph'
import { createInternalAgentToolRegistry } from './tool-registry'

type AgentUsage = {
  inputTokens: number
  outputTokens: number
  estimatedCredits: number
}

type AgentPlannerResult = {
  plan: AgentPlan | null
  reason: string
  usage?: {
    inputTokens?: number
    outputTokens?: number
    estimatedCredits?: number
  }
}

type InternalAgentToolRegistry = ReturnType<typeof createInternalAgentToolRegistry>
type InternalAgentToolDescriptors = ReturnType<InternalAgentToolRegistry['descriptors']>

export type AgentVerifierResult = {
  decision: 'answer' | 'retry' | 'clarify' | 'refuse' | 'no_info'
  reason: string
  unsupportedClaimIds?: string[]
}

export type ControllerInput = {
  request: AgentRequest
  registry: InternalAgentToolRegistry
  plan: (input: {
    request: AgentRequest
    graph: AgentEvidenceGraphSnapshot
    descriptors: InternalAgentToolDescriptors
  }) => Promise<AgentPlannerResult>
  verify: (
    graph: AgentEvidenceGraphSnapshot,
    plan: AgentPlan
  ) => AgentVerifierResult | Promise<AgentVerifierResult>
}

export type ControllerResult = {
  decision: 'answer' | 'clarify' | 'refuse' | 'no_info'
  plan?: AgentPlan
  evidence: AgentEvidenceGraphSnapshot
  usage: AgentUsage
  verifiedPartialClaimIds: string[]
  trace: {
    rounds: number
    toolCalls: number
    stopReason: string
    duplicateCallsSkipped: number
    toolErrors: number
  }
}

const ZERO_USAGE: AgentUsage = {
  inputTokens: 0,
  outputTokens: 0,
  estimatedCredits: 0,
}

function cloneValue<T>(value: T): T {
  return value === undefined ? value : structuredClone(value)
}

function usageValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
}

function addUsage(
  total: AgentUsage,
  usage?: { inputTokens?: number; outputTokens?: number; estimatedCredits?: number }
): void {
  total.inputTokens += usageValue(usage?.inputTokens)
  total.outputTokens += usageValue(usage?.outputTokens)
  total.estimatedCredits += usageValue(usage?.estimatedCredits)
}

function exceededUsageBudget(request: AgentRequest, usage: AgentUsage): string | null {
  if (usage.inputTokens > request.budget.maxInputTokens) return 'input_token_budget'
  if (usage.outputTokens > request.budget.maxOutputTokens) return 'output_token_budget'
  if (usage.estimatedCredits > request.budget.maxEstimatedCredits) return 'credit_budget'
  return null
}

function exhaustedUsageBudget(request: AgentRequest, usage: AgentUsage): string | null {
  if (usage.inputTokens >= request.budget.maxInputTokens) return 'input_token_budget'
  if (usage.outputTokens >= request.budget.maxOutputTokens) return 'output_token_budget'
  if (usage.estimatedCredits >= request.budget.maxEstimatedCredits) return 'credit_budget'
  return null
}

function stableJson(value: unknown, ancestors = new Set<object>()): string {
  if (value === null) return 'null'

  switch (typeof value) {
    case 'undefined':
      return 'undefined'
    case 'string':
      return JSON.stringify(value)
    case 'boolean':
      return String(value)
    case 'number':
      if (Number.isNaN(value)) return 'NaN'
      if (value === Infinity) return 'Infinity'
      if (value === -Infinity) return '-Infinity'
      if (Object.is(value, -0)) return '-0'
      return String(value)
    case 'bigint':
      return `${value.toString()}n`
    case 'symbol':
      return `symbol:${String(value.description)}`
    case 'function':
      return `function:${String(value)}`
  }

  if (ancestors.has(value)) throw new Error('Agent plan arguments must not be circular')
  ancestors.add(value)

  let serialized: string
  if (Array.isArray(value)) {
    serialized = `[${value.map((item) => stableJson(item, ancestors)).join(',')}]`
  } else if (value instanceof Date) {
    serialized = JSON.stringify(value.toISOString())
  } else {
    serialized = `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item, ancestors)}`)
      .join(',')}}`
  }

  ancestors.delete(value)
  return serialized
}

function toolCallKey(step: AgentPlanStep): string {
  return `${step.tool}:${stableJson(step.args)}`
}

function comparableClaim(claim: AtomicAgentClaim): AtomicAgentClaim {
  return {
    id: claim.id,
    question: claim.question,
    ...(claim.subject === undefined ? {} : { subject: claim.subject }),
    ...(claim.facet === undefined ? {} : { facet: claim.facet }),
    requiredEvidence: claim.requiredEvidence,
    risk: claim.risk,
    status: claim.status,
  }
}

function claimsMatchInitializedPlan(
  initializedClaims: Map<string, AtomicAgentClaim>,
  claims: AtomicAgentClaim[]
): boolean {
  if (claims.length > initializedClaims.size) return false

  const seen = new Set<string>()
  for (const claim of claims) {
    if (seen.has(claim.id)) return false
    seen.add(claim.id)

    const initialized = initializedClaims.get(claim.id)
    if (
      !initialized ||
      stableJson(comparableClaim(initialized)) !== stableJson(comparableClaim(claim))
    ) {
      return false
    }
  }

  return true
}

function emptySnapshot(): AgentEvidenceGraphSnapshot {
  return createAgentEvidenceGraph([]).snapshot()
}

function timeoutResult(step: AgentPlanStep): AgentToolResult {
  return {
    tool: step.tool,
    status: 'timeout',
    evidence: [],
    supportedClaimIds: [],
    diagnostics: { reason: 'tool_timeout' },
  }
}

function errorResult(step: AgentPlanStep, error: unknown): AgentToolResult {
  return {
    tool: step.tool,
    status: 'error',
    evidence: [],
    supportedClaimIds: [],
    diagnostics: { reason: error instanceof Error ? error.message : 'tool_error' },
  }
}

async function executeWithDeadline(input: {
  registry: InternalAgentToolRegistry
  request: AgentRequest
  step: AgentPlanStep
  startedAt: number
}): Promise<AgentToolResult> {
  const remainingMs = input.request.budget.maxLatencyMs - (Date.now() - input.startedAt)
  if (remainingMs <= 0) return timeoutResult(input.step)

  const controller = new AbortController()
  let timeout: ReturnType<typeof setTimeout> | undefined
  const execution = input.registry
    .execute(input.step.tool, {
      request: cloneValue(input.request),
      args: cloneValue(input.step.args),
      claimIds: [...input.step.claimIds],
      signal: controller.signal,
    })
    .then(
      (value) => ({ kind: 'result' as const, value: cloneValue(value) }),
      (error: unknown) => ({ kind: 'error' as const, error })
    )
  const deadline = new Promise<{ kind: 'timeout' }>((resolve) => {
    timeout = setTimeout(() => {
      controller.abort()
      resolve({ kind: 'timeout' })
    }, remainingMs)
  })

  const settled = await Promise.race([execution, deadline])
  if (timeout) clearTimeout(timeout)

  if (settled.kind === 'timeout') return timeoutResult(input.step)
  if (settled.kind === 'error') {
    return controller.signal.aborted
      ? timeoutResult(input.step)
      : errorResult(input.step, settled.error)
  }
  return settled.value
}

function markVerifierUnsupported(graph: AgentEvidenceGraph, verifier: AgentVerifierResult): void {
  if (!verifier.unsupportedClaimIds?.length) return

  const knownClaimIds = new Set(graph.snapshot().claims.map((claim) => claim.id))
  const supportedIds = verifier.unsupportedClaimIds.filter((claimId) => knownClaimIds.has(claimId))
  if (supportedIds.length > 0) graph.markUnsupported(supportedIds, verifier.reason)
}

function finish(input: {
  decision: ControllerResult['decision']
  stopReason: string
  graph: AgentEvidenceGraph | null
  usage: AgentUsage
  rounds: number
  toolCalls: number
  duplicateCallsSkipped: number
  toolErrors: number
  plan?: AgentPlan
}): ControllerResult {
  const evidence = input.graph?.snapshot() ?? emptySnapshot()
  const supportedClaimIds = evidence.claims
    .filter((claim) => claim.status === 'supported')
    .map((claim) => claim.id)

  return {
    decision: input.decision,
    ...(input.plan === undefined ? {} : { plan: cloneValue(input.plan) }),
    evidence,
    usage: { ...input.usage },
    verifiedPartialClaimIds: supportedClaimIds,
    trace: {
      rounds: input.rounds,
      toolCalls: input.toolCalls,
      stopReason: input.stopReason,
      duplicateCallsSkipped: input.duplicateCallsSkipped,
      toolErrors: input.toolErrors,
    },
  }
}

export async function runInternalAgentController(
  input: ControllerInput
): Promise<ControllerResult> {
  const request = cloneValue(input.request)
  const startedAt = Date.now()
  const usage = { ...ZERO_USAGE }
  const callKeys = new Set<string>()
  let graph: AgentEvidenceGraph | null = null
  let initializedClaims = new Map<string, AtomicAgentClaim>()
  let toolCalls = 0
  let duplicateCallsSkipped = 0
  let toolErrors = 0
  let lastPlan: AgentPlan | undefined
  let rounds = 0

  const finishCurrent = (
    decision: ControllerResult['decision'],
    stopReason: string,
    planValue = lastPlan
  ) =>
    finish({
      decision,
      stopReason,
      graph,
      usage,
      rounds,
      toolCalls,
      duplicateCallsSkipped,
      toolErrors,
      ...(planValue === undefined ? {} : { plan: planValue }),
    })

  for (let round = 1; round <= request.budget.maxRounds; round += 1) {
    rounds = round

    if (Date.now() - startedAt >= request.budget.maxLatencyMs) {
      return finishCurrent('no_info', 'latency_budget')
    }
    if (round > 1) {
      const usageStopReason = exhaustedUsageBudget(request, usage)
      if (usageStopReason) return finishCurrent('no_info', usageStopReason)
    }

    const descriptors = cloneValue(input.registry.descriptors())
    let planned: AgentPlannerResult
    try {
      planned = await input.plan({
        request: cloneValue(request),
        graph: graph?.snapshot() ?? emptySnapshot(),
        descriptors,
      })
    } catch {
      return finishCurrent('no_info', 'planner_error', undefined)
    }

    addUsage(usage, planned.usage)
    if (!planned.plan) return finishCurrent('no_info', planned.reason, undefined)

    const currentPlan = cloneValue(planned.plan)
    if (!graph) {
      graph = createAgentEvidenceGraph(currentPlan.claims)
      initializedClaims = new Map(currentPlan.claims.map((claim) => [claim.id, cloneValue(claim)]))
    } else if (!claimsMatchInitializedPlan(initializedClaims, currentPlan.claims)) {
      return finishCurrent('no_info', 'plan_claim_mismatch')
    }
    lastPlan = currentPlan

    if (Date.now() - startedAt >= request.budget.maxLatencyMs) {
      return finishCurrent('no_info', 'latency_budget')
    }
    const plannerUsageStopReason = exceededUsageBudget(request, usage)
    if (plannerUsageStopReason) {
      return finishCurrent('no_info', plannerUsageStopReason)
    }

    if (
      currentPlan.decision === 'clarify' ||
      currentPlan.decision === 'refuse' ||
      currentPlan.decision === 'no_info'
    ) {
      return finishCurrent(
        currentPlan.decision,
        currentPlan.reason ?? planned.reason ?? currentPlan.decision
      )
    }

    if (currentPlan.decision === 'direct') {
      let verdict: AgentVerifierResult
      try {
        verdict = await input.verify(graph.snapshot(), cloneValue(currentPlan))
      } catch {
        return finishCurrent('no_info', 'verifier_error')
      }
      markVerifierUnsupported(graph, verdict)
      if (verdict.decision !== 'retry') {
        return finishCurrent(verdict.decision, verdict.reason)
      }
      continue
    }

    const readySteps = currentPlan.steps.filter((candidate) =>
      candidate.dependsOn.every((dependencyId) => graph?.hasSuccessfulAttempt(dependencyId))
    )
    if (readySteps.length === 0) {
      return finishCurrent('no_info', 'no_executable_steps')
    }

    const batchKeys = new Set<string>()
    const executableSteps: AgentPlanStep[] = []
    for (const candidate of readySteps) {
      let key: string
      try {
        key = toolCallKey(candidate)
      } catch {
        return finishCurrent('no_info', 'invalid_tool_arguments')
      }

      if (callKeys.has(key) || batchKeys.has(key)) {
        duplicateCallsSkipped += 1
        continue
      }
      batchKeys.add(key)
      executableSteps.push(candidate)
    }

    if (executableSteps.length === 0) {
      return finishCurrent('no_info', 'duplicate_tool_call')
    }

    const remainingSlots = request.budget.maxToolCalls - toolCalls
    if (remainingSlots <= 0) return finishCurrent('no_info', 'tool_call_budget')

    const selectedSteps = executableSteps.slice(0, remainingSlots)
    const callBudgetReached = selectedSteps.length < executableSteps.length
    for (const selectedStep of selectedSteps) {
      callKeys.add(toolCallKey(selectedStep))
    }
    toolCalls += selectedSteps.length

    const results = await Promise.all(
      selectedSteps.map(async (selectedStep) => ({
        step: selectedStep,
        result: await executeWithDeadline({
          registry: input.registry,
          request,
          step: selectedStep,
          startedAt,
        }),
      }))
    )

    for (const execution of results) {
      addUsage(usage, execution.result.usage)
      if (execution.result.status === 'error' || execution.result.status === 'timeout') {
        toolErrors += 1
      }
      graph.addToolResult(execution.step.id, execution.result)
    }

    let verdict: AgentVerifierResult
    try {
      verdict = await input.verify(graph.snapshot(), cloneValue(currentPlan))
    } catch {
      return finishCurrent('no_info', 'verifier_error')
    }
    markVerifierUnsupported(graph, verdict)
    if (verdict.decision !== 'retry') {
      return finishCurrent(verdict.decision, verdict.reason)
    }

    const toolUsageStopReason = exceededUsageBudget(request, usage)
    if (toolUsageStopReason) return finishCurrent('no_info', toolUsageStopReason)
    if (callBudgetReached || toolCalls >= request.budget.maxToolCalls) {
      return finishCurrent('no_info', 'tool_call_budget')
    }
  }

  return finishCurrent('no_info', 'round_budget')
}
