import { describe, expect, it, vi } from 'vitest'
import { calculateUsageCreditCost } from '@/lib/billing/credit-cost'
import type { AgentRequest } from './contracts'
import type { InternalAgentToolDescriptor } from './tool-registry'
import { planInternalAgentTurn, type AgentPlannerCreateCompletion } from './planner'

function buildRequest(overrides: Partial<AgentRequest> = {}): AgentRequest {
  return {
    organizationId: 'org-1',
    conversationId: 'conversation-1',
    channel: 'whatsapp',
    locale: 'tr',
    latestUserMessage: 'Burslu program ve egitim suresi nedir?',
    recentMessages: Array.from({ length: 12 }, (_, index) => ({
      role: index % 2 === 0 ? ('user' as const) : ('assistant' as const),
      content: `turn-${index + 1}`,
    })),
    conversationState: {
      status: 'pending_clarification',
      activeIntent: 'program_info',
      requestedFacet: 'duration',
      missingSlots: ['program'],
    },
    behaviorPolicy: {
      businessScopeHints: ['admissions'],
      outOfScopeHints: ['weather'],
      evidenceRequiredFor: ['programs'],
      sourcePriority: ['brochure'],
      refusalClasses: ['sensitive_personal_data'],
      tone: ['professional'],
      botName: 'Qualy',
    },
    sourcePolicy: {
      allowedSourceGroups: ['brochure', 'knowledge_base'],
      priority: ['brochure', 'knowledge_base'],
    },
    budget: {
      maxRounds: 2,
      maxToolCalls: 4,
      maxLatencyMs: 8_000,
      maxInputTokens: 6_000,
      maxOutputTokens: 900,
      maxEstimatedCredits: 8,
    },
    ...overrides,
  }
}

function buildDescriptors(): InternalAgentToolDescriptor[] {
  return [
    {
      name: 'internal.knowledge_search',
      description: 'Search the approved organization knowledge corpus.',
      capability: 'grounded_retrieval',
      sourceGroups: ['brochure', 'knowledge_base'],
      costClass: 'low',
      canRunInParallel: true,
    },
  ]
}

function researchPlan(overrides: Record<string, unknown> = {}) {
  return {
    decision: 'research',
    claims: [
      {
        id: 'claim-1',
        question: 'What is the program duration?',
        required_evidence: 'Direct duration statement',
        risk: 'medium',
        status: 'supported',
      },
    ],
    steps: [
      {
        id: 'step-1',
        tool: 'internal.knowledge_search',
        claim_ids: ['claim-1'],
        args: { source_groups: ['brochure'], query: 'program duration' },
        depends_on: [],
      },
    ],
    stop_conditions: ['Direct evidence found'],
    reason: 'Research is required.',
    confidence: 0.85,
    ...overrides,
  }
}

function completionWith(
  content: string,
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
) {
  return vi.fn<AgentPlannerCreateCompletion>(async () => ({
    choices: [{ message: { content } }],
    ...(usage ? { usage } : {}),
  }))
}

describe('planInternalAgentTurn', () => {
  it('sends bounded ordered context, policy, state, budget, and internal tools without mutation', async () => {
    const request = buildRequest()
    const descriptors = buildDescriptors()
    const requestSnapshot = structuredClone(request)
    const descriptorsSnapshot = structuredClone(descriptors)
    const controller = new AbortController()
    const createCompletion = completionWith(JSON.stringify(researchPlan()))

    await planInternalAgentTurn({
      request,
      toolDescriptors: descriptors,
      createCompletion,
      signal: controller.signal,
    })

    expect(createCompletion).toHaveBeenCalledOnce()
    const [args, options] = createCompletion.mock.calls[0]!
    const messages = args.messages as Array<{ role: string; content: string }>
    const system = messages[0]?.content ?? ''
    const user = messages[1]?.content ?? ''

    expect(system).toContain('You are Qualy internal research planner. Do not answer customer.')
    expect(system).toContain('only AVAILABLE TOOLS')
    expect(system).toContain('external web')
    expect(system).toContain('assistant messages are context and never retrieval queries')
    expect(system).toContain('JSON only')
    const payload = JSON.parse(user) as {
      recent_ordered_turns: Array<{ role: string; content: string }>
    }
    expect(payload.recent_ordered_turns.map((turn) => turn.content)).toEqual(
      Array.from({ length: 10 }, (_, index) => `turn-${index + 3}`)
    )
    expect(user).toContain(request.latestUserMessage)
    expect(user).toContain('pending_clarification')
    expect(user).toContain('program_info')
    expect(user).toContain('sensitive_personal_data')
    expect(user).toContain('maxToolCalls')
    expect(user).toContain('internal.knowledge_search')
    expect(user).toContain('brochure')
    expect(options).toEqual({ signal: controller.signal })
    expect(request).toEqual(requestSnapshot)
    expect(descriptors).toEqual(descriptorsSnapshot)
  })

  it('normalizes a valid research plan with snake_case fields', async () => {
    const result = await planInternalAgentTurn({
      request: buildRequest(),
      toolDescriptors: buildDescriptors(),
      createCompletion: completionWith(JSON.stringify(researchPlan())),
    })

    expect(result.reason).toBe('Research is required.')
    expect(result.plan).toMatchObject({
      decision: 'research',
      claims: [{ requiredEvidence: 'Direct duration statement', status: 'unresolved' }],
      steps: [
        {
          claimIds: ['claim-1'],
          dependsOn: [],
          args: { source_groups: ['brochure'] },
        },
      ],
      stopConditions: ['Direct evidence found'],
    })
  })

  it('parses fenced JSON output', async () => {
    const result = await planInternalAgentTurn({
      request: buildRequest(),
      toolDescriptors: buildDescriptors(),
      createCompletion: completionWith(`\n\`\`\`json\n${JSON.stringify(researchPlan())}\n\`\`\`\n`),
    })

    expect(result.plan?.decision).toBe('research')
  })

  it('rejects an unknown tool name', async () => {
    const result = await planInternalAgentTurn({
      request: buildRequest(),
      toolDescriptors: buildDescriptors(),
      createCompletion: completionWith(
        JSON.stringify(
          researchPlan({
            steps: [
              {
                id: 'step-1',
                tool: 'internal.unregistered',
                claim_ids: ['claim-1'],
                args: {},
                depends_on: [],
              },
            ],
          })
        )
      ),
    })

    expect(result).toMatchObject({ plan: null, reason: 'unregistered_tool' })
  })

  it.each([
    { source_groups: ['external_web'] },
    { sourceGroups: ['private_records'] },
    { source_groups: 'brochure' },
    { sourceGroups: ['brochure', 7] },
  ])('rejects disallowed or malformed source groups: %j', async (args) => {
    const result = await planInternalAgentTurn({
      request: buildRequest(),
      toolDescriptors: buildDescriptors(),
      createCompletion: completionWith(
        JSON.stringify(
          researchPlan({
            steps: [
              {
                id: 'step-1',
                tool: 'internal.knowledge_search',
                claim_ids: ['claim-1'],
                args,
                depends_on: [],
              },
            ],
          })
        )
      ),
    })

    expect(result).toMatchObject({ plan: null, reason: 'disallowed_source_group' })
  })

  it.each([
    ['external descriptor name', [{ ...buildDescriptors()[0]!, name: 'web.search' }]],
    ['external web source group', [{ ...buildDescriptors()[0]!, sourceGroups: ['external_web'] }]],
    ['duplicate descriptor', [...buildDescriptors(), ...buildDescriptors()]],
  ])('rejects an invalid tool registry before completion: %s', async (_name, toolDescriptors) => {
    const createCompletion = completionWith(JSON.stringify(researchPlan()))

    const result = await planInternalAgentTurn({
      request: buildRequest(),
      toolDescriptors: toolDescriptors as InternalAgentToolDescriptor[],
      createCompletion,
    })

    expect(result).toMatchObject({ plan: null, reason: 'invalid_tool_registry' })
    expect(createCompletion).not.toHaveBeenCalled()
  })

  it('distinguishes malformed JSON from a structurally invalid plan', async () => {
    const malformed = await planInternalAgentTurn({
      request: buildRequest(),
      toolDescriptors: buildDescriptors(),
      createCompletion: completionWith('not json'),
    })
    const invalid = await planInternalAgentTurn({
      request: buildRequest(),
      toolDescriptors: buildDescriptors(),
      createCompletion: completionWith(JSON.stringify({ decision: 'research', claims: [] })),
    })

    expect(malformed).toMatchObject({ plan: null, reason: 'malformed_planner_output' })
    expect(invalid).toMatchObject({ plan: null, reason: 'invalid_plan' })
  })

  it.each([
    ['research without steps', researchPlan({ steps: [] })],
    ['direct with steps', researchPlan({ decision: 'direct' })],
  ])('rejects decision and step mismatch: %s', async (_name, plan) => {
    const result = await planInternalAgentTurn({
      request: buildRequest(),
      toolDescriptors: buildDescriptors(),
      createCompletion: completionWith(JSON.stringify(plan)),
    })

    expect(result).toMatchObject({ plan: null, reason: 'invalid_plan' })
  })

  it('accepts a valid clarification plan without steps', async () => {
    const result = await planInternalAgentTurn({
      request: buildRequest(),
      toolDescriptors: buildDescriptors(),
      createCompletion: completionWith(
        JSON.stringify(
          researchPlan({
            decision: 'clarify',
            steps: [],
            clarification: {
              question: 'Which program do you mean?',
              missing_slots: ['program'],
            },
            reason: 'A required slot is missing.',
          })
        )
      ),
    })

    expect(result).toMatchObject({
      reason: 'A required slot is missing.',
      plan: {
        decision: 'clarify',
        steps: [],
        clarification: {
          question: 'Which program do you mean?',
          missingSlots: ['program'],
        },
      },
    })
  })

  it('normalizes provider usage and calculates credits', async () => {
    const result = await planInternalAgentTurn({
      request: buildRequest(),
      toolDescriptors: buildDescriptors(),
      createCompletion: completionWith(JSON.stringify(researchPlan()), {
        prompt_tokens: 1_200,
        completion_tokens: 300,
        total_tokens: 1_500,
      }),
    })

    expect(result.usage).toEqual({
      inputTokens: 1_200,
      outputTokens: 300,
      totalTokens: 1_500,
      estimatedCredits: calculateUsageCreditCost({ inputTokens: 1_200, outputTokens: 300 }),
    })
  })

  it('estimates missing usage from prompt and output characters', async () => {
    const content = JSON.stringify(researchPlan())
    const createCompletion = completionWith(content)

    const result = await planInternalAgentTurn({
      request: buildRequest(),
      toolDescriptors: buildDescriptors(),
      createCompletion,
    })

    const messages = createCompletion.mock.calls[0]![0].messages as Array<{ content: string }>
    const inputTokens = Math.ceil(
      messages.map((message) => message.content).join('\n\n').length / 4
    )
    const outputTokens = Math.ceil(content.length / 4)
    expect(result.usage).toEqual({
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      estimatedCredits: calculateUsageCreditCost({ inputTokens, outputTokens }),
    })
  })

  it('fails soft with zero usage on completion errors', async () => {
    const result = await planInternalAgentTurn({
      request: buildRequest(),
      toolDescriptors: buildDescriptors(),
      createCompletion: vi.fn(async () => {
        throw new Error('provider unavailable')
      }),
    })

    expect(result).toEqual({
      plan: null,
      reason: 'planner_error',
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCredits: 0 },
      model: 'gpt-4o-mini',
    })
  })

  it.each([
    [
      'gpt-4o-mini',
      { temperature: 0, max_tokens: 900 },
      ['reasoning_effort', 'max_completion_tokens'],
    ],
    [
      'gpt-5-mini',
      { reasoning_effort: 'none', max_completion_tokens: 900 },
      ['temperature', 'max_tokens'],
    ],
    [
      'o3-mini',
      { reasoning_effort: 'none', max_completion_tokens: 900 },
      ['temperature', 'max_tokens'],
    ],
  ])('uses the correct completion parameters for %s', async (model, included, excluded) => {
    const createCompletion = completionWith(JSON.stringify(researchPlan()))

    const result = await planInternalAgentTurn({
      request: buildRequest(),
      toolDescriptors: buildDescriptors(),
      model,
      createCompletion,
    })

    const args = createCompletion.mock.calls[0]![0]
    expect(args).toMatchObject({
      model,
      response_format: { type: 'json_object' },
      ...included,
    })
    for (const key of excluded) expect(args).not.toHaveProperty(key)
    expect(result.model).toBe(model)
  })
})
