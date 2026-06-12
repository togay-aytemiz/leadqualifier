import { describe, expect, it } from 'vitest'

import type { AgentRequest, AgentToolResult } from './contracts'
import { createInternalAgentToolRegistry, type InternalAgentTool } from './tool-registry'

function request(allowedSourceGroups: string[]): AgentRequest {
  return {
    organizationId: 'org-1',
    channel: 'simulator',
    locale: 'en',
    latestUserMessage: 'What is the approved price?',
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
      allowedSourceGroups,
      priority: allowedSourceGroups,
    },
    budget: {
      maxRounds: 3,
      maxToolCalls: 6,
      maxLatencyMs: 15_000,
      maxInputTokens: 20_000,
      maxOutputTokens: 2_000,
      maxEstimatedCredits: 50,
    },
  }
}

function internalTool(overrides: Partial<InternalAgentTool> = {}): InternalAgentTool {
  return {
    name: 'internal.catalog',
    description: 'Read approved structured facts',
    capability: 'structured_fact',
    sourceGroups: ['structured_catalog'],
    execute: async () => ({
      tool: 'internal.catalog',
      status: 'empty',
      evidence: [],
      supportedClaimIds: [],
    }),
    ...overrides,
  }
}

describe('internal agent tool registry', () => {
  it('rejects an external tool name', () => {
    const externalTool = {
      ...internalTool(),
      name: 'web.search',
    } as unknown as InternalAgentTool

    expect(() => createInternalAgentToolRegistry([externalTool])).toThrow(
      'External agent tools are not allowed'
    )
  })

  it('rejects an internal tool that declares the external web source group', () => {
    expect(() =>
      createInternalAgentToolRegistry([
        internalTool({ sourceGroups: ['structured_catalog', 'external_web'] }),
      ])
    ).toThrow('External agent tools are not allowed')
  })

  it('rejects duplicate tool names', () => {
    const tool = internalTool()

    expect(() => createInternalAgentToolRegistry([tool, tool])).toThrow(
      'Duplicate agent tool: internal.catalog'
    )
  })

  it('never exposes execute through descriptors or lookup', () => {
    const registry = createInternalAgentToolRegistry([internalTool()])

    expect(registry.descriptors()[0]).not.toHaveProperty('execute')
    expect(registry.get('internal.catalog')).not.toHaveProperty('execute')
  })

  it('lists registered names and gets tool descriptors', () => {
    const registry = createInternalAgentToolRegistry([
      internalTool({ costClass: 'low', canRunInParallel: true }),
    ])

    expect(registry.names()).toEqual(['internal.catalog'])
    expect(registry.get('internal.catalog')).toEqual({
      name: 'internal.catalog',
      description: 'Read approved structured facts',
      capability: 'structured_fact',
      sourceGroups: ['structured_catalog'],
      costClass: 'low',
      canRunInParallel: true,
    })
    expect(registry.get('internal.missing')).toBeUndefined()
  })

  it('executes an allowed tool and preserves its execution input', async () => {
    let receivedInput: Parameters<InternalAgentTool['execute']>[0] | undefined
    const expectedResult: AgentToolResult = {
      tool: 'internal.catalog',
      status: 'success',
      evidence: [],
      supportedClaimIds: ['claim-1'],
    }
    const registry = createInternalAgentToolRegistry([
      internalTool({
        execute: async (input) => {
          receivedInput = input
          return expectedResult
        },
      }),
    ])
    const executionRequest = request(['structured_catalog'])
    const args = { query: 'approved price' }
    const claimIds = ['claim-1']
    const signal = new AbortController().signal

    const result = await registry.execute('internal.catalog', {
      request: executionRequest,
      args,
      claimIds,
      signal,
    })

    expect(result).toBe(expectedResult)
    expect(receivedInput?.request).toBe(executionRequest)
    expect(receivedInput?.args).toBe(args)
    expect(receivedInput?.claimIds).toBe(claimIds)
    expect(receivedInput?.signal).toBe(signal)
  })

  it('rejects execution when a registered tool source group is not allowed', async () => {
    const registry = createInternalAgentToolRegistry([internalTool()])

    await expect(
      registry.execute('internal.catalog', {
        request: request(['knowledge_base']),
        args: {},
        claimIds: ['claim-1'],
        signal: new AbortController().signal,
      })
    ).rejects.toThrow(
      'Agent tool source groups are not allowed: internal.catalog (structured_catalog)'
    )
  })

  it('rejects a planner-requested source group outside the request policy', async () => {
    const registry = createInternalAgentToolRegistry([internalTool()])

    await expect(
      registry.execute('internal.catalog', {
        request: request(['structured_catalog']),
        args: { source_groups: ['external_web'] },
        claimIds: ['claim-1'],
        signal: new AbortController().signal,
      })
    ).rejects.toThrow(
      'Agent tool source groups are not allowed: internal.catalog (external_web)'
    )
  })

  it('rejects malformed planner-requested source groups', async () => {
    const registry = createInternalAgentToolRegistry([internalTool()])

    await expect(
      registry.execute('internal.catalog', {
        request: request(['structured_catalog']),
        args: { sourceGroups: ['structured_catalog', 42] },
        claimIds: ['claim-1'],
        signal: new AbortController().signal,
      })
    ).rejects.toThrow('Agent tool requested invalid source groups: internal.catalog')
  })

  it('rejects execution for an unregistered tool name', async () => {
    const registry = createInternalAgentToolRegistry([])

    await expect(
      registry.execute('internal.missing', {
        request: request([]),
        args: {},
        claimIds: [],
        signal: new AbortController().signal,
      })
    ).rejects.toThrow('Agent tool is not registered: internal.missing')
  })

  it('allows an empty internal registry', () => {
    const registry = createInternalAgentToolRegistry([])

    expect(registry.names()).toEqual([])
    expect(registry.descriptors()).toEqual([])
    expect(registry.get('internal.missing')).toBeUndefined()
  })
})
