import { describe, expect, it, vi } from 'vitest'

import type { AgentPlan, AgentRequest, AgentToolResult, AtomicAgentClaim } from './contracts'
import {
  runInternalAgentController,
  type AgentVerifierResult,
  type ControllerInput,
} from './controller'
import { createInternalAgentToolRegistry, type InternalAgentTool } from './tool-registry'

function claim(id: string, overrides: Partial<AtomicAgentClaim> = {}): AtomicAgentClaim {
  return {
    id,
    question: `Question for ${id}`,
    requiredEvidence: `Evidence for ${id}`,
    risk: 'low',
    status: 'unresolved',
    ...overrides,
  }
}

function request(overrides: Partial<AgentRequest> = {}): AgentRequest {
  return {
    organizationId: 'org-1',
    conversationId: 'conversation-1',
    channel: 'simulator',
    locale: 'en',
    latestUserMessage: 'What is the approved answer?',
    recentMessages: [],
    behaviorPolicy: {
      businessScopeHints: [],
      outOfScopeHints: [],
      evidenceRequiredFor: [],
      sourcePriority: [],
      refusalClasses: [],
      tone: [],
    },
    sourcePolicy: {
      allowedSourceGroups: ['knowledge_base'],
      priority: ['knowledge_base'],
    },
    budget: {
      maxRounds: 3,
      maxToolCalls: 6,
      maxLatencyMs: 15_000,
      maxInputTokens: 20_000,
      maxOutputTokens: 2_000,
      maxEstimatedCredits: 50,
    },
    ...overrides,
  }
}

function plan(
  claims: AtomicAgentClaim[],
  steps: AgentPlan['steps'],
  overrides: Partial<AgentPlan> = {}
): AgentPlan {
  return {
    decision: 'research',
    claims,
    steps,
    stopConditions: [],
    ...overrides,
  }
}

function step(
  id: string,
  tool: string,
  claimIds: string[],
  args: Record<string, unknown> = {},
  dependsOn: string[] = []
): AgentPlan['steps'][number] {
  return { id, tool, claimIds, args, dependsOn }
}

function result(
  tool: string,
  supportedClaimIds: string[] = [],
  overrides: Partial<AgentToolResult> = {}
): AgentToolResult {
  return {
    tool,
    status: 'success',
    evidence: [],
    supportedClaimIds,
    ...overrides,
  }
}

function tool(
  name: InternalAgentTool['name'],
  execute: InternalAgentTool['execute'],
  sourceGroups = ['knowledge_base']
): InternalAgentTool {
  return {
    name,
    description: `Tool ${name}`,
    capability: 'test',
    sourceGroups,
    canRunInParallel: true,
    execute,
  }
}

function plannerSequence(
  entries: Array<{
    plan: AgentPlan | null
    reason?: string
    usage?: { inputTokens?: number; outputTokens?: number; estimatedCredits?: number }
  }>
): ControllerInput['plan'] {
  let index = 0
  return vi.fn(async () => {
    const entry = entries[Math.min(index, entries.length - 1)]
    index += 1
    return {
      plan: entry.plan,
      reason: entry.reason ?? entry.plan?.reason ?? 'planned',
      usage: entry.usage,
    }
  })
}

function controllerInput(options: {
  request?: AgentRequest
  tools?: InternalAgentTool[]
  plans: Parameters<typeof plannerSequence>[0]
  verify?: ControllerInput['verify']
}): ControllerInput {
  return {
    request: options.request ?? request(),
    registry: createInternalAgentToolRegistry(options.tools ?? []),
    plan: plannerSequence(options.plans),
    verify: options.verify ?? (() => ({ decision: 'retry', reason: 'needs_more_evidence' })),
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

describe('bounded internal agent controller', () => {
  it('runs independent steps in parallel and stops on an early verified answer', async () => {
    const first = deferred<AgentToolResult>()
    const second = deferred<AgentToolResult>()
    const firstExecute = vi.fn(() => first.promise)
    const secondExecute = vi.fn(() => second.promise)
    const claims = [claim('c1'), claim('c2')]
    const verify = vi.fn<ControllerInput['verify']>(() => ({
      decision: 'answer',
      reason: 'all_claims_supported',
    }))
    const run = runInternalAgentController(
      controllerInput({
        tools: [tool('internal.catalog', firstExecute), tool('internal.table', secondExecute)],
        plans: [
          {
            plan: plan(claims, [
              step('s1', 'internal.catalog', ['c1'], { query: 'one' }),
              step('s2', 'internal.table', ['c2'], { query: 'two' }),
            ]),
          },
        ],
        verify,
      })
    )

    await vi.waitFor(() => {
      expect(firstExecute).toHaveBeenCalledTimes(1)
      expect(secondExecute).toHaveBeenCalledTimes(1)
    })
    first.resolve(result('internal.catalog', ['c1']))
    second.resolve(result('internal.table', ['c2']))

    const controllerResult = await run
    expect(controllerResult).toMatchObject({
      decision: 'answer',
      verifiedPartialClaimIds: ['c1', 'c2'],
      trace: {
        rounds: 1,
        toolCalls: 2,
        stopReason: 'all_claims_supported',
        duplicateCallsSkipped: 0,
        toolErrors: 0,
      },
    })
    expect(verify).toHaveBeenCalledTimes(1)
  })

  it('executes a dependent step only in a later round', async () => {
    const catalogExecute = vi.fn(async () => result('internal.catalog', ['c1']))
    const tableExecute = vi.fn(async () => result('internal.table', ['c2']))
    const claims = [claim('c1'), claim('c2')]
    const repeatedPlan = plan(claims, [
      step('s1', 'internal.catalog', ['c1']),
      step('s2', 'internal.table', ['c2'], {}, ['s1']),
    ])
    const verify = vi
      .fn<ControllerInput['verify']>()
      .mockReturnValueOnce({ decision: 'retry', reason: 'missing_c2' })
      .mockReturnValueOnce({ decision: 'answer', reason: 'complete' })

    const controllerResult = await runInternalAgentController(
      controllerInput({
        tools: [tool('internal.catalog', catalogExecute), tool('internal.table', tableExecute)],
        plans: [{ plan: repeatedPlan }, { plan: repeatedPlan }],
        verify,
      })
    )

    expect(catalogExecute).toHaveBeenCalledTimes(1)
    expect(tableExecute).toHaveBeenCalledTimes(1)
    expect(controllerResult.trace).toMatchObject({
      rounds: 2,
      toolCalls: 2,
      duplicateCallsSkipped: 1,
    })
    expect(controllerResult.decision).toBe('answer')
  })

  it('never executes the same tool with identical sorted arguments twice', async () => {
    const execute = vi.fn(async () => result('internal.catalog'))
    const claims = [claim('c1')]
    const firstPlan = plan(claims, [
      step('s1', 'internal.catalog', ['c1'], { subject: 'price', locale: 'tr' }),
    ])
    const secondPlan = plan(claims, [
      step('s2', 'internal.catalog', ['c1'], { locale: 'tr', subject: 'price' }),
    ])

    const controllerResult = await runInternalAgentController(
      controllerInput({
        tools: [tool('internal.catalog', execute)],
        plans: [{ plan: firstPlan }, { plan: secondPlan }],
      })
    )

    expect(execute).toHaveBeenCalledTimes(1)
    expect(controllerResult).toMatchObject({
      decision: 'no_info',
      trace: {
        rounds: 2,
        toolCalls: 1,
        stopReason: 'duplicate_tool_call',
        duplicateCallsSkipped: 1,
      },
    })
  })

  it('stops at the hard round ceiling', async () => {
    const execute = vi.fn(async () => result('internal.catalog'))
    const claims = [claim('c1')]
    const controllerResult = await runInternalAgentController(
      controllerInput({
        request: request({ budget: { ...request().budget, maxRounds: 2 } }),
        tools: [tool('internal.catalog', execute)],
        plans: [
          { plan: plan(claims, [step('s1', 'internal.catalog', ['c1'], { page: 1 })]) },
          { plan: plan(claims, [step('s2', 'internal.catalog', ['c1'], { page: 2 })]) },
        ],
      })
    )

    expect(controllerResult.trace).toMatchObject({
      rounds: 2,
      toolCalls: 2,
      stopReason: 'round_budget',
    })
  })

  it('reserves parallel call slots atomically before launch', async () => {
    const executions = Array.from({ length: 4 }, (_, index) =>
      vi.fn(async () => result(`internal.tool_${index}`))
    )
    const tools = executions.map((execute, index) =>
      tool(`internal.tool_${index}` as InternalAgentTool['name'], execute)
    )
    const claims = [claim('c1')]
    const controllerResult = await runInternalAgentController(
      controllerInput({
        request: request({ budget: { ...request().budget, maxToolCalls: 2 } }),
        tools,
        plans: [
          {
            plan: plan(
              claims,
              tools.map((registeredTool, index) =>
                step(`s${index}`, registeredTool.name, ['c1'], { index })
              )
            ),
          },
        ],
      })
    )

    expect(executions.map((execute) => execute.mock.calls.length)).toEqual([1, 1, 0, 0])
    expect(controllerResult.trace).toMatchObject({
      rounds: 1,
      toolCalls: 2,
      stopReason: 'tool_call_budget',
    })
  })

  it('records timeout and thrown errors while successful siblings survive', async () => {
    const timedOut = tool('internal.timeout', async ({ signal }) => {
      await new Promise<void>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
      })
      return result('internal.timeout')
    })
    const failed = tool('internal.error', async () => {
      throw new Error('upstream exploded')
    })
    const succeeded = tool('internal.success', async () => result('internal.success', ['c1']))
    const claims = [claim('c1')]
    const controllerResult = await runInternalAgentController(
      controllerInput({
        request: request({ budget: { ...request().budget, maxLatencyMs: 20 } }),
        tools: [timedOut, failed, succeeded],
        plans: [
          {
            plan: plan(claims, [
              step('timeout-step', timedOut.name, ['c1']),
              step('error-step', failed.name, ['c1']),
              step('success-step', succeeded.name, ['c1']),
            ]),
          },
        ],
        verify: () => ({ decision: 'answer', reason: 'partial_answer' }),
      })
    )

    expect(controllerResult.evidence.attempts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ stepId: 'timeout-step', status: 'timeout' }),
        expect.objectContaining({
          stepId: 'error-step',
          status: 'error',
          diagnostics: { reason: 'upstream exploded' },
        }),
        expect.objectContaining({ stepId: 'success-step', status: 'success' }),
      ])
    )
    expect(controllerResult.trace.toolErrors).toBe(2)
    expect(controllerResult.verifiedPartialClaimIds).toEqual(['c1'])
  })

  it('fails soft with the planner reason when planning returns null', async () => {
    const controllerResult = await runInternalAgentController(
      controllerInput({
        plans: [{ plan: null, reason: 'malformed_planner_output', usage: { inputTokens: 4 } }],
      })
    )

    expect(controllerResult).toMatchObject({
      decision: 'no_info',
      usage: { inputTokens: 4, outputTokens: 0, estimatedCredits: 0 },
      trace: { rounds: 1, stopReason: 'malformed_planner_output' },
    })
  })

  it.each(['clarify', 'refuse', 'no_info'] as const)(
    'returns a non-research %s plan directly without verification',
    async (decision) => {
      const verify = vi.fn<ControllerInput['verify']>()
      const directPlan = plan([claim('c1')], [], {
        decision,
        reason: `${decision}_reason`,
        ...(decision === 'clarify'
          ? { clarification: { question: 'Which service?', missingSlots: ['service'] } }
          : {}),
      })
      const controllerResult = await runInternalAgentController(
        controllerInput({ plans: [{ plan: directPlan }], verify })
      )

      expect(controllerResult.decision).toBe(decision)
      expect(controllerResult.trace.stopReason).toBe(`${decision}_reason`)
      expect(verify).not.toHaveBeenCalled()
    }
  )

  it('maps a direct plan to answer only through the verifier', async () => {
    const directPlan = plan([claim('c1')], [], { decision: 'direct', reason: 'known_state' })
    const verify = vi.fn<ControllerInput['verify']>(() => ({
      decision: 'answer',
      reason: 'direct_supported',
    }))

    const controllerResult = await runInternalAgentController(
      controllerInput({ plans: [{ plan: directPlan }], verify })
    )

    expect(verify).toHaveBeenCalledTimes(1)
    expect(controllerResult.decision).toBe('answer')
    expect(controllerResult.trace.stopReason).toBe('direct_supported')
  })

  it('rejects later plans that add or change initialized claims', async () => {
    const initialClaims = [claim('c1')]
    const execute = vi.fn(async () => result('internal.catalog'))
    const controllerResult = await runInternalAgentController(
      controllerInput({
        tools: [tool('internal.catalog', execute)],
        plans: [
          { plan: plan(initialClaims, [step('s1', 'internal.catalog', ['c1'])]) },
          {
            plan: plan(
              [claim('c1', { question: 'Changed question' }), claim('c2')],
              [step('s2', 'internal.catalog', ['c1'], { retry: true })]
            ),
          },
        ],
      })
    )

    expect(controllerResult.decision).toBe('no_info')
    expect(controllerResult.trace.stopReason).toBe('plan_claim_mismatch')
    expect(execute).toHaveBeenCalledTimes(1)
  })

  it('allows later plans to keep an unchanged subset of initialized claims', async () => {
    const claims = [claim('c1'), claim('c2')]
    const execute = vi.fn(async () => result('internal.catalog', ['c1']))
    const controllerResult = await runInternalAgentController(
      controllerInput({
        tools: [tool('internal.catalog', execute)],
        plans: [
          { plan: plan(claims, [step('s1', 'internal.catalog', ['c1'], { round: 1 })]) },
          {
            plan: plan([claim('c2')], [step('s2', 'internal.catalog', ['c2'], { round: 2 })]),
          },
        ],
        verify: vi
          .fn<ControllerInput['verify']>()
          .mockReturnValueOnce({ decision: 'retry', reason: 'missing_c2' })
          .mockReturnValueOnce({ decision: 'answer', reason: 'partial_ok' }),
      })
    )

    expect(controllerResult.decision).toBe('answer')
    expect(execute).toHaveBeenCalledTimes(2)
  })

  it('aggregates planner and tool usage across rounds', async () => {
    const claims = [claim('c1')]
    const execute = vi
      .fn<InternalAgentTool['execute']>()
      .mockResolvedValueOnce(
        result('internal.catalog', [], {
          usage: { inputTokens: 3, outputTokens: 4, estimatedCredits: 5 },
        })
      )
      .mockResolvedValueOnce(
        result('internal.catalog', ['c1'], {
          usage: { inputTokens: 7, outputTokens: 8, estimatedCredits: 9 },
        })
      )
    const controllerResult = await runInternalAgentController(
      controllerInput({
        tools: [tool('internal.catalog', execute)],
        plans: [
          {
            plan: plan(claims, [step('s1', 'internal.catalog', ['c1'], { round: 1 })]),
            usage: { inputTokens: 10, outputTokens: 11, estimatedCredits: 12 },
          },
          {
            plan: plan(claims, [step('s2', 'internal.catalog', ['c1'], { round: 2 })]),
            usage: { inputTokens: 13, outputTokens: 14, estimatedCredits: 15 },
          },
        ],
        verify: vi
          .fn<ControllerInput['verify']>()
          .mockReturnValueOnce({ decision: 'retry', reason: 'again' })
          .mockReturnValueOnce({ decision: 'answer', reason: 'complete' }),
      })
    )

    expect(controllerResult.usage).toEqual({
      inputTokens: 33,
      outputTokens: 37,
      estimatedCredits: 41,
    })
  })

  it.each([
    ['input_token_budget', { maxInputTokens: 5 }, { inputTokens: 6 }],
    ['output_token_budget', { maxOutputTokens: 5 }, { outputTokens: 6 }],
    ['credit_budget', { maxEstimatedCredits: 5 }, { estimatedCredits: 6 }],
  ] as const)(
    'enforces the %s after planner usage is aggregated',
    async (stopReason, budgetOverride, usage) => {
      const baseRequest = request()
      const controllerResult = await runInternalAgentController(
        controllerInput({
          request: request({
            budget: { ...baseRequest.budget, ...budgetOverride },
          }),
          plans: [
            {
              plan: plan([claim('c1')], [step('s1', 'internal.missing', ['c1'])]),
              usage,
            },
          ],
        })
      )

      expect(controllerResult.trace.stopReason).toBe(stopReason)
      expect(controllerResult.trace.toolCalls).toBe(0)
    }
  )

  it('marks verifier-provided unsupported claim ids', async () => {
    const claims = [claim('c1'), claim('c2')]
    const execute = vi.fn(async () => result('internal.catalog', ['c1']))
    const verifierResult: AgentVerifierResult = {
      decision: 'answer',
      reason: 'partial_with_gap',
      unsupportedClaimIds: ['c2'],
    }

    const controllerResult = await runInternalAgentController(
      controllerInput({
        tools: [tool('internal.catalog', execute)],
        plans: [{ plan: plan(claims, [step('s1', 'internal.catalog', ['c1', 'c2'])]) }],
        verify: () => verifierResult,
      })
    )

    expect(controllerResult.verifiedPartialClaimIds).toEqual(['c1'])
    expect(controllerResult.evidence).toMatchObject({
      claims: [
        { id: 'c1', status: 'supported' },
        { id: 'c2', status: 'unsupported' },
      ],
      unsupportedReasons: [{ claimId: 'c2', reason: 'partial_with_gap' }],
    })
  })

  it('records registry source-policy failures as tool error attempts', async () => {
    const execute = vi.fn(async () => result('internal.catalog', ['c1']))
    const controllerResult = await runInternalAgentController(
      controllerInput({
        tools: [tool('internal.catalog', execute, ['structured_catalog'])],
        plans: [{ plan: plan([claim('c1')], [step('s1', 'internal.catalog', ['c1'])]) }],
        verify: () => ({ decision: 'no_info', reason: 'policy_blocked' }),
      })
    )

    expect(execute).not.toHaveBeenCalled()
    expect(controllerResult.evidence.attempts).toEqual([
      expect.objectContaining({
        stepId: 's1',
        status: 'error',
        diagnostics: {
          reason: 'Agent tool source groups are not allowed: internal.catalog (structured_catalog)',
        },
      }),
    ])
    expect(controllerResult.trace.toolErrors).toBe(1)
  })

  it('stops a dependency cycle without executing or verifying', async () => {
    const verify = vi.fn<ControllerInput['verify']>()
    const claims = [claim('c1')]
    const controllerResult = await runInternalAgentController(
      controllerInput({
        plans: [
          {
            plan: plan(claims, [
              step('s1', 'internal.one', ['c1'], {}, ['s2']),
              step('s2', 'internal.two', ['c1'], {}, ['s1']),
            ]),
          },
        ],
        verify,
      })
    )

    expect(controllerResult.trace).toMatchObject({
      toolCalls: 0,
      stopReason: 'no_executable_steps',
    })
    expect(verify).not.toHaveBeenCalled()
  })

  it('protects caller input and internal state from callback mutation', async () => {
    const originalRequest = request({
      recentMessages: [{ role: 'user', content: 'Original turn' }],
    })
    const originalPlan = plan([claim('c1')], [], {
      decision: 'direct',
      reason: 'typed_state',
    })
    const planner = vi.fn<ControllerInput['plan']>(async (input) => {
      input.request.latestUserMessage = 'planner mutation'
      input.request.recentMessages[0].content = 'planner turn mutation'
      input.graph.claims.push(claim('injected'))
      input.descriptors.push({
        name: 'internal.injected',
        description: 'Injected',
        capability: 'injected',
        sourceGroups: [],
      })
      return { plan: originalPlan, reason: 'typed_state' }
    })
    const verify = vi.fn<ControllerInput['verify']>((graph, receivedPlan) => {
      graph.claims[0].question = 'verifier mutation'
      receivedPlan.claims[0].question = 'verifier plan mutation'
      return { decision: 'answer', reason: 'verified' }
    })

    const controllerResult = await runInternalAgentController({
      request: originalRequest,
      registry: createInternalAgentToolRegistry([]),
      plan: planner,
      verify,
    })

    expect(originalRequest.latestUserMessage).toBe('What is the approved answer?')
    expect(originalRequest.recentMessages[0].content).toBe('Original turn')
    expect(originalPlan.claims[0].question).toBe('Question for c1')
    expect(controllerResult.evidence.claims).toEqual([claim('c1')])
  })
})
